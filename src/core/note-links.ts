/**
 * Wiki links, backlinks and related notes (feature 016, specs/016-intelligent-notes).
 * Pure and deterministic: no model, no filesystem. The server's connections
 * read and the browser's editor resolve links the same way.
 *
 * `[[Page name]]` stays exactly that in the stored Markdown. A link's identity
 * is the item it resolves to, by id: the current name, else an old name, and a
 * pin the store writes at rename time outranks both, so a later page that takes
 * the old name can't capture a link written before.
 */
import { isTombstone, nameKey, type LibraryItem, type LibraryKind, type LibraryTombstone } from "./library.ts";
import { codeRanges } from "./library-refs.ts";

/** A target can't hold brackets, a pipe or a line break. Same rule as the editor's tokenizer. */
export const WIKI_TARGET = "[^\\[\\]|\\n]+";
const WIKI_AT = new RegExp(`^\\[\\[(${WIKI_TARGET})\\]\\](?![(\\[:])`);
export const WIKI_TARGET_MAX = 200;

export const isWikiTarget = (name: string): boolean => name.length > 0 && name.length <= WIKI_TARGET_MAX && !/[[\]|\n]/.test(name) && name.trim().length > 0;

/** The link at the start of `src`, for the editor's tokenizer and the scanner alike. */
export function wikiLinkAt(src: string): { raw: string; target: string } | null {
	const match = WIKI_AT.exec(src);
	if (!match || !isWikiTarget(match[1]!)) return null;
	return { raw: match[0], target: match[1]! };
}

/** Ranges of `$…$`, `$$…$$`, `\(…\)` and `\[…\]`: the editor reads these as math, so `[[1,2]]` inside is no link. */
function mathRanges(text: string, code: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
	const inCode = (at: number) => code.some(([from, to]) => at >= from && at < to);
	const ranges: Array<[number, number]> = [];
	let i = 0;
	while (i < text.length) {
		if (inCode(i)) { i++; continue; }
		const ch = text[i]!;
		if (ch === "\\") {
			const next = text[i + 1];
			if (next === "(" || next === "[") {
				const close = next === "(" ? "\\)" : "\\]";
				const end = text.indexOf(close, i + 2);
				if (end > 0 && !text.slice(i + 2, end).includes("\n\n")) { ranges.push([i, end + 2]); i = end + 2; continue; }
			}
			i += 2;
			continue;
		}
		if (ch !== "$") { i++; continue; }
		let run = i;
		while (text[run] === "$") run++;
		const length = run - i;
		if (length > 2) { i = run; continue; }
		let j = run, found = -1;
		while (j < text.length) {
			if (text[j] !== "$") { j++; continue; }
			let closeRun = j;
			while (text[closeRun] === "$") closeRun++;
			if (closeRun - j === length) { found = closeRun; break; }
			j = closeRun;
		}
		// Display math may hold blank lines; inline math may not.
		if (found > 0 && (length === 2 || !text.slice(run, found).includes("\n\n")) && text.slice(run, found - length).trim()) { ranges.push([i, found]); i = found; continue; }
		i = run;
	}
	return ranges;
}

/** Indented code: four spaces after a blank line, the same blocks a page shows as code. */
function indentedCodeRanges(text: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	let offset = 0, blankBefore = true, inBlock = false;
	for (const line of text.split("\n")) {
		const end = offset + line.length;
		const indented = /^(?: {4}|\t)/.test(line);
		if ((blankBefore || inBlock) && indented) { ranges.push([offset, end]); inBlock = true; }
		else if (line.trim()) inBlock = false;
		blankBefore = !line.trim();
		offset = end + 1;
	}
	return ranges;
}

export interface WikiOccurrence { target: string; start: number; end: number }

