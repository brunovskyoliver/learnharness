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
import { folderTrail, KIND_LABEL, nameKey, type LibraryFolder, type LibraryItem, type LibraryKind } from "./library.ts";
import { NO_LONGER_IN_LIBRARY, REMOVED_FROM_REPO } from "./library-refs.ts";

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
