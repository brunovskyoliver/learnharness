/**
 * Full-text search over the Library (feature 019). Pure: extraction of passages
 * from text already in hand, query parsing, matching, ranking and snippets. The
 * store keeps what this produces; the server decides when to run it. No model is
 * involved, and the same input always gives the same output.
 *
 * Folding lower-cases, strips diacritics and collapses whitespace, keeping a map
 * back to the source so a snippet highlights the characters that actually matched.
 */
import { folderSubtree, type LibraryFolder, type LibraryItem, type LibraryKind } from "./library.ts";

export const DOC_INDEX_VERSION = 1;
export const DOC_QUERY_MAX_CHARS = 200;
export const DOC_QUERY_MAX_TERMS = 8;
export const DOC_QUERY_MIN_CHARS = 2;
export const DOC_SEARCH_LIMIT = 50;
export const DOC_HITS_PER_ITEM = 3;
/** Past this a text file isn't indexed, and says so. Uploads reach 50 MiB. */
export const DOC_TEXT_MAX_BYTES = 8 * 1024 * 1024;
const CHUNK_CHARS = 2000;
const SNIPPET_CONTEXT = 80;

export type DocIndexState = "indexed" | "pending" | "failed" | "no-text" | "unsupported";

export const DOC_STATE_LABEL: Record<DocIndexState, string> = {
	indexed: "Searched",
	pending: "Waiting to be read",
	failed: "Could not be read",
	"no-text": "No text could be read",
	unsupported: "Can't be searched",
};

/** Where a passage sits. Exactly one is present. */
export interface DocPassageRef { block?: number; line?: number; page?: number }
export interface DocPassage extends DocPassageRef { text: string }

/** One item's entry in the index. No timestamps, so a reindex of unchanged
 *  sources writes identical bytes. */
export interface DocIndexShard {
	v: number;
	itemId: string;
	signature: string;
	state: Exclude<DocIndexState, "pending">;
	reason?: string;
	passages: DocPassage[];
}

/** Changes exactly when the indexed text can have changed. Names, folders and
 *  tags are read from the catalog at query time, so a rename or move costs nothing. */
export function docSignature(item: Pick<LibraryItem, "kind" | "size" | "updatedAt" | "headVersion">): string {
	return item.kind === "page" || item.kind === "diagram" ? `${item.kind}:${item.headVersion ?? 0}:${item.size}` : `${item.kind}:${item.size}:${item.updatedAt}`;
}

export const isSearchableKind = (kind: LibraryKind): boolean => kind !== "image" && kind !== "other";

// ─── folding ─────────────────────────────────────────────────────────────────

export interface Folded {
	text: string;
	/** Source offset of each folded unit, plus one final entry for the end. */
	map: number[];
}

const WS = /\s/;
const MARKS = /\p{M}/gu;

/** `keepSpace: false` drops whitespace altogether, which is what a quote needs:
 *  a PDF's line breaks and a selection's spaces rarely agree. */
export function foldWithMap(source: string, keepSpace = true): Folded {
	let text = "";
	const map: number[] = [];
	let lastSpace = true;
	for (let i = 0; i < source.length;) {
		const code = source.codePointAt(i)!;
		const width = code > 0xffff ? 2 : 1;
		const raw = source.slice(i, i + width);
		if (WS.test(raw)) {
			if (keepSpace && !lastSpace) { text += " "; map.push(i); }
			lastSpace = true;
		} else {
			const folded = code < 0x80 ? raw.toLowerCase() : raw.normalize("NFKD").replace(MARKS, "").toLowerCase();
			for (let u = 0; u < folded.length; u++) { text += folded[u]; map.push(i); }
			if (folded) lastSpace = false;
		}
		i += width;
	}
	if (keepSpace && text.endsWith(" ")) { text = text.slice(0, -1); map.pop(); }
	map.push(source.length);
	return { text, map };
}

export const foldText = (source: string, keepSpace = true): string => foldWithMap(source, keepSpace).text;

// ─── passages ────────────────────────────────────────────────────────────────

/** What a reader sees of a Markdown block. Syntax and link targets aren't
 *  searchable text, so a source link's URL never matches a query. */