/** Every wiki link in stored text: not in code, not in math, not escaped. */
export function scanWikiLinks(text: string): WikiOccurrence[] {
	if (!text.includes("[[")) return [];
	const code = [...codeRanges(text), ...indentedCodeRanges(text)];
	const skip = [...code, ...mathRanges(text, code)];
	const found: WikiOccurrence[] = [];
	for (let at = text.indexOf("[["); at !== -1; at = text.indexOf("[[", at + 1)) {
		if (skip.some(([from, to]) => at >= from && at < to)) continue;
		let slashes = 0;
		for (let i = at - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
		if (slashes % 2 === 1) continue;
		const link = wikiLinkAt(text.slice(at));
		if (!link) continue;
		found.push({ target: link.target, start: at, end: at + link.raw.length });
		at += link.raw.length - 1;
	}
	return found;
}

/** The text between an open `[[` and the caret, while a link is being typed. */
export function wikiQuery(before: string): { start: number; query: string } | null {
	const at = before.lastIndexOf("[[");
	if (at < 0) return null;
	const query = before.slice(at + 2);
	if (query.length > WIKI_TARGET_MAX || /[[\]|\n\uFFFC]/.test(query)) return null;
	return { start: at, query };
}

export type WikiLinkState = "live" | "deleted" | "missing";
export interface WikiResolution { state: WikiLinkState; id?: string; name?: string; kind?: LibraryKind; size?: number }

/** page id → name key → item id: what each page's links meant when their target was renamed. */
export type WikiPins = Record<string, Record<string, string>>;
export type WikiEntry = LibraryItem | LibraryTombstone;

export interface WikiTable { byId: Map<string, WikiEntry>; current: Map<string, LibraryItem>; previous: Map<string, LibraryItem>; deleted: Map<string, LibraryTombstone> }

export function wikiTable(entries: readonly WikiEntry[]): WikiTable {
	const table: WikiTable = { byId: new Map(), current: new Map(), previous: new Map(), deleted: new Map() };
	for (const entry of entries) {
		table.byId.set(entry.id, entry);
		if (isTombstone(entry)) table.deleted.set(nameKey(entry.name), entry);
		else {
			table.current.set(nameKey(entry.name), entry);
			for (const old of entry.previousNames ?? []) if (!table.previous.has(nameKey(old))) table.previous.set(nameKey(old), entry);
		}
	}
	return table;
}

const live = (item: LibraryItem): WikiResolution => ({ state: "live", id: item.id, name: item.name, kind: item.kind, size: item.size });
const gone = (item: LibraryTombstone): WikiResolution => ({ state: "deleted", id: item.id, name: item.name, kind: item.kind });

/** The one rule for what a link means. Dangling is an answer, never an error. */
export function resolveWikiTarget(target: string, table: WikiTable, pins?: Record<string, string>): WikiResolution {
	const key = nameKey(target.trim());
	const pinned = pins?.[key];
	const pinnedEntry = pinned ? table.byId.get(pinned) : undefined;
	if (pinnedEntry) return isTombstone(pinnedEntry) ? gone(pinnedEntry) : live(pinnedEntry);
	const current = table.current.get(key);
	if (current) return live(current);
	const previous = table.previous.get(key);
	if (previous) return live(previous);
	const deleted = table.deleted.get(key);
	if (deleted) return gone(deleted);
	return { state: "missing" };
}

/** A page's text as the index sees it: the learner's draft when one exists. */
export interface NoteDoc { id: string; name: string; text: string; tags?: readonly string[]; folderId?: string; archived?: boolean }

export interface NoteLinkRow { target: string; resolution: WikiResolution }
export interface BacklinkRow { id: string; name: string; count: number; snippet: string; archived?: boolean }
export interface RelatedRow { id: string; name: string; reason: string; score: number }

/** Each distinct target a page links to, first-seen, resolved. */
export function outgoingLinks(doc: NoteDoc, table: WikiTable, pins: WikiPins = {}): NoteLinkRow[] {
	const seen = new Map<string, NoteLinkRow>();
	for (const { target } of scanWikiLinks(doc.text)) {
		const key = nameKey(target.trim());
		if (!seen.has(key)) seen.set(key, { target, resolution: resolveWikiTarget(target, table, pins[doc.id]) });
	}
	return [...seen.values()];
}

const SNIPPET_CHARS = 120;

function snippetAround(text: string, occurrence: WikiOccurrence): string {
	const lineStart = text.lastIndexOf("\n", occurrence.start) + 1;
	const lineEnd = text.indexOf("\n", occurrence.end);
	const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd).trim();
	if (line.length <= SNIPPET_CHARS) return line;
	const at = occurrence.start - lineStart;
	const from = Math.max(0, at - 50);
	return `${from > 0 ? "…" : ""}${line.slice(from, from + SNIPPET_CHARS)}…`;
}

