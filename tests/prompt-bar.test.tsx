/**
 * The prompt bar (feature 001) and, since feature 025 (R8), the check
 * threads beside the lesson: the bar keeps free chat; a waiting check is
 * answered in its thread (question, choices, reply-line field, Submit).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PracticeDock } from "../components/practice-dock.tsx";
import { QuestionDock, teaserText } from "../components/question-dock.tsx";
import { Composer } from "../components/composer.tsx";
import { StatsBar } from "../components/stats-bar.tsx";
import { AnswerWell } from "../components/prompt-controls.tsx";
import { CheckThread } from "../components/study/check-thread.tsx";

const quiz = {
	question: "Which planet is closest to the sun?",
	options: [{ label: "Mercury" }, { label: "Venus" }],
	correctAnswer: "Mercury",
	explanation: "innermost",
} as never;

const statement = "Knowledge tracing has **three load-bearing features**. Name them.";

function practice(expanded: boolean, extra: Partial<Parameters<typeof PracticeDock>[0]> = {}) {
	return renderToStaticMarkup(
		<CheckThread id="p1" kind="problem" label="Problem" teaser={teaserText(statement)} reveal={false} open={expanded} fresh={false} variant="inline" layer={null} lessonWidth={390} shift={0} anchorId={null} onOpen={() => {}} onClose={() => {}}>
			<PracticeDock problemCallId="p1" active={expanded} statement={statement} onSubmit={() => {}} {...extra} />
		</CheckThread>,
	);
}

describe("prompt bar zones", () => {
	it("the answer well wraps its field with no separate label", () => {
		const html = renderToStaticMarkup(<AnswerWell><textarea id="f" /></AnswerWell>);
		assert.match(html, /data-testid="answer-well"/);
		assert.ok(!html.includes("<label"), "the placeholder names the field");
	});

	it("an open lesson check renders its head, the question, the reply-line field and Submit answer in that order", () => {
		const html = renderToStaticMarkup(
			<CheckThread id="q1" kind="question" label="Lesson check" teaser="Which planet?" reveal={false} open fresh={false} variant="inline" layer={null} lessonWidth={390} shift={0} anchorId={null} onOpen={() => {}} onClose={() => {}}>
				<QuestionDock toolName="quiz" toolCallId="q1" input={quiz} active onSubmit={() => {}} />
			</CheckThread>,
		);
		const head = html.indexOf(">Your turn<");
		const body = html.indexOf('data-testid="lesson-question"');
		const field = html.indexOf('data-testid="thinking-field"');
		const submit = html.indexOf(">Submit answer<");
		assert.ok(head !== -1 && head < body && body < field && field < submit, "order");
		assert.match(html, /aria-label="Collapse question"/);
		assert.ok(html.includes("nb-pill"), "the ink pill is the primary action");
		assert.ok(html.includes("nb-reply-line"), "the reply-line field");
		assert.ok(!html.includes("border-dashed"), "no dashed I don't know row");
		assert.match(html, /I don't know|I don&#x27;t know/, "I don't know stays available");
	});
});

describe("practice thread", () => {
	it("shows Skip beside Submit only when a skip handler exists", () => {
		const withSkip = practice(true, { onSkip: () => {} });
		assert.match(withSkip, /data-testid="practice-skip"[^>]*>Skip</);
		assert.ok(withSkip.indexOf("practice-skip") < withSkip.indexOf('data-testid="practice-send"'), "Skip precedes Submit");
		assert.match(withSkip, /aria-label="Submit"/);
		assert.ok(!practice(true).includes("practice-skip"));
	});

	it("the collapsed thread renders the teaser without raw markdown", () => {
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
