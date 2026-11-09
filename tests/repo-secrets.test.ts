/** Feature 026 secrets (SC-006, FR-004, FR-026, R8, T050): a link, a failed
 *  pull, a token replace and an unlink against a real token-protected git
 *  remote, then a scan of everything the app said or wrote for the sentinel
 *  token: console output, every response body, and every file under the data
 *  directory except git-tokens.json (catalog, index shards, the mirror,
 *  git-work leftovers). The token never reaches auth.json, process.env or the
 *  Settings keys listing, and no model call happens. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { GitRemote, skipReason } from "./fixtures/git-remote.ts";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-repo-secrets-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_TEST_GIT_LOOPBACK_HTTP = "1";
const routes = await import("../src/server/repo-links.ts");
const { libraryContentResponse, libraryListResponse } = await import("../src/server/library.ts");
const { repoSyncIdle } = await import("../src/server/repo-sync.ts");
const { libraryStore } = await import("../src/store/library.ts");
const { libraryTextIdle } = await import("../src/server/library-text.ts");
const { keyStatuses, providerKeyList } = await import("../src/server/keys.ts");

const skip = skipReason();
const TOKEN = "ghp_sentinelSECRETS9090qq";
const NEXT_TOKEN = "ghp_sentinelNEXT5151ww";
const WRONG = "ghp_sentinelWRONG3131ee";
const SENTINELS = [TOKEN, NEXT_TOKEN, WRONG];
const logged: string[] = [];
const bodies: string[] = [];
const fetched: string[] = [];
const originals = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug, fetch: globalThis.fetch };
let remote: GitRemote;

before(async () => {
	for (const level of ["log", "warn", "error", "info", "debug"] as const) {
		console[level] = (...args: unknown[]) => { logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" ")); };
	}
	// Model providers all go through fetch; the git client uses node:http.
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		fetched.push(String(input instanceof Request ? input.url : input));
		return originals.fetch(input, init);
	}) as typeof fetch;
	if (skip) return;
	remote = await GitRemote.start();
	remote.createRepo("private", { "README.md": "# private\n", "week1/notes.md": "# week 1\n" }, { token: TOKEN });
});
after(async () => {
	Object.assign(console, { log: originals.log, warn: originals.warn, error: originals.error, info: originals.info, debug: originals.debug });
	globalThis.fetch = originals.fetch;
	await remote?.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

const record = async (response: Response) => {
	const text = await response.clone().text();
	bodies.push(text);
	return response;
};
const filesUnder = (root: string): string[] => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
	const full = path.join(root, entry.name);
	return entry.isDirectory() ? filesUnder(full) : entry.isFile() ? [full] : [];
});

describe("a repo token never leaves git-tokens.json (SC-006)", { skip }, () => {
	it("link, failed pull, replace, sync and unlink leak nothing", async () => {
		const created = await record(await routes.repoLinkCreateResponse(new Request("http://app.test/api/library/links", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: remote.url("private"), folderName: "Private notes", parentId: null, requestId: "req_secret", token: TOKEN }),
		})));
		assert.equal(created.status, 201, bodies.at(-1));
		const { link } = await created.json() as { link: { id: string; tokenMask: string } };
		await libraryTextIdle();

		await record(await routes.repoLinksListResponse());
		await record(await libraryListResponse());
		for (const item of await libraryStore.list()) {
			const content = await record(await libraryContentResponse(new Request(`http://app.test/api/library/items/${item.id}/content`), item.id));
			assert.equal(content.status, 200, item.name);
		}

		// A wrong token: the pull fails as auth, the failure is shown, the token is not.
		remote.setToken("private", TOKEN);
		await record(await routes.repoLinkPatchResponse(new Request("http://app.test", { method: "PATCH", body: JSON.stringify({ token: WRONG }) }), link.id));
		remote.commit("private", { "week2/notes.md": "# week 2\n" });
		await record(await routes.repoLinkSyncResponse(link.id));
		await repoSyncIdle();
		const failed = (await libraryStore.repoLinks()).find((l) => l.id === link.id)!;
		assert.equal(failed.sync.state, "failed");
		assert.equal(failed.sync.failure?.code, "auth");
		await record(await routes.repoLinksListResponse());

		// The right token again, under a new value upstream.
		remote.setToken("private", NEXT_TOKEN);
		await record(await routes.repoLinkPatchResponse(new Request("http://app.test", { method: "PATCH", body: JSON.stringify({ token: NEXT_TOKEN }) }), link.id));
		await record(await routes.repoLinkSyncResponse(link.id));
		await repoSyncIdle();
		await libraryTextIdle();
		assert.equal((await libraryStore.repoLinks()).find((l) => l.id === link.id)!.sync.state, "synced");
		await record(await routes.repoLinksListResponse());
		await record(await libraryListResponse());

		// While linked, the token sits in git-tokens.json only, at 0600.
		const tokensPath = path.join(dir, "git-tokens.json");
		assert.equal(fs.statSync(tokensPath).mode & 0o777, 0o600);
		assert.ok(fs.readFileSync(tokensPath, "utf8").includes(NEXT_TOKEN));
		const scan = (label: string) => {
			for (const file of filesUnder(dir)) {
				if (file === tokensPath) continue;
				const text = fs.readFileSync(file, "latin1");
				for (const sentinel of SENTINELS) assert.ok(!text.includes(sentinel), `${label}: ${path.relative(dir, file)} holds a token`);
			}
		};
		scan("linked");
		assert.ok(!fs.existsSync(path.join(dir, "auth.json")) || SENTINELS.every((s) => !fs.readFileSync(path.join(dir, "auth.json"), "utf8").includes(s)));
		for (const sentinel of SENTINELS) assert.ok(!Object.values(process.env).some((v) => v?.includes(sentinel)), "no token in process.env");
		const keysListing = JSON.stringify({ statuses: keyStatuses(), providers: providerKeyList() });
		for (const sentinel of SENTINELS) assert.ok(!keysListing.includes(sentinel), "no token on the keys page");
		assert.ok(!keysListing.includes(link.id), "a repo link is not a provider key");

		await record(await routes.repoLinkDeleteResponse(link.id));
		await repoSyncIdle();
		scan("unlinked");
		assert.ok(!fs.existsSync(tokensPath) || !SENTINELS.some((s) => fs.readFileSync(tokensPath, "utf8").includes(s)), "unlink deletes the token");

		for (const body of bodies) for (const sentinel of SENTINELS) assert.ok(!body.includes(sentinel), `a response body holds a token: ${body.slice(0, 120)}`);
		for (const line of logged) for (const sentinel of SENTINELS) assert.ok(!line.includes(sentinel), `console output holds a token: ${line.slice(0, 120)}`);
		assert.ok(remote.requests.some((r) => r.authorization), "the token did go to the remote, as Basic auth");
	});

	it("no model call happens during link, pull or unlink (FR-026)", () => {
		assert.deepEqual(fetched, []);
	});
});
