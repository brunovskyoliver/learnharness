"use client";

/**
 * Margin threads (feature 024, US3): which thread is open, what he is
 * writing back, his sent words until the companion shows them, the AI's
 * answers streaming in, Resolve / Dismiss with a 6 s Undo, and the
 * keyboard path between notes. Everything is written through the API
 * first (constitution III: his message is stored before the reply run
 * starts; a send that fails keeps his text in the field). Replies start
 * only when he sends, and a failure waits for his "Try again"
 * (constitution V: no automatic retry).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { TextSelection } from "@tiptap/pm/state";
import type { NotebookThread, ThreadMessage, ThreadStatus } from "@/src/core";
import { postThreadMessage, setThreadStatus, startReply } from "./nb-actions";
import type { NoteBridge } from "./nb-plugins";
import { useNotebook } from "./nb-shared";

/** The status line after Resolve or Dismiss stays this long with its Undo (ui-contract). */
export const UNDO_MS = 6000;

export const RESOLVED_LINE = "Resolved. It's still in exports.";
export const DISMISSED_LINE = "Dismissed.";
export const FAILED_LINE = "That didn't come through.";
export const STOPPED_LINE = "Stopped.";
export const REPLY_READY = "Reply ready.";

/** Something that went wrong in a thread, shown in place until he acts. */
export type ThreadProblem =
	| { kind: "send"; detail?: string }
	| { kind: "run"; detail?: string }
	| { kind: "refused"; reason: "models" | "key"; provider?: string };

export interface Leaving { thread: NotebookThread; status: "resolved" | "dismissed" }

export interface ThreadsApi {
	openId: string | null;
	/** The thread whose field takes focus on its next render (a nonce keeps repeats apart). */
	focusRequest: { id: string; n: number } | null;
	draft: (id: string) => string;
	setDraft: (id: string, text: string) => void;
	/** The thread's messages with his just-sent words that the companion doesn't show yet. */
	messages: (thread: NotebookThread) => ThreadMessage[];
	/** Text streamed so far for an answer still being written. */
	liveText: (messageId: string) => string | undefined;
	/** Words that arrived while he watched ink in. */
	inked: (messageId: string) => boolean;
	/** An answer has been asked for and nothing of it shows yet. */
	waiting: (threadId: string) => boolean;
	sending: (threadId: string) => boolean;
	problem: (threadId: string) => ThreadProblem | undefined;
	/** A streaming answer nobody is writing any more (its run is gone). */
	orphaned: (messageId: string) => boolean;
	detail: (messageId: string) => string | undefined;
	leaving: (threadId: string) => Leaving | undefined;
	open: (id: string, focusField?: boolean) => void;
	collapse: (returnFocus: boolean) => void;
	send: (id: string) => Promise<void>;
	retry: (id: string) => Promise<void>;
	setStatus: (thread: NotebookThread, status: "resolved" | "dismissed") => Promise<void>;
	undo: (id: string) => Promise<void>;
	copy: (thread: NotebookThread) => Promise<void>;
}

const noop = () => {};
const none = () => undefined;
export const ThreadsContext = createContext<ThreadsApi>({
	openId: null, focusRequest: null, draft: () => "", setDraft: noop, messages: (t) => t.messages, liveText: none, inked: () => false,
	waiting: () => false, sending: () => false, problem: none, orphaned: () => false, detail: none, leaving: none,
	open: noop, collapse: noop, send: async () => {}, retry: async () => {}, setStatus: async () => {}, undo: async () => {}, copy: async () => {},
});
export const useThreads = () => useContext(ThreadsContext);

/** A thread as plain text for "Copy text": each message a paragraph, his marked "You:". */
export const threadPlainText = (messages: readonly Pick<ThreadMessage, "author" | "text">[]): string =>
	messages.filter((m) => m.text.trim()).map((m) => (m.author === "user" ? `You: ${m.text.trim()}` : m.text.trim())).join("\n\n");

