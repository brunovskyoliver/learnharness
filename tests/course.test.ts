/**
 * COURSE TRACK (feature 006): the syllabus is the latest successful `course`
 * call; validation against the current plan; coverage derived with the plan
 * view's rule; Home's counts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseCountsOf, courseCoverage, courseInputProblems, derivePlanStatusesLh, latestCourseLh, latestCourseView, type CourseInput } from "../src/core/index.ts";

type LhMessage = import("../src/core/index.ts").LhMessage;
type PlanTree = import("../src/core/index.ts").PlanTree;

const tree = (ids: string[]): PlanTree => ({ nodes: ids.map((id) => ({ id, title: id.toUpperCase() })), edges: [], version: 1 });
const PLAN = tree(["loss", "slopes", "training", "probability"]);

const course = (topics: string[][]): CourseInput => ({
	title: "Stanford CS229",
	url: "https://cs229.stanford.edu/",
	items: topics.map((t, i) => ({ title: `Lecture ${i + 1}`, kind: "lecture" as const, url: `https://example.org/l${i + 1}`, topics: t })),
});

let n = 0;
const quizOn = (nodeId: string): LhMessage => ({ id: `q${++n}`, role: "assistant", content: [{ type: "toolCall", id: `c${n}`, name: "quiz", arguments: { nodeId } }], timestamp: n }) as never;
const courseCall = (input: CourseInput, isError = false): LhMessage[] => {
	const id = `course-${++n}`;
	return [
		{ id: `a${id}`, role: "assistant", content: [{ type: "toolCall", id, name: "course", arguments: input }], timestamp: n } as never,
		{ id: `r${id}`, role: "toolResult", toolCallId: id, toolName: "course", content: [{ type: "text", text: "x" }], details: isError ? null : { ok: true, course: input }, isError, timestamp: n } as never,
	];
};

describe("courseInputProblems", () => {
	it("accepts a call mapped onto the current plan", () => {
		assert.deepEqual(courseInputProblems(course([["loss"], []]), PLAN), []);
	});
	it("refuses without a plan, and names bad topics and links", () => {
		assert.match(courseInputProblems(course([["loss"]]), null).join(), /no plan yet/);
		assert.match(courseInputProblems(course([["nope"]]), PLAN).join(), /items\[0\]\.topics: "nope" is not a node/);
		assert.match(courseInputProblems({ ...course([["loss"]]), url: "javascript:alert(1)" }, PLAN).join(), /url: must be an http\(s\) link/);
		const bad = course([["loss"]]);
		bad.items[0]!.url = "ftp://x";
		assert.match(courseInputProblems(bad, PLAN).join(), /items\[0\]\.url/);
		assert.match(courseInputProblems({ ...course([]) }, PLAN).join(), /at least one item/);
	});
});

describe("latest course", () => {
	it("the latest successful call wins; failed calls are ignored", () => {
		const first = course([["loss"]]);
		const second = course([["loss"], ["slopes"]]);
		const messages = [...courseCall(first), ...courseCall(second), ...courseCall(course([["x"]]), true)];
		assert.equal(latestCourseLh(messages)?.items.length, 2);
		const view = [{ parts: [{ type: "tool-course", state: "output-available", output: { ok: true, course: first } }, { type: "tool-course", state: "output-error", output: undefined }] }];
		assert.equal(latestCourseView(view)?.items.length, 1);
		assert.equal(latestCourseLh([]), null);
	});
});

describe("courseCoverage", () => {
	it("covered when every mapped topic in the plan has a check; stale topics stop counting", () => {
		const c = course([["loss"], ["loss", "slopes"], ["training"], [], ["gone"]]);
		const messages = [quizOn("loss"), quizOn("slopes")];
		assert.deepEqual(courseCoverage(c, PLAN, derivePlanStatusesLh(PLAN, messages)), ["covered", "covered", "not-covered", "not-in-plan", "not-in-plan"]);
		const rewritten = tree(["loss", "training"]);
		assert.deepEqual(courseCoverage(c, rewritten, derivePlanStatusesLh(rewritten, messages)), ["covered", "covered", "not-covered", "not-in-plan", "not-in-plan"], "slopes left the plan, so lecture 2 needs only loss");
	});

	it("counts for Home", () => {
		const messages = [...courseCall(course([["loss"], ["training"], []])), quizOn("loss")];
		assert.deepEqual(courseCountsOf(PLAN, messages), { covered: 1, items: 3 });
		assert.equal(courseCountsOf(PLAN, [quizOn("loss")]), null);
		assert.equal(courseCountsOf(null, messages), null);
	});
});
