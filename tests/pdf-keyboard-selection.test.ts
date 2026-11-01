/** The keyboard's way to select in a PDF (feature 023): words, lines, Shift, and the
 *  edges the reader answers by moving on. The browser path is in check-documents-ui. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstPdfCursor, movePdfCursor, pdfCursorMoveFor, wordsOf } from "../components/library/pdf-keyboard-selection.ts";

const text = "alpha beta gamma delta epsilon";
const lines = [0, 11, 23]; // "alpha beta " · "gamma delta " · "epsilon"
const word = (w: string) => { const start = text.indexOf(w); return { start, end: start + w.length }; };
const quote = (c: { start: number; end: number }) => text.slice(c.start, c.end);

describe("movePdfCursor", () => {
	it("starts on the first word, and a page with none has no start", () => {
		assert.deepEqual(firstPdfCursor("  hello there"), { start: 2, end: 7 });
		assert.equal(firstPdfCursor("  \n "), null);
		assert.equal(wordsOf("").length, 0);
	});
	it("arrows move one word, the words being runs of non-space", () => {
		const next = movePdfCursor(text, lines, word("beta"), "word-next", false)!;
		assert.equal(quote(next), "gamma");
		assert.equal(quote(movePdfCursor(text, lines, word("beta"), "word-previous", false)!), "alpha");
	});
	it("up and down go to another line's first word", () => {
		assert.equal(quote(movePdfCursor(text, lines, word("beta"), "line-next", false)!), "gamma");
		assert.equal(quote(movePdfCursor(text, lines, word("epsilon"), "line-previous", false)!), "gamma");
	});
	it("Shift keeps the start and moves the end", () => {
		const two = movePdfCursor(text, lines, word("alpha"), "word-next", true)!;
		assert.equal(quote(two), "alpha beta");
		const three = movePdfCursor(text, lines, two, "line-next", true)!;
		assert.equal(quote(three), "alpha beta gamma");
		assert.equal(quote(movePdfCursor(text, lines, three, "word-previous", true)!), "alpha beta");
	});
	it("Shift can't cross the start", () => {
		const back = movePdfCursor(text, lines, word("beta"), "word-previous", true)!;
		assert.equal(quote(back), "beta");
	});
	it("off either end answers null, for the reader to move page", () => {
		assert.equal(movePdfCursor(text, lines, word("epsilon"), "word-next", false), null);
		assert.equal(movePdfCursor(text, lines, word("alpha"), "word-previous", false), null);
		assert.equal(movePdfCursor(text, lines, word("epsilon"), "line-next", false), null);
		assert.equal(movePdfCursor(text, lines, word("alpha"), "line-previous", false), null);
		assert.equal(movePdfCursor("   ", [0], { start: 0, end: 1 }, "word-next", false), null);
	});
	it("only the arrows move", () => {
		assert.equal(pdfCursorMoveFor("ArrowRight"), "word-next");
		assert.equal(pdfCursorMoveFor("ArrowUp"), "line-previous");
		assert.equal(pdfCursorMoveFor("PageDown"), null);
	});
});
