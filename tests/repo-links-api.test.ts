/** Feature 026 repo-link routes (contracts/api.md), create part (US1): every
 *  refusal before any fetch, the first pull in the request, nothing kept on
 *  failure, the pending row, the token only as a mask, the hosted address
 *  block, and the content route reading mirrored bytes (R4). */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-repo-links-")));
process.env.LH_DATA_DIR = dir;
const { runAsTenant } = await import("../config.ts");
const { repoLinkCreateResponse, repoLinksListResponse } = await import("../src/server/repo-links.ts");
const { libraryContentResponse, libraryListResponse } = await import("../src/server/library.ts");
const { setRepoRemote } = await import("../src/server/repo-sync.ts");
const { libraryStore } = await import("../src/store/library.ts");
const { libraryTextIdle } = await import("../src/server/library-text.ts");
const { RepoRemoteError } = await import("../src/core/repo-link.ts");
type RepoRemote = import("../src/core/ports.ts").RepoRemote;
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const TOKEN = "ghp_sentinelLINKS4242zz";
const enc = (text: string) => new TextEncoder().encode(text);
const TREE: Record<string, Uint8Array> = {
	"README.md": enc("# notes\n"),
	"week1/notes.md": enc("# week 1\n"),
	"tools/run.exe": enc("MZ"),
};

/** A remote held in memory, counting calls; `gate` holds the snapshot until released. */
function fakeRemote(options: { fail?: () => Error; gate?: Promise<void> } = {}) {
	const calls = { tip: 0, snapshot: 0, tokens: [] as (string | undefined)[] };
	const remote: RepoRemote = {
		async tip(request) {
			calls.tip++;
			calls.tokens.push(request.token);
			if (options.fail) throw options.fail();
			return { branch: request.branch ?? "main", commit: "c".repeat(40) };
		},
		async snapshot(request, visit) {
			calls.snapshot++;
			await options.gate;
			for (const [p, bytes] of Object.entries(TREE)) {
				await visit({ path: p, mode: "100644", oid: Buffer.from(p).toString("hex").padEnd(40, "0").slice(0, 40), type: "blob", read: async () => bytes });
			}
			return { branch: request.branch, commit: "c".repeat(40) };
		},
	};
	return { remote, calls };
}

let requestN = 0;
const post = (body: Record<string, unknown>) => repoLinkCreateResponse(new Request("http://app.test/api/library/links", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ url: "https://github.com/oliver/notes", folderName: "Lecture notes", parentId: null, requestId: `req_${++requestN}`, ...body }),
}));
const listLinks = async () => (await repoLinksListResponse()).json() as Promise<{ links: { id: string; tokenMask: string | null; display: string; sync: { state: string } }[]; pending: { requestId: string; folderName: string }[]; limits: { maxLinks: number } }>;
const catalogText = () => fs.readFileSync(path.join(dir, "library", "catalog.json"), "utf8");
const tokensFile = () => path.join(dir, "git-tokens.json");

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});
afterEach(async () => {
	setRepoRemote();
	// Text indexing of new mirrored files runs in the background.
	await libraryTextIdle();
});

describe("POST /api/library/links refusals, before any fetch", () => {
	const cases: [string, Record<string, unknown>, number, string][] = [
		["ssh", { url: "git@github.com:oliver/notes.git" }, 400, "not_https"],
		["http", { url: "http://github.com/oliver/notes" }, 400, "not_https"],
		["credential", { url: "https://oliver:hunter2@github.com/oliver/notes" }, 400, "credential_in_address"],
		["not an address", { url: "notes" }, 400, "invalid_address"],
		["bad branch", { branch: "feature..x" }, 400, "invalid_branch"],
		["bad folder name", { folderName: ".hidden" }, 400, "invalid_name"],
		["missing parent", { parentId: "fld_gone" }, 404, "folder_missing"],
	];
	for (const [label, body, status, code] of cases) {
		it(`${label} → ${status} ${code}`, async () => {
			const { remote, calls } = fakeRemote();
			setRepoRemote(remote);
			const response = await post(body);
			assert.equal(response.status, status);
			const parsed = await response.json() as { code: string; error: string };
			assert.equal(parsed.code, code);
			assert.ok(!parsed.error.includes("hunter2"), "a refusal never echoes the credential");
			assert.equal(calls.tip + calls.snapshot, 0);
		});
	}

	it("a name clash → 409 with suggestedName; a parent inside a mirror → 409 repo_folder", async () => {
		const { remote, calls } = fakeRemote();
		setRepoRemote(remote);
		await libraryStore.createFolder("Lecture notes", null);
		const clash = await post({});
		assert.equal(clash.status, 409);
		assert.deepEqual(await clash.json(), { error: "Lecture notes is already a folder here.", code: "name_taken", name: "Lecture notes", suggestedName: "Lecture notes (2)" });
		assert.equal(calls.tip, 0);

		const linked = await post({ folderName: "Repo" });
		assert.equal(linked.status, 201);
		const week1 = (await libraryStore.folders()).find((f) => f.mirror?.path === "week1")!;
		const before = calls.tip;
		const inside = await post({ folderName: "Other", parentId: week1.id, url: "https://github.com/oliver/other" });
		assert.equal(inside.status, 409);
		assert.deepEqual(await inside.json(), { error: "Repo mirrors a repo. Add files in the repo instead.", code: "repo_folder", name: "Repo" });
		assert.equal(calls.tip, before);
	});

	it("hosted: a private, loopback or link-local address → 403 address_blocked before any fetch (FR-030)", async () => {
		const { remote, calls } = fakeRemote();
		setRepoRemote(remote);
		process.env.LH_HOSTED = "1";
		try {
			for (const url of ["https://10.1.2.3/x/notes", "https://127.0.0.1/x/notes", "https://[::1]/x/notes", "https://169.254.169.254/x/notes", "https://localhost/x/notes"]) {
				const response = await runAsTenant("user_links", () => post({ url }));
				assert.equal(response.status, 403, url);
				assert.deepEqual(await response.json(), { error: "This address can't be reached from the hosted app.", code: "address_blocked" });
			}
		} finally {
			delete process.env.LH_HOSTED;
		}
		assert.equal(calls.tip + calls.snapshot, 0);
	});
});

