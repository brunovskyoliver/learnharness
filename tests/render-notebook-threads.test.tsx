/** Notebook's margin threads (feature 024, US3; ui-contract "Reading and threads"). */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { NotebookThread, ThreadMessage } from "../src/core/index.ts";
import { Thread } from "../components/notebook/thread.tsx";
import { markLabel } from "../components/notebook/thinking.tsx";
import { ThreadsContext, threadPlainText, type ThreadsApi } from "../components/notebook/use-threads.ts";

const AT = "2026-11-06T10:00:00.000Z";
const msg = (id: string, author: "ai" | "user", text: string, extra: Partial<ThreadMessage> = {}): ThreadMessage => ({ id, author, text, at: AT, ...extra });
const thread = (messages: ThreadMessage[]): NotebookThread => ({
	id: "thr_1", anchor: { quote: "AI is making people dumber", prefix: "", suffix: "" }, placement: "margin", side: "left", status: "open", origin: "read",
	createdAt: AT, updatedAt: AT, messages,
});

const api = (patch: Partial<ThreadsApi> = {}): ThreadsApi => ({
	openId: null, focusRequest: null, draft: () => "", setDraft: () => {}, messages: (t) => t.messages, liveText: () => undefined, inked: () => false,
	waiting: () => false, sending: () => false, problem: () => undefined, orphaned: () => false, detail: () => undefined, leaving: () => undefined,
	open: () => {}, collapse: () => {}, send: async () => {}, retry: async () => {}, setStatus: async () => {}, undo: async () => {}, copy: async () => {},
	...patch,
});

const render = (t: NotebookThread, value: ThreadsApi, props: Partial<React.ComponentProps<typeof Thread>> = {}) =>
	renderToStaticMarkup(<ThreadsContext.Provider value={value}><Thread thread={t} variant="margin" side="left" fresh={false} detached={false} order={10} {...props} /></ThreadsContext.Provider>);

const QUESTION = "Doing less thinking isn't the same as becoming less capable of thinking. Which do you mean?";

describe("a collapsed thread", () => {
	it("is one button with the clamped question and its reply count", () => {
		const html = render(thread([msg("m1", "ai", QUESTION), msg("m2", "user", "The second."), msg("m3", "ai", "Then measure it.")]), api());
		assert.match(html, /data-state="collapsed"/);
		assert.match(html, /role="note"[^>]*aria-roledescription="note"[^>]*aria-label="Margin note"/);
		assert.match(html, /<button type="button" class="nb-thread-open" aria-expanded="false" data-nb-entry="" data-order="10"/);
		assert.match(html, /nb-note-text nb-voice nb-clamp/);
		assert.match(html, />2 replies</);
		assert.doesNotMatch(html, /Write back/);
		assert.match(html, /aria-label="More for this note"/);
	});

	it("says 1 reply, none for a lone question, and when its words are gone", () => {
		assert.match(render(thread([msg("m1", "ai", QUESTION), msg("m2", "user", "Hm.")]), api()), />1 reply</);
		assert.doesNotMatch(render(thread([msg("m1", "ai", QUESTION)]), api()), /repl/);
		assert.match(render(thread([msg("m1", "ai", QUESTION)]), api(), { detached: true }), /The words this was about are gone\./);
	});

	it("fades while another thread is open", () => {
		assert.match(render(thread([msg("m1", "ai", QUESTION)]), api({ openId: "thr_other" }), { faded: true }), /data-faded="true"/);
	});
});

