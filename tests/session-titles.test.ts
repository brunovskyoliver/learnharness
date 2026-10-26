import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, firstUserText, isUntouchedTitle } from "../src/server/session-titles.ts";
import { titleFromPrompt } from "../src/core/contracts/graph.ts";

const prompt = "i wanna learn about about ML and this stanford course cs229, where do we even start with all of it";
const msgs = [{ id: "m1", role: "user", content: prompt, timestamp: 0 }] as never;

describe("AI session titles", () => {
	it("cleans the model's reply into a sentence-case title", () => {
		assert.equal(cleanTitle('"Gradient descent basics."'), "Gradient descent basics");
		assert.equal(cleanTitle("Title: intro to CS229\nextra"), "Intro to CS229");
		assert.equal(cleanTitle(""), null);
		assert.equal(cleanTitle("one two three four five six seven eight nine"), null);
	});

	it("reads the first user message", () => {
		assert.equal(firstUserText({ messages: msgs }), prompt);
		assert.equal(firstUserText({ messages: [] }), null);
	});

	it("only treats placeholder titles as untouched", () => {
		assert.ok(isUntouchedTitle({ title: titleFromPrompt(prompt), messages: msgs }));
		assert.ok(isUntouchedTitle({ title: "Untitled session", messages: [] }));
		assert.ok(!isUntouchedTitle({ title: "My ML plan", messages: msgs }), "hand-renamed stays");
	});
});
