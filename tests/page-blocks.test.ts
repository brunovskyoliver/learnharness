/** Feature 010: pages as blocks, the comparison, and undoing the tutor's
 *  changes while keeping the learner's later edits. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareTexts, countWords, joinBlocks, revertTutorChanges, splitBlocks, tutorHunks } from "../components/library/page-blocks.ts";
import { PAGE_CORPUS } from "./fixtures/page-roundtrip-corpus.ts";

describe("blocks", () => {
	it("split and join give back every corpus page byte for byte", () => {
		for (const { name, md } of PAGE_CORPUS) assert.equal(joinBlocks(splitBlocks(md)), md, name);
	});
	it("a block keeps formulas, tables and lists whole", () => {
		const keys = splitBlocks("# H\n\n$$\nx\n$$\n\n| a |\n|---|\n| 1 |\n\n- one\n- two\n").blocks.map((b) => b.key);
		assert.deepEqual(keys, ["# H", "$$\nx\n$$", "| a |\n|---|\n| 1 |", "- one\n- two"]);
	});
});

describe("comparison", () => {
	it("marks added and removed blocks in reading order", () => {
		assert.deepEqual(compareTexts("A\n\nB\n\nC\n", "A\n\nB2\n\nC\n\nD\n"), [
			{ kind: "same", markdown: "A" },
			{ kind: "removed", markdown: "B" },
			{ kind: "added", markdown: "B2" },
			{ kind: "same", markdown: "C" },
			{ kind: "added", markdown: "D" },
		]);
	});
});

describe("undoing the tutor's edit", () => {
	const base = "# Notes\n\nOne.\n\nTwo.\n\nThree.\n";
	const tutor = "# Notes\n\nOne, simpler.\n\nTwo.\n\nThree.\n\nA new check.\n";
	const hunks = tutorHunks(2, base, tutor);

	it("finds two places", () => {
		assert.deepEqual(hunks, [
			{ version: 2, removed: ["One."], added: ["One, simpler."], anchor: "# Notes" },
			{ version: 2, removed: [], added: ["A new check."], anchor: "Three." },
		]);
	});
	it("with no later typing, gives back the text before it", () => {
		assert.deepEqual(revertTutorChanges(tutor, hunks), { text: base, skipped: 0, reverted: 2 });
	});
	it("keeps the learner's later typing elsewhere", () => {
		const later = tutor.replace("Two.", "Two, by me.");
		assert.equal(revertTutorChanges(later, hunks).text, base.replace("Two.", "Two, by me."));
	});
	it("leaves a place both changed, and counts it", () => {
		const later = tutor.replace("One, simpler.", "One, simpler, and mine.");
		const out = revertTutorChanges(later, hunks);
		assert.equal(out.skipped, 1);
		assert.equal(out.reverted, 1);
		assert.equal(out.text, "# Notes\n\nOne, simpler, and mine.\n\nTwo.\n\nThree.\n");
	});
	it("puts back a block the tutor removed", () => {
		const removedHunks = tutorHunks(3, base, "# Notes\n\nOne.\n\nThree.\n");
		assert.equal(revertTutorChanges("# Notes\n\nOne.\n\nThree.\n", removedHunks).text, base);
		const lastGone = tutorHunks(4, base, "# Notes\n\nOne.\n\nTwo.\n");
		assert.equal(revertTutorChanges("# Notes\n\nOne.\n\nTwo.\n", lastGone).text, base);
	});
	it("two tutor versions undo newest first", () => {
		const v3 = tutor.replace("Three.", "Three, revised.");
		const all = [...hunks, ...tutorHunks(3, tutor, v3)];
		assert.equal(revertTutorChanges(v3, all).text, base);
	});
	it("keeps Windows line endings", () => {
		const crlf = (s: string) => s.replace(/\n/g, "\r\n");
		assert.equal(revertTutorChanges(crlf(tutor), hunks).text, crlf(base));
	});
});

describe("word count", () => {
	it("counts words, not punctuation", () => {
		assert.equal(countWords("An eigenvector — keeps its direction, doesn't it?"), 7);
		assert.equal(countWords(""), 0);
		assert.equal(countWords("Čeština 日本語"), 2);
	});
});
