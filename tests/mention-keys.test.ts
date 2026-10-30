import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mentionKeyAction } from "../components/library/use-library-mention.ts";

const open = { open: true, hasOptions: true, composing: false };

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
		assert.equal(mentionKeyAction({ ...open, hasOptions: false, key: "Escape" }), "close");
	});
	it("no match falls through for Enter, Tab and arrows", () => {
		for (const key of ["Enter", "Tab", "ArrowDown", "ArrowUp"]) assert.equal(mentionKeyAction({ ...open, hasOptions: false, key }), null, key);
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
