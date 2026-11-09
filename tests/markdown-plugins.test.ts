/** Feature 024 (US4): which on-demand renderers a message needs. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { needsCode, needsMath, rendererNeeds } from "../components/ai-elements/markdown-plugins.ts";

describe("needsMath", () => {
	test("dollar math, inline and display", () => {
		assert.equal(needsMath("The map $f(x) = x^2$ is smooth."), true);
		assert.equal(needsMath("$$\n\\int_0^1 x\\,dx\n$$"), true);
	});
	test("legacy \\( and \\[ delimiters", () => {
		assert.equal(needsMath("so \\(x+1\\) holds"), true);
		assert.equal(needsMath("\\[\na^2+b^2\n\\]"), true);
	});
	test("a lone dollar waits too (conservative: never a raw flash)", () => {
		assert.equal(needsMath("It costs $5."), true);
	});
	test("an escaped dollar is a literal dollar", () => {
		assert.equal(needsMath("It costs \\$5 and \\$10 more."), false);
	});
	test("dollars inside code need no math", () => {
		assert.equal(needsMath("Run `echo $HOME` first."), false);
		assert.equal(needsMath("```sh\necho $HOME\n```"), false);
		assert.equal(needsMath("    echo $HOME"), false);
	});
	test("plain prose needs nothing", () => {
		assert.deepEqual(rendererNeeds("Plain words, **bold** and a [link](https://example.invalid)."), { math: false, code: false });
		assert.deepEqual(rendererNeeds(""), { math: false, code: false });
	});
});

describe("needsCode", () => {
	test("fenced code with backticks or tildes", () => {
		assert.equal(needsCode("Look:\n\n```ts\nconst x = 1;\n```"), true);
		assert.equal(needsCode("~~~\nplain block\n~~~"), true);
	});
	test("an indented code block", () => {
		assert.equal(needsCode("Before.\n\n    indented code\n"), true);
	});
	test("inline code alone needs no highlighter", () => {
		assert.equal(needsCode("Use `npm test` and `git status`."), false);
	});
	test("a mermaid fence is app-rendered, not highlighted", () => {
		assert.equal(needsCode("```mermaid\ngraph TD; A-->B\n```"), false);
		assert.equal(needsCode("```mermaid\ngraph TD; A-->B\n```\n\n```py\nprint(1)\n```"), true);
	});
	test("an unfinished fence while streaming still counts", () => {
		assert.equal(needsCode("Here:\n\n```py\nprint("), true);
	});
	test("math and code together", () => {
		assert.deepEqual(rendererNeeds("$x$ and\n\n```js\n1\n```"), { math: true, code: true });
	});
});
