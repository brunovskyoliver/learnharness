/**
 * Anchors and citations for documents (feature 020). Pure. An annotation holds a
 * page, a text quote and the rectangles it covered, each as a fraction of the page
 * so they survive any zoom. The learner's file is never touched: all of this lives
 * apart from the bytes, per item id.
 *
 * A citation is an ordinary Markdown link, `[…](/library?item=…&page=…&quote=…)`,
 * so it travels with a note, survives export and reads in any viewer.
 */
import { escapePassageText } from "./note-sources.ts";
import { foldWithMap } from "./document-search.ts";

export const ANNOTATION_QUOTE_MAX = 4000;
export const ANNOTATION_NOTE_MAX = 4000;
export const ANNOTATION_RECTS_MAX = 200;
export const ANCHOR_CONTEXT_CHARS = 32;
export const CITATION_QUOTE_MAX = 200;

/** Fractions of the page: x, y, width, height, each 0 to 1. */
export type AnchorRect = [number, number, number, number];

export interface TextAnchor {
	page: number;
	quote: string;
	prefix: string;
	suffix: string;
	/** Source offset on the page, a hint for telling repeats apart. */
	start: number;
	rects: AnchorRect[];
}

export interface DocumentAnnotation {
	id: string;
	itemId: string;
	anchor: TextAnchor;
	/** Absent for a plain highlight. */
	note?: string;
	/** The bytes it was made on. A difference means look again, never discard. */
	fingerprint: { size: number; updatedAt: string };
	createdAt: string;
	updatedAt: string;
}

export interface AnnotationsFile { version: 1; annotations: DocumentAnnotation[] }

/** A selection's context, cut from the page's text. */
export function anchorContext(pageText: string, start: number, end: number): { prefix: string; suffix: string } {
	return { prefix: pageText.slice(Math.max(0, start - ANCHOR_CONTEXT_CHARS), start), suffix: pageText.slice(end, end + ANCHOR_CONTEXT_CHARS) };
}

/** Finds a quote in a page's text, ignoring case, accents and all whitespace, so
 *  line breaks don't matter. With several matches, the surrounding text decides,
 *  then the nearest to `start`. Returns source offsets, or null. */
export function locateQuote(pageText: string, anchor: Pick<TextAnchor, "quote"> & Partial<Pick<TextAnchor, "prefix" | "suffix" | "start">>): { start: number; end: number } | null {
	const page = foldWithMap(pageText, false);
	const quote = foldWithMap(anchor.quote, false).text;
	if (!quote) return null;
	const prefix = foldWithMap(anchor.prefix ?? "", false).text;
	const suffix = foldWithMap(anchor.suffix ?? "", false).text;
	let best: { at: number; score: number; distance: number } | null = null;
	for (let at = page.text.indexOf(quote); at !== -1; at = page.text.indexOf(quote, at + 1)) {
		let score = 0;
		if (prefix && page.text.slice(Math.max(0, at - prefix.length), at) === prefix) score++;
		if (suffix && page.text.slice(at + quote.length, at + quote.length + suffix.length) === suffix) score++;
		const distance = anchor.start === undefined ? 0 : Math.abs(page.map[at]! - anchor.start);
		if (!best || score > best.score || (score === best.score && distance < best.distance)) best = { at, score, distance };
	}
	if (!best) return null;
	return { start: page.map[best.at]!, end: page.map[best.at + quote.length - 1]! + 1 };
}

/** Whether a rectangle list is usable: in range, and not absurdly many. */
export function validRects(value: unknown): value is AnchorRect[] {
	if (!Array.isArray(value) || value.length > ANNOTATION_RECTS_MAX) return false;
	return value.every((rect) => Array.isArray(rect) && rect.length === 4 && rect.every((n) => typeof n === "number" && Number.isFinite(n) && n >= -0.01 && n <= 1.01));
}