describe("POST /api/library/links, the first pull", () => {
	it("201 with the link and folder; the token stored only as a mask", async () => {
		const { remote, calls } = fakeRemote();
		setRepoRemote(remote);
		const response = await post({ token: `  ${TOKEN}  ` });
		assert.equal(response.status, 201);
		const text = await response.text();
		assert.ok(!text.includes(TOKEN), "the response never carries the token");
		const body = JSON.parse(text) as { link: { id: string; folderId: string; tokenMask: string; display: string; url: string; branch: string; branchGiven: boolean; sync: { state: string; skipped: { unsupported: number } } }; folder: { id: string; name: string } };
		assert.equal(body.folder.name, "Lecture notes");
		assert.equal(body.link.folderId, body.folder.id);
		assert.equal(body.link.display, "github.com/oliver/notes");
		assert.equal(body.link.url, "https://github.com/oliver/notes");
		assert.equal(body.link.branch, "main");
		assert.equal(body.link.branchGiven, false);
		assert.equal(body.link.sync.state, "synced");
		assert.equal(body.link.sync.skipped.unsupported, 1);
		assert.match(body.link.tokenMask, /…/);
		assert.deepEqual(calls.tokens, [TOKEN]);
		assert.equal(JSON.parse(fs.readFileSync(tokensFile(), "utf8"))[body.link.id], TOKEN);
		assert.equal(fs.statSync(tokensFile()).mode & 0o777, 0o600);
		assert.ok(!catalogText().includes(TOKEN));

		const list = await listLinks();
		assert.deepEqual(list.links.map((l) => [l.id, l.tokenMask]), [[body.link.id, body.link.tokenMask]]);
		assert.equal(list.limits.maxLinks, 10);
		const library = await (await libraryListResponse()).json() as { links: { id: string }[]; items: { name: string; mirror?: unknown }[] };
		assert.deepEqual(library.links.map((l) => l.id), [body.link.id]);
		assert.deepEqual(library.items.map((i) => i.name).sort(), ["README.md", "notes.md"]);
	});

	it("a named branch is kept as given", async () => {
		const { remote } = fakeRemote();
		setRepoRemote(remote);
		const response = await post({ branch: "dev" });
		const body = await response.json() as { link: { branch: string; branchGiven: boolean; tokenMask: null } };
		assert.equal(body.link.branch, "dev");
		assert.equal(body.link.branchGiven, true);
		assert.equal(body.link.tokenMask, null);
	});

	it("422 sync_failed leaves no folder, no link, no token and no snapshot", async () => {
		const { remote } = fakeRemote({ fail: () => new RepoRemoteError({ code: "auth", message: "The repo refused the token. Check that it can read this repo.", detail: "HttpError: 401" }) });
		setRepoRemote(remote);
		const response = await post({ token: TOKEN });
		assert.equal(response.status, 422);
		const body = await response.json() as { code: string; refused: string; failure: { code: string; message: string } };
		assert.equal(body.code, "sync_failed");
		assert.equal(body.refused, "sync_failed");
		assert.equal(body.failure.code, "auth");
		assert.equal(body.failure.message, "The repo refused the token. Check that it can read this repo.");
		assert.deepEqual(await libraryStore.folders(), []);
		assert.deepEqual(await libraryStore.repoLinks(), []);
		assert.equal(fs.existsSync(tokensFile()), false);
		const mirrors = path.join(dir, "files", ".mirrors");
		assert.ok(!fs.existsSync(mirrors) || fs.readdirSync(mirrors).every((link) => fs.readdirSync(path.join(mirrors, link)).length === 0));
	});

	it("shows a pending row while the first pull runs, gone after a failure (US1 #5)", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let failNow = false;
		const { remote } = fakeRemote({ gate });
		const failing: RepoRemote = {
			tip: remote.tip,
			async snapshot(request, visit) {
				await gate;
				if (failNow) throw new RepoRemoteError({ code: "network", message: "The repo's server couldn't be reached.", detail: "ECONNRESET" });
				return remote.snapshot(request, visit);
			},
		};
		setRepoRemote(failing);
		failNow = true;
		const running = post({ requestId: "req_pending" });
		for (let i = 0; i < 50 && (await listLinks()).pending.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
		const during = await listLinks();
		assert.deepEqual(during.pending.map((p) => [p.requestId, p.folderName]), [["req_pending", "Lecture notes"]]);
		assert.deepEqual(during.links, []);
		assert.deepEqual(await libraryStore.folders(), [], "no folder while pending");
		release();
		const response = await running;
		assert.equal(response.status, 422);
		const afterwards = await listLinks();
		assert.deepEqual(afterwards.pending, []);
		assert.deepEqual(afterwards.links, []);
	});
});

