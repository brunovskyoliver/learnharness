/**
 * The text Graph import extracts from an uploaded file (bug
 * graph-import-pdf-binary). Plain-text notes are read as text, as before. A
 * PDF is read through the Library's PDF reader (pdfjs, `pdfExtract`), never as
 * raw bytes: decoding a PDF's binary as UTF-8 once sent ~15 MB of junk (957
 * chunks, ~10M tokens over 4 hours) through the extraction pipeline.
 * No model is involved here.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfExtract } from "../agent/subagents/pdf-ops.ts";

export const PDF_NO_TEXT = "This PDF has no text to read. It may be scanned images.";

const PAGE_HEADER = /^--- Page \d+ ---$/;

function isPdf(name: string, head: Uint8Array): boolean {
	if (/\.pdf$/i.test(name)) return true;
	// "%PDF-" magic, for a PDF uploaded under another name.
	return head.length >= 5 && String.fromCharCode(...head.subarray(0, 5)) === "%PDF-";
}

/** A PDF's extracted text carries only `--- Page N ---` headers when it has no
 *  text layer; that is not text worth a model call. */
export function hasReadableText(extracted: string): boolean {
	return extracted.split("\n").some((line) => !PAGE_HEADER.test(line.trim()) && /[\p{L}\p{N}]/u.test(line));
}

export async function notesImportText(
	file: File,
	extract: (filePath: string, pageSpec: string) => Promise<string> = pdfExtract,
): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!isPdf(file.name, bytes)) return new TextDecoder().decode(bytes);
	const dir = await mkdtemp(join(tmpdir(), "lh-notes-pdf-"));
	try {
		const path = join(dir, "upload.pdf");
		await writeFile(path, bytes, { mode: 0o600 });
		const text = await extract(path, "all");
		if (!hasReadableText(text)) throw new Error(PDF_NO_TEXT);
		return text;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
