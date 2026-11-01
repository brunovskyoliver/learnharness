/** The keyboard's way to select in a PDF (feature 023, constitution VI). Pure: offsets
 *  into a page's text layer, moved a word or a line at a time. The reader turns the
 *  result into a real selection, so the same bubble and actions follow. */

export interface PdfCursor { start: number; end: number }

export type PdfCursorMove = "word-next" | "word-previous" | "line-next" | "line-previous";

const KEY_MOVES: Record<string, PdfCursorMove> = { ArrowRight: "word-next", ArrowLeft: "word-previous", ArrowDown: "line-next", ArrowUp: "line-previous" };

export const pdfCursorMoveFor = (key: string): PdfCursorMove | null => KEY_MOVES[key] ?? null;

/** Every word on the page, as offsets. A word is a run of anything but whitespace. */
export function wordsOf(text: string): PdfCursor[] {
	return [...text.matchAll(/\S+/g)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

/** The first word at or after `at`, or the last one when none follows. */
function wordIndexAt(words: readonly PdfCursor[], at: number): number {
	const found = words.findIndex((word) => word.end > at);
	return found < 0 ? words.length - 1 : found;
}

function lineIndexAt(lines: readonly number[], at: number): number {
	let index = 0;
	for (let i = 0; i < lines.length; i++) if (lines[i]! <= at) index = i;
	return index;
}

/**
 * Plain arrows move the single selected word; with Shift, the end moves and the start
 * stays, and it can't pass the start. `lines` holds where each text run starts: pdf.js
 * lays a page out as one run per line, near enough for a keyboard. Null: the page has
 * no more in that direction, which the reader answers by moving to the next page.
 */
export function movePdfCursor(text: string, lines: readonly number[], cursor: PdfCursor, move: PdfCursorMove, extend: boolean): PdfCursor | null {
	const words = wordsOf(text);
	if (words.length === 0) return null;
	const point = extend ? cursor.end - 1 : cursor.start;
	const here = wordIndexAt(words, Math.max(0, point));
	let target: number;
	if (move === "word-next") target = here + 1;
	else if (move === "word-previous") target = here - 1;
	else {
		const line = lineIndexAt(lines, Math.max(0, point));
		const nextLine = lines[move === "line-next" ? line + 1 : line - 1];
		if (nextLine === undefined) return null;
		target = wordIndexAt(words, nextLine);
	}
	const word = words[target];
	if (!word) return null;
	if (!extend) return { start: word.start, end: word.end };
	return word.end <= cursor.start ? { start: cursor.start, end: words[wordIndexAt(words, cursor.start)]!.end } : { start: cursor.start, end: word.end };
}

/** The word to begin on: the first on the page. */
export function firstPdfCursor(text: string): PdfCursor | null {
	return wordsOf(text)[0] ?? null;
}
