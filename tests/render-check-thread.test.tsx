/**
 * Checks as margin threads (feature 025, research R8): the check thread's
 * placement rule, its collapsed/open/reveal faces, the anchor it follows,
 * and the storage keys that must stay bare (`question/<id>/…`,
 * `problem/<id>/…`) so drafts from before the redesign survive.
 */
import React, { act } from "react";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { CheckThread, DRAFT_KEPT, REVEAL_LINE, type CheckThreadProps } from "../components/study/check-thread.tsx";
import { CHECK_MIN_LEFT, CHECK_ROOM, checkAnchorPartId, checkColumn, checkLayout, checkMessageIndex } from "../components/study/check-geometry.ts";
import { QuestionDock } from "../components/question-dock.tsx";
import { PracticeDock } from "../components/practice-dock.tsx";
import { SessionAccountProvider, SessionPartState, SessionStateProvider } from "../components/session-state.tsx";

const dom = parseHTML("<html><body></body></html>");
const saved = new Map<string, string>();
Object.assign(dom.window, { localStorage: { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v); }, removeItem: (k: string) => { saved.delete(k); } } });
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true, window: dom.window, document: dom.document,
	Node: dom.window.Node, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
	HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
	MutationObserver: dom.window.MutationObserver, getComputedStyle: () => ({ display: "block", visibility: "visible" }),
});
const { createRoot } = await import("react-dom/client");

const quiz = { question: "Which planet is closest to the sun?", options: [{ label: "Mercury" }, { label: "Venus" }], correctAnswer: "Mercury", explanation: "innermost" };
const base: Omit<CheckThreadProps, "children"> = {
	id: "q1", kind: "question", label: "Lesson check", teaser: "Which planet is closest to the sun?", reveal: false, open: false, fresh: false,
	variant: "inline", layer: null, lessonWidth: 390, shift: 0, anchorId: null, onOpen: () => {}, onClose: () => {},
};
const thread = (over: Partial<CheckThreadProps> = {}, child: React.ReactNode = <QuestionDock toolName="quiz" toolCallId="q1" input={quiz} active={!!over.open} onSubmit={() => {}} />) =>
	renderToStaticMarkup(<CheckThread {...base} {...over}>{child}</CheckThread>);

describe("checkLayout: margin or inline (R8)", () => {
	it("a wide lesson keeps the column centred and puts the thread in the margin", () => {
		assert.deepEqual(checkLayout(2000), { variant: "margin", shift: 0 });
	});
	it("between, the column moves left just enough for 71 + 410 and the edge gap", () => {
		const layout = checkLayout(1440);
		assert.equal(layout.variant, "margin");
		const column = checkColumn(1440, layout.shift);
		assert.ok(1440 - column.right >= CHECK_ROOM, "room for the open thread right of the column");
		assert.ok(column.left >= CHECK_MIN_LEFT, "the column stays clear of the turn rail");
		assert.equal(column.right - column.left, 660);
	});
	it("phones, a narrow window or the right pane open: inline", () => {
		for (const width of [320, 390, 768, 960, 1200]) assert.deepEqual(checkLayout(width), { variant: "inline", shift: 0 }, `${width}px`);
	});
});

