"use client";

/**
 * Everything the AI draws on one note (feature 024, US2): it keeps the
 * editor's passage marks in step with the note's open threads (anchors
 * resolved against the text he sees, research R5), runs "Thinks with you"
 * (use-reading), and lays out, over the column, the reading marks, the
 * margin notes with their tethers and the inline replies, and runs the
 * threads (US3: open, write back, resolve, dismiss; Marks only; the
 * keyboard path between notes). Nothing here writes to his page.
 */
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@tiptap/pm/view";
import { anchorForSpan, effectiveLayout, firstWords, type NoteCompanion, type NoteMode, type NotebookLayout, type NotebookPace, type NotebookThread } from "@/src/core";
import { ReadingMarks } from "./blot";
import { InlineReplies } from "./inline-reply";
import { Margin, rangeLines } from "./margin";
import { marginWidths, readingHoldMs, type PassageLine } from "./nb-geometry";
import { flashcardsHref } from "./nb-actions";
import { anchorRange, quoteRange, rangeText, type AnchorMark, type NoteBridge, type QuestionMark } from "./nb-plugins";
import { useNotebook } from "./nb-shared";
import { useLayoutTick } from "./use-layout-tick";
import { useReading } from "./use-reading";
import { useRunStream } from "./use-run-stream";
import { useSelectionRuns } from "./use-selection-runs";
import { ASK_ID, focusPassage, ThreadsContext, useThreadsController, type ThreadsApi } from "./use-threads";

/** Anchors are matched again this long after typing stops (positions map through edits meanwhile). */
const RESOLVE_DELAY_MS = 150;

function useViewportWidth(): number {
	const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
	useEffect(() => {
		const sync = () => setWidth(window.innerWidth);
		sync();
		window.addEventListener("resize", sync);
		return () => window.removeEventListener("resize", sync);
	}, []);
	return width;
}

/** Follows a Think or Visualize run until its thread lands. */
function PassageFollower({ runId, onEnd }: { runId: string; onEnd: (outcome: { threadId?: string } | "failed" | "gone") => void }) {
	useRunStream(runId, {
		done: (d) => onEnd({ ...(d.threadId ? { threadId: d.threadId } : {}) }),
		failed: () => onEnd("failed"),
		stopped: () => onEnd("gone"),
		lost: () => onEnd("gone"),
	});
	return null;
}

/** Follows one reply run's stream into the thread it answers in. */
function RunFollower({ runId, follow }: { runId: string; follow: ReturnType<typeof useThreadsController>["follow"] }) {
	useRunStream(runId, {
		delta: (d) => follow.delta(runId, d.messageId, d.text),
		done: () => follow.end(runId, "done"),
		failed: (d) => follow.end(runId, "failed", d.detail ?? d.error),
		stopped: () => follow.end(runId, "stopped"),
		lost: () => follow.end(runId, "lost"),
	});
	return null;
}

/** "Open question about “…”": the Marks only button's name (ui-contract). */
export const markLabel = (quote: string): string => `Open question about “${firstWords(quote)}”`;

/** The caret as the browser has it (the editor's state may not have read a click yet). */
function caretPos(view: EditorView): number {
	const selection = window.getSelection();
	try {
		if (selection?.anchorNode && view.dom.contains(selection.anchorNode)) return view.posAtDOM(selection.anchorNode, selection.anchorOffset);
	} catch {
		/* fall back to the editor's own selection */
	}
	return view.state.selection.from;
}

