/**
 * Home's "Waiting for you" (feature 002): newest posed first, the kind
 * label in the accent, a quiet Answer/Solve link that opens the session on
 * the item (`?answer=`), and distinct loading / empty / failed states (a
 * failed refresh keeps the last list). Plus the dock's side of `?answer=`:
 * only the item still waiting opens; a stale id changes nothing.
 * Same tsx classic-JSX shim as render-sidebar.test.tsx.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WaitingSectionView, answerHref, continueHref, continueSessions, progressLine, waitingSessions } from "../components/waiting-section.tsx";
import { answerOpensDock } from "../components/chat.tsx";
import type { ChatListItem, WaitingItem } from "../src/core/index.ts";

function item(id: string, waiting?: Partial<WaitingItem>, overrides: Partial<ChatListItem> = {}): ChatListItem {
	return {
		id,
		title: `Session ${id}`,
		kind: "teach",
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-28T10:00:00.000Z",
		messageCount: 4,
		phase: "teach",
		pendingQuestion: waiting !== undefined,
		pendingProblem: false,
		busy: false,
		compacting: false,
		...(waiting ? { waiting: { toolCallId: `call-${id}`, kind: "Lesson check", action: "Answer", teaser: `Question ${id}?`, postedAt: "2026-10-28T09:00:00.000Z", ...waiting } } : {}),
		...overrides,
	};
}

const render = (chats: ChatListItem[] | null, loadError = false) =>
	renderToStaticMarkup(<WaitingSectionView chats={chats} loadError={loadError} onRetry={() => {}} />);

describe("waitingSessions", () => {
	it("keeps only waiting sessions, newest posed first", () => {
		const chats = [
			item("old", { postedAt: "2026-10-20T09:00:00.000Z" }),
			item("idle"),
			item("new", { postedAt: "2026-10-28T09:00:00.000Z" }),
			item("mid", { postedAt: "2026-10-25T09:00:00.000Z" }),
		];
		assert.deepEqual(waitingSessions(chats).map((c) => c.id), ["new", "mid", "old"]);
	});
});

describe("WaitingSectionView", () => {
	it("renders rows in order with kind, title, teaser and the right action", () => {
		const html = render([
			item("a", { kind: "Problem", action: "Solve", teaser: "Find the **eigenvalues**.", postedAt: "2026-10-27T09:00:00.000Z" }, { kind: "practice", pendingProblem: true, pendingQuestion: false }),
			item("b", { kind: "Prediction", postedAt: "2026-10-28T09:00:00.000Z" }),
		]);
		assert.match(html, /Waiting for you/);
		assert.match(html, /2 open/);
		const b = html.indexOf("Session b");
		const a = html.indexOf("Session a");
		assert.ok(b > 0 && a > b, "newest first");
		assert.match(html, /text-primary">Prediction</);
		assert.match(html, /text-primary">Problem</);
		assert.match(html, /Find the eigenvalues\./, "markdown is stripped, never raw");
		assert.doesNotMatch(html, /\*\*/);
		assert.match(html, />Solve</);
		assert.match(html, />Answer</);
	});

	it("links each action to the session, opening on the item", () => {
		const chat = item("x y", { toolCallId: "call/1" });
		assert.equal(answerHref(waitingSessions([chat])[0]!), "/chat/x%20y?answer=call%2F1");
		assert.match(render([chat]), /href="\/chat\/x%20y\?answer=call%2F1"/);
	});

	it("uses the quiet button: raised grey, never the amber fill", () => {
		const html = render([item("a", {})]);
		assert.match(html, /<a[^>]*data-quiet=""[^>]*class="waiting-row-action prompt-primary"/);
		assert.doesNotMatch(html, /bg-primary/);
	});

	it("truncates a long title in the meta line, never the time", () => {
		const html = render([item("a", {}, { title: "A very long session title that will not fit on a phone" })]);
		assert.match(html, /<span class="min-w-0 truncate">A very long session title that will not fit on a phone<\/span><span class="shrink-0 whitespace-pre"> · /);
		assert.doesNotMatch(html, /waiting-row-meta[^"]*truncate/, "the meta line itself does not truncate");
	});

	it("puts the heading on the column edge, with no inset", () => {
		assert.doesNotMatch(render([item("a", {})]), /px-1/);
		assert.doesNotMatch(render([item("idle")]), /px-1/);
	});

	it("says nothing is waiting in one sentence, with no icon", () => {
		const html = render([item("idle")]);
		assert.match(html, /Nothing is waiting\. Every check is answered and every problem solved\./);
		assert.doesNotMatch(html, /<svg/);
		assert.doesNotMatch(html, /open<\/span>/);
	});

	it("loading, failed, and a failed refresh that keeps the list are distinct", () => {
		assert.match(render(null), /aria-label="Loading what is waiting"/);
		const failed = render(null, true);
		assert.match(failed, /Could not load what is waiting\./);
		assert.match(failed, />Try again</);
		const kept = render([item("a", {})], true);
		assert.match(kept, /Session a/);
		assert.doesNotMatch(kept, /Could not load/);
	});
});