describe("an open thread", () => {
	const open = api({ openId: "thr_1" });

	it("shows every message, his in sans, the field, Send, Resolve, Dismiss and ⋯", () => {
		const html = render(thread([msg("m1", "ai", QUESTION), msg("m2", "user", "The second."), msg("m3", "ai", "Then measure it.")]), open);
		assert.match(html, /data-state="open"/);
		assert.match(html, /data-nb-hold-reads=""/);
		assert.match(html, /class="nb-thread nb-unfold"/);
		assert.match(html, /class="nb-msg nb-msg-user" data-author="user"[^>]*>The second\.</);
		assert.equal((html.match(/data-author="ai"/g) ?? []).length, 2);
		assert.match(html, /class="nb-reply-line"><textarea[^>]*placeholder="Write back…"[^>]*aria-label="Write back"/);
		assert.match(html, /aria-label="Send"[^>]*aria-disabled="true"/);
		assert.match(html, />Resolve<\/button>/);
		assert.match(html, />Dismiss<\/button>/);
		assert.match(html, /nb-thread-more-end/);
		assert.match(html, /nb-thread-rail/);
	});

	it("an answer being written: the wait blot, then the streamed words inking in", () => {
		const t = thread([msg("m1", "ai", QUESTION), msg("m2", "user", "Why?"), msg("m3", "ai", "", { state: "streaming", runId: "nbr_1" })]);
		assert.match(render(t, open), /role="status" aria-label="Writing back" class="nb-ink-wait"/);
		const streaming = render(t, api({ openId: "thr_1", liveText: (id) => (id === "m3" ? "Heat leaves the cup." : undefined), inked: (id) => id === "m3" }));
		assert.match(streaming, /class="nb-ink-word"[^>]*>Heat </);
		assert.doesNotMatch(streaming, /Writing back/);
		// Asked for, nothing shown yet.
		assert.match(render(thread([msg("m1", "ai", QUESTION), msg("m2", "user", "Why?")]), api({ openId: "thr_1", waiting: () => true })), /Writing back/);
	});

	it("failed: says so in place with an explicit Try again and the details", () => {
		const t = thread([msg("m1", "ai", QUESTION), msg("m2", "user", "Why?"), msg("m3", "ai", "Heat", { state: "failed" })]);
		const html = render(t, api({ openId: "thr_1", detail: () => "upstream 500" }));
		assert.match(html, /data-state="failed"/);
		assert.match(html, />Heat</);
		assert.match(html, /That didn&#x27;t come through\./);
		assert.match(html, />Try again</);
		assert.match(html, />Show details</);
		// An answer whose run is gone reads as failed too.
		const orphan = thread([msg("m1", "ai", QUESTION), msg("m2", "user", "Why?"), msg("m3", "ai", "", { state: "streaming", runId: "nbr_x" })]);
		assert.match(render(orphan, api({ openId: "thr_1", orphaned: () => true })), /data-testid="nb-thread-failed"/);
	});

	it("stopped: the partial text, then Stopped.", () => {
		const html = render(thread([msg("m1", "ai", QUESTION), msg("m2", "user", "Why?"), msg("m3", "ai", "Heat leaves", { state: "stopped" })]), open);
		assert.match(html, />Heat leaves</);
		assert.match(html, />Stopped\.</);
		assert.doesNotMatch(html, /Try again/);
	});

	it("a send that failed keeps his words and offers Try again; a refusal says why", () => {
		const t = thread([msg("m1", "ai", QUESTION)]);
		const sent = render(t, api({ openId: "thr_1", draft: () => "My answer", problem: () => ({ kind: "send", detail: "offline" }) }));
		assert.match(sent, />My answer<\/textarea>/);
		assert.match(sent, /Your words are still in the field\./);
		assert.match(sent, />Try again</);
		const refused = render(t, api({ openId: "thr_1", problem: () => ({ kind: "refused", reason: "models" }) }));
		assert.match(refused, /No model set up\./);
		assert.match(refused, /Open Study&#x27;s settings/);
	});

	it("inline threads open the same way under their block", () => {
		const html = renderToStaticMarkup(<ThreadsContext.Provider value={open}><Thread thread={thread([msg("m1", "ai", QUESTION)])} variant="inline" fresh={false} detached={false} order={3} /></ThreadsContext.Provider>);
		assert.match(html, /class="nb-inline" data-state="open"/);
		assert.match(html, /aria-label="Note under the passage"/);
		assert.match(html, /placeholder="Write back…"/);
		assert.doesNotMatch(html, /nb-thread-rail/);
	});
});

describe("after Resolve or Dismiss", () => {
	it("a status line with Undo holds the thread's place", () => {
		const t = thread([msg("m1", "ai", QUESTION)]);
		const resolved = render(t, api({ leaving: () => ({ thread: t, status: "resolved" }) }));
		assert.match(resolved, /data-state="gone"/);
		assert.match(resolved, /Resolved\. It&#x27;s still in exports\./);
		assert.match(resolved, /data-nb-undo=""[^>]*>Undo</);
		assert.match(render(t, api({ leaving: () => ({ thread: t, status: "dismissed" }) })), />Dismissed\.</);
	});
});

describe("words", () => {
	it("Marks only names its ? by the passage's first words", () => {
		assert.equal(markLabel("college is becoming increasingly worthless with the advent of AI"), "Open question about “college is becoming increasingly worthless with…”");
		assert.equal(markLabel("AI is making people dumber"), "Open question about “AI is making people dumber”");
	});

	it("Copy text: each message a paragraph, his marked", () => {
		assert.equal(threadPlainText([{ author: "ai", text: "Why?" }, { author: "user", text: " Because. " }, { author: "ai", text: "" }]), "Why?\n\nYou: Because.");
	});
});
