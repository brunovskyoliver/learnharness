/** Feature 026 tenancy (SC-007, T049): in hosted mode two tenants' repo
 *  links, tokens, pending first links, mirrored bytes, events and pull
 *  schedules are invisible to each other, and repo-link state used outside
 *  a tenant throws instead of falling back to the shared root. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-tenant-repo-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_HOSTED = "1";
const { runAsTenant } = await import("../config.ts");
const routes = await import("../src/server/repo-links.ts");
const sync = await import("../src/server/repo-sync.ts");
const { libraryStore } = await import("../src/store/library.ts");
const { repoTokens } = await import("../src/store/repo-tokens.ts");
const { libraryTextIdle } = await import("../src/server/library-text.ts");
const { eventsResponse } = await import("../src/server/events-stream.ts");
type RepoRemote = import("../src/core/ports.ts").RepoRemote;
after(() => {
	delete process.env.LH_HOSTED;
	fs.rmSync(dir, { recursive: true, force: true });
});

const enc = (text: string) => new TextEncoder().encode(text);
const TOKEN_A = "ghp_tenantAAAA1111sentinel";
const calls = { tip: [] as string[] };
let held: Promise<void> | undefined;
const fake: RepoRemote = {
	async tip(request) {
		calls.tip.push(request.url);
		return { branch: request.branch ?? "main", commit: "a".repeat(40) };
	},
	async snapshot(request, visit) {
		await held;
		await visit({ path: "README.md", mode: "100644", oid: "b".repeat(40), type: "blob", read: async () => enc(`# ${request.url}\n`) });
		return { branch: request.branch, commit: "a".repeat(40) };
	},
};
const ticking: (() => void)[] = [];

let n = 0;
const post = (name: string, token?: string) => routes.repoLinkCreateResponse(new Request("http://app.test/api/library/links", {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ url: `https://github.com/oliver/${name}`, folderName: name, parentId: null, requestId: `req_${++n}`, ...(token ? { token } : {}) }),
}));
const list = async () => (await routes.repoLinksListResponse()).json() as Promise<{ links: { id: string }[]; pending: { requestId: string }[] }>;
const settled = async () => { await sync.repoSyncIdle(); await libraryTextIdle(); };

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
	calls.tip = [];
	held = undefined;
	ticking.length = 0;
	sync.setRepoRemote(fake);
	sync.setRepoTimers({ every(_ms, run) { ticking.push(run); return () => { ticking.splice(ticking.indexOf(run), 1); }; } });
});
afterEach(async () => {
	for (const user of ["user_a", "user_b"]) await runAsTenant(user, async () => { await settled(); sync.resetRepoSchedule(); });
	sync.setRepoRemote();
	sync.setRepoTimers();
});

describe("two tenants' repo links (SC-007)", () => {
	it("links, tokens, folders and mirrored bytes stay with their tenant", async () => {
		const created = await runAsTenant("user_a", async () => {
			const response = await post("alpha", TOKEN_A);
			assert.equal(response.status, 201);
			return (await response.json()) as { link: { id: string } };
		});
		const id = created.link.id;
		await runAsTenant("user_a", settled);

		await runAsTenant("user_b", async () => {
			assert.deepEqual((await list()).links, []);
			assert.deepEqual(await libraryStore.repoLinks(), []);
			assert.deepEqual(await libraryStore.folders(), []);
			assert.deepEqual(await libraryStore.list(), []);
			assert.equal(repoTokens.get(id), null);
			assert.equal(repoTokens.mask(id), null);
			// Another tenant's link id answers as missing on every route.
			assert.equal((await routes.repoLinkSyncResponse(id)).status, 404);
			assert.equal((await routes.repoLinkPatchResponse(new Request("http://app.test", { method: "PATCH", body: JSON.stringify({ token: "ghp_other" }) }), id)).status, 404);
			assert.equal((await routes.repoLinkDeleteResponse(id)).status, 404);
		});

		await runAsTenant("user_a", async () => {
			assert.equal((await list()).links.length, 1);
			assert.equal(repoTokens.get(id), TOKEN_A, "user_b's attempts changed nothing");
		});
		const userA = path.join(dir, "users", "user_a");
		const userB = path.join(dir, "users", "user_b");
		assert.ok(fs.existsSync(path.join(userA, "files", ".mirrors", id)));
		assert.ok(fs.existsSync(path.join(userA, "git-tokens.json")));
		assert.ok(!fs.existsSync(path.join(userB, "files", ".mirrors", id)));
		assert.ok(!fs.existsSync(path.join(userB, "git-tokens.json")));
		assert.ok(!fs.existsSync(path.join(dir, "git-tokens.json")), "nothing in the shared root");
		assert.ok(!fs.existsSync(path.join(dir, "files", ".mirrors")));
	});

	it("a pending first link shows only in its own tenant's list", async () => {
		let open!: () => void;
		held = new Promise<void>((resolve) => { open = resolve; });
		const linking = runAsTenant("user_a", () => post("slow"));
		const until = Date.now() + 5000;
		while (runAsTenant("user_a", () => sync.pendingLinks().length) === 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 5));
		assert.equal(runAsTenant("user_a", () => sync.pendingLinks().length), 1);
		await runAsTenant("user_b", async () => {
			assert.deepEqual(sync.pendingLinks(), []);
			assert.deepEqual((await list()).pending, []);
		});
		open();
		assert.equal((await linking).status, 201);
	});

	it("events reach only the emitting tenant's windows", async () => {
		const read = async (stream: ReadableStream<Uint8Array>, ms: number) => {
			const reader = stream.getReader();
			const decoder = new TextDecoder();
			let text = "";
			const stop = setTimeout(() => void reader.cancel(), ms);
			try {
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					text += decoder.decode(value);
				}
			} catch { /* cancelled */ }
			clearTimeout(stop);
			return text;
		};
		const streamA = runAsTenant("user_a", () => eventsResponse()).body!;
		const streamB = runAsTenant("user_b", () => eventsResponse()).body!;
		const textA = read(streamA, 400);
		const textB = read(streamB, 400);
		await runAsTenant("user_a", async () => { assert.equal((await post("evented")).status, 201); });
		assert.match(await textA, /event: library-sync/);
		assert.doesNotMatch(await textB, /library-sync|library-changed/);
	});

	it("a window pulls only its own tenant's links", async () => {
		await runAsTenant("user_a", async () => { assert.equal((await post("mine")).status, 201); await settled(); });
		await runAsTenant("user_b", async () => { assert.equal((await post("theirs")).status, 201); await settled(); });
		calls.tip = [];
		const close = runAsTenant("user_b", () => sync.openWindow());
		await runAsTenant("user_b", settled);
		assert.deepEqual(calls.tip, ["https://github.com/oliver/theirs"]);
		assert.equal(ticking.length, 1, "one timer, user_b's");
		calls.tip = [];
		runAsTenant("user_b", () => ticking[0]!());
		await runAsTenant("user_b", settled);
		assert.deepEqual(calls.tip, ["https://github.com/oliver/theirs"]);
		close();
		assert.equal(ticking.length, 0);
	});
});

describe("hosted repo-link state outside a tenant", () => {
	it("throws instead of reading the shared root", async () => {
		assert.throws(() => sync.pendingLinks(), /outside a tenant/);
		assert.throws(() => repoTokens.get("rpl_x"), /outside a tenant/);
		assert.throws(() => repoTokens.set("rpl_x", "ghp_x"), /outside a tenant/);
		await assert.rejects(libraryStore.repoLinks(), /outside a tenant/);
		await assert.rejects(routes.repoLinksListResponse(), /outside a tenant/);
		assert.throws(() => sync.openWindow(), /outside a tenant/);
		assert.ok(!fs.existsSync(path.join(dir, "git-tokens.json")));
	});
});
