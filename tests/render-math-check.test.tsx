/** The math check in the transcript (feature 007): the verdict row in
 *  words per outcome; nothing while its question waits; a placeholder
 *  instead of the expressions during an active problem; the "Checked with
 *  Wolfram" label only on flagged answered and concluded cards; the live
 *  row never shows the input. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { isShownMathCheckFailure, MathCheckCard } from "../components/artifacts/math-check-card.tsx";
import { LiveToolCard } from "../components/artifacts/live-tool-card.tsx";
import { AnsweredCard } from "../components/answered-card.tsx";
import { ConcludeCard } from "../components/practice-cards.tsx";
import { buildAnswer, normalizeOptions, resolveCorrect, type QuestionData } from "../src/core/question-core.ts";

const input = { purpose: "grading", lhs: "D[Sin[2 x], x]", rhs: "3 Cos[2 x]", assumptions: "x > 0" };
const visible = { hidden: false, expressionsHidden: false };

function part(over: Record<string, unknown>) {
	return { type: "tool-math_check", state: "output-available", toolCallId: "c1", input, mathCheck: visible, ...over } as never;
}
const render = (p: never) => renderToStaticMarkup(<MathCheckCard part={p} />);
const details = (outcome: string, extra: Record<string, unknown> = {}) => ({ outcome, raw: `Out[1]= "OUTCOME: ${outcome}"`, ms: 3900, ...extra });

describe("MathCheckCard", () => {
	it("names each outcome in words", () => {
		assert.match(render(part({ output: details("agreed") })), /Checked with Wolfram · equal/);
		assert.match(render(part({ output: details("disagreed") })), /Wolfram · not equal/);
		assert.match(render(part({ output: details("undecided") })), /Wolfram · couldn(&#x27;|')t decide/);
		const failed = render(part({ state: "output-error", output: undefined, errorText: "The Wolfram check is unavailable: fetch failed." }));
		assert.match(failed, /Wolfram check failed/);
		assert.match(failed, /fetch failed/);
		assert.match(render(part({ state: "input-available", output: undefined })), /Wolfram check not finished/);
	});

	it("only an agreed check says Checked with Wolfram", () => {
		for (const outcome of ["disagreed", "undecided"]) assert.ok(!render(part({ output: details(outcome) })).includes("Checked with Wolfram"));
		assert.ok(!render(part({ state: "output-error", errorText: "x" })).includes("Checked with Wolfram"));
	});

	it("shows the expressions, assumptions, counterexample and reply when visible", () => {
		const html = render(part({ output: details("disagreed", { counterexample: "{x -> 5}" }) }));
		assert.match(html, /D\[Sin\[2 x\], x\] = 3 Cos\[2 x\]/);
		assert.match(html, /Assuming/);
		assert.match(html, /x &gt; 0/);
		assert.match(html, /Counterexample/);
		assert.match(html, /\{x -&gt; 5\}/);
		assert.match(html, /Wolfram(&#x27;|')s reply/);
		assert.match(html, /Took 3\.9 s/);
	});

	it("renders nothing while its question waits for an answer", () => {
		assert.equal(render(part({ output: details("agreed"), mathCheck: { hidden: true, expressionsHidden: false } })), "");
	});

	it("keeps the expressions back during an active problem", () => {
		const html = render(part({ output: details("disagreed", { counterexample: "{x -> 5}" }), mathCheck: { hidden: false, expressionsHidden: true } }));
		assert.match(html, /Wolfram · not equal/);
		assert.match(html, /Expressions shown after the problem is concluded/);
		assert.ok(!html.includes("Cos[2 x]"), "no expression");
		assert.ok(!html.includes("x -&gt; 5"), "no counterexample");
		assert.ok(!html.includes("OUTCOME"), "no raw reply");
	});
});

describe("failed checks in the transcript", () => {
	it("get their own row unless the model only has to fix its input", () => {
		const failed = (errorText: string) => ({ type: "tool-math_check", state: "output-error", errorText });
		assert.equal(isShownMathCheckFailure(failed("The Wolfram check is unavailable: fetch failed.")), true);
		assert.equal(isShownMathCheckFailure(failed("Wolfram could not read the expressions: ToExpression::sntx")), true);
		assert.equal(isShownMathCheckFailure(failed('Invalid tool input for tool "math_check":\n- lhs is empty.')), false);
		assert.equal(isShownMathCheckFailure({ type: "tool-plot", state: "output-error", errorText: "x" }), false);
		assert.equal(isShownMathCheckFailure({ type: "tool-math_check", state: "output-available" }), false);
	});
});

describe("the live row", () => {
	it("says it is checking and never shows the input", () => {
		const html = renderToStaticMarkup(<LiveToolCard part={{ type: "tool-math_check", state: "input-streaming", toolCallId: "c1", input } as never} />);
		assert.match(html, /Checking with Wolfram/);
		assert.ok(!html.includes("Cos[2 x]"));
	});
});

function quizQD(): QuestionData {
	const options = normalizeOptions([{ label: "$2\\cos(2x)$" }, { label: "$\\cos(2x)$" }]);
	return { id: "q1", kind: "quiz", question: "d/dx sin(2x)?", mode: "single-select", options, correctIndices: resolveCorrect("$2\\cos(2x)$", options).indices, explanation: "Chain rule.", createdAt: new Date().toISOString() };
}

describe("reveal labels", () => {
	it("AnsweredCard shows Checked with Wolfram only when flagged, as plain text", () => {
		const answer = buildAnswer(quizQD(), { values: ["$2\\cos(2x)$"], confidence: 90 });
		const flagged = renderToStaticMarkup(<AnsweredCard answer={answer} checked />);
		assert.match(flagged, /data-testid="wolfram-checked"[^>]*>.*Checked with Wolfram<\/p>/);
		assert.match(flagged, /aria-hidden="true"/, "the icon is decoration; the words carry the meaning");
		assert.ok(!renderToStaticMarkup(<AnsweredCard answer={answer} />).includes("Checked with Wolfram"));
	});

	it("ConcludeCard shows it only when its problem was checked", () => {
		const conclude = (over: Record<string, unknown> = {}) =>
			renderToStaticMarkup(<ConcludeCard part={{ type: "tool-conclude", state: "output-available", toolCallId: "k1", input: { outcome: "solved", verdict: "Right." }, reveal: "$2\\cos(2x)$", ...over } as never} />);
		assert.match(conclude({ wolframChecked: true }), /Checked with Wolfram/);
		assert.ok(!conclude().includes("Checked with Wolfram"));
	});
});
