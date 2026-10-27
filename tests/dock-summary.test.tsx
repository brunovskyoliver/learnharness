import React, { act } from "react";
import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import type { Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";
import { Composer } from "../components/composer.tsx";
import { PracticeDock } from "../components/practice-dock.tsx";
import { SessionAccountProvider, SessionStateProvider, useSessionState } from "../components/session-state.tsx";
import type { QuestionAnswerData } from "../src/core/index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true, window: dom.window, document: dom.document,
	Node: dom.window.Node, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
	HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
	MutationObserver: dom.window.MutationObserver, getComputedStyle: () => ({ display: "block", visibility: "visible" }),
});
Object.defineProperty(document, "oninput", { value: null, configurable: true });
const { createRoot } = await import("react-dom/client");
const roots: Root[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await act(async () => root.unmount());
	document.body.replaceChildren();
});
async function harness() {
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host); roots.push(root);
	return { host, render: async (node: React.ReactNode) => { await act(async () => root.render(node)); } };
}
const quiz = { question: "Which planet?", options: [{ label: "Mercury" }, { label: "Venus" }], correctAnswer: "Mercury", explanation: "Closest to the sun." };
it("folding a live question preserves the input node, selected answer, confidence, and one submit owner", async () => {
	const { host, render } = await harness();
	let submitted: QuestionAnswerData | undefined;
	const view = (expanded: boolean) => <QuestionDock toolName="quiz" toolCallId="summary-q" input={quiz} expanded={expanded} onExpand={() => {}} onSubmit={answer => { submitted = answer; }} initialDraft={{ selection: { selected: new Set([0]), otherSelected: false, dontKnow: false }, thinking: "My reasoning", other: "", text: "", confidenceIndex: 2 }} />;
	await render(view(true));
	const input = host.querySelector("textarea");
	const choice = host.querySelector('[data-kbdrow="0"]');
	assert.ok(input); assert.ok(choice);
	await render(view(false));
	assert.equal(host.querySelector("textarea"), input);
	assert.equal(input.value, "My reasoning");
	assert.equal(host.querySelectorAll("form").length, 1);
	assert.equal(host.querySelector('[data-testid="lesson-question"]')?.hasAttribute("hidden"), true);
	assert.equal(choice.getAttribute("aria-checked"), "true");
	await render(view(true));
	assert.equal(host.querySelector("textarea"), input);
	assert.equal(host.querySelector('[data-testid="lesson-question"]')?.hasAttribute("hidden"), false);
	await act(async () => { host.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
	assert.ok(submitted);
	assert.equal(submitted.thinking, "My reasoning");
	assert.equal(submitted.confidence, 75);
});

function SeedPracticeDraft() {
	const [, setDraft] = useSessionState("problem/summary-p/thinking", "");
	return <button data-seed="" onClick={() => setDraft("A persistent practice trace")}>Seed draft</button>;
}
it("practice summary keeps its live trace mounted and submits it after re-expansion", async () => {
	const { host, render } = await harness();
	let submitted = "";
	const view = (expanded: boolean) => <SessionAccountProvider account={null}><SessionStateProvider chatId="dock-test"><SeedPracticeDraft /><PracticeDock problemCallId="summary-p" statement="Solve this public problem statement." expanded={expanded} onExpand={() => {}} onSubmit={text => { submitted = text; }} /></SessionStateProvider></SessionAccountProvider>;
	await render(view(true));
	await act(async () => { host.querySelector<HTMLButtonElement>("[data-seed]")!.click(); });
	const input = host.querySelector("textarea")!;
	assert.equal(input.value, "A persistent practice trace");
	await render(view(false));
	assert.equal(host.querySelector("textarea"), input);
	assert.match(host.querySelector('[data-testid="practice-dock-bar"]')!.textContent!, /public problem statement/);
	assert.equal(host.querySelector('[data-testid="practice-problem-content"]')?.hasAttribute("hidden"), true);
	await render(view(true));
	await act(async () => { host.querySelector<HTMLButtonElement>('[data-testid="practice-send"]')!.click(); });
	assert.equal(submitted, "A persistent practice trace");
	assert.equal(input.value, "");
});


it("the mounted composer lets IME confirm text before Enter can submit", async () => {
	const { host, render } = await harness();
	let sends = 0;
	await render(<Composer busy={false} value="draft" onChange={() => {}} onSend={() => { sends++; }} onStop={() => {}} canSend />);
	const input = host.querySelector("textarea")!;
	for (const composing of [true, false]) {
		const event = new window.Event("keydown", { bubbles: true, cancelable: true });
		Object.assign(event, { key: "Enter", isComposing: composing });
		await act(async () => { input.dispatchEvent(event); });
		assert.equal(sends, composing ? 0 : 1);
	}
});
