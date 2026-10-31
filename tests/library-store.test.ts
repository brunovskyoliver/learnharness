/** The Library catalog (feature 009, research R2): reconcile, crash recovery,
 *  refusals and tenant separation, against a real temp folder. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-library-store-")));
process.env.LH_DATA_DIR = dir;
const { runAsTenant } = await import("../config.ts");
const { libraryStore } = await import("../src/store/library.ts");
const { isRefusal, LibraryCatalogError } = await import("../src/core/library.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const files = path.join(dir, "files");
const catalog = path.join(dir, "library", "catalog.json");
async function* body(text: string | Uint8Array) { yield typeof text === "string" ? new TextEncoder().encode(text) : text; }
const upload = (name: string, text: string) => libraryStore.writeUpload(name, body(text), Buffer.byteLength(text));
const live = async (name: string) => {
	const result = await upload(name, "# hi");
	assert.ok(!isRefusal(result));
	return result;
};

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

describe("reconcile", () => {
	it("adds existing files and leaves their bytes alone", async () => {
		fs.mkdirSync(files);
		const bytes = Buffer.from([0x00, 0xff, 0x10, 0x80]);
		fs.writeFileSync(path.join(files, "old.bin"), bytes);
		fs.writeFileSync(path.join(files, "notes.md"), "# notes");
		const items = await libraryStore.list();
		assert.deepEqual(items.map((i) => [i.name, i.kind, i.origin.type]), [["notes.md", "markdown", "existing"], ["old.bin", "other", "existing"]]);
		assert.deepEqual(fs.readFileSync(path.join(files, "old.bin")), bytes);
		const ids = items.map((i) => i.id);
		assert.ok(ids.every((id) => id.startsWith("lib_")));
		assert.deepEqual((await libraryStore.list()).map((i) => i.id), ids, "ids are stable across listings");
	});

	it("skips symlinks and folders", async () => {
		fs.mkdirSync(path.join(files, "folder"), { recursive: true });
		const outside = path.join(dir, "outside.txt");
		fs.writeFileSync(outside, "keep");
		fs.symlinkSync(outside, path.join(files, "link.md"));
		assert.deepEqual(await libraryStore.list(), []);
	});

	it("tombstones a vanished file", async () => {
		const item = await live("gone.md");
		fs.rmSync(path.join(files, "gone.md"));
		assert.deepEqual(await libraryStore.list(), []);
		const tombstone = JSON.parse(fs.readFileSync(catalog, "utf8")).items[0];
		assert.deepEqual(Object.keys(tombstone).sort(), ["deletedAt", "id", "kind", "name"]);
		assert.equal(tombstone.id, item.id);
	});

	it("recovers a crash mid-rename by size and mtime", async () => {
		const item = await live("before.md");
		fs.renameSync(path.join(files, "before.md"), path.join(files, "after.md"));
		const [recovered, ...rest] = await libraryStore.list();
		assert.equal(rest.length, 0);
		assert.equal(recovered!.id, item.id);
		assert.equal(recovered!.name, "after.md");
		assert.deepEqual(recovered!.previousNames, ["before.md"]);
	});

	it("does not guess when two vanished entries fit one file", async () => {
		const stamp = new Date("2026-01-01T00:00:00Z");
		fs.mkdirSync(files);
		for (const name of ["a.md", "b.md"]) { fs.writeFileSync(path.join(files, name), "same"); fs.utimesSync(path.join(files, name), stamp, stamp); }
		const before = await libraryStore.list();
		fs.renameSync(path.join(files, "a.md"), path.join(files, "c.md"));
		fs.rmSync(path.join(files, "b.md"));
		const [after] = await libraryStore.list();
		assert.equal(after!.name, "c.md");
		assert.ok(!before.some((i) => i.id === after!.id));
	});

	it("picks up an outside change in size", async () => {
		await live("grow.md");
		fs.appendFileSync(path.join(files, "grow.md"), " more");
		assert.equal((await libraryStore.list())[0]!.size, 9);
	});
});

describe("catalog refusals", () => {
	it("refuses a newer version and never rewrites it", async () => {
		fs.mkdirSync(path.dirname(catalog), { recursive: true });
		const newer = JSON.stringify({ version: 2, items: [] });
		fs.writeFileSync(catalog, newer);
		await assert.rejects(libraryStore.list(), LibraryCatalogError);
		await assert.rejects(upload("a.md", "x"), LibraryCatalogError);
		assert.equal(fs.readFileSync(catalog, "utf8"), newer);
		assert.equal(fs.existsSync(path.join(files, "a.md")), false);
	});

	it("refuses to recreate an unreadable catalog", async () => {
		fs.mkdirSync(path.dirname(catalog), { recursive: true });
		fs.writeFileSync(catalog, "{ torn");
		await assert.rejects(libraryStore.list(), LibraryCatalogError);
		assert.equal(fs.readFileSync(catalog, "utf8"), "{ torn");
	});

	it("releases its lock after a failure", async () => {
		fs.mkdirSync(path.dirname(catalog), { recursive: true });
		fs.writeFileSync(catalog, "{ torn");
		await assert.rejects(libraryStore.list());
		fs.rmSync(catalog);
		assert.deepEqual(await libraryStore.list(), []);
	});
});

describe("writeUpload", () => {
	it("stores bytes, leaves no temp file and records the item", async () => {
		const item = await live("a.md");
		assert.equal(fs.readFileSync(path.join(files, "a.md"), "utf8"), "# hi");
		assert.deepEqual(fs.readdirSync(path.join(dir, "tmp")), []);
		assert.equal(item.kind, "markdown");
		assert.equal(item.size, 4);
		assert.deepEqual(item.origin, { type: "upload" });
	});

	it("refuses a same-name upload, in any case, with a free name and original bytes intact", async () => {
		await live("a.md");
		const result = await upload("A.MD", "other");
		assert.ok(isRefusal(result));
		assert.equal(result.refused, "name_taken");
		assert.equal(result.suggestedName, "A (2).MD");
		assert.equal(fs.readFileSync(path.join(files, "a.md"), "utf8"), "# hi");
		assert.deepEqual(fs.readdirSync(files), ["a.md"]);
	});

	it("lets exactly one of two concurrent same-name uploads win", async () => {
		const results = await Promise.all([upload("race.md", "first"), upload("race.md", "second!")]);
		assert.equal(results.filter((r) => !isRefusal(r)).length, 1);
		assert.equal((await libraryStore.list()).length, 1);
		assert.deepEqual(fs.readdirSync(path.join(dir, "tmp")), []);
	});

	it("treats a symlink at the target as a conflict and leaves the outside file alone", async () => {
		const outside = path.join(dir, "outside.txt");
		fs.writeFileSync(outside, "keep");
		fs.mkdirSync(files);
		fs.symlinkSync(outside, path.join(files, "link.md"));
		const result = await upload("link.md", "new");
		assert.ok(isRefusal(result));
		assert.equal(result.refused, "name_taken");
		assert.equal(fs.readFileSync(outside, "utf8"), "keep");
		assert.equal(fs.lstatSync(path.join(files, "link.md")).isSymbolicLink(), true);
	});

	it("refuses a body shorter or longer than declared and stores nothing", async () => {
		for (const declared of [3, 5]) {
			const result = await libraryStore.writeUpload("cut.md", body("four"), declared);
			assert.ok(isRefusal(result));
			assert.equal(result.refused, "length_mismatch");
		}
		assert.equal(fs.existsSync(path.join(files, "cut.md")), false);
		assert.deepEqual(fs.readdirSync(path.join(dir, "tmp")), []);
	});

	it("refuses a stream that fails partway as not whole", async () => {
		async function* failing() { yield new TextEncoder().encode("par"); throw new Error("aborted"); }
		const result = await libraryStore.writeUpload("cut.md", failing(), 10);
		assert.ok(isRefusal(result));
		assert.equal(result.refused, "length_mismatch");
		assert.deepEqual(fs.readdirSync(path.join(dir, "tmp")), []);
	});

	it("refuses content that does not match its type", async () => {
		const result = await upload("fake.pdf", "not a pdf");
		assert.ok(isRefusal(result));
		assert.equal(result.refused, "content_mismatch");
		assert.equal(fs.existsSync(path.join(files, "fake.pdf")), false);
	});

	it("marks an uploaded PDF as pending text", async () => {
		const item = await upload("a.pdf", "%PDF-1.7");
		assert.ok(!isRefusal(item));
		assert.equal(item.textState, "pending");
	});
});

describe("rename", () => {
	it("moves the file, keeps the id and remembers the old name", async () => {
		const item = await live("old.md");
		const renamed = await libraryStore.rename(item.id, "new.md");
		assert.ok(renamed && !isRefusal(renamed));
		assert.equal(renamed.id, item.id);
		assert.deepEqual(renamed.previousNames, ["old.md"]);
		assert.deepEqual(fs.readdirSync(files), ["new.md"]);
		assert.equal(renamed.updatedAt, item.updatedAt, "contents did not change");
	});

	it("refuses a taken name and leaves both files", async () => {
		const a = await live("a.md");
		await live("b.md");
		const result = await libraryStore.rename(a.id, "B.md");
		assert.ok(result && isRefusal(result));
		assert.equal(result.refused, "name_taken");
		assert.deepEqual(fs.readdirSync(files).sort(), ["a.md", "b.md"]);
	});

	it("allows a change of case on the same item", async () => {
		const item = await live("a.md");
		const renamed = await libraryStore.rename(item.id, "A.md");
		assert.ok(renamed && !isRefusal(renamed));
		assert.deepEqual(fs.readdirSync(files), ["A.md"]);
	});

	it("refuses a new type the contents do not fit", async () => {
		const item = await live("a.md");
		for (const name of ["a.pdf", "a.exe"]) {
			const result = await libraryStore.rename(item.id, name);
			assert.ok(result && isRefusal(result), name);
		}
		const moved = await libraryStore.rename(item.id, "a.txt");
		assert.ok(moved && !isRefusal(moved));
		assert.equal(moved.kind, "text");
	});

	it("answers null for an unknown id", async () => {
		assert.equal(await libraryStore.rename("lib_none", "x.md"), null);
	});
});

describe("remove", () => {
	it("removes the bytes and cached text and leaves a tombstone", async () => {
		const item = await live("a.md");
		await libraryStore.writeDerived(item.id, { lines: 1 });
		assert.equal(await libraryStore.remove(item.id), true);
		assert.equal(fs.existsSync(path.join(files, "a.md")), false);
		assert.equal(await libraryStore.readDerived(item.id), null);
		assert.deepEqual(await libraryStore.list(), []);
		assert.equal(await libraryStore.remove(item.id), false);
		const again = await upload("a.md", "new");
		assert.ok(!isRefusal(again));
		assert.notEqual(again.id, item.id, "ids are never reused");
	});
});

describe("tenants", () => {
	it("never see each other's items, and lock separately", async () => {
		const made = await runAsTenant("user_a", () => live("mine.md"));
		const other = await runAsTenant("user_b", () => libraryStore.list());
		assert.deepEqual(other, []);
		assert.equal(await runAsTenant("user_b", () => libraryStore.get(made.id)), null);
		assert.equal(await runAsTenant("user_b", () => libraryStore.remove(made.id)), false);
		assert.ok(fs.existsSync(path.join(dir, "users", "user_a", "files", "mine.md")));
	});

	it("fails closed in hosted mode with no tenant", async () => {
		process.env.LH_HOSTED = "1";
		try { await assert.rejects(libraryStore.list(), /outside a tenant/); }
		finally { delete process.env.LH_HOSTED; }
	});
});
