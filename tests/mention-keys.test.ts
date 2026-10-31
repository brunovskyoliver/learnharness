import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeMentionRow, mentionKeyAction, moveMentionCursor, placeNewPageReference } from "../components/library/use-library-mention.ts";

const open = { open: true, hasActive: true, composing: false };

describe("mentionKeyAction", () => {
	it("Enter and Tab insert", () => {
		assert.equal(mentionKeyAction({ ...open, key: "Enter" }), "insert");
		assert.equal(mentionKeyAction({ ...open, key: "Tab" }), "insert");
	});
	it("arrows move", () => {
		assert.equal(mentionKeyAction({ ...open, key: "ArrowDown" }), "next");
		assert.equal(mentionKeyAction({ ...open, key: "ArrowUp" }), "previous");
	});
	it("Escape is claimed while open, rows or not", () => {
		assert.equal(mentionKeyAction({ ...open, key: "Escape" }), "close");
		assert.equal(mentionKeyAction({ ...open, hasActive: false, key: "Escape" }), "close");
	});
	it("with no active row, Enter and Tab fall through and arrows still reach New page", () => {
		for (const key of ["Enter", "Tab"]) assert.equal(mentionKeyAction({ ...open, hasActive: false, key }), null, key);
		assert.equal(mentionKeyAction({ ...open, hasActive: false, key: "ArrowDown" }), "next");
		assert.equal(mentionKeyAction({ ...open, hasActive: false, key: "ArrowUp" }), "previous");
	});
	it("IME composition takes nothing", () => {
		for (const key of ["Enter", "Tab", "Escape", "ArrowDown"]) assert.equal(mentionKeyAction({ ...open, composing: true, key }), null, key);
	});
	it("a closed list takes nothing", () => {
		for (const key of ["Enter", "Tab", "Escape"]) assert.equal(mentionKeyAction({ ...open, open: false, key }), null, key);
	});
	it("Shift+Enter stays a newline and Ctrl+Enter stays submit", () => {
		assert.equal(mentionKeyAction({ ...open, key: "Enter", shiftKey: true }), null);
		assert.equal(mentionKeyAction({ ...open, key: "Enter", ctrlKey: true }), null);
		assert.equal(mentionKeyAction({ ...open, key: "Tab", shiftKey: true }), null);
	});
	it("other keys type", () => {
		assert.equal(mentionKeyAction({ ...open, key: "a" }), null);
	});
});

describe("the New page row", () => {
	it("is the last option, reached by both arrows, and they wrap", () => {
		assert.equal(moveMentionCursor(1, 2, 1), "new-page");
		assert.equal(moveMentionCursor(0, 2, -1), "new-page");
		assert.equal(moveMentionCursor(2, 2, 1), 0);
		assert.equal(moveMentionCursor(2, 2, -1), 1);
		assert.equal(activeMentionRow("new-page", 2), 2);
	});
	it("with no match, nothing is active until an arrow asks for it, and an arrow steps off it", () => {
		assert.equal(activeMentionRow(0, 0), -1);
		for (const step of [1, -1] as const) {
			assert.equal(moveMentionCursor(-1, 0, step), "new-page");
			assert.equal(activeMentionRow(moveMentionCursor(0, 0, step), 0), -1);
		}
		assert.equal(activeMentionRow("new-page", 0), 0);
	});
	it("stays chosen when matches load, and a stale row clamps to the last match", () => {
		assert.equal(activeMentionRow("new-page", 3), 3);
		assert.equal(activeMentionRow(5, 2), 1);
	});
	it("replaces the token and keeps the rest of the draft", () => {
		assert.deepEqual(placeNewPageReference("see @zz and that", { start: 4, text: "@zz" }, "Untitled page"), { value: "see @Untitled page  and that", start: 4, caret: 19 });
		assert.deepEqual(placeNewPageReference("@", { start: 0, text: "@" }, "Untitled page (2)"), { value: "@Untitled page (2) ", start: 0, caret: 19 });
	});
	it("a draft that moved on while creating loses nothing", () => {
		assert.equal(placeNewPageReference("rewritten", { start: 0, text: "@zz" }, "P").value, "rewritten @P ");
		assert.equal(placeNewPageReference("rewritten\n", { start: 0, text: "@zz" }, "P").value, "rewritten\n@P ");
		assert.equal(placeNewPageReference("", { start: 0, text: "@zz" }, "P").value, "@P ");
		assert.equal(placeNewPageReference("x @zzy", { start: 2, text: "@zz" }, "P").value, "x @P y");
	});
});
