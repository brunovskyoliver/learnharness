/**
 * Home's "Calibration" (feature 004): hidden until an answer counts; one
 * line per used level, Guessing → Certain, percent from 5 answers; "Wrong
 * while Certain" with the newest 5, "Show all {n}", a Review link to the
 * session's message anchor, and the owner's empty sentence.
 * Same tsx classic-JSX shim as render-sidebar.test.tsx.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CalibrationSectionView, missHref } from "../components/calibration-section.tsx";
import type { ChatCalibration, ChatListItem } from "../src/core/index.ts";

function chat(id: string, calibration?: ChatCalibration): ChatListItem {
	return {
		id, title: `Session ${id}`, kind: "teach", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-28T10:00:00.000Z",
		messageCount: 4, phase: "teach", pendingQuestion: false, pendingProblem: false, busy: false, compacting: false,
		...(calibration ? { calibration } : {}),
	};
}

const miss = (n: number, messageId: string | null = `m${n}`) => ({
	toolCallId: `call-${n}`,
	question: `Why does **step ${n}** overshoot?`,
	answeredAt: new Date(Date.UTC(2026, 9, 1 + n)).toISOString(),
	messageId,
});

const render = (chats: ChatListItem[] | null) => renderToStaticMarkup(<CalibrationSectionView chats={chats} />);

describe("CalibrationSectionView", () => {
	it("renders nothing until an answer counts", () => {
		assert.equal(render(null), "");
		assert.equal(render([chat("a")]), "");
	});

	it("lists used levels in order with the percent rule", () => {
		const html = render([
			chat("a", { levels: { Certain: { answers: 61, right: 51 } }, misses: [] }),
			chat("b", { levels: { Unsure: { answers: 1, right: 0 } }, misses: [] }),
		]);
		assert.match(html, /<h2[^>]*>Calibration<\/h2>/);
		const unsure = html.indexOf("Unsure · 1 answer · 0 right");
		const certain = html.indexOf("Certain · 61 answers · 51 right (84%)");
		assert.ok(unsure > 0 && certain > unsure, "Guessing → Certain order");
		assert.doesNotMatch(html, /Fairly sure|Guessing/);
	});

	it("says none yet when no answer at Certain was wrong", () => {
		const html = render([chat("a", { levels: { Certain: { answers: 3, right: 3 } }, misses: [] })]);
		assert.match(html, /Wrong while Certain/);
		assert.match(html, /None yet\. Every answer you marked Certain was right\./);
	});

	it("shows the newest 5 misses with Review links, and Show all", () => {
		const misses = [1, 2, 3, 4, 5, 6, 7].map((n) => miss(n));
		const html = render([chat("a", { levels: { Certain: { answers: 9, right: 2 } }, misses })]);
		assert.equal(html.match(/data-testid="calibration-miss"/g)?.length, 5);
		assert.ok(html.indexOf("step 7") < html.indexOf("step 3"), "newest first");
		assert.doesNotMatch(html, /step 2|step 1\b/);
		assert.match(html, /Why does step 7 overshoot\?/, "markdown stripped");
		assert.match(html, /<span class="min-w-0 truncate">Session a<\/span><span class="shrink-0 whitespace-pre"> · /);
		assert.match(html, /href="\/chat\/a#message-m7"[^>]*>Review</);
		assert.match(html, /<button[^>]*>Show all 7<\/button>/);
	});

	it("links to the session without a hash when no anchor exists", () => {
		assert.equal(missHref({ chatId: "x y", messageId: null }), "/chat/x%20y");
		assert.equal(missHref({ chatId: "x", messageId: "m/1" }), "/chat/x#message-m%2F1");
	});
});
