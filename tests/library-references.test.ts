/** contracts/references.md's resolution table, row by row, on a real store. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

const data = fs.mkdtempSync(path.join(os.tmpdir(), "lh-references-"));
process.env.LH_DATA_DIR = data;
const { resolveReferences } = await import("../src/server/library-references.ts");
const { stores } = await import("../src/server/stores.ts");
const { libraryTextIdle } = await import("../src/server/library-text.ts");
const { PATHS } = await import("../config.ts");

const ROOM = 1_000_000;
const resolve = (text: string, over: Partial<Parameters<typeof resolveReferences>[1]> = {}) =>
	resolveReferences(text, { roomTokens: ROOM, visionReady: true, pdfWaitMs: 2000, ...over });

async function add(name: string, content: string | Buffer) {
	const bytes = Buffer.from(content);
	async function* body() { yield new Uint8Array(bytes); }
	const item = await stores.libraryStore.writeUpload(name, body(), bytes.length);
	assert.ok(!("refused" in item), JSON.stringify(item));
	return item as Extract<typeof item, { id: string }>;
}

const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n\x1a\n"), Buffer.alloc(16)]);

before(() => fs.mkdirSync(PATHS.files, { recursive: true }));
beforeEach(() => {
	fs.rmSync(PATHS.files, { recursive: true, force: true });
	fs.rmSync(PATHS.library, { recursive: true, force: true });
	fs.mkdirSync(PATHS.files, { recursive: true });
});
after(() => fs.rmSync(data, { recursive: true, force: true }));

describe("resolveReferences", () => {
	it("inlines text within the limits, with the name at send", async () => {
		const item = await add("notes.md", "# hi\nbody");
		const [ref] = await resolve("see @notes.md");
		assert.equal(ref!.itemId, item.id);
		assert.equal(ref!.name, "notes.md");
		assert.equal(ref!.mode, "inline");
		assert.equal(ref!.reason, undefined);
		assert.equal(ref!.material, "# hi\nbody");
	});
	it("inlines exactly 32 KiB and outlines one byte more", async () => {
		await add("exact.txt", "a".repeat(32 * 1024));
		await add("over.txt", "a".repeat(32 * 1024 + 1));
		assert.equal((await resolve("@exact.txt"))[0]!.mode, "inline");
		const [over] = await resolve("@over.txt");
		assert.equal(over!.mode, "outline");
		assert.equal(over!.reason, "too-long");
		assert.ok(over!.material!.length < 8 * 1024 + 1);
		assert.ok(!over!.material!.includes("a".repeat(9000)));
	});
	it("outlines Markdown as its headings with line numbers", async () => {
		await add("long.md", `# One\n${"text\n".repeat(8000)}## Two\n`);
		const [ref] = await resolve("@long.md");
		assert.equal(ref!.reason, "too-long");
		assert.ok(ref!.material!.includes("1: # One"));
		assert.ok(ref!.material!.includes("8002: ## Two"));
	});
	it("outlines a CSV as header, rows and a count", async () => {
		await add("t.csv", `a,b\n${"1,2\n".repeat(20000)}`);
		const [ref] = await resolve("@t.csv");
		assert.ok(ref!.material!.startsWith("20000 rows."));
		assert.ok(ref!.material!.includes("a,b"));
	});
	it("an outline never passes 8 KiB and says when it was cut", async () => {
		await add("many.md", "# heading\n".repeat(9000));
		const [ref] = await resolve("@many.md");
		assert.ok(Buffer.byteLength(ref!.material!) <= 8 * 1024);
		assert.ok(ref!.material!.includes("Outline shortened"));
	});
	it("switches to an outline when the message total would pass 64 KiB", async () => {
		for (const name of ["a.txt", "b.txt", "c.txt"]) await add(name, "x".repeat(30 * 1024));
		const refs = await resolve("@a.txt @b.txt @c.txt");
		assert.deepEqual(refs.map((r) => [r.mode, r.reason]), [["inline", undefined], ["inline", undefined], ["outline", "message-limit"]]);
	});
	it("outlines an item over half the room left", async () => {
		await add("a.txt", "x".repeat(4000)); // about 1000 tokens
		assert.equal((await resolve("@a.txt", { roomTokens: 2000 }))[0]!.mode, "inline");
		const [ref] = await resolve("@a.txt", { roomTokens: 1999 });
		assert.deepEqual([ref!.mode, ref!.reason], ["outline", "no-room"]);
	});
	it("spends the room as it goes", async () => {
		await add("a.txt", "x".repeat(4000));
		await add("b.txt", "y".repeat(4000));
		const refs = await resolve("@a.txt @b.txt", { roomTokens: 2500 });
		assert.deepEqual(refs.map((r) => r.reason), [undefined, "no-room"]);
	});
	it("marks the ninth reference onward as not attached", async () => {
		const names = Array.from({ length: 10 }, (_, i) => `n${i}.txt`);
		for (const name of names) await add(name, "x");
		const refs = await resolve(names.map((n) => `@${n}`).join(" "));
		assert.deepEqual(refs.slice(0, 8).map((r) => r.mode), Array(8).fill("inline"));
		assert.deepEqual(refs.slice(8).map((r) => [r.mode, r.reason, r.material]), [["missing", "over-count", undefined], ["missing", "over-count", undefined]]);
	});
	it("an image with vision gets image mode and no material", async () => {
		await add("fig.png", PNG);
		const [ref] = await resolve("@fig.png");
		assert.deepEqual([ref!.mode, ref!.reason, ref!.material], ["image", undefined, undefined]);
	});
	it("an image without vision is unreadable", async () => {
		await add("fig.png", PNG);
		const [ref] = await resolve("@fig.png", { visionReady: false });
		assert.deepEqual([ref!.mode, ref!.reason], ["unreadable", "no-vision"]);
	});
	it("reads settings for vision by default: none set means no-vision", async () => {
		await add("fig.png", PNG);
		const [ref] = await resolveReferences("@fig.png", { roomTokens: ROOM });
		assert.deepEqual([ref!.mode, ref!.reason], ["unreadable", "no-vision"]);
	});
	it("a PDF pdfjs can't open is unreadable and the input goes on", async () => {
		await add("broken.pdf", "%PDF-1.7 not really");
		const [ref] = await resolve("@broken.pdf");
		await libraryTextIdle();
		assert.deepEqual([ref!.mode, ref!.reason], ["unreadable", "no-text"]);
	});
	it("a PDF still being read after the wait is not-ready, with no material", async () => {
		await add("big.pdf", "%PDF-1.7 not really");
		const [ref] = await resolve("@big.pdf", { pdfWaitMs: 0 });
		assert.deepEqual([ref!.mode, ref!.reason, ref!.material], ["outline", "not-ready", undefined]);
		await libraryTextIdle();
	});
	it("kind other is unsupported", async () => {
		fs.writeFileSync(path.join(PATHS.files, "old.xyz"), "x");
		const [ref] = await resolve("@old.xyz");
		assert.deepEqual([ref!.mode, ref!.reason], ["unreadable", "unsupported"]);
	});
	it("a tombstone is missing, with no size", async () => {
		const item = await add("gone.md", "x");
		await stores.libraryStore.remove(item.id);
		const [ref] = await resolve("@gone.md");
		assert.deepEqual([ref!.mode, ref!.reason, ref!.size, ref!.name], ["missing", undefined, undefined, "gone.md"]);
	});
	it("an old name resolves to the item under its current name", async () => {
		const item = await add("before.md", "x");
		await stores.libraryStore.rename(item.id, "after.md");
		const [ref] = await resolve("@before.md");
		assert.deepEqual([ref!.itemId, ref!.name], [item.id, "after.md"]);
	});
	it("a read error on one item gives unreadable and never blocks the rest", async () => {
		await add("ok.md", "fine");
		await add("bad.md", "x");
		const original = stores.libraryStore.readText;
		stores.libraryStore.readText = async (item) => {
			if (item.name === "bad.md") throw new Error("EIO");
			return original(item);
		};
		try {
			const refs = await resolve("@bad.md @ok.md");
			assert.deepEqual(refs.map((r) => r.mode), ["unreadable", "inline"]);
		} finally {
			stores.libraryStore.readText = original;
		}
	});
	it("an unreadable catalog yields no references instead of blocking the input", async () => {
		fs.mkdirSync(PATHS.library, { recursive: true });
		fs.writeFileSync(path.join(PATHS.library, "catalog.json"), "{damaged");
		assert.deepEqual(await resolve("@notes.md"), []);
	});
	it("text with no @ never reads the catalog", async () => {
		const original = stores.libraryStore.catalog;
		stores.libraryStore.catalog = async () => { throw new Error("must not be called"); };
		try { assert.deepEqual(await resolve("no token"), []); }
		finally { stores.libraryStore.catalog = original; }
	});
	it("dedupes across an answer's fields", async () => {
		await add("a.md", "x");
		const refs = await resolveReferences(["@a.md", "again @a.md"], { roomTokens: ROOM });
		assert.equal(refs.length, 1);
	});
});
