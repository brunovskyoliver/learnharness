/**
 * What the learner may see of a math check (feature 007, research R5):
 * question checks hide until their question is answered or their problem
 * concluded; grading checks show the outcome but hide the expressions (the
 * committed answer) until the conclude; lesson checks show at once. The
 * "Checked with Wolfram" label follows the last bound question check.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mathCheckBindings, type LhMessage } from "../src/core/index.ts";
import { projectView } from "../src/core/view.ts";

let n = 0;
const user = (text = "go"): LhMessage => ({ id: `u${n++}`, role: "user", content: text, timestamp: n } as never);
const marker = (customType = "practice-thinking"): LhMessage => ({ id: `m${n++}`, role: "custom", customType, content: "thinking", details: {}, display: true, timestamp: n } as never);
const assistant = (...calls: Array<[id: string, name: string, args?: unknown]>): LhMessage =>
	({ id: `a${n++}`, role: "assistant", content: calls.map(([id, name, args]) => ({ type: "toolCall", id, name, arguments: args ?? {} })), timestamp: n } as never);
const result = (toolCallId: string, toolName: string, details: unknown, isError = false): LhMessage =>
	({ id: `r${n++}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details, isError, timestamp: n } as never);
const check = (id: string, purpose: string): [string, string, unknown] => [id, "math_check", { purpose, lhs: "D[Sin[2 x], x]", rhs: "2 Cos[2 x]" }];
const verdict = (id: string, outcome: string) => result(id, "math_check", { outcome, raw: "", ms: 1 });
const answer = (id: string, name = "quiz") => result(id, name, { selected: ["a"], correct: true });

describe("question checks (teacher)", () => {
	it("hide until the quiz is answered, then show; the quiz is labelled", () => {
		const before = [user(), assistant(check("c1", "question")), verdict("c1", "agreed"), assistant(["q1", "quiz"])];
		const b1 = mathCheckBindings(before);
		assert.deepEqual(b1.checks.get("c1"), { hidden: true, expressionsHidden: false });
		const after = [...before, answer("q1")];
		const b2 = mathCheckBindings(after);
		assert.deepEqual(b2.checks.get("c1"), { hidden: false, expressionsHidden: false });
		assert.ok(b2.checked.has("q1"));
	});

	it("stay hidden while the turn has not posed its question yet", () => {
		const b = mathCheckBindings([user(), assistant(check("c1", "question")), verdict("c1", "agreed")]);
		assert.equal(b.checks.get("c1")!.hidden, true);
	});

	it("show once the learner speaks and no question came", () => {
		const b = mathCheckBindings([user(), assistant(check("c1", "question")), verdict("c1", "agreed"), user("ok?")]);
		assert.deepEqual(b.checks.get("c1"), { hidden: false, expressionsHidden: false });
	});

	it("label only when the last bound check agreed", () => {
		const fixed = mathCheckBindings([user(), assistant(check("c1", "question")), verdict("c1", "disagreed"), assistant(check("c2", "question")), verdict("c2", "agreed"), assistant(["q1", "quiz"]), answer("q1")]);
		assert.ok(fixed.checked.has("q1"));
		const broken = mathCheckBindings([user(), assistant(check("c1", "question")), verdict("c1", "agreed"), assistant(check("c2", "question")), verdict("c2", "disagreed"), assistant(["q1", "quiz"]), answer("q1")]);
		assert.equal(broken.checked.has("q1"), false);
	});

	it("never label on undecided, failed or unfinished checks", () => {
		for (const tail of [[verdict("c1", "undecided")], [result("c1", "math_check", null, true)], []]) {
			const b = mathCheckBindings([user(), assistant(check("c1", "question")), ...tail, assistant(["q1", "quiz"]), answer("q1")]);
			assert.equal(b.checked.has("q1"), false);
		}
	});

	it("treat explain like quiz", () => {
		const b = mathCheckBindings([user(), assistant(check("c1", "question")), verdict("c1", "agreed"), assistant(["e1", "explain"]), answer("e1", "explain")]);
		assert.ok(b.checked.has("e1"));
		assert.equal(b.checks.get("c1")!.hidden, false);
	});

	it("move to the retried question when the first pose was rejected", () => {
		const b = mathCheckBindings([user(), assistant(check("c1", "question")), verdict("c1", "agreed"), assistant(["q1", "quiz"]), result("q1", "quiz", { problems: [] }, true), assistant(["q2", "quiz"]), answer("q2")]);
		assert.ok(b.checked.has("q2"));
		assert.equal(b.checks.get("c1")!.hidden, false);
	});
});

describe("grading checks (practice)", () => {
	it("show the outcome at once and the expressions after the conclude", () => {
		const active = [user(), assistant(check("c0", "question")), verdict("c0", "agreed"), assistant(["p1", "problem"]), marker(), assistant(check("g1", "grading")), verdict("g1", "agreed")];
		const b1 = mathCheckBindings(active);
		assert.deepEqual(b1.checks.get("g1"), { hidden: false, expressionsHidden: true });
		assert.deepEqual(b1.checks.get("c0"), { hidden: true, expressionsHidden: false });
		const done = [...active, assistant(["k1", "conclude"])];
		const b2 = mathCheckBindings(done);
		assert.deepEqual(b2.checks.get("g1"), { hidden: false, expressionsHidden: false });
		assert.deepEqual(b2.checks.get("c0"), { hidden: false, expressionsHidden: false });
		assert.ok(b2.checked.has("p1"));
		assert.ok(b2.checked.has("k1"), "the conclude card carries its problem's label");
	});

	it("without an active problem behave as lesson checks", () => {
		const b = mathCheckBindings([user(), assistant(check("g1", "grading")), verdict("g1", "agreed")]);
		assert.deepEqual(b.checks.get("g1"), { hidden: false, expressionsHidden: false });
	});
});

describe("lesson checks", () => {
	it("show at once", () => {
		const b = mathCheckBindings([user(), assistant(check("l1", "lesson")), verdict("l1", "agreed"), assistant(["q1", "quiz"])]);
		assert.deepEqual(b.checks.get("l1"), { hidden: false, expressionsHidden: false });
		assert.equal(b.checked.has("q1"), false);
	});
});

describe("the view projection", () => {
	it("decorates math_check parts and labels checked items", () => {
		const messages = [user(), assistant(check("c1", "question")), verdict("c1", "agreed"), assistant(["q1", "quiz", { question: "?" }]), answer("q1")];
		const parts = projectView(messages).flatMap((m) => m.parts);
		const c = parts.find((p) => p.toolCallId === "c1")!;
		assert.deepEqual(c.mathCheck, { hidden: false, expressionsHidden: false });
		assert.equal(parts.find((p) => p.toolCallId === "q1")!.wolframChecked, true);
	});

	it("leaves other parts untouched", () => {
		const parts = projectView([user(), assistant(["q1", "quiz", { question: "?" }]), answer("q1")]).flatMap((m) => m.parts);
		const q = parts.find((p) => p.toolCallId === "q1")!;
		assert.equal("wolframChecked" in q, false);
	});
});
