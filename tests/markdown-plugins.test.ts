/** Feature 024 (US4): which text starts the on-demand code highlighter. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { needsCode } from "../components/ai-elements/markdown-plugins.ts";

test("fenced code with backticks or tildes", () => {
	assert.equal(needsCode("Look:\n\n```ts\nconst x = 1;\n```"), true);
	assert.equal(needsCode("~~~\nplain block\n~~~"), true);
	assert.equal(needsCode("```\nno language\n```"), true);
});

test("a fence inside a list item or a quote", () => {
	assert.equal(needsCode("1. Run:\n   ```sh\n   npm test\n   ```"), true);
	assert.equal(needsCode("- ```py\n  print(1)\n  ```"), true);
	assert.equal(needsCode("> ```js\n> 1\n> ```"), true);
});

test("an unfinished fence while streaming", () => {
	assert.equal(needsCode("Here:\n\n```py\nprint("), true);
});

test("inline code alone needs no highlighter", () => {
	assert.equal(needsCode("Use `npm test` and `git status`."), false);
	assert.equal(needsCode("Inline ```triple``` ticks on one line."), false);
});

test("a mermaid fence is app-rendered, not highlighted", () => {
	assert.equal(needsCode("```mermaid\ngraph TD; A-->B\n```"), false);
	assert.equal(needsCode("```mermaid\ngraph TD; A-->B\n```\n\nAfter."), false);
	assert.equal(needsCode("```mermaid\ngraph TD; A-->B\n```\n\n```py\nprint(1)\n```"), true);
});

test("plain prose and math need nothing", () => {
	assert.equal(needsCode(""), false);
	assert.equal(needsCode("Plain words, **bold** and $x^2$."), false);
});
