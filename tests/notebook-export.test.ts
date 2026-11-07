/** Feature 024, US7 (T039): the export document model and Markdown, the zip
 *  writer (checked with Node's own inflate and a central-directory parse),
 *  the Word package, the PDF when a browser is here, and the export route. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-nb-export-")));
process.env.LH_DATA_DIR = dir;
delete process.env.LH_HOSTED;
const { buildExportDocument, contentDisposition, copyNoteMarkdown, exportFilename, exportHtml, exportMarkdown, exportSketchSvg, OTHER_NOTES_HEADING } = await import("../src/core/notebook-export.ts");
const { zip } = await import("../src/core/zip.ts");
const { docx, docxEntries, DOCX_STYLES } = await import("../src/core/docx.ts");
const { pdfOverride, pdfUnavailableReason, renderPdf, stopBrowserService } = await import("../src/agent/subagents/headless.ts");
const { stores } = await import("../src/server/stores.ts");
const { PATHS } = await import("../config.ts");
const { isRefusal } = await import("../src/core/library.ts");
const exportRoute = await import("../app/api/notebook/[pageId]/export/route.ts");
after(() => { stopBrowserService(); fs.rmSync(dir, { recursive: true, force: true }); });

type Sketch = import("../src/core/notebook-sketch.ts").Sketch;
type Thread = import("../src/core/notebook.ts").NotebookThread;

const PAGE = `Entropy always rises in a closed system.

## Why tea cools

- Heat flows from hot to cold.
- The room barely warms.
  - It is much bigger.

> A quoted thought.

The last line.
`;
const AT = "2026-11-06T10:00:00.000Z";
const thread = (id: string, quote: string, status: Thread["status"], texts: string[], reviewerId?: string, sketch?: Sketch): Thread => ({
	id, anchor: { quote, prefix: "", suffix: "" }, placement: "margin", side: "right", status, origin: "read", createdAt: AT, updatedAt: AT,
	messages: texts.map((text, i) => ({ id: `m_${id}_${i}`, author: i % 2 ? "user" as const : "ai" as const, text, at: AT, ...(i % 2 === 0 && reviewerId ? { reviewerId } : {}), ...(i === 0 && sketch ? { sketch } : {}) })),
});
const SKETCH: Sketch = {
	title: "Heat flows", subtitle: "Hot to cold.", w: 200, h: 100,
	items: [{ step: 0, kind: "rect", x: 10, y: 10, w: 60, h: 40 }, { step: 1, kind: "arrow", x1: 80, y1: 30, x2: 150, y2: 30 }],
	steps: [{ caption: "A hot cup." }, { caption: "Heat leaves it.", note: "Hot to cold." }],
};
const threads = [
	thread("t_open", "closed system", "open", ["Closed to what, exactly?", "Energy.", "Then say so."], "examiner"),
	thread("t_res", "Heat flows from hot to cold.", "resolved", ["Always?"], "plain"),
	thread("t_dis", "The last line", "dismissed", ["Dismissed note."]),
	thread("t_gone", "words that are no longer here at all", "open", ["Where did this go?"]),
	thread("t_nest", "It is much bigger.", "open", ["How much bigger?"], "examiner", SKETCH),
];
const reviewers = [{ id: "plain", name: "Plain reader" }, { id: "examiner", name: "Examiner" }];
const doc = (includeAi: boolean, extra: Thread[] = []) => buildExportDocument({ title: "Heat", markdown: PAGE, companion: { threads: [...threads, ...extra] }, reviewers, includeAi });

describe("export document and Markdown", () => {
	it("puts each note right after the block it is about, in order; resolved stay, dismissed go, detached under Other notes", () => {
		const d = doc(true);
		const where = Object.fromEntries(d.units.flatMap((u, i) => u.notes.map((n) => [n.id, i])));
		assert.equal(d.units[where.t_open!]!.block.kind, "paragraph");
		assert.equal(d.units[where.t_res!]!.block.kind, "item");
		assert.equal(d.units[where.t_nest!]!.block.kind, "item");
		assert.ok((d.units[where.t_nest!]!.block as { level: number }).level === 1);
		assert.ok(!("t_dis" in where));
		assert.deepEqual(d.otherNotes.map((n) => n.id), ["t_gone"]);
		const md = exportMarkdown(d, { title: true });
		assert.ok(md.startsWith("# Heat\n\nEntropy always rises in a closed system.\n\n> **Examiner:** Closed to what, exactly?\n>\n> **You:** Energy.\n>\n> **Examiner:** Then say so.\n"), md);
		// Plain reader: no name.
		assert.match(md, /- Heat flows from hot to cold\.\n\n {2}> Always\?\n/);
		// The nested item's note keeps the list's indent; the drawing becomes captions.
		assert.match(md, / {4}> \*\*Examiner:\*\* How much bigger\?\n {4}>\n {4}> \*Drawing: Heat flows\*\n {4}> 1\. A hot cup\.\n {4}> 2\. Heat leaves it\. Hot to cold\./);
		assert.ok(!md.includes("Dismissed note."));
		assert.match(md, new RegExp(`## ${OTHER_NOTES_HEADING}\\n\\n\\*On “words that are no longer here at all”\\*\\n\\n> Where did this go\\?\\n$`));
		// His words are all still there, in order.
		const kept = md.split("\n").filter((l) => !/^\s*>/.test(l)).join("\n");
		for (const line of PAGE.trim().split("\n").filter((l) => l && !l.startsWith(">"))) assert.ok(kept.includes(line), line);
	});

	it("without the notes the file is the page with its title, and Copy this note is the page itself", () => {
		const md = exportMarkdown(doc(false), { title: true });
		assert.equal(md, `# Heat\n\n${PAGE}`);
		assert.equal(copyNoteMarkdown({ markdown: PAGE, companion: { threads }, reviewers, includeAi: false }), PAGE);
		const withNotes = copyNoteMarkdown({ markdown: PAGE, companion: { threads }, reviewers, includeAi: true });
		assert.ok(withNotes.startsWith("Entropy always rises"));
		assert.match(withNotes, /> \*\*Examiner:\*\* Closed to what, exactly\?/);
	});

	it("reads his marks: bold, italic, ~~strike~~, <u>, ink colours, code, links", () => {
		const d = buildExportDocument({ title: "x", markdown: "A **b** *i* ~~s~~ <u>u</u> <span data-color=\"red\">r</span> `c` [l](https://example.com)\n", companion: null, reviewers, includeAi: false });
		const runs = (d.units[0]!.block as { runs: { text: string }[] }).runs;
		assert.deepEqual(runs.filter((r) => Object.keys(r).length > 1).map((r) => r), [
			{ text: "b", bold: true }, { text: "i", italic: true }, { text: "s", strike: true }, { text: "u", underline: true }, { text: "r", color: "red" }, { text: "c", code: true }, { text: "l", href: "https://example.com" },
		]);
	});

	it("names files safely and says them in Content-Disposition", () => {
		assert.equal(exportFilename("Heat / cold: notes?", "pdf"), "Heat cold notes.pdf");
		assert.equal(exportFilename("..", "md"), "Note.md");
		assert.equal(exportFilename("Čaj a teplo", "docx"), "Čaj a teplo.docx");
		assert.equal(contentDisposition("Čaj.md"), `attachment; filename="Caj.md"; filename*=UTF-8''%C4%8Caj.md`);
	});

	it("the PDF's HTML has no script, the notes in their own voice and the drawing inline", () => {
		const html = exportHtml(doc(true));
		assert.ok(!/<script/i.test(html));
		assert.match(html, /default-src 'none'/);
		assert.match(html, /<aside class="note"><div class="msg ai"><span class="speaker">Examiner<\/span><p>Closed to what, exactly\?<\/p>/);
		assert.match(html, /<figure class="sketch"><svg /);
		assert.ok(!exportHtml(doc(false)).includes("class=\"note\""));
		const { svg, width } = exportSketchSvg(SKETCH);
		assert.ok(!svg.includes("var(--"));
		assert.equal(width, Math.round(200 * 1.12));
	});
});

// ─── zip ─────────────────────────────────────────────────────────────────────

const deps = { deflateRaw: (b: Uint8Array) => zlib.deflateRawSync(b), crc32: (b: Uint8Array) => zlib.crc32(b) };

/** Reads a zip by its central directory (as unzippers do) and inflates each entry. */
function unzip(bytes: Uint8Array): Map<string, { data: Buffer; method: number; crc: number }> {
	const buf = Buffer.from(bytes);
	const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	assert.ok(end >= 0, "end of central directory");
	const count = buf.readUInt16LE(end + 10);
	let at = buf.readUInt32LE(end + 16);
	const out = new Map<string, { data: Buffer; method: number; crc: number }>();
	for (let i = 0; i < count; i++) {
		assert.equal(buf.readUInt32LE(at), 0x02014b50);
		const method = buf.readUInt16LE(at + 10);
		const crc = buf.readUInt32LE(at + 16);
		const size = buf.readUInt32LE(at + 20);
		const nameLength = buf.readUInt16LE(at + 28);
		const local = buf.readUInt32LE(at + 42);
		const name = buf.subarray(at + 46, at + 46 + nameLength).toString("utf8");
		assert.equal(buf.readUInt32LE(local), 0x04034b50);
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
		const raw = buf.subarray(start, start + size);
		const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
		out.set(name, { data, method, crc });
		at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
	}
	return out;
}

