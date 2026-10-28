/** The plan popup's Course section (feature 006): items in course order,
 *  kind labels, new-tab links, mapped topic titles and derived states;
 *  nothing without a recorded syllabus. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseList, courseExists } from "../components/course-list.tsx";
import type { CourseInput } from "../src/core/index.ts";

const tree = { nodes: [{ id: "loss", title: "Measuring prediction error" }, { id: "training", title: "Learning by gradient descent" }], edges: [], version: 1 };
const course: CourseInput = { title: "Stanford CS229", url: "https://cs229.stanford.edu/", items: [
	{ title: "Lecture 2: Linear regression", kind: "lecture", url: "https://example.org/l2", topics: ["loss"] },
	{ title: "Lecture 3: Gradient descent", kind: "lecture", topics: ["loss", "training"] },
	{ title: "Problem Set 0", kind: "problem-set", url: "https://example.org/ps0", topics: [] },
] };

const messages = (withCourse: boolean) => [{
	id: "a1", role: "assistant",
	parts: [
		{ type: "tool-plan_init", state: "output-available", output: { tree } },
		{ type: "tool-quiz", state: "output-available", input: { nodeId: "loss" } },
		...(withCourse ? [{ type: "tool-course", state: "output-available", output: { ok: true, course } }] : []),
	],
}] as never;

describe("CourseList", () => {
	it("renders the syllabus with states derived from the checks", () => {
		const html = renderToStaticMarkup(<CourseList messages={messages(true)} />);
		assert.match(html, /<h2[^>]*>Course<\/h2>/);
		assert.match(html, /href="https:\/\/cs229\.stanford\.edu\/" target="_blank" rel="noopener noreferrer"/);
		assert.match(html, /1 of 3 covered/);
		const states = [...html.matchAll(/data-state="([a-z-]+)"/g)].map((m) => m[1]);
		assert.deepEqual(states, ["covered", "not-covered", "not-in-plan"]);
		assert.match(html, />Lecture</);
		assert.match(html, />Problem set</);
		assert.match(html, /Topics: Measuring prediction error, Learning by gradient descent/);
		assert.match(html, />Not in this lesson&#x27;s plan</);
		assert.match(html, />Not yet</);
		assert.match(html, />Covered</);
	});

	it("renders nothing without a syllabus", () => {
		assert.equal(renderToStaticMarkup(<CourseList messages={messages(false)} />), "");
		assert.equal(courseExists(messages(false)), false);
		assert.equal(courseExists(messages(true)), true);
	});
});