describe("the anchor: the nearest tutor paragraph before the check", () => {
	const messages = [
		{ role: "assistant", parts: [{ type: "text", id: "t1", text: "First." }] },
		{ role: "user", parts: [{ type: "text", id: "u1", text: "Me." }] },
		{ role: "assistant", parts: [{ type: "text", id: "t2", text: "Now the check:" }, { type: "tool-plot", toolCallId: "plot" }, { type: "tool-quiz", toolCallId: "q1" }] },
		{ role: "assistant", parts: [{ type: "reasoning" }, { type: "text", id: "blank", text: " \n" }, { type: "tool-problem", toolCallId: "p1" }] },
	];
	it("skips tool rows between the paragraph and the check", () => assert.equal(checkAnchorPartId(messages, "q1"), "t2"));
	it("skips blank text and looks back into earlier assistant messages, never the learner's", () => assert.equal(checkAnchorPartId(messages, "p1"), "t2"));
	it("no paragraph before it: null (the thread anchors at its own slot)", () => assert.equal(checkAnchorPartId([{ role: "assistant", parts: [{ type: "tool-quiz", toolCallId: "x" }] }], "x"), null));
	it("finds the message holding the check (the windowing exemption)", () => assert.equal(checkMessageIndex(messages, "p1"), 3));
	it("a problem follows the tutor's latest reply after its pose (owner, 2026-11-11)", () => {
		const later = [...messages, { role: "user", parts: [{ type: "text", id: "u2", text: "x^3/2" }] }, { role: "assistant", parts: [{ type: "text", id: "hint", text: "Differentiate your answer." }] }];
		assert.equal(checkAnchorPartId(later, "p1", true), "hint");
		assert.equal(checkAnchorPartId(later, "p1", false), "t2");
		assert.equal(checkAnchorPartId(messages, "p1", true), "t2", "no reply yet: the pose's paragraph");
	});
});