describe("zip", () => {
	it("writes stored and deflated entries whose CRCs and contents check out", () => {
		const text = "hello ".repeat(500);
		const random = new Uint8Array(300).map((_, i) => (i * 7919) % 251);
		const bytes = zip([
			{ name: "a.txt", data: new TextEncoder().encode(text) },
			{ name: "dir/b.bin", data: random, store: true },
			{ name: "č/ünïcode.xml", data: new TextEncoder().encode("<x/>") },
		], deps);
		const files = unzip(bytes);
		assert.deepEqual([...files.keys()], ["a.txt", "dir/b.bin", "č/ünïcode.xml"]);
		assert.equal(files.get("a.txt")!.method, 8);
		assert.equal(files.get("dir/b.bin")!.method, 0);
		assert.equal(files.get("a.txt")!.data.toString("utf8"), text);
		assert.deepEqual(new Uint8Array(files.get("dir/b.bin")!.data), random);
		for (const file of files.values()) assert.equal(zlib.crc32(file.data), file.crc);
		// Same input, same bytes.
		assert.deepEqual(zip([{ name: "a.txt", data: new TextEncoder().encode(text) }], deps), zip([{ name: "a.txt", data: new TextEncoder().encode(text) }], deps));
	});

	it("refuses repeated or absolute names", () => {
		assert.throws(() => zip([{ name: "a", data: new Uint8Array() }, { name: "a", data: new Uint8Array() }], deps));
		assert.throws(() => zip([{ name: "/a", data: new Uint8Array() }], deps));
	});
});

