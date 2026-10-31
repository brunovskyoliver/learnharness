/** Pages as blocks (feature 010, US3 and US4): the comparison History shows,
 *  the tutor's changes and their undo. A block is a top-level Markdown token,
 *  the same unit the codec keeps byte for byte; nothing here re-serializes a
 *  block, so text outside a changed block keeps its bytes. */
import { markdownTokenRaws } from "./page-markdown.ts";

/** One block: its text (`key`, no trailing whitespace) and the whitespace after it. */
export interface Block { key: string; after: string }
export interface SplitPage { lead: string; blocks: Block[]; crlf: boolean }

export function splitBlocks(markdown: string): SplitPage {
	const crlf = markdown.includes("\r\n") && !/(^|[^\r])\n/.test(markdown);
	const text = markdown.replace(/\r\n?/g, "\n");
	let lead = "";
	const blocks: Block[] = [];
	for (const { raw, space } of markdownTokenRaws(text)) {
		if (space || !raw.trim()) {
			if (blocks.length) blocks.at(-1)!.after += raw;
			else lead += raw;
			continue;
		}
		const key = raw.replace(/\s+$/, "");
		blocks.push({ key, after: raw.slice(key.length) });
	}
	return { lead, blocks, crlf };
}

export function joinBlocks(page: SplitPage): string {
	const text = page.lead + page.blocks.map((b) => b.key + b.after).join("");
	return page.crlf ? text.replace(/\n/g, "\r\n") : text;
}

export type CompareRow = { kind: "same" | "added" | "removed"; markdown: string };

/** Above this, a comparison is refused rather than run (research R3). */
export const COMPARE_LIMIT = 4000;

/** Longest common subsequence over block texts, then rows in reading order. */
export function compareBlocks(before: readonly string[], after: readonly string[]): CompareRow[] | null {
	if (before.length > COMPARE_LIMIT || after.length > COMPARE_LIMIT) return null;
	const n = before.length, m = after.length;
	const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			table[i]![j] = before[i] === after[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
		}
	}
	const rows: CompareRow[] = [];
	let i = 0, j = 0;
	while (i < n && j < m) {
		if (before[i] === after[j]) { rows.push({ kind: "same", markdown: before[i]! }); i++; j++; }
		else if (table[i + 1]![j]! >= table[i]![j + 1]!) rows.push({ kind: "removed", markdown: before[i++]! });
		else rows.push({ kind: "added", markdown: after[j++]! });
	}
	while (i < n) rows.push({ kind: "removed", markdown: before[i++]! });
	while (j < m) rows.push({ kind: "added", markdown: after[j++]! });
	return rows;
}

export const compareTexts = (before: string, after: string) =>
	compareBlocks(splitBlocks(before).blocks.map((b) => b.key), splitBlocks(after).blocks.map((b) => b.key));

/** One place a tutor version changed: what it removed and what it put there.
 *  `anchor` is the block before the place in the tutor's text, null at the top. */
export interface TutorHunk { version: number; removed: string[]; added: string[]; anchor: string | null }

export function tutorHunks(version: number, before: string, after: string): TutorHunk[] {
	const rows = compareTexts(before, after);
	if (!rows) return [];
	const hunks: TutorHunk[] = [];
	let anchor: string | null = null;
	let open: TutorHunk | null = null;
	for (const row of rows) {
		if (row.kind === "same") {
			if (open) { hunks.push(open); open = null; }
			anchor = row.markdown;
			continue;
		}
		open ??= { version, removed: [], added: [], anchor };
		if (row.kind === "removed") open.removed.push(row.markdown);
		else { open.added.push(row.markdown); anchor = row.markdown; }
	}
	if (open) hunks.push(open);
	return hunks;
}

const sequenceAt = (keys: readonly string[], at: number, seq: readonly string[]) => seq.every((k, i) => keys[at + i] === k);

/** Where a hunk's added blocks sit in `keys`, or where its removed blocks go
 *  back when it added none. -1: the place is gone. */
function locate(keys: readonly string[], hunk: TutorHunk): number {
	const anchorAt = hunk.anchor === null ? -1 : keys.indexOf(hunk.anchor);
	if (hunk.added.length === 0) return hunk.anchor === null || anchorAt >= 0 ? anchorAt + 1 : -1;
	const found: number[] = [];
	for (let i = 0; i + hunk.added.length <= keys.length; i++) if (sequenceAt(keys, i, hunk.added)) found.push(i);
	return found.find((i) => i === anchorAt + 1) ?? (found.length === 1 ? found[0]! : -1);
}

/** Undo the tutor's hunks in `current`, newest version first and, within one,
 *  from the end so earlier places keep their positions. A hunk whose added
 *  blocks are no longer there unchanged, in order, is left alone and counted. */
export function revertTutorChanges(current: string, hunks: readonly TutorHunk[]): { text: string; skipped: number; reverted: number } {
	const page = splitBlocks(current);
	let skipped = 0, reverted = 0;
	const versions = [...new Set(hunks.map((h) => h.version))].sort((a, b) => b - a);
	for (const version of versions) {
		for (const hunk of hunks.filter((h) => h.version === version).reverse()) {
			const at = locate(page.blocks.map((b) => b.key), hunk);
			if (at < 0) { skipped++; continue; }
			const end = at + hunk.added.length;
			const atEnd = end === page.blocks.length;
			// The whitespace that followed the place, kept after what replaces it.
			const tail = end > at ? page.blocks[end - 1]!.after : at > 0 ? page.blocks[at - 1]!.after : "";
			const restored: Block[] = hunk.removed.map((key) => ({ key, after: "\n\n" }));
			if (restored.length > 0) {
				if (end > at) restored.at(-1)!.after = tail;
				else if (atEnd) {
					restored.at(-1)!.after = at > 0 ? page.blocks[at - 1]!.after : "\n";
					if (at > 0) page.blocks[at - 1]!.after = "\n\n";
				}
			} else if (atEnd && at > 0) {
				// The tutor's blocks ended the page; the block before ends it again.
				page.blocks[at - 1]!.after = tail;
			}
			page.blocks.splice(at, hunk.added.length, ...restored);
			reverted++;
		}
	}
	return { text: joinBlocks(page), skipped, reverted };
}

/** Words a learner would count: prose, not formulas, code or raw source. */
export function countWords(text: string): number {
	const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
	return words ? words.length : 0;
}