describe("CheckThread faces", () => {
	it("collapsed: Your turn · kind, the teaser in the voice and Answer; the form stays mounted but hidden", () => {
		const html = thread();
		const { document } = parseHTML(html);
		const open = document.querySelector('[data-testid="question-dock-bar"]')!;
		assert.ok(open, "the whole collapsed line is one button");
		assert.equal(open.getAttribute("aria-expanded"), "false");
		assert.match(open.textContent!, /Your turn · Lesson check/);
		assert.match(open.textContent!, /Which planet is closest/);
		assert.match(open.textContent!, /Answer$/);
		const body = document.querySelector(".lh-check-body")!;
		assert.ok(body.hasAttribute("hidden") && body.hasAttribute("inert"), "closed: hidden and inert");
		assert.ok(body.querySelector("textarea"), "but the form is mounted, so a draft is never dropped");
		assert.equal(document.querySelector('[data-testid="check-thread"]')!.getAttribute("data-variant"), "inline");
	});
	it("a teach check before its reveal invites: Check your understanding", () => {
		const html = thread({ reveal: true });
		assert.match(html, /data-testid="teach-check-reveal"/);
		assert.ok(html.includes(REVEAL_LINE));
		assert.ok(!html.includes("question-dock-bar"));
	});
	it("open: the head with the collapse control, the question unfolding, Submit answer as the ink pill", () => {
		const html = thread({ open: true });
		const { document } = parseHTML(html);
		assert.ok(!document.querySelector('[data-testid="question-dock-bar"]'));
		assert.ok(document.querySelector('[aria-label="Collapse question"]'));
		const body = document.querySelector(".lh-check-body")!;
		assert.ok(!body.hasAttribute("hidden") && body.classList.contains("nb-unfold"));
		assert.ok(document.querySelector(".lh-check-prompt.nb-voice"), "the question is in the voice");
		assert.ok(document.querySelector('.nb-option-card[role="radio"]'), "choices are Notebook's option cards");
		assert.equal(document.querySelector("button.nb-pill")!.textContent, "Submit answer");
		assert.ok(!html.includes("innermost"), "no explanation or correct answer before answering");
	});
	it("problems: Problem · teaser · Solve, and Skip beside Submit when open", () => {
		const child = <PracticeDock problemCallId="p1" statement="Prove the parity claim." active onSkip={() => {}} onSubmit={() => {}} />;
		const collapsed = thread({ id: "p1", kind: "problem", label: "Problem", teaser: "Prove the parity claim." }, child);
		assert.match(collapsed, /data-testid="practice-dock-bar"/);
		assert.match(collapsed, />Solve</);
		const open = thread({ id: "p1", kind: "problem", label: "Problem", open: true }, child);
		assert.match(open, /aria-label="Collapse problem"/);
		assert.ok(open.indexOf('data-testid="practice-skip"') < open.indexOf('data-testid="practice-send"'));
	});
	it("the Using line sits in the thread", () => {
		const html = thread({ using: <p className="question-demo-reference">Using Gradient descent</p> });
		assert.match(html, /question-demo-reference">Using Gradient descent/);
	});
	it("margin variant with no layer yet renders only its slot (the thread is portalled beside the column)", () => {
		const html = thread({ variant: "margin" });
		assert.match(html, /data-check-slot="q1"/);
		assert.ok(!html.includes('data-testid="check-thread"'));
	});
});

describe("storage keys stay bare inside the transcript part scope", () => {
	const roots: Root[] = [];
	afterEach(async () => {
		for (const root of roots.splice(0)) await act(async () => root.unmount());
		document.body.replaceChildren();
	});
	it("question and problem drafts write question/<id>/… and problem/<id>/…, never under the part key", async () => {
		saved.clear();
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		roots.push(root);
		await act(async () => root.render(
			<SessionAccountProvider account="a">
				<SessionStateProvider chatId="c1">
					<SessionPartState id="message-1">
						<SessionPartState id="part-7">
							<SessionPartState id="">
								<CheckThread {...base} open>
									<QuestionDock toolName="quiz" toolCallId="q1" input={quiz} active onSubmit={() => {}} />
								</CheckThread>
								<CheckThread {...base} id="p1" kind="problem" label="Problem" open>
									<PracticeDock problemCallId="p1" statement="S." active onSubmit={() => {}} />
								</CheckThread>
							</SessionPartState>
						</SessionPartState>
					</SessionPartState>
				</SessionStateProvider>
			</SessionAccountProvider>,
		));
		await act(async () => { (host.querySelector('[data-kbdrow="0"]') as HTMLButtonElement).click(); });
		const field = host.querySelector('[data-testid="practice-thinking-field"] textarea') as HTMLTextAreaElement;
		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
			setter ? setter.call(field, "my trace") : (field.value = "my trace");
			field.dispatchEvent(new window.Event("input", { bubbles: true }));
		});
		await act(async () => root.unmount());
		roots.pop();
		const keys = [...saved.values()].flatMap((raw) => Object.keys((JSON.parse(raw) as { values: Record<string, unknown> }).values));
		assert.ok(keys.includes("question/q1/selection"), `bare question key: ${keys.join(", ")}`);
		assert.ok(keys.every((key) => !key.startsWith("message-1") && !key.startsWith("part-7")), "no part scope in the keys");
	});

	it("a closed thread holding a draft says Draft kept after the teaser; an empty one says nothing", async () => {
		saved.clear();
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		roots.push(root);
		const render = (open: boolean) => root.render(
			<SessionAccountProvider account="a">
				<SessionStateProvider chatId="c2">
					<SessionPartState id="">
						<CheckThread {...base} open={open}>
							<QuestionDock toolName="quiz" toolCallId="q1" input={quiz} active={open} onSubmit={() => {}} />
						</CheckThread>
						<CheckThread {...base} id="p1" kind="problem" label="Problem" open={false}>
							<PracticeDock problemCallId="p1" statement="S." active={false} onSubmit={() => {}} />
						</CheckThread>
					</SessionPartState>
				</SessionStateProvider>
			</SessionAccountProvider>,
		);
		await act(async () => render(false));
		assert.ok(!host.textContent?.includes(DRAFT_KEPT), "empty drafts say nothing");
		await act(async () => render(true));
		await act(async () => { (host.querySelector('[data-kbdrow="0"]') as HTMLButtonElement).click(); });
		await act(async () => render(false));
		const question = host.querySelector('[data-check="q1"] .lh-check-open')!;
		const draft = question.querySelector('[data-testid="check-draft-kept"]');
		assert.equal(draft?.textContent, DRAFT_KEPT);
		assert.equal(draft?.previousElementSibling?.className.includes("lh-check-teaser"), true, "after the teaser");
		assert.ok(!host.querySelector('[data-check="p1"] [data-testid="check-draft-kept"]'), "the untouched problem says nothing");
		await act(async () => root.unmount());
		roots.pop();
	});
});