/** An anchor from an untrusted body, or null. */
export function parseAnchor(raw: unknown): TextAnchor | null {
	if (!raw || typeof raw !== "object") return null;
	const body = raw as Record<string, unknown>;
	const { page, quote, prefix, suffix, start, rects } = body;
	if (!Number.isInteger(page) || (page as number) < 1) return null;
	if (typeof quote !== "string" || !quote.trim() || quote.length > ANNOTATION_QUOTE_MAX) return null;
	if (typeof prefix !== "string" || prefix.length > ANCHOR_CONTEXT_CHARS * 4) return null;
	if (typeof suffix !== "string" || suffix.length > ANCHOR_CONTEXT_CHARS * 4) return null;
	if (!Number.isInteger(start) || (start as number) < 0) return null;
	if (!validRects(rects)) return null;
	return { page: page as number, quote, prefix, suffix, start: start as number, rects };
}

export const ANCHOR_UNANCHORED_TEXT = "This text is no longer on that page.";

// ─── citations ───────────────────────────────────────────────────────────────

export interface DocumentCitation { itemId: string; page: number; quote: string }

/** Enough to find the place. `(` and `)` go encoded, so the Markdown link holds. */
export function citationQuote(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length <= CITATION_QUOTE_MAX ? flat : flat.slice(0, CITATION_QUOTE_MAX).replace(/\s+\S*$/, "");
}

const encode = (value: string) => encodeURIComponent(value).replace(/[()'!*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export const citationHref = ({ itemId, page, quote }: DocumentCitation): string =>
	`/library?item=${encode(itemId)}&page=${page}&quote=${encode(quote)}`;

/** The citation an address names, or null for any other address. */
export function parseCitationHref(href: string): DocumentCitation | null {
	const at = href.indexOf("?");
	if (at === -1) return null;
	const path = href.slice(0, at).replace(/^https?:\/\/[^/]+/, "");
	if (path !== "/library") return null;
	const params = new URLSearchParams(href.slice(at + 1).split("#")[0]);
	const itemId = params.get("item");
	const page = Number(params.get("page"));
	if (!itemId || !Number.isInteger(page) || page < 1) return null;
	return { itemId, page, quote: params.get("quote") ?? "" };
}

const labelText = (name: string) => name.replace(/[\\[\]]/g, "\\$&").replace(/\s+/g, " ").trim();

export const citationLabel = (name: string, page: number) => `PDF: ${labelText(name)}, p. ${page}`;

function quoteLines(markdown: string): string {
	return markdown.split("\n").map((line) => (line.trim() ? `> ${line.trimEnd()}` : ">")).join("\n");
}

/** The block a passage from a PDF becomes in a note: a quote ending in its citation. */
export function documentPassageBlock(text: string, source: { itemId: string; name: string; page: number }): string {
	const body = escapePassageText(text.replace(/\r\n?/g, "\n").trim());
	return `${quoteLines(body)}\n>\n> [${citationLabel(source.name, source.page)}](${citationHref({ itemId: source.itemId, page: source.page, quote: citationQuote(text) })})`;
}

// ─── a passage sent to the tutor ─────────────────────────────────────────────

const PASSAGE_RE = /<library_passage item="([^"]*)" page="(\d+)">\n([\s\S]*?)\n<\/library_passage>/g;

const unescapeAttribute = (value: string) => value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A selected passage as marked reading material. The closing tag can't appear in
 *  the body, so the document can't end its own block. */
export function renderLibraryPassage(source: { itemId: string; page: number }, text: string): string {
	const body = text.replace(/\r\n?/g, "\n").trim().replace(/<\/library_passage/gi, (match) => `<\\/${match.slice(2)}`);
	return `<library_passage item="${attribute(source.itemId)}" page="${source.page}">\n${body}\n</library_passage>`;
}

export type UserTextRun = { text: string } | { passage: string; citation: DocumentCitation };

/** A sent message as the learner reads it: passages become quotes with a citation. */
export function userTextRuns(text: string): UserTextRun[] {
	if (!text.includes("<library_passage ")) return [{ text }];
	const runs: UserTextRun[] = [];
	let at = 0;
	for (const match of text.matchAll(PASSAGE_RE)) {
		if (match.index > at) runs.push({ text: text.slice(at, match.index) });
		const passage = match[3]!;
		runs.push({ passage, citation: { itemId: unescapeAttribute(match[1]!), page: Number(match[2]), quote: citationQuote(passage) } });
		at = match.index + match[0].length;
	}
	if (at < text.length) runs.push({ text: text.slice(at) });
	return runs;
}
