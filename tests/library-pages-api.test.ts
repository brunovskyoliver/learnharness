/** The page routes' handlers per contracts/library-api.md (T050). */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-pages-api-")));
process.env.LH_DATA_DIR = dir;
const { runAsTenant } = await import("../config.ts");
const api = await import("../src/server/library.ts");
const { PAGE_MAX_BYTES } = await import("../src/core/library.ts");
after(() => { delete process.env.LH_HOSTED; fs.rmSync(dir, { recursive: true, force: true }); });

const req = (body: unknown, method = "POST") => new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const create = async (name: string, content = "one") => {
	const r = await api.pageCreateResponse(req({ name, content }));
	assert.equal(r.status, 201);
	return (await r.json()) as { item: { id: string; kind: string; headVersion: number }; head: { n: number } };
};

describe("page routes", () => {
	it("POST creates: 201, 400 and 409 with a free name, 413", async () => {
		const made = await create("Week 3");
		assert.equal(made.item.kind, "page");
		assert.equal(made.head.n, 1);
		assert.equal(made.item.headVersion, 1);
		assert.equal((await api.pageCreateResponse(req({ name: "a/b" }))).status, 400);
		assert.equal((await api.pageCreateResponse(req("{not json"))).status, 400);
		const clash = await api.pageCreateResponse(req({ name: "week 3" }));
		assert.equal(clash.status, 409);
		assert.deepEqual(await clash.json(), { error: "week 3 is already in your Library.", code: "name_taken", name: "week 3", suggestedName: "week 3 (2)" });
		assert.equal((await api.pageCreateResponse(req({ name: "big", content: "x".repeat(PAGE_MAX_BYTES + 1) }))).status, 413);
	});
	it("GET reads head and draft, no-store; 404 for a document or unknown id", async () => {
		const { item } = await create("Read");
		const r = await api.pageReadResponse(item.id);
		assert.equal(r.status, 200);
		assert.equal(r.headers.get("cache-control"), "no-store");
		const body = await r.json() as { head: { n: number; content: string; author: string }; draft: unknown };
		assert.equal(body.head.content, "one");
		assert.equal(body.head.author, "learner");
		assert.equal(body.draft, null);
		assert.equal((await api.pageReadResponse("lib_none")).status, 404);
	});
	it("PUT draft: 200 with rev, 409 stale with the current state, 413, 400", async () => {
		const { item } = await create("Draft");
		const ok = await api.pageDraftResponse(req({ base: 1, rev: 0, content: "d1" }, "PUT"), item.id);
		assert.equal(ok.status, 200);
		const { rev } = await ok.json() as { rev: number };
		const stale = await api.pageDraftResponse(req({ base: 1, rev: 0, content: "d2" }, "PUT"), item.id);
		assert.equal(stale.status, 409);
		const body = await stale.json() as { code: string; head: { n: number }; draft: { rev: number; content: string } };
		assert.equal(body.code, "stale");
		assert.equal(body.head.n, 1);
		assert.deepEqual([body.draft.rev, body.draft.content], [rev, "d1"]);
		assert.equal((await api.pageDraftResponse(req({ base: 1, rev, content: "x".repeat(PAGE_MAX_BYTES + 1) }, "PUT"), item.id)).status, 413);
		assert.equal((await api.pageDraftResponse(req({ base: "1", rev, content: "x" }, "PUT"), item.id)).status, 400);
		assert.equal((await api.pageReadResponse(item.id)).status, 200);
		assert.equal(((await (await api.pageReadResponse(item.id)).json()) as { draft: { content: string } }).draft.content, "d1", "the draft is kept");
	});
	it("POST versions: 201, draft cleared; 409 stale; conflict accepted; a client can't name a server cause", async () => {
		const { item } = await create("Versions");
		const first = await api.pageCommitResponse(req({ base: 1, rev: 0, content: "two" }), item.id);
		assert.equal(first.status, 201);
		assert.equal(((await first.json()) as { version: { n: number } }).version.n, 2);
		assert.equal((await api.pageCommitResponse(req({ base: 1, rev: 0, content: "old tab" }), item.id)).status, 409);
		const conflict = await api.pageCommitResponse(req({ base: 1, rev: 0, content: "old tab", cause: "conflict" }), item.id);
		assert.equal(conflict.status, 201);
		assert.equal(((await conflict.json()) as { version: { cause: string } }).version.cause, "conflict");
		const forged = await api.pageCommitResponse(req({ base: 3, rev: 0, content: "forged", cause: "agent-revise" }), item.id);
		assert.equal(((await forged.json()) as { version: { cause: string; author: string } }).version.cause, "save");
		const unchanged = await api.pageCommitResponse(req({ base: 4, rev: 0, content: "forged" }), item.id);
		assert.equal(unchanged.status, 200, "no version for identical text");
	});
	it("GET versions is metadata only, newest first; GET one has its text; 404s", async () => {
		const { item } = await create("List");
		await api.pageCommitResponse(req({ base: 1, rev: 0, content: "two" }), item.id);
		const { versions } = await (await api.pageVersionsResponse(item.id)).json() as { versions: Record<string, unknown>[] };
		assert.deepEqual(versions.map((v) => v.n), [2, 1]);
		assert.ok(versions.every((v) => !("content" in v)));
		assert.equal(((await (await api.pageVersionResponse(item.id, "1")).json()) as { content: string }).content, "one");
		assert.equal((await api.pageVersionResponse(item.id, "9")).status, 404);
		assert.equal((await api.pageVersionResponse(item.id, "abc")).status, 404);
		assert.equal((await api.pageVersionsResponse("lib_none")).status, 404);
	});
	it("POST restore: 201 with a new version; 404 for an unknown one", async () => {
		const { item } = await create("Restore");
		await api.pageCommitResponse(req({ base: 1, rev: 0, content: "two" }), item.id);
		const r = await api.pageRestoreResponse(req({ n: 1 }), item.id);
		assert.equal(r.status, 201);
		assert.equal(((await r.json()) as { version: { n: number; restoredFrom: number } }).version.restoredFrom, 1);
		assert.equal((await api.pageRestoreResponse(req({ n: 42 }), item.id)).status, 404);
	});
	it("tenants never see each other's pages; hosted without a tenant refuses", async () => {
		process.env.LH_HOSTED = "1";
		try {
			const made = await runAsTenant("user_a", () => create("Private"));
			assert.equal((await runAsTenant("user_b", () => api.pageReadResponse(made.item.id))).status, 404);
			assert.equal((await runAsTenant("user_b", () => api.pageDraftResponse(req({ base: 1, rev: 0, content: "x" }, "PUT"), made.item.id))).status, 404);
			assert.equal((await runAsTenant("user_a", () => api.pageReadResponse(made.item.id))).status, 200);
			await assert.rejects(async () => api.pageReadResponse(made.item.id));
		} finally {
			delete process.env.LH_HOSTED;
		}
	});
});
