/**
 * Reference chips (feature 027): where a chip opens, what it says and how it is
 * named. Pure; the catalog (components/reference-catalog.ts) says which state an
 * item is in, and the chip component draws the result. Strings are
 * contracts/ui-contract.md §1.
 *
 * A chip never builds an @ name (research R15): the recogniser finds the span
 * by `nameTable`, and the chip shows the item's display name, which for a file
 * mirrored from a repo (feature 026) is its file name, not its Library path.
 */
import { citationQuote, libraryHref } from "./document-anchors.ts";
import { folderTrail, KIND_LABEL, nameKey, type LibraryFolder, type LibraryItem, type LibraryKind, type LibraryTombstone } from "./library.ts";
import { NO_LONGER_IN_LIBRARY, REMOVED_FROM_REPO, referenceSpans } from "./library-refs.ts";

/** `unknown`: the Library could not be read. The chip shows as sent and opens as live. */
export type ChipState = "live" | "trashed" | "deleted" | "removed" | "unknown";

export interface ChipInput {
	itemId: string;
	state: ChipState;
	/** Live and trashed: the current display name. Otherwise the name as written. */
	name: string;
	kind: LibraryKind;
	page?: number;
	/** The passage the chip carries. */
	quote?: string;
	/** Trashed: the Trash entry that holds it. */
	trashEntryId?: string;
	/** The item's full Library path ("Physics/Lecture notes/week1/notes.md"), when known. */
	path?: string;
	/** The folder it sits in, when known: the hint that tells equal names apart. */
	parent?: string;
}