// ─── docx ────────────────────────────────────────────────────────────────────

const PNG = new Uint8Array(zlib.gunzipSync(zlib.gzipSync(Buffer.from("89504e470d0a1a0a", "hex"))));

describe("docx", () => {
	it("packs the parts Word needs: paragraphs, the AI note style, lists and a picture for a sketch", () => {
		const d = doc(true);
		const bytes = docx(d, new Map([[SKETCH, { png: PNG, width: 224, height: 156 }]]), deps);
		const files = unzip(bytes);
		for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/fontTable.xml", "word/_rels/document.xml.rels", "word/media/image1.png"]) assert.ok(files.has(part), part);
		const document = files.get("word/document.xml")!.data.toString("utf8");
		assert.match(document, /<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Heat<\/w:t>/);
		assert.match(document, /<w:pStyle w:val="Heading2"\/>.*Why tea cools/);
		assert.match(document, new RegExp(`<w:pStyle w:val="${DOCX_STYLES.note}"/></w:pPr><w:r><w:rPr><w:rStyle w:val="${DOCX_STYLES.speaker}"/></w:rPr><w:t xml:space="preserve">Examiner: </w:t></w:r><w:r><w:t xml:space="preserve">Closed to what, exactly\\?</w:t>`));
		assert.match(document, /<w:numPr><w:ilvl w:val="1"\/><w:numId w:val="\d+"\/><\/w:numPr>/);
		assert.match(document, /<a:blip r:embed="rIdImg1"\/>/);
		assert.ok(!document.includes("Dismissed note."));
		assert.match(document, new RegExp(OTHER_NOTES_HEADING));
		const rels = files.get("word/_rels/document.xml.rels")!.data.toString("utf8");
		assert.match(rels, /Id="rIdImg1" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/image" Target="media\/image1\.png"/);
		assert.match(files.get("word/styles.xml")!.data.toString("utf8"), /w:styleId="AINote".*<w:rFonts w:ascii="Newsreader"[^>]*\/><w:i\/>/s);
		assert.match(files.get("word/fontTable.xml")!.data.toString("utf8"), /<w:font w:name="Instrument Sans"><w:altName w:val="Arial"\/>/);
		assert.deepEqual(new Uint8Array(files.get("word/media/image1.png")!.data), PNG);
	});

	it("a sketch caption's $math$ is a math run in Word and the PDF, not dollar signs (real-model pass)", () => {
		const mathSketch: Sketch = { ...SKETCH, steps: [SKETCH.steps[0]!, { caption: "The last cell receives $3+3=6$ paths.", note: "So $a+b$." }] };
		const extra = [thread("t_math", "Heat flows from hot to cold.", "open", ["Look."], "plain", mathSketch)];
		const html = exportHtml(doc(true, extra));
		assert.match(html, /2\. The last cell receives <span class="math">3\+3=6<\/span> paths\./);
		assert.match(html, /<em><span class="math">a\+b<\/span><\/em>|<em>So <span class="math">a\+b<\/span>/);
		assert.doesNotMatch(html, /\$3\+3=6\$/);
		// One line per step: only the step spans are blocks, not the math inside them.
		assert.match(html, /\.sketch figcaption > span \{ display: block; \}/);
		assert.doesNotMatch(html, /\.sketch figcaption span \{/);
		for (const picture of [new Map([[mathSketch, { png: PNG, width: 224, height: 156 }]]), new Map()]) {
			const document = unzip(docx(doc(true, extra), picture as never, deps)).get("word/document.xml")!.data.toString("utf8");
			assert.match(document, /<w:rStyle w:val="MathChar"\/><\/w:rPr><w:t xml:space="preserve">3\+3=6<\/w:t>/);
			assert.doesNotMatch(document, /\$3\+3=6\$/);
		}
	});

	it("without the notes, or without a picture, there is no image part", () => {
		const plain = docxEntries(doc(false));
		assert.ok(!plain.some((e) => e.name.startsWith("word/media/")));
		const text = new TextDecoder().decode(plain.find((e) => e.name === "word/document.xml")!.data);
		assert.ok(!text.includes(DOCX_STYLES.note + '"/>'));
		const noPicture = docxEntries(doc(true));
		assert.ok(!noPicture.some((e) => e.name.startsWith("word/media/")));
		assert.match(new TextDecoder().decode(noPicture.find((e) => e.name === "word/document.xml")!.data), /Drawing: Heat flows/);
	});
});

// ─── PDF ─────────────────────────────────────────────────────────────────────

describe("PDF", () => {
	const reason = pdfUnavailableReason();
	it("prints the HTML to a PDF with pages (needs a browser)", { skip: reason ? `no browser here: ${reason}` : false, timeout: 90_000 }, async () => {
		const pdf = await renderPdf(exportHtml(doc(true)));
		assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
		assert.ok((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length >= 1);
	});
});

// ─── the route ───────────────────────────────────────────────────────────────

const req = (body: unknown) => new Request("http://localhost/api/notebook/x/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const ctx = (pageId: string) => ({ params: Promise.resolve({ pageId }) });

describe("POST /api/notebook/:pageId/export", () => {
	it("400 for a bad id or body, 404 for an unknown page", async () => {
		assert.equal((await exportRoute.POST(req({ format: "md", includeAi: true }), ctx("a/b"))).status, 400);
		assert.equal((await exportRoute.POST(req({ format: "rtf", includeAi: true }), ctx("lib_x"))).status, 400);
		assert.equal((await exportRoute.POST(req({ format: "md" }), ctx("lib_x"))).status, 400);
		assert.equal((await exportRoute.POST(req("{bad"), ctx("lib_x"))).status, 400);
		assert.equal((await exportRoute.POST(req({ format: "md", includeAi: true }), ctx("lib_nope"))).status, 404);
	});

	it("answers each format as an attachment named after the page, with or without the notes", async () => {
		const made = await stores.libraryStore.createPage("Heat: notes", PAGE, { author: "learner" });
		assert.ok(!isRefusal(made));
		const id = made.item.id;
		fs.mkdirSync(path.join(PATHS.library, "notebook"), { recursive: true });
		fs.writeFileSync(path.join(PATHS.library, "notebook", `${id}.json`), JSON.stringify({ v: 1, pageId: id, instruction: "", threads, chat: [] }));

		const md = await exportRoute.POST(req({ format: "md", includeAi: true }), ctx(id));
		assert.equal(md.status, 200);
		assert.equal(md.headers.get("Content-Type"), "text/markdown; charset=utf-8");
		assert.equal(md.headers.get("Content-Disposition"), `attachment; filename="Heat notes.md"; filename*=UTF-8''Heat%20notes.md`);
		const text = await md.text();
		assert.match(text, /^# Heat: notes\n/);
		assert.match(text, /Closed to what, exactly\?/);
		const without = await (await exportRoute.POST(req({ format: "md", includeAi: false }), ctx(id))).text();
		assert.ok(!without.includes("Closed to what, exactly?"));

		const word = await exportRoute.POST(req({ format: "docx", includeAi: true }), ctx(id));
		assert.equal(word.status, 200);
		assert.match(word.headers.get("Content-Disposition")!, /filename="Heat notes\.docx"/);
		const files = unzip(new Uint8Array(await word.arrayBuffer()));
		assert.match(files.get("word/document.xml")!.data.toString("utf8"), /Closed to what, exactly\?/);
		// The sketch became a real PNG (resvg).
		assert.equal(files.get("word/media/image1.png")!.data.subarray(1, 4).toString("latin1"), "PNG");

		pdfOverride.current = async (html) => Buffer.from(`%PDF-1.7 fake ${html.length}`);
		try {
			const pdf = await exportRoute.POST(req({ format: "pdf", includeAi: false }), ctx(id));
			assert.equal(pdf.status, 200);
			assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
			assert.match(pdf.headers.get("Content-Disposition")!, /filename="Heat notes\.pdf"/);
			assert.match(await pdf.text(), /^%PDF-1\.7 fake/);
			pdfOverride.current = async () => { throw new Error("printer on fire"); };
			const failed = await exportRoute.POST(req({ format: "pdf", includeAi: true }), ctx(id));
			assert.equal(failed.status, 500);
			assert.equal((await failed.json()).detail, "printer on fire");
		} finally {
			delete pdfOverride.current;
		}
	});
});
