/** Library folders (feature 011): nesting, cycles, name clashes, migration and
 *  tenant separation, against a real temp folder. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-library-folders-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore } = await import("../src/store/library.ts");
const { folderPathLabel, folderTrail, isRefusal, wouldCycle } = await import("../src/core/library.ts");
const { folderCreateResponse, folderDeleteResponse, folderPatchResponse, libraryListResponse, libraryPatchResponse } = await import("../src/server/library.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const catalogPath = path.join(dir, "library", "catalog.json");
async function* body(text: string) { yield new TextEncoder().encode(text); }
const folder = async (name: string, parent: string | null = null) => {
	const made = await libraryStore.createFolder(name, parent);
	assert.ok(!isRefusal(made));
	return made;
};
const send = (method: string, value: unknown) => new Request("http://x/", { method, body: JSON.stringify(value), headers: { "Content-Type": "application/json" } });

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

describe("folders", () => {
	it("nests, and paths read from the top down", async () => {
		const a = await folder("Physics");
		const b = await folder("Waves", a.id);
		const folders = await libraryStore.folders();
		assert.deepEqual(folderTrail(b.id, folders).map((f) => f.name), ["Physics", "Waves"]);
		assert.equal(folderPathLabel(b.id, folders), "Physics / Waves");
	});

	it("refuses a move into itself or below it", async () => {
		const a = await folder("a");
		const b = await folder("b", a.id);
		const c = await folder("c", b.id);
		for (const target of [a.id, c.id]) {
			const result = await libraryStore.moveFolder(a.id, target);
			assert.ok(result && isRefusal(result) && result.refused === "folder_cycle");
		}
		assert.equal((await libraryStore.folders()).find((f) => f.id === a.id)?.parentId, null);
	});

	it("no sequence of allowed moves makes a cycle", async () => {
		const ids: string[] = [];
		for (let i = 0; i < 8; i++) ids.push((await folder(`f${i}`)).id);
		let seed = 7;
		const next = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
		for (let round = 0; round < 200; round++) {
			await libraryStore.moveFolder(ids[next(8)]!, next(4) === 0 ? null : ids[next(8)]!);
		}
		const folders = await libraryStore.folders();
		for (const f of folders) {
			let current: typeof f | undefined = f;
			const seen = new Set<string>();
			while (current) {
				assert.ok(!seen.has(current.id), "a folder reached itself");
				seen.add(current.id);
				current = folders.find((p) => p.id === current!.parentId);
			}
		}
		assert.equal(wouldCycle("a", "a", [{ id: "a", parentId: null }]), true);
	});

	it("sibling names never collide, cousins may match", async () => {
		const a = await folder("a");
		const b = await folder("b");
		await folder("same", a.id);
		const other = await folder("same", b.id);
		const clash = await libraryStore.createFolder("SAME", a.id);
		assert.ok(isRefusal(clash) && clash.refused === "name_taken" && clash.suggestedName === "SAME (2)");
		const moved = await libraryStore.moveFolder(other.id, a.id);
		assert.ok(moved && isRefusal(moved) && moved.refused === "name_taken");
	});

	it("a folder with anything in it is not deleted", async () => {
		const a = await folder("a");
		const page = await libraryStore.createPage("p", "text", { author: "learner", folderId: a.id });
		assert.ok(!isRefusal(page));
		const refused = await libraryStore.removeFolder(a.id);
		assert.ok(refused !== true && refused !== false && refused.refused === "folder_not_empty");
		await libraryStore.moveItem(page.item.id, null);
		assert.equal(await libraryStore.removeFolder(a.id), true);
		assert.equal(await libraryStore.removeFolder(a.id), false);
	});
});

describe("items in folders", () => {
	it("a moved upload keeps its bytes, id and flat file", async () => {
		const a = await folder("a");
		const item = await libraryStore.writeUpload("n.md", body("# hi"), 4);
		assert.ok(!isRefusal(item));
		const moved = await libraryStore.moveItem(item.id, a.id);
		assert.ok(moved && !isRefusal(moved));
		assert.equal(moved.id, item.id);
		assert.equal(moved.folderId, a.id);
		assert.equal(moved.updatedAt, item.updatedAt);
		assert.equal(fs.readFileSync(path.join(dir, "files", "n.md"), "utf8"), "# hi");
		assert.equal((await libraryStore.list())[0]?.folderId, a.id, "reconciling keeps the folder");
	});

	it("a moved page keeps its versions and draft", async () => {
		const a = await folder("a");
		const page = await libraryStore.createPage("p", "one", { author: "learner" });
		assert.ok(!isRefusal(page));
		await libraryStore.savePageDraft(page.item.id, { base: page.head.n, rev: 0, content: "two" });
		await libraryStore.moveItem(page.item.id, a.id);
		const state = await libraryStore.readPage(page.item.id);
		assert.equal(state?.draft?.content, "two");
		assert.equal((await libraryStore.listPageVersions(page.item.id))?.length, 1);
	});

	it("uploading to a missing folder stores nothing", async () => {
		const result = await libraryStore.writeUpload("n.md", body("# hi"), 4, "fld_gone");
		assert.ok(isRefusal(result) && result.refused === "folder_missing");
		assert.equal(fs.existsSync(path.join(dir, "files", "n.md")), false);
	});
});

describe("migration", () => {
	it("a feature 009 catalog reads whole and survives a write byte-compatible", async () => {
		fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
		const before = { version: 1, items: [{ id: "lib_old", name: "p", kind: "page", size: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", origin: { type: "learner" }, headVersion: 1 }, { id: "lib_dead", name: "gone", kind: "text", deletedAt: "2026-01-01T00:00:00.000Z" }] };
		fs.writeFileSync(catalogPath, JSON.stringify(before));
		assert.deepEqual((await libraryStore.list()).map((i) => [i.id, i.folderId]), [["lib_old", undefined]]);
		assert.deepEqual(await libraryStore.folders(), []);
		await folder("a");
		const after = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
		assert.equal(after.version, 1, "an older app can still open it");
		assert.deepEqual(after.items, before.items);
	});

	it("an item in a dangling folder is still listed", async () => {
		fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
		fs.writeFileSync(catalogPath, JSON.stringify({ version: 1, items: [{ id: "lib_x", name: "p", kind: "page", size: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", origin: { type: "learner" }, folderId: "fld_gone" }] }));
		assert.equal((await libraryStore.list()).length, 1);
	});
});

describe("API", () => {
	it("maps every outcome to an honest status", async () => {
		const made = await folderCreateResponse(send("POST", { name: "a" }));
		assert.equal(made.status, 201);
		const { folder: a } = await made.json() as { folder: { id: string } };
		assert.equal((await folderCreateResponse(send("POST", { name: "a" }))).status, 409);
		assert.equal((await folderCreateResponse(send("POST", { name: "b", parentId: "fld_gone" }))).status, 404);
		assert.equal((await folderCreateResponse(send("POST", { name: "../x" }))).status, 400);
		assert.equal((await folderPatchResponse(send("PATCH", { parentId: a.id }), a.id)).status, 409);
		assert.equal((await folderPatchResponse(send("PATCH", { parentId: 3 }), a.id)).status, 400);
		assert.equal((await folderPatchResponse(send("PATCH", { name: "z" }), "fld_gone")).status, 404);
		const list = await (await libraryListResponse()).json() as { folders: unknown[] };
		assert.equal(list.folders.length, 1);
		assert.equal((await libraryPatchResponse(send("PATCH", { folderId: a.id }), "lib_gone")).status, 404);
		assert.equal((await folderDeleteResponse(a.id)).status, 200);
		assert.equal((await folderDeleteResponse(a.id)).status, 404);
	});
});

describe("tenants", () => {
	it("a folder id from another tenant does not exist", async () => {
		const { runAsTenant } = await import("../config.ts");
		const a = await runAsTenant("tenant-a", () => folder("mine"));
		const reached = await runAsTenant("tenant-b", () => libraryStore.moveFolder(a.id, null));
		assert.equal(reached, null);
		const listed = await runAsTenant("tenant-b", () => libraryStore.folders());
		assert.deepEqual(listed, []);
	});
});

describe("move targets", () => {
	it("a folder can't choose itself or anything below it", async () => {
		const { moveTargets } = await import("../components/library/folder-dialogs.tsx");
		const a = await folder("a");
		const b = await folder("b", a.id);
		const c = await folder("c");
		const folders = await libraryStore.folders();
		assert.deepEqual(moveTargets(folders, { folderId: a.id }).map((t) => t.id), [null, c.id]);
		assert.deepEqual(moveTargets(folders, null).map((t) => t.label), ["Library", "a", "a / b", "c"]);
		assert.ok(b);
	});
});
