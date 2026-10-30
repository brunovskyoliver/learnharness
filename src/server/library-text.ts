/**
 * Cached facts about a document's text (feature 009, research R6). No model is
 * involved. library/derived/<id>.json is rebuildable, keyed by size and mtime.
 * pdfjs runs on the main thread, so PDFs go one at a time per tenant.
 */
import { createReadStream } from "node:fs";
import { tenantScoped } from "../../config.ts";
import { pdfExtract, pdfInfo, pdfOutline } from "../agent/subagents/pdf-ops.ts";
import { extensionOf, OUTLINE_MAX_BYTES, REFERENCE_INLINE_MAX_BYTES, type LibraryItem } from "../core/library.ts";
import { libraryStore } from "../store/library.ts";

export interface DerivedPdf {
	pageCount: number;
	meanTextLength: number;
	/** UTF-8 bytes of the extracted text. */
	textBytes: number;
	/** Kept only when short enough to inline; longer text is read by page. */
	text?: string;
	bookmarks?: string[];
	/** Pages worth rendering: images or heavy math. */
	flaggedPages?: number[];
}

export interface DerivedText {
	size: number;
	mtime: string;
	lines?: number;
	pdf?: DerivedPdf;
}

const queue = () => tenantScoped("__lhLibraryText", () => ({ tail: Promise.resolve() as Promise<unknown> }));
const NEWLINE = 0x0a;
const FLAGGED_MATH_DENSITY = 0.05;
const PREVIEW_LINES = 40;
const CSV_ROWS = 5;

async function countLines(file: string): Promise<number> {
	let lines = 0;
	let last = NEWLINE;
	for await (const chunk of createReadStream(file) as AsyncIterable<Buffer>) {
		for (const byte of chunk) if (byte === NEWLINE) lines++;
		last = chunk[chunk.length - 1] ?? last;
	}
	return last === NEWLINE ? lines : lines + 1;
}

/** Cached or fresh text info for a document. */
export async function readDerivedText(item: LibraryItem): Promise<DerivedText | null> {
	const cached = await libraryStore.readDerived(item.id) as DerivedText | null;
	if (cached?.size !== item.size || cached.mtime !== item.updatedAt) return null;
	// A PDF cached before references existed has no text facts yet.
	if (item.kind === "pdf" && typeof cached.pdf?.textBytes !== "number") return null;
	return cached;
}

async function buildPdf(file: string): Promise<DerivedPdf> {
	const info = await pdfInfo(file);
	const text = info.mean_text_length === 0 ? "" : await pdfExtract(file, "all");
	const textBytes = Buffer.byteLength(text);
	return {
		pageCount: info.page_count,
		meanTextLength: info.mean_text_length,
		textBytes,
		...(text && textBytes <= REFERENCE_INLINE_MAX_BYTES ? { text } : {}),
		bookmarks: await pdfOutline(file).catch(() => []),
		flaggedPages: info.pages.filter((page) => page.image_count > 0 || page.math_density >= FLAGGED_MATH_DENSITY).map((page) => page.page),
	};
}

async function index(item: LibraryItem): Promise<void> {
	const file = libraryStore.documentPath(item);
	const base = { size: item.size, mtime: item.updatedAt };
	try {
		if (item.kind === "pdf") {
			if (await readDerivedText(item)) return;
			const pdf = await buildPdf(file);
			await libraryStore.writeDerived(item.id, { ...base, pdf } satisfies DerivedText);
			await libraryStore.setTextState(item.id, pdf.meanTextLength === 0 ? "none" : "ok");
		} else {
			await libraryStore.writeDerived(item.id, { ...base, lines: await countLines(file) } satisfies DerivedText);
			await libraryStore.setTextState(item.id, "ok");
		}
	} catch (err) {
		console.error(`[library] text info failed for ${item.id}:`, err instanceof Error ? err.message : err);
		await libraryStore.setTextState(item.id, "failed").catch(() => {});
	}
}

function enqueue(item: LibraryItem): Promise<unknown> {
	const slot = queue();
	slot.tail = slot.tail.then(() => index(item));
	return slot.tail;
}

