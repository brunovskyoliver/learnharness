/** Feature 010, US2: what a tutor action sends, and why it can be unavailable. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteSelection, TUTOR_ACTION_LABEL, TUTOR_ACTIONS, TUTOR_BLOCKED_TEXT, TUTOR_EDIT_ACTIONS, tutorMessage } from "../components/library/page-tutor-actions.ts";
import { parseReferences } from "../src/core/library-refs.ts";
import type { LibraryItem } from "../src/core/library.ts";

const page = { id: "lib_p", name: "Week 3 notes", kind: "page", size: 10, createdAt: "", updatedAt: "" } as unknown as LibraryItem;

describe("tutor messages", () => {
	it("follow the contract's wording", () => {
		assert.equal(tutorMessage("explain", "Week 3 notes", "An eigenvector keeps its direction."), "Explain this part of @Week 3 notes:\n\n> An eigenvector keeps its direction.");
		assert.equal(tutorMessage("simpler", "Week 3 notes", "x"), "Rewrite this part of @Week 3 notes more simply, in the page:\n\n> x");
		assert.equal(tutorMessage("quiz", "Week 3 notes", "x"), "Quiz me on this part of @Week 3 notes:\n\n> x");
		assert.equal(tutorMessage("ask", "Week 3 notes", "x"), "About this part of @Week 3 notes:\n\n> x\n\n");
	});
	it("feature 018: the new actions read as the contract says, and only edits ask for the page", () => {
		assert.equal(tutorMessage("summarize", "N", "x"), "Summarize this part of @N:\n\n> x");
		assert.equal(tutorMessage("rewrite", "N", "x"), "Rewrite this part of @N more clearly, in the page:\n\n> x");
		assert.equal(tutorMessage("expand", "N", "x"), "Expand this part of @N with what it leaves out, in the page:\n\n> x");
		assert.equal(tutorMessage("challenge", "N", "x"), "Challenge me on this part of @N, with a graded check on whether it holds:\n\n> x");
		assert.equal(tutorMessage("questions", "N", "x"), "Ask me graded questions on this part of @N, one at a time, keeping the questions and answers out of the page:\n\n> x");
		for (const action of TUTOR_ACTIONS) assert.equal(tutorMessage(action, "N", "x").includes(", in the page:") || tutorMessage(action, "N", "x").includes("more simply, in the page:"), TUTOR_EDIT_ACTIONS.has(action), action);
	});
	it("quote every line, keeping blank lines inside the quote", () => {
		assert.equal(quoteSelection("  one\r\n\ntwo  \n"), "> one\n>\n> two");
	});
	it("reference the page, which the server resolves", () => {
		for (const action of TUTOR_ACTIONS) {
			const refs = parseReferences(tutorMessage(action, page.name, "some text"), [page]);
			assert.deepEqual(refs.map((r) => r.id), ["lib_p"], action);
		}
	});
	it("labels and unavailable sentences match the contract", () => {
		assert.deepEqual(Object.values(TUTOR_ACTION_LABEL), ["Explain", "Simpler", "Summarize", "Rewrite", "Expand", "Challenge", "Quiz me on this", "Generate questions", "Ask…"]);
		assert.deepEqual(TUTOR_BLOCKED_TEXT, {
			question: "Answer the question in the chat first.",
			problem: "Finish or skip the problem first.",
			busy: "The tutor is still answering.",
		});
	});
});