export function plainBlockText(block: string): string {
	return block
		.split("\n")
		.map((line) => line
			.replace(/^\s{0,3}(?:#{1,6}\s+|(?:>\s?)+|[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, "")
			.replace(/^\s*(?:```.*|~~~.*)$/, "")
			.replace(/^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, "")
			.replace(/<\/?(?:details|summary)(?:\s[^>]*)?>/gi, ""))
		.join("\n")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[\[([^\]\n]+)\]\]/g, "$1")
		.replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
		.replace(/&#91;/g, "[").replace(/&#93;/g, "]")
		.replace(/\\([\\`*_~$<[\]>#.+-])/g, "$1")
		.replace(/(\*\*|__|~~|`)/g, "")
		.replace(/(^|[\s(])[*_]([^\s*_][^*_\n]*)[*_](?=[\s).,;:!?]|$)/gm, "$1$2")
		.trim();
}

/** A page's head text as blocks, split on blank lines outside code fences. */
export function pagePassages(markdown: string): DocPassage[] {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const out: DocPassage[] = [];
	let current: string[] = [];
	let fenced = false;
	let block = 0;
	const flush = () => {
		if (current.length === 0) return;
		const text = plainBlockText(current.join("\n"));
		if (text) out.push({ block, text: text.slice(0, CHUNK_CHARS * 8) });
		block++;
		current = [];
	};
	for (const line of lines) {
		if (/^ {0,3}(```|~~~)/.test(line)) fenced = !fenced;
		if (!fenced && !line.trim()) { flush(); continue; }
		current.push(line);
	}
	flush();
	return out;
}

/** A text file as runs of lines. `line` is the run's first line, 1-indexed. A
 *  very long line is cut across runs that keep its number. */
export function textPassages(text: string): DocPassage[] {
	const out: DocPassage[] = [];
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	let run: string[] = [];
	let size = 0;
	let start = 1;
	const flush = () => {
		const body = run.join("\n");
		if (body.trim()) out.push({ line: start, text: body });
		run = [];
		size = 0;
	};
	lines.forEach((line, index) => {
		if (size > 0 && size + line.length + 1 > CHUNK_CHARS) flush();
		if (run.length === 0) start = index + 1;
		if (line.length > CHUNK_CHARS) {
			flush();
			for (let at = 0; at < line.length; at += CHUNK_CHARS) out.push({ line: index + 1, text: line.slice(at, at + CHUNK_CHARS) });
			return;
		}
		run.push(line);
		size += line.length + 1;
	});
	flush();
	return out;
}

/** PDF text is per page. An empty page isn't a passage. */
export function pdfPassages(pages: readonly string[]): DocPassage[] {
	return pages.flatMap((text, index) => (text.trim() ? [{ page: index + 1, text: text.trim() }] : []));
}

// ─── queries ─────────────────────────────────────────────────────────────────

export interface DocQuery {
	/** Each must appear. A quoted phrase is one term. */
	terms: string[];
	/** The whole query, folded, for the phrase bonus. */
	whole: string;
}

/** Null when there is nothing usable to look for. */
export function parseDocQuery(raw: string): DocQuery | null {
	const text = raw.slice(0, DOC_QUERY_MAX_CHARS);
	const terms: string[] = [];
	for (const match of text.matchAll(/"([^"]+)"|(\S+)/g)) {
		const term = foldText(match[1] ?? match[2]!);
		if (term && !terms.includes(term)) terms.push(term);
		if (terms.length === DOC_QUERY_MAX_TERMS) break;
	}
	const whole = foldText(text.replace(/"/g, " "));
	if (terms.length === 0 || whole.length < DOC_QUERY_MIN_CHARS) return null;
	return { terms, whole };
}

function occurrences(haystack: string, needle: string, cap = 10): number {
	let count = 0;
	for (let at = haystack.indexOf(needle); at !== -1 && count < cap; at = haystack.indexOf(needle, at + needle.length)) count++;
	return count;
}

// ─── snippets ────────────────────────────────────────────────────────────────

export interface DocSnippet {
	text: string;
	/** Half-open ranges into `text`, sorted, not overlapping. */
	ranges: [number, number][];
	before: boolean;
	after: boolean;
}

function allRanges(folded: Folded, terms: readonly string[]): [number, number][] {
	const ranges: [number, number][] = [];
	for (const term of terms) {
		for (let at = folded.text.indexOf(term); at !== -1; at = folded.text.indexOf(term, at + term.length)) {
			ranges.push([folded.map[at]!, folded.map[at + term.length]!]);
		}
	}
	ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const merged: [number, number][] = [];
	for (const range of ranges) {
		const last = merged.at(-1);
		if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
		else merged.push([range[0], range[1]]);
	}
	return merged;
}

/** Text around the first match, with every match inside it marked. Whitespace
 *  collapses to single spaces, and the ranges follow. */
export function buildSnippet(text: string, query: Pick<DocQuery, "terms">, context = SNIPPET_CONTEXT): DocSnippet {
	const folded = foldWithMap(text);
	const ranges = allRanges(folded, query.terms);
	const first = ranges[0] ?? [0, 0];
	let start = Math.max(0, first[0] - context);
	let end = Math.min(text.length, first[1] + context);
	// To a word edge, without losing the match.
	if (start > 0) { const space = text.slice(start, first[0]).search(/\s/); if (space !== -1) start += space + 1; }
	if (end < text.length) { const space = text.slice(first[1], end).lastIndexOf(" "); if (space > 0) end = first[1] + space; }
	let out = "";
	const offset: number[] = [];
	let spaced = true;
	for (let i = start; i < end; i++) {
		const ch = text[i]!;
		const blank = WS.test(ch);
		offset.push(out.length);
		if (blank) { if (!spaced) out += " "; spaced = true; }
		else { out += ch; spaced = false; }
	}
	offset.push(out.length);
	const trimmed = out.trimEnd();
	const local = ranges
		.filter(([s, e]) => s >= start && e <= end)
		.map(([s, e]): [number, number] => [offset[s - start]!, Math.min(offset[e - start]!, trimmed.length)])
		.filter(([s, e]) => e > s);
	return { text: trimmed, ranges: local, before: start > 0, after: end < text.length };
}

/** A snippet as plain runs, for rendering as text nodes. Never markup. */
export function snippetRuns(snippet: DocSnippet): { text: string; match: boolean }[] {
	const runs: { text: string; match: boolean }[] = [];
	let at = 0;
	for (const [s, e] of snippet.ranges) {
		if (s > at) runs.push({ text: snippet.text.slice(at, s), match: false });
		runs.push({ text: snippet.text.slice(s, e), match: true });
		at = e;
	}
	if (at < snippet.text.length) runs.push({ text: snippet.text.slice(at), match: false });
	return runs;
}

// ─── jumping ─────────────────────────────────────────────────────────────────

/** Where opening a result lands. */
export interface DocJump {
	page?: number;
	line?: number;
	block?: number;
	/** Exact words to find there. */
	quote?: string;
	/** The query's terms, to fall back on when the quote has gone. */
	terms?: string[];
	/** A citation, so finding the quote or not is reported. */
	citation?: boolean;
	/** Bumps per request, so the same place can be asked for twice. */
	nonce?: number;
}

const JUMP_QUOTE_CHARS = 120;

/** The line of the first match, for a text file's hit. */
function lineOfMatch(passage: DocPassage, folded: Folded, term: string): number {
	const at = folded.text.indexOf(term);
	if (at === -1 || passage.line === undefined) return passage.line ?? 1;
	const source = folded.map[at]!;
	let line = passage.line;
	for (let i = 0; i < source; i++) if (passage.text[i] === "\n") line++;
	return line;
}

/** Words around the match, in source form, for the editor or viewer to find. */
function quoteAround(text: string, folded: Folded, term: string): string {
	const at = folded.text.indexOf(term);
	if (at === -1) return text.slice(0, JUMP_QUOTE_CHARS).trim();
	const start = folded.map[at]!;
	const end = folded.map[at + term.length]!;
	return text.slice(start, Math.min(text.length, Math.max(end, start + JUMP_QUOTE_CHARS))).split("\n")[0]!.trim();
}

export function jumpOf(passage: DocPassage, query: DocQuery, folded = foldWithMap(passage.text)): DocJump {
	const term = query.terms.find((candidate) => folded.text.includes(candidate)) ?? query.terms[0]!;
	if (passage.page !== undefined) return { page: passage.page, quote: quoteAround(passage.text, folded, term), terms: query.terms };
	if (passage.line !== undefined) return { line: lineOfMatch(passage, folded, term), terms: query.terms };
	return { block: passage.block, quote: quoteAround(passage.text, folded, term), terms: query.terms };
}

// ─── searching one item ──────────────────────────────────────────────────────

export interface DocHit {
	id: string;
	itemId: string;
	/** Filled by the caller from the catalog, so it is always the current name. */
	snippet: DocSnippet | null;
	jump: DocJump | null;
	score: number;
}

/** Hits in one item. Every term must appear in one passage; failing that, an item
 *  holding them all across passages gives its fullest passage. */
export function searchShard(shard: Pick<DocIndexShard, "itemId" | "passages">, foldedPassages: readonly Folded[], name: string, query: DocQuery): DocHit[] {
	const foldedName = foldText(name);
	const nameMatches = query.terms.every((term) => foldedName.includes(term));
	const nameBonus = nameMatches ? 20 : 0;
	const scored: { index: number; found: number; score: number }[] = [];
	const covered = new Set<string>();
	shard.passages.forEach((_passage, index) => {
		const text = foldedPassages[index]!.text;
		let found = 0;
		let score = 0;
		for (const term of query.terms) {
			const count = occurrences(text, term);
			if (count > 0) { found++; covered.add(term); score += count; }
		}
		if (found > 0) scored.push({ index, found, score: score + (query.terms.length > 1 && text.includes(query.whole) ? 5 : 0) });
	});
	const allCovered = query.terms.every((term) => covered.has(term));
	const whole = scored.filter((row) => row.found === query.terms.length);
	const chosen = whole.length > 0 ? whole : allCovered ? [...scored].sort((a, b) => b.found - a.found || a.index - b.index).slice(0, 1) : [];
	const best = [...chosen].sort((a, b) => b.score - a.score || a.index - b.index).slice(0, DOC_HITS_PER_ITEM);
	if (best.length === 0) {
		return nameMatches ? [{ id: `${shard.itemId}:name`, itemId: shard.itemId, snippet: null, jump: null, score: nameBonus }] : [];
	}
	return best.map(({ index, score }) => {
		const passage = shard.passages[index]!;
		return {
			id: `${shard.itemId}:${index}`,
			itemId: shard.itemId,
			snippet: buildSnippet(passage.text, query),
			jump: jumpOf(passage, query, foldedPassages[index]),
			score: score + nameBonus,
		};
	});
}

/** Highest first, then by name and place, so equal scores never shuffle. */
export function compareHits<T extends { score: number; name: string; id: string }>(a: T, b: T): number {
	return b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id, undefined, { numeric: true });
}

// ─── filters ─────────────────────────────────────────────────────────────────

export interface DocFilters {
	kind?: LibraryKind | null;
	tag?: string | null;
	/** Includes everything below the folder. */
	folderId?: string | null;
	/** Archived items are searched unless this says otherwise (owner, spec.md). */
	hideArchived?: boolean;
}

export function docFilterPredicate(filters: DocFilters, folders: readonly Pick<LibraryFolder, "id" | "parentId">[]): (item: LibraryItem) => boolean {
	const subtree = filters.folderId ? folderSubtree(filters.folderId, folders) : null;
	return (item) => {
		if (filters.kind && item.kind !== filters.kind) return false;
		if (filters.tag && !item.tags?.includes(filters.tag)) return false;
		if (subtree && !(item.folderId && subtree.has(item.folderId))) return false;
		if (filters.hideArchived && item.archivedAt) return false;
		return true;
	};
}

// ─── the wire ────────────────────────────────────────────────────────────────

export interface DocStatusRow { id: string; name: string; kind: LibraryKind; state: DocIndexState; reason?: string }

export interface DocIndexStatus {
	counts: Record<DocIndexState, number>;
	/** Everything not searched, by name, so nothing is silently left out. */
	notSearched: DocStatusRow[];
	/** A rebuild or catch-up is running. */
	building: { done: number; total: number } | null;
}

export interface DocSearchResult {
	id: string;
	itemId: string;
	name: string;
	kind: LibraryKind;
	size: number;
	location: string;
	archived: boolean;
	tags: string[];
	state: DocIndexState;
	reason?: string;
	snippet: DocSnippet | null;
	jump: DocJump | null;
}

export interface DocSearchResponse {
	query: string;
	results: DocSearchResult[];
	total: number;
	status: DocIndexStatus;
}

/** One sentence for the live region and the line above the results. */
export function docCountText(shown: number, total: number): string {
	if (total === 0) return "Nothing matched";
	const noun = total === 1 ? "match" : "matches";
	return shown < total ? `Showing ${shown} of ${total} ${noun}` : `${total} ${noun}`;
}

/** "12 searched · 1 waiting · 2 with no text · 1 unsupported · 1 failed". */
export function docStatusText(counts: Record<DocIndexState, number>): string {
	const parts = [`${counts.indexed} searched`];
	if (counts.pending) parts.push(`${counts.pending} waiting to be read`);
	if (counts["no-text"]) parts.push(`${counts["no-text"]} with no readable text`);
	if (counts.unsupported) parts.push(`${counts.unsupported} that can't be searched`);
	if (counts.failed) parts.push(`${counts.failed} that could not be read`);
	return parts.join(" · ");
}