/** After an upload, in the background. Images have no text to index. */
export function indexAfterUpload(item: LibraryItem): void {
	if (item.kind === "image" || item.kind === "other" || item.kind === "page") return;
	void enqueue(item);
}

/** Settles once this tenant's queued work is done. For tests and shutdown. */
export function libraryTextIdle(): Promise<unknown> {
	return queue().tail;
}

/** A PDF's facts for a reference: cached, or built within `waitMs`. `not-ready`
 *  leaves the work running, so the next reference finds it. `failed` means
 *  pdfjs could not read the file. */
export async function pdfFacts(item: LibraryItem, waitMs: number): Promise<DerivedPdf | "not-ready" | "failed"> {
	const cached = await readDerivedText(item);
	if (cached?.pdf) return cached.pdf;
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), waitMs); });
	const finished = await Promise.race([enqueue(item).then(() => "done" as const), timeout]);
	clearTimeout(timer);
	if (finished === "timeout") return "not-ready";
	return (await readDerivedText(item))?.pdf ?? "failed";
}

// ─── outlines (research R6): no model, at most 8 KiB ─────────────────────────

function capOutline(lines: string[]): string {
	const notice = "[Outline shortened. Use library_read for the rest.]";
	const room = OUTLINE_MAX_BYTES - Buffer.byteLength(`\n${notice}`);
	const kept: string[] = [];
	let bytes = 0;
	for (const line of lines) {
		const cost = Buffer.byteLength(line) + 1;
		if (bytes + cost > room) return [...kept, notice].join("\n");
		kept.push(line);
		bytes += cost;
	}
	return kept.join("\n");
}

const lineCount = (lines: string[]) => `${lines.length} ${lines.length === 1 ? "line" : "lines"}`;
const HOW_TO_READ = "Use library_read with an offset and limit for any part.";

function markdownOutline(text: string): string {
	const lines = text.split("\n");
	const headings: string[] = [];
	let fenced = false;
	lines.forEach((line, i) => {
		if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
		else if (!fenced && /^#{1,6}\s/.test(line)) headings.push(`${i + 1}: ${line}`);
	});
	return capOutline([`${lineCount(lines)}. ${HOW_TO_READ}`, ...headings]);
}

function previewOutline(text: string, title: string): string {
	const lines = text.split("\n");
	return capOutline([`${title}${lineCount(lines)}. ${HOW_TO_READ}`, ...lines.slice(0, PREVIEW_LINES)]);
}

function csvOutline(text: string): string {
	const lines = text.split("\n");
	while (lines.length && lines[lines.length - 1] === "") lines.pop();
	const rows = Math.max(lines.length - 1, 0);
	return capOutline([`${rows} ${rows === 1 ? "row" : "rows"}. ${HOW_TO_READ}`, ...lines.slice(0, 1 + CSV_ROWS)]);
}

function pdfOutlineText(pdf: DerivedPdf): string {
	return capOutline([
		`${pdf.pageCount} ${pdf.pageCount === 1 ? "page" : "pages"}. Use library_read with pages or search to read it.`,
		...(pdf.bookmarks?.length ? ["Bookmarks:", ...pdf.bookmarks] : []),
		...(pdf.flaggedPages?.length ? [`Pages with images or heavy math: ${pdf.flaggedPages.join(", ")}`] : []),
	]);
}

/** The outline of text already in hand, for documents and pages. */
export function textOutline(item: Pick<LibraryItem, "kind" | "name">, text: string): string {
	switch (item.kind) {
		case "markdown":
		case "page":
			return markdownOutline(text);
		case "csv":
			return csvOutline(text);
		case "code":
			return previewOutline(text, `Language: ${extensionOf(item.name)}. `);
		default:
			return previewOutline(text, "");
	}
}

/** A PDF's outline from its facts. Exposed so library_read and references agree. */
export { pdfOutlineText };

/** library_read's PDF landing: page count, bookmarks and how to read on. */
export async function libraryPdfOverview(item: LibraryItem): Promise<string | null> {
	const facts = await pdfFacts(item, 10_000);
	if (facts === "failed") return null;
	return facts === "not-ready" ? "Its text is still being prepared. Try `pages` or `search` directly." : pdfOutlineText(facts);
}