describe("GET /api/library/items/:id/content for a mirrored file (R4)", () => {
	it("serves the mirror's bytes, and retries once from a fresh catalog when the snapshot moved", async () => {
		const { remote } = fakeRemote();
		setRepoRemote(remote);
		assert.equal((await post({})).status, 201);
		const item = (await libraryStore.list()).find((i) => i.name === "README.md")!;
		const read = (id: string) => libraryContentResponse(new Request(`http://app.test/api/library/items/${id}/content`), id);
		const first = await read(item.id);
		assert.equal(first.status, 200);
		assert.equal(await first.text(), "# notes\n");

		// A pull swaps the snapshot between the route's read and its open.
		const stale = await libraryStore.get(item.id);
		const catalogFile = path.join(dir, "library", "catalog.json");
		const old = item.mirror!.snapshot!;
		const linkDir = path.join(dir, "files", ".mirrors", item.mirror!.linkId);
		fs.renameSync(path.join(linkDir, old), path.join(linkDir, "snp_next"));
		fs.writeFileSync(catalogFile, fs.readFileSync(catalogFile, "utf8").split(old).join("snp_next"));
		const realGet = libraryStore.get;
		let calls = 0;
		libraryStore.get = async (id) => (++calls === 1 ? stale : realGet(id));
		try {
			const swapped = await read(item.id);
			assert.equal(swapped.status, 200);
			assert.equal(await swapped.text(), "# notes\n");
			assert.equal(calls, 2);
		} finally {
			libraryStore.get = realGet;
		}
	});
});

describe("POST /api/library/links/:id/sync (Sync now, T030)", () => {
	it("202 with the link syncing; a second press joins the running pull; 404 for an unknown id", async () => {
		const { repoLinkSyncResponse } = await import("../src/server/repo-links.ts");
		const { repoSyncIdle } = await import("../src/server/repo-sync.ts");
		const { remote, calls } = fakeRemote();
		setRepoRemote(remote);
		const created = await (await post({ token: TOKEN })).json() as { link: { id: string } };
		const id = created.link.id;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		const held: RepoRemote = { tip: async (request) => { await gate; return remote.tip(request); }, snapshot: remote.snapshot };
		setRepoRemote(held);
		const tipsBefore = calls.tip;
		const first = await repoLinkSyncResponse(id);
		assert.equal(first.status, 202);
		const text = await first.text();
		assert.ok(!text.includes(TOKEN));
		const body = JSON.parse(text) as { link: { id: string; sync: { state: string }; tokenMask: string } };
		assert.equal(body.link.id, id);
		assert.equal(body.link.sync.state, "syncing");
		assert.match(body.link.tokenMask, /…/);
		const second = await repoLinkSyncResponse(id);
		assert.equal(second.status, 202);
		assert.equal((await listLinks()).links[0]!.sync.state, "syncing");
		release();
		await repoSyncIdle();
		assert.equal(calls.tip - tipsBefore, 1, "one pull for two presses");
		assert.deepEqual(calls.tokens.at(-1), TOKEN, "the stored token is used");
		assert.equal((await listLinks()).links[0]!.sync.state, "synced");

		const unknown = await repoLinkSyncResponse("rpl_nope");
		assert.equal(unknown.status, 404);
		assert.equal((await unknown.json() as { code: string }).code, "link_missing");
	});

	it("the content route names the mirrored file's version, so an open reader can tell it changed", async () => {
		const { remote } = fakeRemote();
		setRepoRemote(remote);
		assert.equal((await post({})).status, 201);
		const item = (await libraryStore.list()).find((i) => i.name === "README.md")!;
		const response = await libraryContentResponse(new Request(`http://app.test/api/library/items/${item.id}/content`), item.id);
		assert.equal(response.headers.get("X-Library-Version"), item.mirror!.oid);
		await response.body?.cancel();
	});
});
