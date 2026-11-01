/** A pre-011 catalog through the whole workspace (feature 023). The fixture is written by
 *  hand in the 009-010 shape: pages with versions, an upload, an old name and a tombstone,
 *  no folders, tags or trash. Then folders, marks, trash, links, search, annotations,
 *  cards, diagrams and held edits all run over a copy. Ids, versions, old names and @
 *  references must come through, and the catalog's version must not move. No model. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-preservation-")));
const dir = path.join(root, "copy");
process.env.LH_DATA_DIR = dir;
after(() => fs.rmSync(root, { recursive: true, force: true }));

const PAGE = "lib_oldPage", UPLOAD = "lib_oldUpload", PLAIN = "lib_oldPlain", GONE = "lib_oldGone";
const at = "2026-10-01T10:00:00.000Z";
const V1 = "# Old notes\n\nA first line.\n\nA line to rewrite.\n";
const V2 = `${V1}\nA learner's line with $x^2$ and a [link](https://example.com).\n`;
const PLAIN_TEXT = "Plain page, never touched.\n";
const BYTES = Buffer.from("%PDF-1.4 not really a pdf, only bytes that must survive\n");
const originalItems = [
	{ id: PAGE, name: "Old notes", previousNames: ["Week 1", "Draft notes"], kind: "page", size: Buffer.byteLength(V2), createdAt: at, updatedAt: at, origin: { type: "agent", chatId: "chat_old" }, headVersion: 2 },
	{ id: UPLOAD, name: "paper.pdf", previousNames: ["scan.pdf"], kind: "pdf", size: BYTES.length, createdAt: at, updatedAt: at, origin: { type: "upload" } },
	{ id: PLAIN, name: "Plain", kind: "page", size: Buffer.byteLength(PLAIN_TEXT), createdAt: at, updatedAt: at, origin: { type: "learner" }, headVersion: 1 },
	{ id: GONE, name: "Deleted long ago", deletedAt: at, previousNames: ["Older name"] },
];
const versionLines = [
	{ n: 1, author: "agent", at, bytes: Buffer.byteLength(V1), base: 0, cause: "agent-create", chatId: "chat_old", toolCallId: "call_1" },
	{ n: 2, author: "learner", at, bytes: Buffer.byteLength(V2), base: 1, cause: "save" },
].map((line) => JSON.stringify(line)).join("\n") + "\n";
const write = (rel: string, content: string | Buffer) => {
	const file = path.join(dir, rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
};
const hash = (rel: string) => createHash("sha256").update(fs.readFileSync(path.join(dir, rel))).digest("hex");
const catalog = () => JSON.parse(fs.readFileSync(path.join(dir, "library", "catalog.json"), "utf8"));

before(() => {
	write("library/catalog.json", JSON.stringify({ version: 1, items: originalItems }, null, "\t"));
	write(`library/pages/${PAGE}/versions.jsonl`, versionLines);
	write(`library/pages/${PAGE}/v1.md`, V1);
	write(`library/pages/${PAGE}/v2.md`, V2);
	write(`library/pages/${PLAIN}/versions.jsonl`, `${JSON.stringify({ n: 1, author: "learner", at, bytes: Buffer.byteLength(PLAIN_TEXT), base: 0, cause: "save" })}\n`);
	write(`library/pages/${PLAIN}/v1.md`, PLAIN_TEXT);
	write("files/paper.pdf", BYTES);
	// A document's updatedAt is its bytes' modification time, so the fixture's has to agree.
	fs.utimesSync(path.join(dir, "files/paper.pdf"), new Date(at), new Date(at));
});

const { libraryStore: store } = await import("../src/store/library.ts");
const { diagramStore } = await import("../src/store/diagrams.ts");
const { pageProposalStore } = await import("../src/store/page-proposals.ts");
const { annotationStore } = await import("../src/store/library-annotations.ts");
const { parseReferences } = await import("../src/core/library-refs.ts");
const { blankDiagram } = await import("../src/core/diagram.ts");
const { CATALOG_VERSION, isRefusal, isTombstone } = await import("../src/core/library.ts");
const { cardCreateResponse } = await import("../src/server/cards.ts");
const { pageConnectionsResponse } = await import("../src/server/notes.ts");

describe("a pre-011 Library through the workspace", () => {
	const v1Hash = () => hash(`library/pages/${PAGE}/v1.md`);
	const before1 = { v1: createHash("sha256").update(V1).digest("hex"), v2: createHash("sha256").update(V2).digest("hex"), bytes: createHash("sha256").update(BYTES).digest("hex"), plain: createHash("sha256").update(PLAIN_TEXT).digest("hex") };

	it("reads as it was written, without rewriting anything", async () => {
		const raw = fs.readFileSync(path.join(dir, "library", "catalog.json"), "utf8");
		const items = await store.catalog();
		assert.deepEqual(items.map((entry) => entry.id), [PAGE, UPLOAD, PLAIN, GONE]);
		assert.equal((await store.readPage(PAGE))!.head.content, V2);
		assert.equal(fs.readFileSync(path.join(dir, "library", "catalog.json"), "utf8"), raw, "a read rewrites nothing");
	});

	it("takes folders, marks, trash, a rename, links, annotations, cards, diagrams and held edits", async () => {
		// 011: folders and moves.
		const physics = await store.createFolder("Physics", null);
		assert.ok(!isRefusal(physics));
		const nested = await store.createFolder("Waves", physics.id);
		assert.ok(!isRefusal(nested));
		for (const id of [PAGE, UPLOAD]) assert.ok(!isRefusal((await store.moveItem(id, nested.id))!));

		// 012-013: marks, archive, trash and back.
		await store.markItem(PAGE, { tags: ["physics"], favorite: true, pinned: true });
		await store.markItem(UPLOAD, { archived: true });
		await store.markItem(UPLOAD, { archived: false });
		const trashed = await store.trashItem(PLAIN);
		assert.ok(trashed);
		await store.restoreTrash(trashed.id);

		// 014-016: opening, a rename, and a wiki link from another page.
		await store.markOpened(PAGE);
		const renamed = await store.rename(PAGE, "Wave notes");
		assert.ok(renamed && !isRefusal(renamed));
		const linking = await store.createPage("Index", "See [[Wave notes]] and @Week 1.\n", { author: "learner" });
		assert.ok(!isRefusal(linking));
		assert.equal((await pageConnectionsResponse(linking.item.id)).status, 200);

		// 017: a saved passage is a new learner version on top.
		const appended = await store.appendToPage(PAGE, "> Saved passage.", { chatId: "chat_new" });
		assert.ok(typeof appended === "object" && appended.version.n === 3);

		// 019-020: annotations live apart from the file.
		await annotationStore.add(UPLOAD, { anchor: { page: 1, quote: "bytes", prefix: "", suffix: "", start: 0, rects: [] }, note: "mine", fingerprint: { size: BYTES.length, updatedAt: at } });

		// 021: a card pointing at the page.
		const card = await cardCreateResponse(new Request("http://x/", { method: "POST", body: JSON.stringify({ front: "What moves?", back: "A wave." }) }));
		assert.equal(card.status, 201);

		// 022: a diagram beside the pages.
		const diagram = await diagramStore.create("Map", blankDiagram("diagram"), { author: "learner" });
		assert.ok(!isRefusal(diagram));

		// 023: one held edit accepted, one rejected.
		const head = (await store.readPage(PAGE))!.head;
		const held = await pageProposalStore.propose({ pageId: PAGE, baseVersion: head.n, apply: (text) => text.replace("A line to rewrite.", "A clearer line.") });
		assert.equal(held.outcome, "proposed");
		const refused = await pageProposalStore.propose({ pageId: PAGE, baseVersion: head.n, apply: (text) => text.replace("A first line.", "Not this.") });
		assert.equal(refused.outcome, "proposed");
		assert.equal((await pageProposalStore.reject((refused as { proposal: { id: string } }).proposal.id)).outcome, "rejected");
		const id = (held as { proposal: { id: string } }).proposal.id;
		assert.equal((await pageProposalStore.accept(id, (await pageProposalStore.review(id))!.current!.expected)).outcome, "accepted");
	});

	it("keeps ids and adds only optional fields", async () => {
		const items = await store.catalog();
		for (const original of originalItems) {
			const now = items.find((entry) => entry.id === original.id);
			assert.ok(now, original.id);
			if ("deletedAt" in original) {
				assert.deepEqual(now, original, "a tombstone is untouched");
				continue;
			}
			assert.ok(!isTombstone(now));
			assert.equal(now.kind, original.kind);
			assert.equal(now.createdAt, original.createdAt);
			assert.deepEqual(now.origin, original.origin, `${original.id}'s origin`);
		}
		assert.equal(catalog().version, 1);
		assert.equal(catalog().version, CATALOG_VERSION, "no version bump");
	});

	it("keeps every version byte for byte, and only adds after them", async () => {
		assert.equal(v1Hash(), before1.v1);
		assert.equal(hash(`library/pages/${PAGE}/v2.md`), before1.v2);
		const log = fs.readFileSync(path.join(dir, `library/pages/${PAGE}/versions.jsonl`), "utf8");
		assert.ok(log.startsWith(versionLines), "the old log is a prefix of the new one");
		const versions = (await store.listPageVersions(PAGE))!;
		assert.deepEqual(versions.map((version) => version.n), [4, 3, 2, 1]);
		assert.deepEqual([versions[0]!.author, versions[0]!.cause], ["agent", "proposal-approved"]);
		assert.equal((await store.readPageVersion(PAGE, 2))!.content, V2);
		const page = (await store.readPage(PAGE))!;
		assert.ok(page.head.content.includes("A clearer line."));
		assert.ok(page.head.content.includes("with $x^2$ and a [link](https://example.com)."), "the learner's line is whole");
		assert.equal((await store.readPage(PLAIN))!.head.content, PLAIN_TEXT, "a restored page is the same page");
		assert.equal(hash(`library/pages/${PLAIN}/v1.md`), before1.plain);
	});

	it("keeps the upload's bytes", () => assert.equal(hash("files/paper.pdf"), before1.bytes));

	it("keeps previous names, and old @ tokens still find the item", async () => {
		const items = await store.catalog();
		const page = items.find((entry) => entry.id === PAGE)!;
		assert.ok(!isTombstone(page));
		assert.deepEqual(page.previousNames!.slice(0, 2), ["Week 1", "Draft notes"]);
		assert.ok(page.previousNames!.includes("Old notes"), "the rename adds to them");
		const upload = items.find((entry) => entry.id === UPLOAD)!;
		assert.ok(!isTombstone(upload));
		assert.deepEqual(upload.previousNames, ["scan.pdf"]);
		const ids = (text: string) => parseReferences(text, items).map((entry) => entry.id);
		assert.deepEqual(ids("Read @Wave notes please"), [PAGE], "the current name");
		assert.deepEqual(ids("Read @Old notes please"), [PAGE], "the name it had before the rename");
		assert.deepEqual(ids("Read @Week 1 please"), [PAGE], "a name older than all of this");
		assert.deepEqual(ids("Read @scan.pdf please"), [UPLOAD]);
		assert.deepEqual(ids("Read @Deleted long ago please"), [GONE], "a tombstone keeps its name for old messages");
	});

	it("keeps new things in new places", () => {
		for (const rel of ["library/page-proposals", "library/pages", "cards"]) assert.ok(fs.existsSync(path.join(dir, rel)), rel);
		const raw = fs.readFileSync(path.join(dir, "library", "catalog.json"), "utf8");
		assert.doesNotMatch(raw, /proposal/i, "no proposal enters the catalog");
		assert.doesNotMatch(raw, /"front"/, "no card enters the catalog");
		assert.doesNotMatch(raw, /"quote"/, "no annotation enters the catalog");
	});
});
