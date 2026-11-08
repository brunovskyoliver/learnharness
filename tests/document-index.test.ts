/** The index and annotations on real stores and route handlers, with no model:
 *  persistence, crash recovery, idempotence, triggers, states and tenants. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { blankPdf } from "./fixtures/make-blank-pdf.mjs";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-doc-index-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_HOSTED = "1";
const { runAsTenant, PATHS } = await import("../config.ts");
const { stores } = await import("../src/server/stores.ts");
const engine = await import("../src/server/library-index.ts");
const api = await import("../src/server/documents.ts");
const files = await import("../src/store/library-index.ts");
const { isRefusal } = await import("../src/core/library.ts");
const { libraryTextIdle } = await import("../src/server/library-text.ts");
const { pullTree } = await import("./fixtures/mirror.ts");
after(async () => { delete process.env.LH_HOSTED; fs.rmSync(dir, { recursive: true, force: true }); });

const store = stores.libraryStore;
const PDF = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "sample-3page.pdf"));
const asUser = <T>(user: string, fn: () => Promise<T>) => runAsTenant(user, fn) as Promise<T>;
const page = async (name: string, content: string) => {
	const made = await store.createPage(name, content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item;
};
const upload = async (name: string, bytes: Buffer, folderId?: string) => {
	async function* body() { yield new Uint8Array(bytes); }
	const item = await store.writeUpload(name, body(), bytes.length, folderId ?? null);
	assert.ok(!isRefusal(item), JSON.stringify(item));
	return item;
};
const sync = async () => { await engine.syncDocumentIndex(); await engine.documentIndexIdle(); };
const search = (q: string, filters = {}) => engine.searchDocuments(q, filters);
const stateOf = async (id: string) => {
	const status = await engine.documentIndexStatus();
	return status.notSearched.find((row) => row.id === id)?.state ?? "indexed";
};
const shardsHash = async () => {
	const generation = (await files.readGeneration())!;
	const folder = path.join(PATHS.library, "search", generation);
	const hash = createHash("sha256");
	for (const name of fs.readdirSync(folder).sort()) hash.update(name).update(fs.readFileSync(path.join(folder, name)));
	return hash.digest("hex");
};
const get = (url: string) => new Request(`http://localhost${url}`);
const post = (data: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const anchor = (over = {}) => ({ page: 1, quote: "force", prefix: "", suffix: "", start: 0, rects: [[0.1, 0.1, 0.2, 0.05]], ...over });

describe("indexing", () => {
	it("finds a page block and a PDF page, with snippets and targets", () => asUser("u_find", async () => {
		await page("Mechanics", "# Heading\n\nNewton wrote about inertia.");
		await upload("sample.pdf", PDF);
		await sync();
		const fromPage = await search("inertia");
		assert.equal(fromPage.results[0]!.name, "Mechanics");
		assert.equal(fromPage.results[0]!.jump?.block, 1);
		assert.equal(fromPage.results[0]!.snippet?.text, "Newton wrote about inertia.");
		const fromPdf = await search("force");
		const hit = fromPdf.results.find((r) => r.kind === "pdf");
		assert.ok(hit, "the PDF has force on a page");
		assert.ok(hit.jump?.page, "and names the page");
		assert.ok(hit.snippet?.ranges.length);
	}));
	it("indexes a text file to the line", () => asUser("u_text", async () => {
		await upload("data.txt", Buffer.from("one\ntwo\nneedle here\nfour"));
		await sync();
		assert.equal((await search("needle")).results[0]!.jump?.line, 3);
	}));
	it("reads the head version only, never a draft or an old version", () => asUser("u_head", async () => {
		const made = await page("Versions", "alphaword first");
		await store.commitPageVersion(made.id, { base: 1, rev: 0, content: "betaword second" });
		await store.savePageDraft(made.id, { base: 2, rev: 0, content: "gammaword draft" });
		await sync();
		assert.equal((await search("alphaword")).total, 0, "an old version");
		assert.equal((await search("gammaword")).total, 0, "a draft");
		assert.equal((await search("betaword")).total, 1);
	}));
	it("reports pending before the index has read an item, and doesn't parse on the request", () => asUser("u_pending", async () => {
		const made = await upload("late.pdf", PDF);
		let parsed = 0;
		const outcome = await search("force");
		assert.equal(outcome.total, 0);
		assert.equal(outcome.status.counts.pending, 1);
		assert.equal(outcome.status.notSearched[0]!.id, made.id);
		await engine.syncDocumentIndex({ extract: async (item) => { parsed++; return engine.extractDocument(item); } });
		assert.equal(parsed, 1);
	}));
	it("says when a PDF has no text, an image can't be searched and a file is broken", () => asUser("u_states", async () => {
		const scan = await upload("scan.pdf", blankPdf());
		const png = Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n\x1a\n"), Buffer.alloc(16)]);
		const image = await upload("photo.png", png);
		const broken = await upload("broken.pdf", Buffer.from("%PDF-1.4\nnot really a pdf"));
		await sync();
		await libraryTextIdle();
		assert.equal(await stateOf(scan.id), "no-text");
		assert.equal(await stateOf(image.id), "unsupported");
		assert.equal(await stateOf(broken.id), "failed");
		// Its name still finds it, and the result says why there is no snippet.
		const found = await search("scan");
		assert.equal(found.results[0]!.itemId, scan.id);
		assert.equal(found.results[0]!.state, "no-text");
		assert.equal(found.results[0]!.snippet, null);
	}));
	it("keeps the catalog version and writes nothing beside library/search", () => asUser("u_additive", async () => {
		await page("Additive", "words here");
		const catalog = () => fs.readFileSync(path.join(PATHS.library, "catalog.json"), "utf8");
		const before = catalog();
		await sync();
		assert.equal(catalog(), before);
		assert.equal(JSON.parse(before).version, 1);
	}));
});

describe("safe reindexing", () => {
	it("is idempotent: a second sync reads nothing, a rebuild writes the same bytes", () => asUser("u_idem", async () => {
		await page("One", "stable words");
		await upload("sample.pdf", PDF);
		await sync();
		const first = await shardsHash();
		let reads = 0;
		await engine.syncDocumentIndex({ extract: async (item) => { reads++; return engine.extractDocument(item); } });
		assert.equal(reads, 0, "nothing changed");
		assert.equal(await shardsHash(), first);
		await engine.syncDocumentIndex({ force: true });
		assert.equal(await shardsHash(), first, "a rebuild of the same sources");
	}));
	it("rebuilds a torn shard, and shows it as pending until then", () => asUser("u_torn", async () => {
		const made = await page("Torn", "tornword text");
		await sync();
		const generation = (await files.readGeneration())!;
		fs.writeFileSync(path.join(PATHS.library, "search", generation, `${made.id}.json`), '{"v":1,"itemId":"tor');
		assert.equal(await stateOf(made.id), "pending");
		assert.equal((await search("tornword")).total, 0);
		await sync();
		assert.equal(await stateOf(made.id), "indexed");
		assert.equal((await search("tornword")).total, 1);
	}));
	it("rebuilds from a torn pointer, or a deleted index, and loses nothing", () => asUser("u_pointer", async () => {
		await page("Pointer", "pointerword text");
		await sync();
		fs.writeFileSync(path.join(PATHS.library, "search", "current.json"), "{not json");
		assert.equal((await search("pointerword")).total, 0);
		await sync();
		assert.equal((await search("pointerword")).total, 1);
		fs.rmSync(path.join(PATHS.library, "search"), { recursive: true, force: true });
		await sync();
		assert.equal((await search("pointerword")).total, 1);
	}));
	it("keeps the old index serving until a rebuild is complete, and a crash leaves it", () => asUser("u_crash", async () => {
		await page("Old", "oldword text");
		await page("Other", "otherword text");
		await sync();
		const before = await files.readGeneration();
		await assert.rejects(engine.syncDocumentIndex({ force: true, extract: async (item) => {
			assert.equal((await search("oldword")).total, 1, "still serving during the rebuild");
			if (item.name === "Other") throw new Error("the process died");
			return engine.extractDocument(item);
		} }));
		assert.equal(await files.readGeneration(), before, "the pointer never moved");
		assert.equal((await search("oldword")).total, 1);
		await sync();
		const names = fs.readdirSync(path.join(PATHS.library, "search")).filter((name) => name.startsWith("g_"));
		assert.deepEqual(names, [before], "the half-built generation is swept");
	}));
	it("ignores a temp file a crash left beside a shard", () => asUser("u_temp", async () => {
		await page("Temp", "tempword");
		await sync();
		const folder = path.join(PATHS.library, "search", (await files.readGeneration())!);
		fs.writeFileSync(path.join(folder, "lib_x.json.abc.tmp"), "half");
		await sync();
		assert.ok(!fs.readdirSync(folder).some((name) => name.endsWith(".tmp")));
	}));
});

describe("what triggers it", () => {
	const settled = async () => { await new Promise((resolve) => setTimeout(resolve, 260)); await engine.documentIndexIdle(); };
	it("follows upload, page version, rename, move, trash and restore through the event", () => asUser("u_watch", async () => {
		const stop = engine.startDocumentIndexWatcher();
		try {
			await upload("watched.txt", Buffer.from("uploadword"));
			await settled();
			assert.equal((await search("uploadword")).total, 1, "upload");
			const made = await page("Note", "firstword");
			await settled();
			await store.commitPageVersion(made.id, { base: 1, rev: 0, content: "secondword" });
			await settled();
			assert.equal((await search("secondword")).total, 1, "page version");
			assert.equal((await search("firstword")).total, 0);
			await store.rename(made.id, "Renamed");
			await settled();
			assert.equal((await search("secondword")).results[0]!.name, "Renamed", "rename");
			const folder = await store.createFolder("Box", null);
			assert.ok(!isRefusal(folder));
			await store.moveItem(made.id, folder.id);
			await settled();
			assert.equal((await search("secondword")).results[0]!.location, "Box", "move");
			const entry = (await store.trashItem(made.id) as TrashEntry | null);
			assert.ok(entry);
			assert.equal((await search("secondword")).total, 0, "trash takes effect at once, before any sync");
			await settled();
			assert.equal((await search("secondword")).total, 0);
			await store.restoreTrash(entry.id);
			await settled();
			assert.equal((await search("secondword")).total, 1, "restore");
		} finally {
			stop();
		}
	}));
	it("doesn't re-read a PDF on rename: names come from the catalog", () => asUser("u_rename_pdf", async () => {
		const made = await upload("before.pdf", PDF);
		await sync();
		await store.rename(made.id, "after.pdf");
		let reads = 0;
		await engine.syncDocumentIndex({ extract: async (item) => { reads++; return engine.extractDocument(item); } });
		assert.equal(reads, 0);
		assert.equal((await search("force")).results.find((r) => r.itemId === made.id)?.name, "after.pdf");
	}));
});

describe("trashed and archived", () => {
	it("never returns trashed content, including a folder's", () => asUser("u_trash", async () => {
		const folder = await store.createFolder("Gone", null);
		assert.ok(!isRefusal(folder));
		const made = await store.createPage("Inside", "trashedword", { author: "learner", folderId: folder.id });
		assert.ok(!isRefusal(made));
		await sync();
		assert.equal((await search("trashedword")).total, 1);
		(await store.trashFolder(folder.id) as TrashEntry | null);
		assert.equal((await search("trashedword")).total, 0);
		const status = await engine.documentIndexStatus();
		assert.ok(!status.notSearched.some((row) => row.id === made.item.id), "and isn't listed");
		await sync();
		const generation = (await files.readGeneration())!;
		assert.equal(await files.readShard(generation, made.item.id), null, "its shard is gone");
	}));
	it("searches archived items unless a filter hides them", () => asUser("u_arch", async () => {
		const made = await page("Shelved", "archivedword");
		await store.markItem(made.id, { archived: true });
		await sync();
		const shown = await search("archivedword");
		assert.equal(shown.total, 1);
		assert.equal(shown.results[0]!.archived, true);
		assert.equal((await search("archivedword", { hideArchived: true })).total, 0);
	}));
});

describe("the search API", () => {
	const ask = async (url: string) => { const r = await api.documentSearchResponse(get(url)); return { status: r.status, body: await r.json() as { results: { name: string; itemId: string }[]; total: number; error?: string } }; };
	it("filters by kind, tag and folder, and refuses a bad one", () => asUser("u_api", async () => {
		const folder = await store.createFolder("Physics", null);
		assert.ok(!isRefusal(folder));
		const a = await store.createPage("A", "sharedword", { author: "learner", folderId: folder.id });
		assert.ok(!isRefusal(a));
		const b = await page("B", "sharedword");
		await store.markItem(b.id, { tags: ["exam"] });
		await upload("c.txt", Buffer.from("sharedword"));
		await sync();
		const names = async (extra: string) => (await ask(`/api/library/search?q=sharedword${extra}`)).body.results.map((r) => r.name).sort();
		assert.deepEqual(await names(""), ["A", "B", "c.txt"]);
		assert.deepEqual(await names("&kind=text"), ["c.txt"]);
		assert.deepEqual(await names("&tag=exam"), ["B"]);
		assert.deepEqual(await names(`&folder=${folder.id}`), ["A"]);
		assert.equal((await ask("/api/library/search?q=x&kind=nope")).status, 400);
		assert.equal((await ask(`/api/library/search?q=${"x".repeat(300)}`)).status, 400);
	}));
	it("answers while the Library is large, without blocking other work", () => asUser("u_big", async () => {
		for (let i = 0; i < 40; i++) await page(`Page ${i}`, Array.from({ length: 200 }, (_, n) => `paragraph ${n} about bigword ${i}`).join("\n\n"));
		await sync();
		let ticks = 0;
		const interval = setInterval(() => { ticks++; }, 1);
		const outcome = await search("bigword");
		clearInterval(interval);
		assert.equal(outcome.total, 40 * 3);
		assert.ok(outcome.results.length <= 50);
		assert.ok(ticks > 0, "the loop kept turning while it searched");
	}));
	it("starts a reindex and returns at once", () => asUser("u_reindex", async () => {
		await page("R", "reindexword");
		assert.equal((await api.documentReindexResponse()).status, 202);
		await engine.documentIndexIdle();
		assert.equal((await search("reindexword")).total, 1);
	}));
});

describe("tenants", () => {
	it("one tenant's search never reaches another's, and each has its own files", async () => {
		const ids = await asUser("u_t1", async () => {
			const made = await page("Private", "tenantword");
			await upload("t.pdf", PDF);
			await sync();
			return { page: made.id };
		});
		await asUser("u_t2", async () => {
			await page("Mine", "mineword");
			await sync();
			assert.equal((await search("tenantword")).total, 0);
			assert.equal((await search("force")).total, 0);
			assert.ok(PATHS.library.includes("u_t2"));
			assert.ok(!fs.existsSync(path.join(PATHS.library, "search", "nope")));
			const generation = (await files.readGeneration())!;
			assert.equal(await files.readShard(generation, ids.page), null);
		});
		await asUser("u_t1", async () => assert.equal((await search("tenantword")).total, 1));
	});
	it("another tenant's id is a 404, for annotations and passages", async () => {
		const { pdf, annotation } = await asUser("u_a1", async () => {
			const uploaded = await upload("a.pdf", PDF);
			const made = await api.annotationCreateResponse(post({ anchor: anchor() }), uploaded.id);
			assert.equal(made.status, 201);
			return { pdf: uploaded.id, annotation: (await made.json() as { annotation: { id: string } }).annotation.id };
		});
		await asUser("u_a2", async () => {
			assert.equal((await api.annotationsListResponse(pdf)).status, 404);
			assert.equal((await api.annotationCreateResponse(post({ anchor: anchor() }), pdf)).status, 404);
			assert.equal((await api.annotationPatchResponse(post({ note: "x" }), pdf, annotation)).status, 404);
			assert.equal((await api.annotationDeleteResponse(pdf, annotation)).status, 404);
			const mine = await page("Mine", "");
			assert.equal((await api.pageDocumentPassageResponse(post({ text: "x", itemId: pdf, page: 1 }), mine.id)).status, 404);
		});
		await asUser("u_a1", async () => {
			const list = await (await api.annotationsListResponse(pdf)).json() as { annotations: unknown[] };
			assert.equal(list.annotations.length, 1, "untouched by the other tenant");
		});
	});
	it("fails closed outside a tenant in hosted mode", async () => {
		await assert.rejects(() => engine.searchDocuments("x", {}));
	});
});

describe("annotations", () => {
	it("persist on disk, apart from the bytes, and survive a re-read", () => asUser("u_ann", async () => {
		const uploaded = await upload("doc.pdf", PDF);
		const bytes = fs.readFileSync(store.documentPath(uploaded));
		const made = await api.annotationCreateResponse(post({ anchor: anchor(), note: "my note" }), uploaded.id);
		const { annotation } = await made.json() as { annotation: { id: string; note: string; anchor: { quote: string }; fingerprint: { size: number } } };
		assert.equal(annotation.note, "my note");
		assert.equal(annotation.fingerprint.size, PDF.length);
		assert.ok(fs.existsSync(path.join(PATHS.library, "annotations", `${uploaded.id}.json`)));
		assert.deepEqual(fs.readFileSync(store.documentPath(uploaded)), bytes, "the file is untouched");
		const patched = await api.annotationPatchResponse(post({ note: null }), uploaded.id, annotation.id);
		assert.equal((await patched.json() as { annotation: { note?: string } }).annotation.note, undefined, "the highlight stays");
		assert.equal((await api.annotationDeleteResponse(uploaded.id, annotation.id)).status, 200);
		assert.equal((await api.annotationDeleteResponse(uploaded.id, annotation.id)).status, 404);
	}));
	it("refuses a bad anchor, a long note, and anything but a PDF", () => asUser("u_ann_bad", async () => {
		const uploaded = await upload("d.pdf", PDF);
		assert.equal((await api.annotationCreateResponse(post({ anchor: { page: 1 } }), uploaded.id)).status, 400);
		assert.equal((await api.annotationCreateResponse(post({ anchor: anchor(), note: "x".repeat(5000) }), uploaded.id)).status, 400);
		const made = await page("Not a pdf", "");
		assert.equal((await api.annotationCreateResponse(post({ anchor: anchor() }), made.id)).status, 404);
	}));
	it("stay through the trash and go when the item goes for good", () => asUser("u_ann_trash", async () => {
		const uploaded = await upload("t.pdf", PDF);
		await api.annotationCreateResponse(post({ anchor: anchor() }), uploaded.id);
		const file = path.join(PATHS.library, "annotations", `${uploaded.id}.json`);
		const entry = (await store.trashItem(uploaded.id) as TrashEntry | null);
		assert.ok(entry);
		assert.ok(fs.existsSync(file));
		assert.equal((await api.annotationsListResponse(uploaded.id)).status, 404, "a trashed item reads as gone");
		await store.restoreTrash(entry.id);
		assert.equal((await (await api.annotationsListResponse(uploaded.id)).json() as { annotations: unknown[] }).annotations.length, 1);
		const again = (await store.trashItem(uploaded.id) as TrashEntry | null);
		await store.purgeTrash(again!.id);
		assert.ok(!fs.existsSync(file));
	}));
	it("sets a damaged file aside instead of overwriting it", () => asUser("u_ann_damage", async () => {
		const uploaded = await upload("x.pdf", PDF);
		const folder = path.join(PATHS.library, "annotations");
		fs.mkdirSync(folder, { recursive: true });
		fs.writeFileSync(path.join(folder, `${uploaded.id}.json`), "{broken");
		const list = await (await api.annotationsListResponse(uploaded.id)).json() as { annotations: unknown[] };
		assert.deepEqual(list.annotations, []);
		assert.ok(fs.readdirSync(folder).some((name) => name.includes(".damaged-")));
	}));
});

describe("a passage into a note", () => {
	it("appends one learner version with a citation, the source name from the server", () => asUser("u_note", async () => {
		const source = await upload("paper.pdf", PDF);
		const note = await page("Notes", "Start.");
		await store.savePageDraft(note.id, { base: 1, rev: 0, content: "Start, edited." });
		const response = await api.pageDocumentPassageResponse(post({ text: "The *passage*.", itemId: source.id, page: 2, name: "forged.pdf" }), note.id);
		assert.equal(response.status, 201);
		const after = await store.readPage(note.id);
		assert.ok(after?.head.content.startsWith("Start, edited.\n\n> The \\*passage\\*."));
		assert.ok(after?.head.content.includes(`[PDF: paper.pdf, p. 2](/library?item=${source.id}&page=2&quote=`));
		assert.ok(!after?.head.content.includes("forged"));
		const versions = await store.listPageVersions(note.id);
		assert.deepEqual(versions?.map((v) => v.cause).slice(0, 2), ["passage", "save"]);
	}));
	it("refuses bad bodies, a missing page and a source that isn't a PDF", () => asUser("u_note_bad", async () => {
		const source = await upload("p.pdf", PDF);
		const note = await page("N", "");
		assert.equal((await api.pageDocumentPassageResponse(post({ itemId: source.id, page: 1 }), note.id)).status, 400);
		assert.equal((await api.pageDocumentPassageResponse(post({ text: "x", itemId: source.id, page: 0 }), note.id)).status, 400);
		assert.equal((await api.pageDocumentPassageResponse(post({ text: "x", itemId: source.id, page: 1 }), "lib_none")).status, 404);
		assert.equal((await api.pageDocumentPassageResponse(post({ text: "x", itemId: note.id, page: 1 }), note.id)).status, 404);
		assert.equal((await api.pageDocumentPassageResponse(post({ text: "x".repeat(30000), itemId: source.id, page: 1 }), note.id)).status, 413);
	}));
});

describe("feature 026: files synced from a linked repo", () => {
	it("are indexed and found; a changed file reindexes; an unreadable one is named; a removed one drops out", () => asUser("u_mirror_index", async () => {
		await pullTree(store, {
			"week1/notes.md": "# Week 1\n\nWaves carry energy.",
			"data.txt": "alpha\nneedlework\n",
			"papers/sample.pdf": PDF,
			"papers/broken.pdf": Buffer.from("%PDF-1.4\nnot really a pdf"),
		});
		await sync();
		await libraryTextIdle();
		const items = await store.list();
		const notes = items.find((i) => i.mirror?.path === "week1/notes.md")!;
		const broken = items.find((i) => i.mirror?.path === "papers/broken.pdf")!;
		const found = await search("energy");
		assert.equal(found.results[0]!.itemId, notes.id);
		assert.equal(found.results[0]!.name, "notes.md");
		assert.ok((await search("force")).results.some((r) => r.kind === "pdf"), "a synced PDF's pages are searched");
		assert.equal(await stateOf(broken.id), "failed", "an unreadable synced file is named as not searched");

		await pullTree(store, { "week1/notes.md": "# Week 1\n\nWaves interfere.", "papers/sample.pdf": PDF, "papers/broken.pdf": Buffer.from("%PDF-1.4\nnot really a pdf") });
		await sync();
		assert.equal((await search("energy")).total, 0, "the old text is gone");
		assert.equal((await search("interfere")).results[0]!.itemId, notes.id, "the changed file was read again, same id");
		assert.equal((await search("needlework")).total, 0, "a file removed upstream drops out");
	}));
});

describe("feature 026: highlights on a synced PDF (T042)", () => {
	it("save, keep their fingerprint through an unchanged pull, and see a new one after a change", () => asUser("u_mirror_ann", async () => {
		await pullTree(store, { "papers/sample.pdf": PDF, "notes.md": "# n" });
		const pdf = (await store.list()).find((i) => i.mirror?.path === "papers/sample.pdf")!;
		const made = await api.annotationCreateResponse(post({ anchor: anchor(), note: "on a synced PDF" }), pdf.id);
		assert.equal(made.status, 201);
		const { annotation } = await made.json() as { annotation: { id: string; fingerprint: { size: number; updatedAt: string } } };
		const list = async () => (await api.annotationsListResponse(pdf.id)).json() as Promise<{ annotations: { id: string }[]; fingerprint: { size: number; updatedAt: string } }>;

		await pullTree(store, { "papers/sample.pdf": PDF, "notes.md": "# n" });
		const unchanged = await list();
		assert.deepEqual(unchanged.annotations.map((a) => a.id), [annotation.id]);
		assert.deepEqual(unchanged.fingerprint, annotation.fingerprint, "an unchanged pull keeps the fingerprint, so nothing re-anchors");

		await pullTree(store, { "papers/sample.pdf": Buffer.concat([PDF, Buffer.from("\n% changed\n")]), "notes.md": "# n" });
		const changed = await list();
		assert.deepEqual(changed.annotations.map((a) => a.id), [annotation.id], "the highlight stays with the same item");
		assert.notDeepEqual(changed.fingerprint, annotation.fingerprint, "a changed file's new fingerprint makes the reader re-anchor by quote");
		// Highlights are for PDFs (feature 020): a synced text file answers as an uploaded one does.
		const text = (await store.list()).find((i) => i.mirror?.path === "notes.md")!;
		assert.equal((await api.annotationCreateResponse(post({ anchor: anchor() }), text.id)).status, 404);
	}));
});

describe("the reader's assets", () => {
	it("serves the local worker and named assets, and nothing else", async () => {
		const worker = await api.pdfjsAssetResponse(["legacy", "build", "pdf.worker.min.mjs"]);
		assert.equal(worker.status, 200);
		assert.match(worker.headers.get("content-type") ?? "", /javascript/);
		for (const bad of [["..", "..", "package.json"], ["legacy", "build", "pdf.mjs"], ["cmaps", "..", "..", "package.json"], ["%2e%2e", "x"]]) {
			assert.equal((await api.pdfjsAssetResponse(bad)).status, 404, bad.join("/"));
		}
	});
});

/** Feature 026: trash and restore can also answer a refusal; these tests never meet one. */
type TrashEntry = import("../src/core/library.ts").LibraryTrashEntry;
type Restored = { items: import("../src/core/library.ts").LibraryItem[]; folders: import("../src/core/library.ts").LibraryFolder[] };
