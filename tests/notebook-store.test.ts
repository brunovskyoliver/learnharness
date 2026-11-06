/** Feature 024 companion store: lock, future versions refused, damaged files
 *  set aside, tenants apart, trash keeps and delete-for-good removes. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-nb-store-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_HOSTED = "1";
const { runAsTenant, PATHS } = await import("../config.ts");
const { notebookStore, companionFile, NotebookReadOnlyError } = await import("../src/store/notebook.ts");
const { stores } = await import("../src/server/stores.ts");
const { isRefusal } = await import("../src/core/library.ts");
const { emptyCompanion } = await import("../src/core/notebook.ts");
after(() => { delete process.env.LH_HOSTED; fs.rmSync(dir, { recursive: true, force: true }); });

let tenantN = 0;
const fresh = <T>(fn: () => Promise<T>) => runAsTenant(`nbstore${++tenantN}`, fn) as Promise<T>;
const notebookDir = () => path.join(PATHS.library, "notebook");

const addThreadText = (pageId: string, text: string) => notebookStore.update(pageId, (companion) => {
	companion.instruction = text;
	return { companion, result: text };
});

describe("companion store", () => {
	it("reads an empty companion when there is no file, and writes it whole", () => fresh(async () => {
		const read = await notebookStore.read("lib_a");
		assert.deepEqual(read, { companion: emptyCompanion("lib_a"), readOnly: null, setAside: false });
		assert.ok(!fs.existsSync(companionFile("lib_a")), "a read writes nothing");
		const out = await addThreadText("lib_a", "Only hints.");
		assert.ok(!("refused" in out));
		const onDisk = JSON.parse(fs.readFileSync(companionFile("lib_a"), "utf8"));
		assert.equal(onDisk.v, 1);
		assert.equal(onDisk.instruction, "Only hints.");
		assert.deepEqual(fs.readdirSync(notebookDir()), ["lib_a.json"], "no temp files left");
	}));

	it("serialises concurrent updates under the lock", () => fresh(async () => {
		await Promise.all(Array.from({ length: 20 }, (_, i) => notebookStore.update("lib_b", (companion) => {
			companion.chat.push({ id: `m${i}`, author: "user", text: `#${i}`, at: "2026-11-06T10:00:00.000Z" });
			return { companion, result: null };
		})));
		const read = await notebookStore.read("lib_b");
		assert.equal(read.companion.chat.length, 20, "no write lost another");
	}));

	it("writes nothing on a refusal", () => fresh(async () => {
		const out = await notebookStore.update("lib_c", () => ({ refused: "no", status: 409 }));
		assert.deepEqual(out, { refused: "no", status: 409 });
		assert.ok(!fs.existsSync(companionFile("lib_c")));
	}));

	it("refuses a newer version read-only and never rewrites it", () => fresh(async () => {
		fs.mkdirSync(notebookDir(), { recursive: true });
		const future = JSON.stringify({ v: 2, pageId: "lib_d", somethingNew: true });
		fs.writeFileSync(companionFile("lib_d"), future);
		const read = await notebookStore.read("lib_d");
		assert.equal(read.readOnly, "future-version");
		assert.deepEqual(read.companion.threads, []);
		await assert.rejects(addThreadText("lib_d", "x"), NotebookReadOnlyError);
		assert.equal(fs.readFileSync(companionFile("lib_d"), "utf8"), future, "byte-identical");
	}));

	it("sets a damaged file aside, says so until the next write, and keeps the damaged bytes", () => fresh(async () => {
		fs.mkdirSync(notebookDir(), { recursive: true });
		fs.writeFileSync(companionFile("lib_e"), "{ not json");
		const read = await notebookStore.read("lib_e");
		assert.equal(read.setAside, true);
		assert.deepEqual(read.companion, emptyCompanion("lib_e"));
		const aside = fs.readdirSync(notebookDir()).filter((name) => name.startsWith("lib_e.damaged-"));
		assert.equal(aside.length, 1);
		assert.equal(fs.readFileSync(path.join(notebookDir(), aside[0]!), "utf8"), "{ not json");
		assert.equal((await notebookStore.read("lib_e")).setAside, true, "still said on the next read");
		await addThreadText("lib_e", "fresh");
		assert.equal((await notebookStore.read("lib_e")).setAside, false);
		// A wrong page id inside the file is damage too.
		fs.writeFileSync(companionFile("lib_f"), JSON.stringify({ ...emptyCompanion("lib_other") }));
		assert.equal((await notebookStore.read("lib_f")).setAside, true);
	}));

	it("keeps tenants apart", async () => {
		await runAsTenant("nbstore-alice", () => addThreadText("lib_shared", "alice"));
		const bob = await runAsTenant("nbstore-bob", () => notebookStore.read("lib_shared"));
		assert.equal(bob.companion.instruction, "");
		const alice = await runAsTenant("nbstore-alice", () => notebookStore.read("lib_shared"));
		assert.equal(alice.companion.instruction, "alice");
	});

	it("keeps the companion through trash and restore; delete for good removes it", () => fresh(async () => {
		const made = await stores.libraryStore.createPage("Heat", "Heat flows.", { author: "learner" });
		assert.ok(!isRefusal(made));
		const id = made.item.id;
		await addThreadText(id, "Argue.");
		const trashed = await stores.libraryStore.trashItem(id);
		assert.ok(trashed && !isRefusal(trashed));
		assert.ok(fs.existsSync(companionFile(id)), "trash keeps it");
		const entry = (await stores.libraryStore.listTrash())[0]!;
		await stores.libraryStore.restoreTrash(entry.id);
		assert.equal((await notebookStore.read(id)).companion.instruction, "Argue.", "restore needs nothing");
		const again = await stores.libraryStore.trashItem(id);
		assert.ok(again && !isRefusal(again));
		const second = (await stores.libraryStore.listTrash())[0]!;
		assert.equal(await stores.libraryStore.purgeTrash(second.id), true);
		assert.ok(!fs.existsSync(companionFile(id)), "delete for good removes it");

		const other = await stores.libraryStore.createPage("Cold", "Cold.", { author: "learner" });
		assert.ok(!isRefusal(other));
		await addThreadText(other.item.id, "x");
		assert.equal(await stores.libraryStore.remove(other.item.id), true);
		assert.ok(!fs.existsSync(companionFile(other.item.id)), "remove deletes it too");
	}));
});
