/**
 * The four-zone prompt bar (feature 001): turn strip, prompt body, answer
 * well, toolbar with one verb-labelled primary action.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PracticeDock } from "../components/practice-dock.tsx";
import { QuestionDock } from "../components/question-dock.tsx";
import { Composer } from "../components/composer.tsx";
import { StatsBar } from "../components/stats-bar.tsx";
import { AnswerWell, TurnStrip } from "../components/prompt-controls.tsx";

const quiz = {
	question: "Which planet is closest to the sun?",
	options: [{ label: "Mercury" }, { label: "Venus" }],
	correctAnswer: "Mercury",
	explanation: "innermost",
} as never;

const statement = "Knowledge tracing has **three load-bearing features**. Name them.";

function practice(expanded: boolean, extra: Partial<Parameters<typeof PracticeDock>[0]> = {}) {
	return renderToStaticMarkup(
		<PracticeDock problemCallId="p1" expanded={expanded} statement={statement} onExpand={() => {}} onSubmit={() => {}} {...extra} />,
	);
}

describe("prompt bar zones", () => {
	it("the turn strip names whose turn it is and the kind", () => {
		const html = renderToStaticMarkup(<TurnStrip kind="Lesson check" />);
		assert.match(html, /data-testid="turn-strip"/);
		assert.match(html, />Your turn</);
		assert.match(html, />Lesson check</);
	});

	it("the answer well wraps its field with no separate label", () => {
		const html = renderToStaticMarkup(<AnswerWell><textarea id="f" /></AnswerWell>);
		assert.match(html, /data-testid="answer-well"/);
		assert.ok(!html.includes("<label"), "the placeholder names the field");
	});

	it("an expanded lesson check renders strip, body, well and Submit answer in that order", () => {
		const html = renderToStaticMarkup(
			<QuestionDock toolName="quiz" toolCallId="q1" input={quiz} expanded onExpand={() => {}} onSubmit={() => {}} onCollapse={() => {}} />,
		);
		const strip = html.indexOf('data-testid="turn-strip"');
		const body = html.indexOf('data-testid="lesson-question"');
		const well = html.indexOf('data-testid="answer-well"');
		const submit = html.indexOf(">Submit answer<");
		assert.ok(strip !== -1 && strip < body && body < well && well < submit, "zone order");
		assert.match(html, /aria-label="Collapse question"/);
		assert.ok(html.includes("prompt-primary"), "labelled primary action");
		assert.ok(!html.includes("border-dashed"), "no dashed I don't know row");
		assert.match(html, /I don't know|I don&#x27;t know/, "I don't know stays available");
	});
});

describe("practice dock", () => {
	it("shows Skip beside Submit only when a skip handler exists", () => {
		const withSkip = practice(true, { onSkip: () => {} });
		assert.match(withSkip, /data-testid="practice-skip"[^>]*>Skip</);
		assert.ok(withSkip.indexOf("practice-skip") < withSkip.indexOf('data-testid="practice-send"'), "Skip precedes Submit");
		assert.match(withSkip, /aria-label="Submit"/);
		assert.ok(!practice(true).includes("practice-skip"));
	});

	it("the collapsed bar renders the teaser without raw markdown", () => {
		const html = practice(false);
		assert.match(html, /data-testid="practice-dock-bar"/);
		assert.match(html, />Your turn</);
		assert.match(html, /three load-bearing features/);
		assert.ok(!html.includes("**"), "markdown markers never show raw");
		assert.match(html, />Solve</);
	});
});

describe("composer actions", () => {
	const base = { value: "", onChange: () => {}, onSend: () => {}, onStop: () => {} };

	it("streaming with an empty field shows a labelled Stop", () => {
		const html = renderToStaticMarkup(<Composer {...base} busy canSend={false} />);
		assert.match(html, /aria-label="Stop"[^>]*>.*Stop<\/button>/s);
	});

	it("plain chat keeps the round send", () => {
		const html = renderToStaticMarkup(<Composer {...base} busy={false} canSend />);
		assert.match(html, /class="prompt-submit"/);
	});

	it("a setup action replaces the model controls in the toolbar", () => {
		const html = renderToStaticMarkup(
			<StatsBar turns={[]} setup={<button type="button" data-testid="setup-cta-keys">Add a provider key</button>} />,
		);
		assert.match(html, /data-testid="setup-cta-keys"/);
		assert.ok(!html.includes('data-testid="stats-model"'), "no model trigger beside the setup action");
		assert.ok(!html.includes(">—<"), "no dash placeholders");
	});
});
