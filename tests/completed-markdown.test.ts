import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completedMarkdownPrefix } from "../src/core/completed-markdown.ts";
import { transformMathDelimiters } from "../src/core/math-delims.ts";

describe("completed Markdown blocks", () => {
	it("holds an unfinished paragraph and releases it at a block boundary", () => {
		assert.equal(completedMarkdownPrefix("A partial **sentence"), "");
		assert.equal(completedMarkdownPrefix("First paragraph.\n\nSecond partial"), "First paragraph.\n\n");
		assert.equal(completedMarkdownPrefix("First paragraph.\n\n"), "First paragraph.\n\n");
	});
	it("shows a finished heading, while keeping the following paragraph buffered", () => {
		assert.equal(completedMarkdownPrefix("## A title"), "");
		assert.equal(completedMarkdownPrefix("## A title\n"), "## A title\n");
		assert.equal(completedMarkdownPrefix("## A title\n\nNext"), "## A title\n\n");
	});
	it("does not treat blank lines within a code fence as completed blocks", () => {
		assert.equal(completedMarkdownPrefix("```python\nx = 1\n\n"), "");
		assert.equal(completedMarkdownPrefix("```python\nx = 1\n```"), "```python\nx = 1\n```");
		assert.equal(completedMarkdownPrefix("~~~~python\nx = 1\n~~~\n\n"), "");
	});
	it("waits for complete equations, including legacy delimiters", () => {
		assert.equal(completedMarkdownPrefix("$$\nx^2\n\n"), "");
		assert.equal(completedMarkdownPrefix("$$\nx^2\n$$"), "$$\nx^2\n$$");
		assert.equal(completedMarkdownPrefix(transformMathDelimiters("Before.\n\n\\[\nx^2\n\n")), "Before.\n\n");
		assert.ok(completedMarkdownPrefix(transformMathDelimiters("\\[\nx^2\n\\]" )).includes("x^2"));
	});
	it("keeps lists and tables together instead of revealing rows and items", () => {
		assert.equal(completedMarkdownPrefix("- One\n- Two\n\n"), "");
		assert.equal(completedMarkdownPrefix("- One\n- Two\n\nNext"), "- One\n- Two\n\n");
		const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
		assert.equal(completedMarkdownPrefix(table), "");
		assert.equal(completedMarkdownPrefix(table + "\n\n"), table + "\n\n");
	});
	it("ignores literal math delimiters inside code and preserves completed source", () => {
		const source = "```text\n\\[not math\n```\n\n";
		assert.equal(completedMarkdownPrefix(source), source);
		assert.equal(completedMarkdownPrefix("A `\\(` literal.\n\n"), "A `\\(` literal.\n\n");
	});
});
