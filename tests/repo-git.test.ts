/** Library git sync's transport against a real smart-HTTP remote (feature 026,
 *  research R5, R6, R14, FR-029, FR-030): tip, shallow snapshot, auth, errors,
 *  the download cap, https-only redirects and the hosted address block. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { GitRemote, skipReason } from "./fixtures/git-remote.ts";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-repo-git-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_TEST_GIT_LOOPBACK_HTTP = "1";
const { runAsTenant } = await import("../config.ts");
const { repoRemote } = await import("../src/server/repo-git.ts");
const { RepoRemoteError } = await import("../src/core/repo-link.ts");
type RepoTreeEntry = import("../src/core/ports.ts").RepoTreeEntry;

const skip = skipReason();
const TOKEN = "ghp_sentinelSECRET7777zz";
let remote: GitRemote;
const logged: string[] = [];
const originals = { log: console.log, warn: console.warn, error: console.error, info: console.info };

before(async () => {
	for (const level of ["log", "warn", "error", "info"] as const) {
		console[level] = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); originals[level](...args); };
	}
	if (skip) return;
	remote = await GitRemote.start();
	remote.createRepo("notes", {
		"README.md": "# notes\n",
		"week1/notes.md": "# week 1\n",
		"week2/notes.md": "# week 2\n",
		"node_modules/x/index.js": "x",
		"link.md": { symlink: "README.md" },
		"vendor/lib": { submodule: "https://example.invalid/lib.git" },
		"slides.pdf": { lfs: { size: 1234 } },
	});
	remote.commit("notes", { "draft.md": "on dev" }, { branch: "dev" });
	remote.createRepo("private", { "secret.md": "# s\n" }, { token: TOKEN });
	remote.createRepo("trunk", { "a.md": "a" }, { branch: "trunk" });
	remote.createRepo("heavy", { "notes.md": "# small\n", "blob.bin": randomBytes(256 * 1024) });
});

after(async () => {
	Object.assign(console, originals);
	await remote?.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

async function failure(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (err) {
		assert.ok(err instanceof RepoRemoteError, `expected a RepoRemoteError, got ${String(err)}`);
		assert.ok(!JSON.stringify({ ...err.failure, message: err.message, stack: err.stack }).includes(TOKEN), "no failure text carries the token");
		return err.failure;
	}
	assert.fail("expected the call to fail");
}

async function collect(url: string, branch: string, options: { token?: string; maxDownloadBytes?: number } = {}) {
	const entries: (Omit<RepoTreeEntry, "read"> & { bytes?: Uint8Array })[] = [];
	const tip = await repoRemote.snapshot({ url, branch, linkId: "rpl_test", skipDirectory: (_p, name) => name === "node_modules", ...options }, async (entry) => {
		const { read, ...rest } = entry;
		entries.push({ ...rest, ...(entry.type === "blob" && entry.mode !== "120000" ? { bytes: await read() } : {}) });
	});
	return { tip, entries: entries.sort((a, b) => a.path.localeCompare(b.path)) };
}

const gitWork = () => path.join(dir, "library", "git-work");

describe("repo-git transport", { skip }, () => {
	it("reads the default branch's tip from HEAD, or a named branch's", async () => {
		assert.deepEqual(await repoRemote.tip({ url: remote.url("notes") }), { branch: "main", commit: remote.tip("notes") });
		assert.deepEqual(await repoRemote.tip({ url: remote.url("notes"), branch: "dev" }), { branch: "dev", commit: remote.tip("notes", "dev") });
		assert.deepEqual(await repoRemote.tip({ url: remote.url("trunk") }), { branch: "trunk", commit: remote.tip("trunk", "trunk") });
	});

	it("snapshots the tip's tree with modes, oids and bytes, then deletes the gitdir", async () => {
		const { tip, entries } = await collect(remote.url("notes"), "main");
		assert.equal(tip.commit, remote.tip("notes"));
		assert.deepEqual(entries.map((e) => [e.path, e.mode, e.type]), [
			[".gitmodules", "100644", "blob"],
			["link.md", "120000", "blob"],
			["README.md", "100644", "blob"],
			["slides.pdf", "100644", "blob"],
			["vendor/lib", "160000", "commit"],
			["week1/notes.md", "100644", "blob"],
			["week2/notes.md", "100644", "blob"],
		].sort((a, b) => a[0]!.localeCompare(b[0]!)));
		const week1 = entries.find((e) => e.path === "week1/notes.md")!;
		assert.equal(new TextDecoder().decode(week1.bytes), "# week 1\n");
		assert.match(week1.oid, /^[0-9a-f]{40}$/);
		assert.ok(!entries.some((e) => e.path.startsWith("node_modules")), "skipped directories are not walked");
		assert.deepEqual(fs.readdirSync(gitWork()), [], "the temp gitdir is gone");
	});

	it("fetches one commit only (depth 1, single branch)", async () => {
		remote.commit("notes", { "week1/notes.md": "# week 1, v2\n" });
		const { tip, entries } = await collect(remote.url("notes"), "main");
		assert.equal(tip.commit, remote.tip("notes"));
		assert.equal(new TextDecoder().decode(entries.find((e) => e.path === "week1/notes.md")!.bytes), "# week 1, v2\n");
		assert.ok(!entries.some((e) => e.path === "draft.md"), "another branch's files are not in the snapshot");
		let shallow = "";
		await repoRemote.snapshot({ url: remote.url("notes"), branch: "main", linkId: "rpl_depth" }, () => {
			const [work] = fs.readdirSync(gitWork());
			assert.match(work!, /^rpl_depth-/);
			shallow = fs.readFileSync(path.join(gitWork(), work!, "shallow"), "utf8").trim();
		});
		assert.equal(shallow, remote.tip("notes"), "the clone is cut at the tip");
	});

	it("reads a private repo with its token", async () => {
		const { entries } = await collect(remote.url("private"), "main", { token: TOKEN });
		assert.deepEqual(entries.map((e) => e.path), ["secret.md"]);
		assert.ok(remote.requests.filter((r) => r.path.startsWith("/private.git")).every((r) => r.authorization?.startsWith("Basic ")));
	});

	it("fails a missing or wrong token as auth, once, without a loop", async () => {
		const before = remote.requests.length;
		const wrong = await failure(repoRemote.tip({ url: remote.url("private"), token: "ghp_wrong" }));
		assert.equal(wrong.code, "auth");
		assert.equal(wrong.message, "The repo refused the token. Check that it can read this repo.");
		assert.equal(remote.requests.length - before, 1, "one request, no retry loop");
		const none = await failure(repoRemote.snapshot({ url: remote.url("private"), branch: "main", linkId: "rpl_x" }, () => {}));
		assert.equal(none.code, "auth");
		assert.equal(none.message, "This repo is private. Add a token that can read it.");
		assert.ok(!wrong.detail.includes("ghp_wrong"), "the detail is redacted");
	});

	it("fails an unknown host as network, and a missing repo or branch as not-found", async () => {
		assert.equal((await failure(repoRemote.tip({ url: "https://nonexistent.invalid/oliver/notes.git" }))).code, "network");
		const missing = await failure(repoRemote.tip({ url: remote.url("nope") }));
		assert.equal(missing.code, "not-found");
		assert.equal(missing.message, "No repo or branch was found at that address.");
		assert.equal((await failure(repoRemote.tip({ url: remote.url("notes"), branch: "nope" }))).code, "not-found");
		assert.equal((await failure(repoRemote.snapshot({ url: remote.url("notes"), branch: "nope", linkId: "rpl_x" }, () => {}))).code, "not-found");
		assert.deepEqual(fs.readdirSync(gitWork()), [], "a failed pull leaves no gitdir");
	});

	it("stops a download past the cap as too-large-download, even when the supported files are small (T058)", async () => {
		// heavy: a 4-byte notes.md (the only supported file) and 256 KiB of an unsupported binary.
		const capped = await failure(collect(remote.url("heavy"), "main", { maxDownloadBytes: 64 * 1024 }));
		assert.equal(capped.code, "too-large-download");
		assert.equal(capped.message, "The repo's download is over 500 MB.");
		const { entries } = await collect(remote.url("heavy"), "main", { maxDownloadBytes: 1024 * 1024 });
		assert.deepEqual(entries.map((e) => e.path), ["blob.bin", "notes.md"]);
		assert.deepEqual(fs.readdirSync(gitWork()), []);
	});

	it("refuses a redirect to a non-https address", async () => {
		const target = remote.url("notes").replace("127.0.0.1", "localhost");
		const moved = remote.redirect("moved", target.replace(/\/notes\.git$/, ""));
		const before = remote.requests.length;
		const refused = await failure(repoRemote.tip({ url: `${moved}/notes.git` }));
		assert.equal(refused.code, "server");
		assert.match(refused.detail, /non-https/);
		assert.equal(remote.requests.length - before, 1, "the redirect target was never requested");
	});

	it("never logs the token", () => {
		assert.ok(!logged.some((line) => line.includes(TOKEN)));
	});
});

describe("hosted address block (FR-030, analyze M1, M3)", { skip }, () => {
	const hosted = <T>(fn: () => Promise<T>) => {
		process.env.LH_HOSTED = "1";
		return runAsTenant("user_git", fn).finally(() => { delete process.env.LH_HOSTED; });
	};

	it("lets the 127.0.0.1 fixture through under the test flag", async () => {
		const tip = await hosted(() => repoRemote.tip({ url: remote.url("notes") }));
		assert.equal(tip.commit, remote.tip("notes"));
		const { entries } = await hosted(() => collect(remote.url("trunk"), "trunk"));
		assert.deepEqual(entries.map((e) => e.path), ["a.md"]);
	});

	it("refuses loopback names, private, link-local and unspecified addresses before connecting", async () => {
		for (const url of ["https://localhost/oliver/notes.git", "https://127.0.0.2/x.git", "https://10.0.0.1/x.git", "https://192.168.1.10/x.git", "https://169.254.169.254/x.git", "https://[::1]/x.git", "https://[fd00::1]/x.git", "https://0.0.0.0/x.git"]) {
			const refused = await failure(hosted(() => repoRemote.tip({ url })));
			assert.equal(refused.code, "address-blocked", url);
			assert.equal(refused.message, "This address can't be reached from the hosted app.");
		}
	});

	it("refuses a redirect to a blocked address", async () => {
		const moved = remote.redirect("to-private", "https://10.0.0.1/repo");
		const refused = await failure(hosted(() => repoRemote.tip({ url: `${moved}/notes.git` })));
		assert.equal(refused.code, "address-blocked");
	});

	it("checks at connect time: a name resolving to loopback is refused by the lookup hook", async () => {
		// localhost resolves to 127.0.0.1 (or ::1); without the flag even 127.0.0.1 is blocked.
		const flag = process.env.LH_TEST_GIT_LOOPBACK_HTTP;
		delete process.env.LH_TEST_GIT_LOOPBACK_HTTP;
		try {
			const refused = await failure(hosted(() => repoRemote.tip({ url: "https://localhost:1/x.git" })));
			assert.equal(refused.code, "address-blocked");
		} finally {
			process.env.LH_TEST_GIT_LOOPBACK_HTTP = flag;
		}
	});

	it("allows the same addresses outside hosted mode", async () => {
		// Local and Electron may reach a LAN git server: the request goes out and fails as network, not blocked.
		const refused = await failure(repoRemote.tip({ url: "https://localhost:1/x.git" }));
		assert.equal(refused.code, "network");
	});
});