const DRAFT_KEY = (id: string) => `lh.nb.draft.${id}`;
const readDraft = (id: string): string => {
	try { return window.localStorage.getItem(DRAFT_KEY(id)) ?? ""; } catch { return ""; }
};
const writeDraft = (id: string, text: string) => {
	try {
		if (text) window.localStorage.setItem(DRAFT_KEY(id), text);
		else window.localStorage.removeItem(DRAFT_KEY(id));
	} catch {
		/* the draft stays in memory */
	}
};

/** Puts the caret at the start of a thread's passage (Escape's way back). False when its words are gone. */
export function focusPassage(bridge: NoteBridge, id: string): boolean {
	const view = bridge.view;
	const anchor = bridge.decor()?.anchors.find((a) => a.id === id);
	if (!view || view.isDestroyed || !anchor) return false;
	try {
		const $pos = view.state.doc.resolve(Math.min(anchor.from, view.state.doc.content.size));
		view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)).scrollIntoView().setMeta("addToHistory", false));
		view.focus();
		return true;
	} catch {
		return false;
	}
}

/** Each run being followed, with the thread it answers in. */
export interface FollowedRun { runId: string; threadId: string }

export function useThreadsController({ bridge, pageId, threads, reload }: {
	bridge: NoteBridge;
	pageId: string;
	/** Every thread of the companion (all statuses). */
	threads: readonly NotebookThread[];
	reload: () => void;
}): { api: ThreadsApi; statusOf: (thread: NotebookThread) => ThreadStatus; runs: FollowedRun[]; follow: { delta: (runId: string, messageId: string, text: string) => void; end: (runId: string, outcome: "done" | "failed" | "stopped" | "lost", detail?: string) => void } } {
	const { announce } = useNotebook();
	const [openId, setOpenId] = useState<string | null>(null);
	const [focusRequest, setFocusRequest] = useState<{ id: string; n: number } | null>(null);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [sent, setSent] = useState<Record<string, ThreadMessage[]>>({});
	const [started, setStarted] = useState<Record<string, string>>({});
	const [streamed, setStreamed] = useState<Record<string, string>>({});
	const [inkedIds, setInkedIds] = useState<ReadonlySet<string>>(() => new Set());
	const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
	const [problems, setProblems] = useState<Record<string, ThreadProblem>>({});
	const [details, setDetails] = useState<Record<string, string>>({});
	const [lost, setLost] = useState<ReadonlySet<string>>(() => new Set());
	const [overrides, setOverrides] = useState<Record<string, ThreadStatus>>({});
	const [leavingMap, setLeavingMap] = useState<Record<string, Leaving>>({});
	const timers = useRef(new Map<string, number>());
	const runMessage = useRef(new Map<string, string>());
	const threadsRef = useRef(threads);
	threadsRef.current = threads;
	const draftsRef = useRef(drafts);
	draftsRef.current = drafts;
	useEffect(() => () => { for (const t of timers.current.values()) window.clearTimeout(t); }, []);

	// A status the companion now agrees with needs no override; his sent words it shows need no copy.
	useEffect(() => {
		setOverrides((prev) => {
			const next = { ...prev };
			let changed = false;
			for (const [id, status] of Object.entries(prev)) {
				const thread = threads.find((t) => t.id === id);
				if (!thread || thread.status === status) { delete next[id]; changed = true; }
			}
			return changed ? next : prev;
		});
		setSent((prev) => {
			let changed = false;
			const next: Record<string, ThreadMessage[]> = {};
			for (const [id, list] of Object.entries(prev)) {
				const known = new Set(threads.find((t) => t.id === id)?.messages.map((m) => m.id) ?? []);
				const kept = list.filter((m) => !known.has(m.id));
				if (kept.length !== list.length) changed = true;
				if (kept.length) next[id] = kept;
			}
			return changed ? next : prev;
		});
	}, [threads]);

	const statusOf = useCallback((thread: NotebookThread): ThreadStatus => overrides[thread.id] ?? thread.status, [overrides]);

	// The runs to follow: ones he just started, and answers the companion says are still being written.
	const runs = useMemo(() => {
		const out = new Map<string, string>();
		for (const [threadId, runId] of Object.entries(started)) out.set(runId, threadId);
		for (const thread of threads) {
			for (const m of thread.messages) {
				if (m.author === "ai" && m.state === "streaming" && m.runId && !lost.has(m.id)) out.set(m.runId, thread.id);
			}
		}
		return [...out].map(([runId, threadId]) => ({ runId, threadId }));
	}, [started, threads, lost]);
	const runsRef = useRef(runs);
	runsRef.current = runs;

	const passageFocus = useCallback((id: string) => focusPassage(bridge, id), [bridge]);

	const open = useCallback((id: string, focusField = true) => {
		setOpenId(id);
		if (!drafts[id]) {
			const stored = readDraft(id);
			if (stored) setDrafts((d) => ({ ...d, [id]: stored }));
		}
		if (focusField) setFocusRequest((r) => ({ id, n: (r?.n ?? 0) + 1 }));
	}, [drafts]);

	const openRef = useRef(openId);
	openRef.current = openId;
	const collapse = useCallback((returnFocus: boolean) => {
		const id = openRef.current;
		setOpenId(null);
		if (!id || !returnFocus) return;
		if (passageFocus(id)) return;
		// No passage (its words are gone): back to the thread's own button.
		window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-thread="${CSS.escape(id)}"] [data-nb-entry]`)?.focus());
	}, [passageFocus]);

	const setDraft = useCallback((id: string, text: string) => {
		setDrafts((d) => ({ ...d, [id]: text }));
		writeDraft(id, text);
	}, []);

	const mark = <T,>(set: Dispatch<SetStateAction<Record<string, T>>>, id: string, value: T | undefined) =>
		set((prev) => {
			const next = { ...prev };
			if (value === undefined) delete next[id];
			else next[id] = value;
			return next;
		});
	const flag = (set: Dispatch<SetStateAction<ReadonlySet<string>>>, id: string, on: boolean) =>
		set((prev) => {
			if (prev.has(id) === on) return prev;
			const next = new Set(prev);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});

	const begin = useCallback(async (threadId: string) => {
		mark(setProblems, threadId, undefined);
		const outcome = await startReply(pageId, threadId, bridge.text()?.text ?? "");
		if ("ok" in outcome) {
			mark(setStarted, threadId, outcome.ok.id);
			reload();
			return;
		}
		if ("refused" in outcome) mark<ThreadProblem>(setProblems, threadId, { kind: "refused", ...outcome.refused });
		else mark<ThreadProblem>(setProblems, threadId, { kind: "run", ...("error" in outcome ? { detail: outcome.error } : {}) });
		announce(FAILED_LINE);
		reload();
	}, [pageId, bridge, reload, announce]);

	const send = useCallback(async (threadId: string) => {
		const text = (draftsRef.current[threadId] ?? "").trim();
		if (!text) return;
		flag(setBusy, threadId, true);
		mark(setProblems, threadId, undefined);
		const posted = await postThreadMessage(pageId, threadId, text);
		if ("error" in posted) {
			// His words stay in the field (constitution III).
			mark<ThreadProblem>(setProblems, threadId, { kind: "send", detail: posted.error });
			flag(setBusy, threadId, false);
			announce(FAILED_LINE);
			return;
		}
		setSent((prev) => ({ ...prev, [threadId]: [...(prev[threadId] ?? []), { id: posted.ok.id, author: "user", text, at: new Date().toISOString() }] }));
		setDraft(threadId, "");
		await begin(threadId);
		flag(setBusy, threadId, false);
	}, [pageId, begin, setDraft, announce]);

	const retry = useCallback(async (threadId: string) => {
		const problem = problems[threadId];
		if (problem?.kind === "send") return send(threadId);
		flag(setBusy, threadId, true);
		await begin(threadId);
		flag(setBusy, threadId, false);
	}, [problems, send, begin]);

	const setStatus = useCallback(async (thread: NotebookThread, status: "resolved" | "dismissed") => {
		const id = thread.id;
		if (openRef.current === id) setOpenId(null);
		mark<ThreadStatus>(setOverrides, id, status);
		mark(setLeavingMap, id, { thread, status });
		announce(status === "resolved" ? RESOLVED_LINE : DISMISSED_LINE);
		window.clearTimeout(timers.current.get(id));
		timers.current.set(id, window.setTimeout(() => {
			timers.current.delete(id);
			const focused = document.activeElement?.closest(`[data-thread="${CSS.escape(id)}"]`);
			mark(setLeavingMap, id, undefined);
			if (focused && !passageFocus(id)) bridge.view?.focus();
		}, UNDO_MS));
		// Focus stays near: on the Undo in the status line.
		window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-thread="${CSS.escape(id)}"] [data-nb-undo]`)?.focus());
		if (!(await setThreadStatus(pageId, id, status))) {
			window.clearTimeout(timers.current.get(id));
			mark(setOverrides, id, undefined);
			mark(setLeavingMap, id, undefined);
			announce(FAILED_LINE);
		}
	}, [pageId, announce, passageFocus, bridge]);

	const undo = useCallback(async (id: string) => {
		window.clearTimeout(timers.current.get(id));
		timers.current.delete(id);
		mark(setLeavingMap, id, undefined);
		mark<ThreadStatus>(setOverrides, id, "open");
		window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-thread="${CSS.escape(id)}"] [data-nb-entry]`)?.focus());
		if (!(await setThreadStatus(pageId, id, "open"))) {
			mark(setOverrides, id, undefined);
			announce(FAILED_LINE);
		}
	}, [pageId, announce]);

	const copy = useCallback(async (thread: NotebookThread) => {
		try {
			await navigator.clipboard.writeText(threadPlainText([...thread.messages, ...(sent[thread.id] ?? [])]));
			announce("Copied.");
		} catch {
			announce("Couldn't copy.");
		}
	}, [sent, announce]);

	const follow = useMemo(() => ({
		delta: (runId: string, messageId: string, text: string) => {
			runMessage.current.set(runId, messageId);
			setStreamed((prev) => ({ ...prev, [messageId]: (prev[messageId] ?? "") + text }));
			setInkedIds((prev) => (prev.has(messageId) ? prev : new Set(prev).add(messageId)));
		},
		end: (runId: string, outcome: "done" | "failed" | "stopped" | "lost", detail?: string) => {
			const threadId = runsRef.current.find((r) => r.runId === runId)?.threadId;
			if (threadId) setStarted((prev) => {
				if (prev[threadId] !== runId) return prev;
				const next = { ...prev };
				delete next[threadId];
				return next;
			});
			const messageId = runMessage.current.get(runId)
				?? threadsRef.current.flatMap((t) => t.messages).find((m) => m.runId === runId)?.id;
			if (outcome === "done") announce(REPLY_READY);
			if (outcome === "failed") {
				if (messageId && detail) setDetails((prev) => ({ ...prev, [messageId]: detail }));
				announce(FAILED_LINE);
			}
			if (outcome === "lost" && messageId) setLost((prev) => new Set(prev).add(messageId));
			reload();
		},
	}), [announce, reload]);

	const api = useMemo<ThreadsApi>(() => ({
		openId,
		focusRequest,
		draft: (id) => drafts[id] ?? "",
		setDraft,
		messages: (thread) => {
			const extra = (sent[thread.id] ?? []).filter((m) => !thread.messages.some((k) => k.id === m.id));
			return extra.length ? [...thread.messages, ...extra] : thread.messages;
		},
		liveText: (id) => streamed[id],
		inked: (id) => inkedIds.has(id),
		waiting: (threadId) => {
			const thread = threads.find((t) => t.id === threadId);
			const last = thread?.messages.at(-1);
			const writing = last?.author === "ai" && last.state === "streaming";
			return Boolean(started[threadId]) && !writing;
		},
		sending: (threadId) => busy.has(threadId),
		problem: (threadId) => problems[threadId],
		orphaned: (id) => lost.has(id),
		detail: (id) => details[id],
		leaving: (id) => leavingMap[id],
		open,
		collapse,
		send,
		retry,
		setStatus,
		undo,
		copy,
	}), [openId, focusRequest, drafts, setDraft, sent, streamed, inkedIds, threads, started, busy, problems, lost, details, leavingMap, open, collapse, send, retry, setStatus, undo, copy]);

	return { api, statusOf, runs, follow };
}
