/** The `course` tool (feature 006): validated against the saved plan; the
 *  result details carry the syllabus (the record of it). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseTool } from "../src/agent/tools/course.ts";
import type { CourseInput, PlanTree } from "../src/core/index.ts";

const plan: PlanTree = { nodes: [{ id: "loss", title: "Loss" }, { id: "training", title: "Training" }], edges: [], version: 1 };
const store = (tree?: PlanTree) => ({ getChat: () => (tree ? { tree } : { }) as never });
const input: CourseInput = { title: "Stanford CS229", url: "https://cs229.stanford.edu/", items: [
	{ title: "Lecture 2: Linear regression and gradient descent", kind: "lecture", url: "https://www.youtube.com/watch?v=4b4MUYve_U8", topics: ["loss", "training"] },
	{ title: "Problem Set 0", kind: "problem-set", topics: [] },
] };
const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");

describe("course tool", () => {
	it("records a valid syllabus in its result details", async () => {
		const r = await courseTool({ chatId: "c", chatStore: store(plan) }).execute("k1", input as never, undefined);
		assert.equal(r.isError ?? false, false);
		assert.equal(text(r), "Course recorded: 2 items.");
		assert.deepEqual(r.details, { ok: true, course: input });
	});

	it("returns problems and records nothing", async () => {
		const bad = { ...input, items: [{ ...input.items[0]!, topics: ["nope"] }] };
		const r = await courseTool({ chatId: "c", chatStore: store(plan) }).execute("k2", bad as never, undefined);
		assert.equal(r.isError, true);
		assert.match(text(r), /"nope" is not a node of the current plan/);
	});

	it("refuses before a plan exists", async () => {
		const r = await courseTool({ chatId: "c", chatStore: store() }).execute("k3", input as never, undefined);
		assert.equal(r.isError, true);
		assert.match(text(r), /no plan yet/);
	});
});
