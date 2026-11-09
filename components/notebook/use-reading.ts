"use client";

/**
 * "Thinks with you" (feature 024, US2): after a typing pause the note is
 * read once (ReadScheduler decides when), the run is followed over its
 * stream, and what it found is shown in order: the passage's pencil
 * underline and breathing blot first, then, once those have had their
 * moment (visual-reference §10.2), the question with its ink and tether.
 * Typing while it reads stops it; nothing it half-wrote lands. "When you
 * ask" never starts a read (constitution V). A refusal (no model, no key)
 * goes to the corner hint, not a toast.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { paceDelay, type NotebookPace } from "@/src/core";
import { startRead, stopRun } from "./nb-actions";
import type { NoteBridge } from "./nb-plugins";
import { useNotebook } from "./nb-shared";
import { ReadScheduler } from "./read-scheduler";
import { useRunStream, type RunPhase } from "./use-run-stream";

export interface LiveRead {
	runId: string;
	phase: RunPhase;
	/** The passage being considered, once the run names it. */
	quote: string | null;
	/** When the underline and blot appeared (performance.now()). */
	shownAt: number | null;
	/** The thread it wrote, held back until the reading marks have had their time. */
	threadId: string | null;
	/** The marks are fading out (the question is showing). */
	leaving: boolean;
}

/** The reading marks fade over 500ms and go after 520ms (§9.1). */
const LEAVE_MS = 520;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Focus where a read must wait: a thread field, the selection menu (later phases mark them). */
const focusHoldsReads = () => Boolean(document.activeElement?.closest("[data-nb-hold-reads]"));

export function useReading({ bridge, pageId, enabled, pace, seenHash, holdFor }: {
	bridge: NoteBridge;
	pageId: string;
	/** "Thinks with you", editable, companion writable. */
	enabled: boolean;
	pace: NotebookPace;
	/** The companion's read cursor: the text the last read saw. */
	seenHash: string | undefined;
	/** How long the reading marks stay for this passage (ms), measured by the caller. */
	holdFor: (quote: string) => number;
}): { live: LiveRead | null; fresh: ReadonlySet<string> } {
	const nb = useNotebook();
	const { setReading, announce } = nb;
	const [live, setLive] = useState<LiveRead | null>(null);
	const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
	const liveRef = useRef(live);
	liveRef.current = live;
	const options = useRef({ enabled, pace, holdFor });
	options.current = { enabled, pace, holdFor };
	const timers = useRef<number[]>([]);
	const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
	useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t); }, []);

	const end = useCallback(() => {
		setLive(null);
		setReading(null);
	}, [setReading]);

	const scheduler = useMemo(() => new ReadScheduler({
		delay: () => paceDelay(options.current.pace),
		enabled: () => options.current.enabled,
		text: () => bridge.text()?.text ?? "",
		held: focusHoldsReads,
		abort: (runId) => {
			void stopRun(runId);
			// What it was doing goes at once; the stream's "stopped" confirms.
			if (liveRef.current?.runId === runId) {
				setLive(null);
				setReading(null);
			}
		},
		start: (text) => {
			void startRead(pageId, text).then((outcome) => {
				if ("ok" in outcome) {
					scheduler.setRunning(outcome.ok.id);
					setLive({ runId: outcome.ok.id, phase: "reading", quote: null, shownAt: null, threadId: null, leaving: false });
					setReading({ state: "running", runId: outcome.ok.id, phase: "reading" });
				} else if ("refused" in outcome) {
					setReading({ state: "refused", ...outcome.refused });
				} else if ("error" in outcome) {
					setReading({ state: "failed", retry: () => scheduler.retry() });
				}
			});
		},
	}), [bridge, pageId, setReading]);

	useEffect(() => () => scheduler.dispose(), [scheduler]);
	useEffect(() => { scheduler.seen(seenHash); }, [scheduler, seenHash]);
	useEffect(() => { if (!enabled) scheduler.cancel(); }, [scheduler, enabled]);
	// A refusal or failure stays until reading is switched off or another read starts.
	useEffect(() => { if (!enabled) setReading(null); }, [enabled, setReading]);

	useEffect(() => bridge.subscribe((event) => {
		if (event === "edit") scheduler.edited();
		else if (event === "composition-start") scheduler.compositionStart();
		else if (event === "composition-end") scheduler.compositionEnd();
	}), [bridge, scheduler]);

	const release = useCallback((threadId: string) => {
		setFresh((current) => new Set([...current, threadId]));
		setLive((current) => (current && current.threadId === threadId ? { ...current, leaving: true } : current));
		later(() => setLive((current) => (current?.threadId === threadId ? null : current)), LEAVE_MS);
	}, [later]);

	useRunStream(live && !live.leaving ? live.runId : null, {
		phase: ({ phase, anchor }) => {
			setLive((current) => {
				if (!current) return current;
				const quote = anchor ?? current.quote;
				const shownAt = quote && current.shownAt === null ? performance.now() : current.shownAt;
				return { ...current, phase, quote, shownAt };
			});
			if (anchor && !liveRef.current?.quote) announce("Reading this passage.");
			const runId = liveRef.current?.runId;
			if (runId) setReading({ state: "running", runId, phase });
		},
		done: ({ status, threadId }) => {
			scheduler.setRunning(null);
			setReading(null);
			const current = liveRef.current;
			if (status === "silent" || !threadId || !current) { setLive(null); return; }
			const hold = reducedMotion() || !current.quote ? 0 : options.current.holdFor(current.quote);
			const waited = current.shownAt === null ? 0 : performance.now() - current.shownAt;
			setLive({ ...current, threadId });
			later(() => release(threadId), Math.max(0, hold - waited));
		},
		failed: () => {
			scheduler.setRunning(null);
			setLive(null);
			announce("That didn’t come through.");
			setReading({ state: "failed", retry: () => scheduler.retry() });
		},
		stopped: () => { scheduler.setRunning(null); end(); },
		lost: () => { scheduler.setRunning(null); end(); },
	});

	return { live, fresh };
}