describe("answerOpensDock — Home's ?answer= on the session side", () => {
	it("opens only for the item still waiting", () => {
		assert.equal(answerOpensDock("call-1", "call-1"), true);
		assert.equal(answerOpensDock("call-old", "call-1"), false, "a stale id leaves the dock as it would open");
		assert.equal(answerOpensDock("call-1", null), false, "answered meanwhile: nothing waits");
		assert.equal(answerOpensDock(undefined, "call-1"), false);
		assert.equal(answerOpensDock("", "call-1"), false);
	});
});

describe("Continue rows (feature 003)", () => {
	const progress = { total: 11, left: 2, next: "Learning by gradient descent" };

	it("lists lessons with topics left and nothing waiting, last active first", () => {
		const chats = [
			item("older", undefined, { progress, updatedAt: "2026-10-20T10:00:00.000Z" }),
			item("asked", {}, { progress }),
			item("plain"),
			item("newer", undefined, { progress, updatedAt: "2026-10-27T10:00:00.000Z" }),
		];
		assert.deepEqual(continueSessions(chats).map((c) => c.id), ["newer", "older"]);
	});

	it("formats the progress line", () => {
		assert.equal(progressLine(progress), "2 of 11 topics left · next: Learning by gradient descent");
	});

	it("renders a Lesson row after every Answer/Solve row, with Continue", () => {
		const html = render([
			item("lesson", undefined, { progress, updatedAt: "2026-10-28T11:00:00.000Z" }),
			item("check", { postedAt: "2026-10-01T09:00:00.000Z" }),
		]);
		assert.ok(html.indexOf("Session check") < html.indexOf("Session lesson"), "Answer/Solve rows come first");
		assert.match(html, /text-primary">Lesson</);
		assert.match(html, /2 of 11 topics left · next: Learning by gradient descent/);
		assert.match(html, /href="\/chat\/lesson\?continue=1"[^>]*>Continue</);
		assert.match(html, /2 open/, "the heading counts every row");
	});

	it("a lesson that also waits renders one Answer row carrying the progress line", () => {
		const html = render([item("both", {}, { progress })]);
		assert.equal(html.match(/data-testid="waiting-row"/g)?.length, 1);
		assert.match(html, />Answer</);
		assert.doesNotMatch(html, />Continue</);
		assert.match(html, /class="waiting-row-progress[^"]*">2 of 11 topics left · next: Learning by gradient descent</);
		assert.match(html, /1 open/);
	});

	it("links Continue to the session's one-shot param", () => {
		assert.equal(continueHref({ id: "x y" }), "/chat/x%20y?continue=1");
	});

	it("keeps the empty sentence when no row exists", () => {
		assert.match(render([item("idle")]), /Nothing is waiting\./);
	});
});

describe("course progress on Home (feature 006)", () => {
	const progress = { total: 11, left: 2, next: "Learning by gradient descent" };
	it("appends the course count to the progress line", () => {
		assert.equal(progressLine(progress, { covered: 3, items: 25 }), "2 of 11 topics left · next: Learning by gradient descent · Course: 3 of 25 covered");
		const lesson = render([item("l", undefined, { progress, course: { covered: 3, items: 25 } })]);
		assert.match(lesson, /Course: 3 of 25 covered/);
		const merged = render([item("m", {}, { progress, course: { covered: 0, items: 4 } })]);
		assert.match(merged, /class="waiting-row-progress[^"]*">2 of 11 topics left · next: Learning by gradient descent · Course: 0 of 4 covered</);
	});
	it("leaves the line unchanged without a course", () => {
		assert.doesNotMatch(render([item("l", undefined, { progress })]), /Course:/);
	});
});
