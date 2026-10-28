/**
 * LESSON PROGRESS (feature 003): how much of a lesson's plan is left and
 * which topic comes next, derived at read time from the plan tree and the
 * transcript with the plan view's own status rule. Unfinished = current or
 * upcoming (owner 2026-10-28: the current topic counts as left).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { continueDraft, lessonProgressOf } from "../src/core/index.ts";

type LhMessage = import("../src/core/index.ts").LhMessage;
type PlanTree = import("../src/core/index.ts").PlanTree;

const tree = (nodes: [id: string, title: string][]): PlanTree => ({
	nodes: nodes.map(([id, title]) => ({ id, title })),
	edges: [],
	version: 1,
});

let seq = 0;
const quizOn = (nodeId: string, tool = "quiz"): LhMessage => ({
	id: `m-${++seq}`,
	role: "assistant",
	content: [{ type: "toolCall", id: `call-${seq}`, name: tool, arguments: { nodeId, question: "Q?" } }],
	timestamp: 1_000 + seq,
}) as never;

/** The hosted ML lesson's plan (2026-10-28), in its stored order. */
const HOSTED = tree([
	["predictions", "Predictions and adjustable weights"],
	["loss", "Measuring prediction error"],
	["slopes", "Derivatives as local change"],
	["chain", "Chain rule and gradients"],
	["training", "Learning by gradient descent"],
	["vectors", "Weighted sums as vector operations"],
	["matrix-shapes", "One dot product per row"],
	["numpy", "Batch predictions in NumPy"],
	["probability", "Probabilities from outcome counts"],
	["classification", "Probabilistic classification"],
	["course", "Course lectures and assignments"],
]);

describe("lessonProgressOf", () => {
	it("has no progress without a plan", () => {
		assert.equal(lessonProgressOf(undefined, []), null);
		assert.equal(lessonProgressOf(null, []), null);
		assert.equal(lessonProgressOf(tree([]), []), null);
	});

	it("before any check, every topic is left and the first is next", () => {
		const t = tree([["a", "Alpha"], ["b", "Beta"]]);
		assert.deepEqual(lessonProgressOf(t, []), { total: 2, left: 2, next: "Alpha" });
	});

	it("counts the current topic as left and names it next", () => {
		const t = tree([["a", "Alpha"], ["b", "Beta"], ["c", "Gamma"]]);
		assert.deepEqual(lessonProgressOf(t, [quizOn("a"), quizOn("b")]), { total: 3, left: 2, next: "Beta" });
	});

	it("an explain call tags position like a quiz", () => {
		const t = tree([["a", "Alpha"], ["b", "Beta"], ["c", "Gamma"]]);
		assert.deepEqual(lessonProgressOf(t, [quizOn("a"), quizOn("b", "explain")]), { total: 3, left: 2, next: "Beta" });
	});

	it("a topic revisited later is current again (the hosted lesson)", () => {
		const order = ["predictions", "loss", "slopes", "chain", "training", "vectors", "matrix-shapes", "numpy", "probability", "classification", "training"];
		assert.deepEqual(lessonProgressOf(HOSTED, order.map((id) => quizOn(id))), {
			total: 11,
			left: 2,
			next: "Learning by gradient descent",
		});
	});

	it("with no current topic in the plan, next is the first upcoming in plan order", () => {
		const t = tree([["a", "Alpha"], ["b", "Beta"], ["c", "Gamma"]]);
		// Checks on a node the plan no longer has leave no current topic.
		assert.deepEqual(lessonProgressOf(t, [quizOn("gone")]), { total: 3, left: 3, next: "Alpha" });
	});

	it("follows the current plan after a rewrite, not the old one", () => {
		const before = tree([["a", "Alpha"], ["b", "Beta"]]);
		const messages = [quizOn("a")];
		assert.deepEqual(lessonProgressOf(before, messages), { total: 2, left: 2, next: "Alpha" });
		const rewritten = tree([["a", "Alpha"], ["x", "Xi"], ["y", "Ypsilon"]]);
		assert.deepEqual(lessonProgressOf(rewritten, [...messages, quizOn("x")]), { total: 3, left: 2, next: "Xi" });
	});

	it("is finished (null) once every plan topic has had a check", () => {
		const t = tree([["a", "Alpha"], ["b", "Beta"]]);
		assert.deepEqual(lessonProgressOf(t, [quizOn("a")]), { total: 2, left: 2, next: "Alpha" });
		assert.equal(lessonProgressOf(t, [quizOn("a"), quizOn("b")]), null);
		assert.equal(lessonProgressOf(t, [quizOn("a"), quizOn("b"), quizOn("a")]), null, "a revisit after every topic was checked stays finished");
	});
});

describe("continueDraft", () => {
	it("names the next topic", () => {
		assert.equal(continueDraft({ total: 11, left: 2, next: "Learning by gradient descent" }), "Continue with Learning by gradient descent");
	});
});