/** Pages that link to `id`, by name. A page's link to itself isn't a backlink. */
export function backlinksOf(id: string, docs: readonly NoteDoc[], table: WikiTable, pins: WikiPins = {}): BacklinkRow[] {
	const rows: BacklinkRow[] = [];
	for (const doc of docs) {
		if (doc.id === id) continue;
		const hits = scanWikiLinks(doc.text).filter(({ target }) => resolveWikiTarget(target, table, pins[doc.id]).id === id);
		if (hits.length === 0) continue;
		rows.push({ id: doc.id, name: doc.name, count: hits.length, snippet: snippetAround(doc.text, hits[0]!), ...(doc.archived ? { archived: true } : {}) });
	}
	return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

const STOP_WORDS = new Set("about above after again against because before being below between could every first from have here into just like more most much only other over same should since some such than that their them then there these they this those through under until very were what when where which while will with would your".split(" "));

/** Words worth comparing: prose only, at least five letters, no stop words. */
function termsOf(text: string): Set<string> {
	const prose = text
		.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")
		.replace(/`[^`\n]*`/g, " ")
		.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, " ")
		.replace(/\]\([^)\s]*(?:\s+"[^"]*")?\)/g, "] ")
		.toLowerCase();
	const out = new Set<string>();
	for (const match of prose.matchAll(/[\p{L}][\p{L}\p{N}'’-]{4,}/gu)) if (!STOP_WORDS.has(match[0])) out.add(match[0]);
	return out;
}

const list = (n: number, one: string) => `${n} shared ${one}${n === 1 ? "" : "s"}`;

/** What makes two pages related, with fixed weights: a shared tag 3, a shared
 *  link target 2, a shared source session 2, the same folder 1, and each rare
 *  word in common 1 (at most 3). Pages linked directly are already listed as
 *  links and backlinks, so they stay out of this list. A score below 2 is noise. */
export const RELATED_LIMIT = 6;

export function relatedNotes(id: string, docs: readonly NoteDoc[], table: WikiTable, pins: WikiPins = {}, sessionsOf: (doc: NoteDoc) => readonly string[] = () => []): RelatedRow[] {
	const self = docs.find((doc) => doc.id === id);
	if (!self) return [];
	const targetsOf = (doc: NoteDoc) => new Set(scanWikiLinks(doc.text).map(({ target }) => resolveWikiTarget(target, table, pins[doc.id]).id).filter((v): v is string => Boolean(v)));
	const selfTargets = targetsOf(self);
	const selfTags = new Set((self.tags ?? []).map(nameKey));
	const selfTerms = termsOf(self.text);
	const selfSessions = new Set(sessionsOf(self));
	const termLists = new Map(docs.map((doc) => [doc.id, termsOf(doc.text)]));
	const documentFrequency = new Map<string, number>();
	for (const terms of termLists.values()) for (const term of terms) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
	// "Rare": in at most a third of the pages, and always in fewer than all of them.
	const rareLimit = Math.max(2, Math.floor(docs.length / 3));
	const rows: RelatedRow[] = [];
	for (const doc of docs) {
		if (doc.id === id || doc.archived) continue;
		const targets = targetsOf(doc);
		if (selfTargets.has(doc.id) || targets.has(id)) continue;
		const tags = (doc.tags ?? []).filter((tag) => selfTags.has(nameKey(tag)));
		const common = [...targets].filter((target) => selfTargets.has(target));
		const sessions = sessionsOf(doc).filter((chat) => selfSessions.has(chat));
		const sameFolder = Boolean(self.folderId) && doc.folderId === self.folderId;
		const words = [...termLists.get(doc.id)!].filter((term) => selfTerms.has(term) && (documentFrequency.get(term) ?? 0) <= rareLimit)
			.sort((a, b) => (documentFrequency.get(a)! - documentFrequency.get(b)!) || a.localeCompare(b));
		const score = tags.length * 3 + common.length * 2 + sessions.length * 2 + (sameFolder ? 1 : 0) + Math.min(words.length, 3);
		if (score < 2) continue;
		const reason = [
			tags.length > 0 ? list(tags.length, "tag") : "",
			common.length > 0 ? list(common.length, "link") : "",
			sessions.length > 0 ? "Same lesson" : "",
			sameFolder ? "Same folder" : "",
			words.length > 0 ? `Both mention ${words.slice(0, 3).join(", ")}` : "",
		].filter(Boolean).join(" · ");
		rows.push({ id: doc.id, name: doc.name, reason, score });
	}
	return rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, RELATED_LIMIT);
}

export { termsOf as noteTerms };
