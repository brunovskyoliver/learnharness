/** Feature 026 (research R1, R2): mirrored folders and items live beside
 *  `items`/`folders` on disk, join them in memory, never meet reconcile, never
 *  take an upload's name, and survive an older app's rewrite. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-mirror-catalog-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore } = await import("../src/store/library.ts");
const { isRefusal } = await import("../src/core/library.ts");
type Catalog = import("../src/core/library.ts").LibraryCatalog;
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const files = path.join(dir, "files");
const catalogFile = path.join(dir, "library", "catalog.json");
async function* body(text: string) { yield new TextEncoder().encode(text); }
const upload = (name: string, text: string, folderId?: string) => libraryStore.writeUpload(name, body(text), Buffer.byteLength(text), folderId);

const at = "2026-11-08T10:00:00.000Z";
const repoKey = "github.com/oliver/notes#main";
const link = { id: "rpl_1", folderId: "fld_link", url: "https://github.com/oliver/notes", display: "github.com/oliver/notes", repoKey, branch: "main", branchGiven: false, hasToken: false, createdAt: at, sync: { state: "synced", lastSuccessAt: at, commit: "c".repeat(40) } };
const linked = { id: "fld_link", name: "Lecture notes", parentId: null, createdAt: at, updatedAt: at, mirror: { linkId: "rpl_1", repoKey, path: "" } };
const week1 = { id: "fld_w1", name: "week1", parentId: "fld_link", createdAt: at, updatedAt: at, mirror: { linkId: "rpl_1", repoKey, path: "week1" } };
const mirroredItem = (id: string, repoPath: string, oid: string) => ({
	id, name: repoPath.split("/").at(-1)!, kind: "markdown", size: 4, createdAt: at, updatedAt: at, origin: { type: "repo", linkId: "rpl_1" },
	folderId: repoPath.includes("/") ? "fld_w1" : "fld_link", mirror: { linkId: "rpl_1", repoKey, path: repoPath, oid, snapshot: "snp_1" },
});
const removed = { id: "lib_gone", name: "old.md", kind: "markdown", deletedAt: at, mirror: { linkId: "rpl_1", repoKey, path: "old.md" }, removedBecause: "repo" };
const plainFolder = { id: "fld_plain", name: "Physics", parentId: null, createdAt: at, updatedAt: at };

/** A catalog with a link, its folders, two mirrored notes.md and a removed entry, plus their bytes. */
function seed(extra: Partial<Catalog> = {}): Catalog {
	const catalog = {
		version: 1,
		items: [],
		folders: [plainFolder],
		repoLinks: [link],
		mirrored: { folders: [linked, week1], items: [mirroredItem("lib_top", "notes.md", "a".repeat(40)), mirroredItem("lib_w1", "week1/notes.md", "b".repeat(40)), removed] },
		...extra,
	} as unknown as Catalog;
	fs.mkdirSync(path.dirname(catalogFile), { recursive: true });
	fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, "\t"));
	const snapshot = path.join(files, ".mirrors", "rpl_1", "snp_1");
	fs.mkdirSync(path.join(snapshot, "week1"), { recursive: true });
	fs.writeFileSync(path.join(snapshot, "notes.md"), "# t\n");
	fs.writeFileSync(path.join(snapshot, "week1", "notes.md"), "# 1\n");
	return catalog;
}

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