/** Mod+Alt+↓ / ↑ (⌘⌥ on a Mac): the keyboard path between the body and the notes. */
const isNoteKey = (event: KeyboardEvent, mac: boolean) =>
	(event.key === "ArrowDown" || event.key === "ArrowUp") && event.altKey && !event.shiftKey && (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

export function NoteThinking({ bridge, column, pageId, companion, reload, mode, pace, layout, readOnly, plain = false }: {
	bridge: NoteBridge;
	column: HTMLElement | null;
	pageId: string;
	companion: NoteCompanion | null;
	reload: () => void;
	mode: NoteMode;
	pace: NotebookPace;
	layout: NotebookLayout;
	readOnly: boolean;
	/** Just my words (US7): nothing the AI wrote shows, and no automatic read starts (nothing would be seen). */
	plain?: boolean;
}) {
	const { announce, mac } = useNotebook();
	const tick = useLayoutTick(bridge, column);
	const width = useViewportWidth();
	// With no margin wide enough for a note, questions become marks too.
	const [noRoom, setNoRoom] = useState(false);
	useLayoutEffect(() => {
		if (!column) return;
		const rect = column.getBoundingClientRect();
		const widths = marginWidths({ columnLeft: rect.left, columnWidth: rect.width, viewportWidth: document.documentElement.clientWidth });
		setNoRoom(widths.left === null && widths.right === null);
	}, [column, tick, width]);
	const shownLayout: NotebookLayout = noRoom ? "marks" : effectiveLayout(layout, width);
	const plainRef = useRef(plain);
	plainRef.current = plain;
	const columnRef = useRef(column);
	columnRef.current = column;

	const { live, fresh: freshRead } = useReading({
		bridge,
		pageId,
		enabled: mode === "thinks" && !readOnly && !plain && companion !== null,
		pace,
		seenHash: companion?.readCursor?.textHash,
		holdFor: (quote) => {
			const view = bridge.view, text = bridge.text(), col = columnRef.current;
			const range = text ? quoteRange(text, quote) : null;
			if (!view || !range || !col) return 0;
			return readingHoldMs(rangeLines(view, range.from, range.to, col.getBoundingClientRect()));
		},
	});

	const stored = useMemo(() => companion?.threads ?? [], [companion]);
	const { api, statusOf, runs, created, follow } = useThreadsController({ bridge, pageId, threads: stored, reload });
	const apiRef = useRef<ThreadsApi>(api);
	apiRef.current = api;
	// His asked threads show before the companion reloads with them.
	const all = useMemo(() => (created.length ? [...stored, ...created.filter((c) => !stored.some((t) => t.id === c.id))] : stored), [stored, created]);

	// The selection menu's actions (US4).
	const router = useRouter();
	const passage = useSelectionRuns({ pageId, noteText: () => bridge.text()?.text ?? "", reload });
	const passageRef = useRef(passage);
	passageRef.current = passage;
	useEffect(() => {
		if (readOnly) return;
		bridge.selectionAction = (action, range) => {
			if (action === "flashcards") { router.push(flashcardsHref(pageId)); return; }
			const text = bridge.text();
			const span = text ? rangeText(text, range.from, range.to) : null;
			if (!text || !span) return;
			const anchor = anchorForSpan(text.text, span.start, span.end);
			if (action === "ask") apiRef.current.ask(anchor);
			else void passageRef.current.start(action, anchor);
		};
		return () => { bridge.selectionAction = null; };
	}, [bridge, pageId, router, readOnly]);
	const { shown: passageShown } = passage;
	useEffect(() => { passageShown(new Set(all.map((t) => t.id))); }, [all, passageShown]);
	const fresh = useMemo<ReadonlySet<string>>(() => (passage.fresh.size ? new Set([...freshRead, ...passage.fresh]) : freshRead), [freshRead, passage.fresh]);
	// "Ask about this" before he sends: a thread on this screen only.
	const askThread = useMemo<NotebookThread | null>(() => (api.asking
		? { id: ASK_ID, anchor: api.asking, placement: "margin", side: "right", status: "open", origin: "ask", createdAt: "", updatedAt: "", messages: [] }
		: null), [api.asking]);
	const pendingRuns = passage.runs;

	// Open threads; ones a running read wrote stay back until its marks have had their moment.
	const threads = useMemo(() => {
		const open = all.filter((t) => statusOf(t) === "open" && !api.leaving(t.id));
		if (askThread) open.push(askThread);
		if (!live) return open;
		return open.filter((t) => fresh.has(t.id) || t.messages[0]?.runId !== live.runId);
	}, [all, statusOf, api, live, fresh, askThread]);
	// Resolved or dismissed a moment ago: their status line holds the place for the Undo.
	const leaving = useMemo(() => all.filter((t) => api.leaving(t.id)), [all, api]);
	const openId = api.openId;
	// A thread that left (or was never there) can't stay open.
	useEffect(() => {
		if (openId && !threads.some((t) => t.id === openId)) apiRef.current.collapse(false);
	}, [openId, threads]);

	// Passage marks: matched against the text he sees after each pause in typing.
	const [anchored, setAnchored] = useState<ReadonlySet<string>>(() => new Set());
	const threadsRef = useRef({ threads, leaving, openId, layout: shownLayout, fresh, pendingRuns });
	threadsRef.current = { threads, leaving, openId, layout: shownLayout, fresh, pendingRuns };
	useEffect(() => {
		let timer = 0;
		const resolve = () => {
			// Just my words: no underline, wash, "?" or spacer in his text.
			if (plain) { bridge.setDecor({ anchors: [], marks: [], asking: null }); return; }
			const text = bridge.text();
			if (!text) return;
			const { threads: shown, leaving: gone, openId: open, layout: now, fresh: wet, pendingRuns: pending } = threadsRef.current;
			const anchors: AnchorMark[] = [];
			const marks: QuestionMark[] = [];
			let asking: { from: number; to: number } | null = null;
			// A run on a passage keeps a hidden anchor: its marks follow the words while he types.
			for (const run of pending) {
				const range = anchorRange(text, run.anchor);
				if (range) anchors.push({ id: run.key, ...range, state: "open", kind: run.kind === "visualize" ? "inline" : "margin", hidden: true });
			}
			for (const thread of [...shown, ...gone]) {
				const range = anchorRange(text, thread.anchor);
				if (!range) continue;
				// The passage he is asking about takes the asking wash, not a thread's underline.
				if (thread.id === ASK_ID) asking = range;
				const hidden = gone.includes(thread) || thread.id === ASK_ID;
				anchors.push({ id: thread.id, ...range, state: "open", kind: thread.placement, ...(thread.id === open ? { active: true } : {}), ...(hidden ? { hidden } : {}) });
				if (now === "marks" && thread.placement === "margin" && !hidden && thread.id !== ASK_ID) {
					marks.push({ id: thread.id, pos: range.to, label: markLabel(thread.anchor.quote), open: thread.id === open, fresh: wet.has(thread.id) });
				}
			}
			bridge.setDecor({ anchors, marks, asking });
			const ids = new Set(anchors.map((m) => m.id));
			setAnchored((prev) => (prev.size === ids.size && [...ids].every((id) => prev.has(id)) ? prev : ids));
		};
		resolve();
		const off = bridge.subscribe((event) => {
			if (event === "view") resolve();
			if (event !== "doc") return;
			window.clearTimeout(timer);
			timer = window.setTimeout(resolve, RESOLVE_DELAY_MS);
		});
		return () => { off(); window.clearTimeout(timer); };
	}, [bridge, threads, leaving, openId, shownLayout, fresh, pendingRuns, plain]);
	// Turning Just my words on closes the open thread (its field would be hidden with it).
	useEffect(() => { if (plain && apiRef.current.openId) apiRef.current.collapse(false); }, [plain]);
	useEffect(() => () => bridge.setDecor({ anchors: [], marks: [], asking: null }), [bridge]);

	// The "?" marks open their thread under the paragraph.
	useEffect(() => {
		const dom = bridge.view?.dom;
		if (!dom) return;
		const click = (event: MouseEvent) => {
			const id = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".nb-mark[data-thread]")?.dataset.thread;
			if (!id) return;
			event.preventDefault();
			if (apiRef.current.openId === id) apiRef.current.collapse(true);
			else apiRef.current.open(id);
		};
		dom.addEventListener("click", click);
		return () => dom.removeEventListener("click", click);
	}, [bridge, tick]);

	// A click anywhere else closes the open thread (its passage, its "?" and its menu count as inside).
	useEffect(() => {
		if (!openId) return;
		const down = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target?.closest) return;
			if (target.closest(`[data-thread="${CSS.escape(openId)}"]`) || target.closest("[data-nb-thread-menu]")) return;
			apiRef.current.collapse(false);
		};
		document.addEventListener("pointerdown", down, true);
		return () => document.removeEventListener("pointerdown", down, true);
	}, [openId]);

	// Keyboard: Mod+Alt+↓/↑ between the body and the notes; Escape in the body closes the open thread.
	useEffect(() => {
		const entries = () => {
			const anchors = new Map((bridge.decor()?.anchors ?? []).map((a) => [a.id, a.from]));
			const byThread = new Map<string, { id: string; order: number; el: HTMLElement }>();
			for (const el of column?.querySelectorAll<HTMLElement>("[data-nb-entry]") ?? []) {
				const id = el.closest<HTMLElement>("[data-thread]")?.dataset.thread;
				if (!id) continue;
				const known = byThread.get(id);
				// One stop per thread: its field when open, else its button, else its mark.
				const rank = (e: HTMLElement) => (e.tagName === "TEXTAREA" ? 0 : e.classList.contains("nb-mark") ? 2 : 1);
				if (!known || rank(el) < rank(known.el)) byThread.set(id, { id, order: anchors.get(id) ?? -1, el });
			}
			return [...byThread.values()].sort((a, b) => a.order - b.order);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing) return;
			const view = bridge.view;
			const active = document.activeElement as HTMLElement | null;
			// Escape with the focus in the body (or nowhere) closes the open thread; inside it, the thread handles it.
			if (event.key === "Escape" && apiRef.current.openId && (!active || active === document.body || (view && view.dom.contains(active) && !active.closest(".nb-mark")))) {
				apiRef.current.collapse(!active || active === document.body);
				return;
			}
			if (!isNoteKey(event, mac) || !view || !active || plainRef.current) return;
			const list = entries();
			const inThread = active.closest<HTMLElement>("[data-thread]");
			const current = inThread && !active.classList.contains("nb-anchor") ? list.findIndex((e) => e.id === inThread.dataset.thread) : -1;
			const inBody = current < 0 && view.dom.contains(active);
			if (!inBody && current < 0) return;
			event.preventDefault();
			if (list.length === 0) return;
			const down = event.key === "ArrowDown";
			let target: (typeof list)[number] | undefined;
			if (inBody) {
				const caret = caretPos(view);
				target = down ? list.find((e) => e.order >= caret) ?? list.at(-1) : [...list].reverse().find((e) => e.order <= caret) ?? list[0];
			} else if (down) {
				target = list[current + 1];
			} else if (current === 0) {
				// Back to the body, at this note's passage.
				if (apiRef.current.openId) apiRef.current.collapse(false);
				if (!focusPassage(bridge, list[0]!.id)) view.focus();
				return;
			} else {
				target = list[current - 1];
			}
			if (!target) return;
			const go = (el: HTMLElement) => { el.focus(); el.scrollIntoView({ block: "nearest" }); };
			if (!apiRef.current.openId || apiRef.current.openId === target.id) { go(target.el); return; }
			apiRef.current.collapse(false);
			// The collapse re-renders; focus the target's button once it has.
			window.requestAnimationFrame(() => go((entries().find((e) => e.id === target.id) ?? target).el));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [bridge, column, mac]);

	// Say a new question once, when it shows.
	const announced = useRef(new Set<string>());
	useEffect(() => {
		for (const thread of threads) {
			if (!fresh.has(thread.id) || announced.current.has(thread.id)) continue;
			announced.current.add(thread.id);
			const words = firstWords(thread.messages[0]?.text ?? "");
			announce(thread.placement === "inline" ? `New note under the passage: ${words}` : `New question in the margin: ${words}`);
		}
	}, [threads, fresh, announce]);

	// The passage being read, as lines in the column.
	// A Think run from the selection menu shows the same marks on its passage until its note lands.
	const thinking = pendingRuns.find((r) => r.kind === "think" && !r.threadId) ?? null;
	const [lines, setLines] = useState<PassageLine[]>([]);
	useLayoutEffect(() => {
		const view = bridge.view, text = bridge.text();
		const range = live?.quote && text ? quoteRange(text, live.quote) : thinking && text ? anchorRange(text, thinking.anchor) : null;
		const next = view && range && column ? rangeLines(view, range.from, range.to, column.getBoundingClientRect()) : [];
		setLines((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
	}, [bridge, column, live?.quote, thinking, tick]);

	const margin: NotebookThread[] = [];
	const inline: NotebookThread[] = [];
	const detachedInline: NotebookThread[] = [];
	for (const thread of [...threads, ...leaving]) {
		const here = anchored.has(thread.id);
		if (thread.placement === "inline" && here) inline.push(thread);
		else if (shownLayout !== "marks") margin.push(thread);
		// Marks only: a thread shows under its paragraph while open (or leaving); with no passage, at the top.
		else if (!here) detachedInline.push(thread);
		else if (thread.id === openId || api.leaving(thread.id)) inline.push(thread);
	}

	return (
		<ThreadsContext.Provider value={api}>
			<div className="nb-thinking" data-layout={shownLayout} data-testid="nb-thinking" data-plain={plain ? "" : undefined}>
				{runs.map((run) => <RunFollower key={run.runId} runId={run.runId} follow={follow} />)}
				{pendingRuns.filter((r) => !r.threadId).map((run) => <PassageFollower key={run.key} runId={run.runId} onEnd={(outcome) => passageRef.current.settle(run.key, outcome)} />)}
				{!plain && (
					<>
						{(live?.quote || thinking) && <ReadingMarks lines={lines} leaving={live?.leaving ?? false} />}
						<Margin bridge={bridge} column={column} threads={margin} layout={shownLayout} fresh={fresh} tick={tick} />
						<InlineReplies bridge={bridge} column={column} threads={[...detachedInline, ...inline]} sketching={pendingRuns.filter((r) => r.kind === "visualize").map((r) => r.key)} anchored={anchored} fresh={fresh} tick={tick} />
					</>
				)}
			</div>
		</ThreadsContext.Provider>
	);
}