export interface ChipTarget extends ChipInput {
	/** Null for deleted and removed: not a link. */
	href: string | null;
	/** "· p. {n}", or "· " and the passage's first line. */
	hint?: string;
	/** "· {folder}", only when another chip beside it shows the same name (M2). */
	folderHint?: string;
	/** The accessible name; for deleted and removed, the text it reads as. */
	label: string;
	/** The whole passage, for `aria-description`. */
	description?: string;
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const firstLine = (text: string) => text.split("\n").map((line) => line.trim()).find(Boolean);
const PASSAGE_LABEL_CHARS = 80;

/** Where an item sits, for telling equal names apart. */
export function itemPlace(item: Pick<LibraryItem, "name" | "folderId">, folders: readonly LibraryFolder[]): Pick<ChipInput, "path" | "parent"> {
	const trail = folderTrail(item.folderId, folders);
	if (trail.length === 0) return {};
	return { path: [...trail.map((f) => f.name), item.name].join("/"), parent: trail.at(-1)!.name };
}

/** One chip's address, hint and names. `disambiguate` (M2) adds the folder hint
 *  and swaps the name in the accessible name for the full Library path. */
export function chipTarget(input: ChipInput, disambiguate = false): ChipTarget {
	const { itemId, state, name, kind, page, quote, trashEntryId, path, parent } = input;
	// A page is searched by the passage's first line, since a block holds one
	// paragraph (research R9); a PDF page's passage is found whole.
	const cut = quote ? citationQuote(page === undefined && kind !== "pdf" ? firstLine(quote) ?? quote : quote) : "";
	const href = state === "live" || state === "unknown"
		? libraryHref({ itemId, page, quote: cut || undefined })
		: state === "trashed"
			? `/library?view=trash${trashEntryId ? `&entry=${encodeURIComponent(trashEntryId)}` : ""}`
			: null;
	const line = quote ? firstLine(quote) : undefined;
	const hint = page !== undefined ? `· p. ${page}` : line ? `· ${line}` : undefined;
	const folderHint = disambiguate && parent ? `· ${parent}` : undefined;
	const spoken = disambiguate && path ? path : name;
	const passage = quote ? flat(quote) : "";
	let label: string;
	if (state === "deleted") label = `${spoken}${NO_LONGER_IN_LIBRARY}`;
	else if (state === "removed") label = `${spoken}${REMOVED_FROM_REPO}`;
	else if (state === "trashed") label = `Open ${spoken} in the trash`;
	else if (page !== undefined) label = `Open ${spoken}, page ${page}`;
	else if (passage) label = `Open ${spoken} at the passage "${passage.slice(0, PASSAGE_LABEL_CHARS).trim()}"`;
	else label = `Open ${spoken}, ${KIND_LABEL[kind]}`;
	return {
		...input,
		href,
		...(hint ? { hint } : {}),
		...(folderHint ? { folderHint } : {}),
		label,
		...(passage && state !== "deleted" && state !== "removed" ? { description: passage } : {}),
	};
}

/** The chips of one text (a message, a reply). Two chips that would show the same
 *  name for different items each get their folder as a faint hint, and their
 *  full Library path in the accessible name (analyze M2, 2026-11-08). */
export function chipTargets(inputs: readonly ChipInput[]): ChipTarget[] {
	const idsByName = new Map<string, Set<string>>();
	for (const { name, itemId } of inputs) {
		const key = nameKey(name);
		idsByName.set(key, (idsByName.get(key) ?? new Set()).add(itemId));
	}
	return inputs.map((input) => chipTarget(input, (idsByName.get(nameKey(input.name))?.size ?? 0) > 1));
}

/** The key a composer field is handling, as far as removing a chip goes. */
export interface ChipDeleteKey {
	key: string;
	composing?: boolean;
	shiftKey?: boolean;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
}

/** What one Backspace or Delete removes in a composer field (research R5): a
 *  whole chip when the caret sits right after it (Backspace) or right before it
 *  (Delete), with nothing selected, not composing and no modifier. A quote form
 *  goes from its `@` through its last quoted line or `</library_passage>`; the
 *  LEAD words before it stay. Null leaves the key to the field. */
export function chipDeleteRange(value: string, caret: { start: number; end: number }, key: ChipDeleteKey, forms: readonly { range: readonly [number, number] }[]): [number, number] | null {
	if (key.key !== "Backspace" && key.key !== "Delete") return null;
	if (key.composing || key.shiftKey || key.metaKey || key.ctrlKey || key.altKey) return null;
	if (caret.start !== caret.end || caret.start < 0 || caret.start > value.length) return null;
	const at = caret.start;
	for (const { range: [start, end] } of forms) {
		if (end > value.length || start >= end) continue;
		if (key.key === "Backspace" ? end === at : start === at) return [start, end];
	}
	return null;
}

// ─── tutor replies (US3, contracts/recognition.md chipMarkdown) ──────────────

/** What a tutor reply's `@name` tokens are recognised against: the live list
 *  and the tombstones the server still resolves. */
export interface ChipCatalog {
	entries: readonly (LibraryItem | LibraryTombstone)[];
	folders?: readonly LibraryFolder[];
}

/** The title that marks a link chipMarkdown made from an `@name`. */
export const CHIP_LINK_TITLE = "lh-ref";

/** Half-open ranges an `@name` must not be rewritten in: a Markdown link or
 *  image (label and address), a reference definition, an autolink, a raw HTML
 *  tag and math (rewriting there would break what renders). Code is skipped
 *  by `referenceSpans` itself. */
function markdownRanges(text: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	const closing = (from: number, open: string, close: string): number => {
		let depth = 0;
		for (let i = from; i < text.length; i++) {
			const c = text[i];
			if (c === "\\") { i++; continue; }
			if (c === "\n" && text[i + 1] === "\n") return -1;
			if (c === open) depth++;
			else if (c === close && --depth === 0) return i;
		}
		return -1;
	};
	for (let at = text.indexOf("["); at !== -1; at = text.indexOf("[", at + 1)) {
		if (at > 0 && text[at - 1] === "\\") continue;
		const end = closing(at, "[", "]");
		if (end === -1) continue;
		const next = text[end + 1];
		let to = -1;
		if (next === "(") to = closing(end + 1, "(", ")");
		else if (next === "[") to = closing(end + 1, "[", "]");
		else if (next === ":") to = (text.indexOf("\n", end) + 1 || text.length + 1) - 1;
		else to = end;
		if (to === -1) continue;
		const start = at > 0 && text[at - 1] === "!" ? at - 1 : at;
		ranges.push([start, to + 1]);
		at = to;
	}
	for (const pattern of [/<[a-z][a-z\d+.-]{1,31}:[^\s<>]*>/gi, /<[^\s<>@]+@[^\s<>@]+>/g, /<\/?[a-z][a-z\d-]*(?:\s[^<>]*)?\/?>|<!--[\s\S]*?-->/gi, /\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g]) {
		for (const match of text.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length]);
	}
	return ranges;
}

/** A tutor reply's resolving `@name` tokens as Library links (research R7):
 *  `@name` → `[@name](/library?item=ID "lh-ref")`, with `[`, `]` and `\` in the
 *  label escaped. Skips code, links, autolinks, raw HTML and math; every other
 *  character stays as it is, and a second run changes nothing. Display only:
 *  the stored reply is never rewritten (constitution III). */
export function chipMarkdown(markdown: string, catalog: ChipCatalog): string {
	if (!markdown.includes("@") || catalog.entries.length === 0) return markdown;
	const spans = referenceSpans(markdown, catalog.entries, catalog.folders ?? []);
	if (spans.length === 0) return markdown;
	const skip = markdownRanges(markdown);
	let out = "";
	let at = 0;
	for (const { start, end, entry } of spans) {
		if (skip.some(([from, to]) => start >= from && start < to)) continue;
		const label = markdown.slice(start, end).replace(/[\\[\]]/g, "\\$&");
		out += `${markdown.slice(at, start)}[${label}](${libraryHref({ itemId: entry.id })} "${CHIP_LINK_TITLE}")`;
		at = end;
	}
	return at === 0 ? markdown : out + markdown.slice(at);
}