describe("mirrored entries in the catalog", () => {
	it("joins mirrored folders and items to folders and items on read", async () => {
		seed();
		const items = await libraryStore.list();
		assert.deepEqual(items.map((i) => [i.id, i.name, i.origin.type]).sort(), [["lib_top", "notes.md", "repo"], ["lib_w1", "notes.md", "repo"]]);
		const folders = await libraryStore.folders();
		assert.deepEqual(folders.map((f) => f.id).sort(), ["fld_link", "fld_plain", "fld_w1"]);
		const all = await libraryStore.catalog();
		const tomb = all.find((e) => e.id === "lib_gone") as { removedBecause?: string; mirror?: unknown };
		assert.equal(tomb.removedBecause, "repo");
		assert.ok(tomb.mirror);
	});

	it("resolves a mirrored item's bytes in its snapshot and reads them", async () => {
		seed();
		const item = (await libraryStore.get("lib_w1"))!;
		assert.equal(libraryStore.documentPath(item), path.join(files, ".mirrors", "rpl_1", "snp_1", "week1", "notes.md"));
		assert.equal(await libraryStore.readText(item), "# 1\n");
		assert.equal(libraryStore.documentPath({ name: "x.md" }), path.join(files, "x.md"));
		assert.throws(() => libraryStore.documentPath({ name: "x.md", mirror: { linkId: "rpl_1", repoKey, path: "../../x.md", snapshot: "snp_1" } }));
	});

	it("splits them back out on write, byte-stable through a round trip", async () => {
		seed();
		const before = fs.readFileSync(catalogFile, "utf8");
		const folder = await libraryStore.createFolder("Chemistry", null);
		assert.ok(!isRefusal(folder));
		await libraryStore.removeFolder(folder.id);
		assert.equal(fs.readFileSync(catalogFile, "utf8"), before);
		const onDisk = JSON.parse(before) as Catalog;
		assert.deepEqual(onDisk.items, []);
		assert.deepEqual(onDisk.folders!.map((f) => f.id), ["fld_plain"]);
		assert.equal(onDisk.mirrored!.items.length, 3);
	});

	it("keeps a catalog with no plain folders without a folders key", async () => {
		seed({ folders: undefined });
		await libraryStore.markItem("lib_top", { favorite: true });
		const onDisk = JSON.parse(fs.readFileSync(catalogFile, "utf8")) as Catalog;
		assert.equal("folders" in onDisk, false);
		assert.equal(onDisk.mirrored!.folders.length, 2);
		assert.equal((onDisk.mirrored!.items.find((i) => i.id === "lib_top") as { favorite?: boolean }).favorite, true);
	});

	it("an older app's rewrite keeps repoLinks and mirrored as they are", async () => {
		seed();
		// HEAD before feature 026: readCatalog merged only `diagrams`, reconcile
		// looked at `items` against the flat folder, writeCatalog wrote the rest back.
		const parsed = JSON.parse(fs.readFileSync(catalogFile, "utf8")) as Catalog;
		const { diagrams, ...rest } = parsed;
		const old = { ...rest, items: [...rest.items, ...(diagrams ?? [])] };
		const flat = new Set(fs.readdirSync(files, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name));
		old.items = old.items.map((i) => ("deletedAt" in i || flat.has(i.name) ? i : { id: i.id, name: i.name, kind: i.kind, deletedAt: at }));
		old.items.push({ id: "lib_new", name: "new.md", kind: "markdown", size: 1, createdAt: at, updatedAt: at, origin: { type: "upload" } });
		fs.writeFileSync(path.join(files, "new.md"), "x");
		fs.writeFileSync(catalogFile, JSON.stringify(old, null, "\t"));
		const after = JSON.parse(fs.readFileSync(catalogFile, "utf8")) as Catalog;
		assert.deepEqual(after.repoLinks, parsed.repoLinks);
		assert.deepEqual(after.mirrored, parsed.mirrored);
		// And this app still reads the mirror whole after the older write.
		assert.deepEqual((await libraryStore.list()).map((i) => i.id).sort(), ["lib_new", "lib_top", "lib_w1"]);
	});

	it("reconcile never tombstones, adopts or touches mirrored entries", async () => {
		seed();
		fs.writeFileSync(path.join(files, "upload.md"), "# u");
		const items = await libraryStore.list();
		assert.deepEqual(items.map((i) => [i.name, i.origin.type]).sort(), [["notes.md", "repo"], ["notes.md", "repo"], ["upload.md", "existing"]]);
		const onDisk = JSON.parse(fs.readFileSync(catalogFile, "utf8")) as Catalog;
		assert.deepEqual(onDisk.mirrored!.items.map((i) => i.id), ["lib_top", "lib_w1", "lib_gone"]);
		assert.ok(onDisk.mirrored!.items.every((i) => i.id === "lib_gone" || !("deletedAt" in i)));
		assert.ok(!onDisk.items.some((i) => i.name === ".mirrors"));
	});

	it("an upload can take a mirrored item's name", async () => {
		seed();
		const result = await upload("notes.md", "# mine");
		assert.ok(!isRefusal(result), JSON.stringify(result));
		assert.equal(fs.readFileSync(path.join(files, "notes.md"), "utf8"), "# mine");
		const names = (await libraryStore.list()).filter((i) => i.name === "notes.md").map((i) => i.origin.type).sort();
		assert.deepEqual(names, ["repo", "repo", "upload"]);
	});
});
