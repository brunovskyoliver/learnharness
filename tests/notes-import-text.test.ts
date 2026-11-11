import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, it } from "node:test";
import { POST } from "../app/api/graph/import/route.ts";
import { extraction } from "../src/server/index.ts";
import { hasReadableText, notesImportText, PDF_NO_TEXT } from "../src/server/notes-import-text.ts";
import { blankPdf } from "./fixtures/make-blank-pdf.mjs";

/* Bug graph-import-pdf-binary: Graph import read a PDF's raw bytes as text,
   sending ~15 MB of binary junk through 957 extraction chunks. */

const SAMPLE = readFileSync(new URL("./fixtures/sample-3page.pdf", import.meta.url));

it("a PDF is read through the PDF reader: page text, never its raw bytes", async () => {
	const text = await notesImportText(new File([SAMPLE], "slides.pdf"));
	assert.match(text, /^--- Page 1 ---/);
	assert.ok(!text.includes("%PDF-"), "no raw PDF syntax");
	assert.ok(!text.includes("endobj"), "no raw PDF objects");
	assert.ok(hasReadableText(text));
});

it("a PDF uploaded under another name is still recognised by its header", async () => {
	const text = await notesImportText(new File([SAMPLE], "slides.txt"));
	assert.ok(!text.includes("endobj"));
	assert.match(text, /--- Page 1 ---/);
});

it("a PDF with no text layer is refused before any model call", async () => {
	await assert.rejects(notesImportText(new File([new Uint8Array(blankPdf(2))], "scan.pdf")), { message: PDF_NO_TEXT });
});

it("plain-text notes are read as text, unchanged", async () => {
	assert.equal(await notesImportText(new File(["# Notes\nčeština ✓"], "notes.md")), "# Notes\nčeština ✓");
});

const original = extraction.importNotes;
after(() => { extraction.importNotes = original; });

it("the import route hands the pipeline the PDF's text and refuses a blank PDF without calling it", async () => {
	const seen: { filePath: string; text: string }[] = [];
	extraction.importNotes = async (input) => { seen.push(input); return { nodes: 0, chains: 0 }; };
	const form = new FormData();
	form.append("files", new File([SAMPLE], "slides.pdf"));
	form.append("files", new File([new Uint8Array(blankPdf(1))], "scan.pdf"));
	const response = await POST(new Request("http://localhost/api/graph/import", { method: "POST", body: form }));
	const { results } = await response.json() as { results: { filePath: string; ok: boolean; error?: string }[] };
	assert.equal(seen.length, 1);
	assert.equal(seen[0]!.filePath, "slides.pdf");
	assert.ok(!seen[0]!.text.includes("endobj"));
	const scan = results.find((r) => r.filePath === "scan.pdf")!;
	assert.equal(scan.ok, false);
	assert.equal(scan.error, PDF_NO_TEXT);
});
