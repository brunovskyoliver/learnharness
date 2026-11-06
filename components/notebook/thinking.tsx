"use client";

/**
 * Everything the AI draws on one note (feature 024, US2): it keeps the
 * editor's passage marks in step with the note's open threads (anchors
 * resolved against the text he sees, research R5), runs "Thinks with you"
 * (use-reading), and lays out, over the column, the reading marks, the
 * margin notes with their tethers and the inline replies. Nothing here
 * writes to his page.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { effectiveLayout, firstWords, visibleThreads, type NoteCompanion, type NoteMode, type NotebookLayout, type NotebookPace, type NotebookThread } from "@/src/core";
import { ReadingMarks } from "./blot";
import { InlineReplies } from "./inline-reply";
import { Margin, rangeLines } from "./margin";
import { readingHoldMs, type PassageLine } from "./nb-geometry";
import { anchorRange, quoteRange, type AnchorMark, type NoteBridge } from "./nb-plugins";
import { useNotebook } from "./nb-shared";
import { useLayoutTick } from "./use-layout-tick";
import { useReading } from "./use-reading";

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

export function NoteThinking({ bridge, column, pageId, companion, mode, pace, layout, readOnly }: {
	bridge: NoteBridge;
	column: HTMLElement | null;
	pageId: string;
	companion: NoteCompanion | null;
	mode: NoteMode;
	pace: NotebookPace;
	layout: NotebookLayout;
	readOnly: boolean;
}) {
	const { announce } = useNotebook();
	const tick = useLayoutTick(bridge, column);
	const width = useViewportWidth();
	const shownLayout = effectiveLayout(layout, width);
	const columnRef = useRef(column);
	columnRef.current = column;

	const { live, fresh } = useReading({
		bridge,
		pageId,
		enabled: mode === "thinks" && !readOnly && companion !== null,
		pace,
		seenHash: companion?.readCursor?.textHash,
		holdFor: (quote) => {
			const view = bridge.view, text = bridge.text(), col = columnRef.current;
			const range = text ? quoteRange(text, quote) : null;
			if (!view || !range || !col) return 0;
			return readingHoldMs(rangeLines(view, range.from, range.to, col.getBoundingClientRect()));
		},
	});

	// Threads a running read wrote stay back until its marks have had their moment.
	const threads = useMemo(() => {
		const open = companion ? visibleThreads(companion) : [];
		if (!live) return open;
		return open.filter((t) => fresh.has(t.id) || t.messages[0]?.runId !== live.runId);
	}, [companion, live, fresh]);

	// Passage marks: matched against the text he sees after each pause in typing.
	const [anchored, setAnchored] = useState<ReadonlySet<string>>(() => new Set());
	const threadsRef = useRef(threads);
	threadsRef.current = threads;
	useEffect(() => {
		let timer = 0;
		const resolve = () => {
			const text = bridge.text();
			if (!text) return;
			const marks: AnchorMark[] = [];
			for (const thread of threadsRef.current) {
				const range = anchorRange(text, thread.anchor);
				if (range) marks.push({ id: thread.id, ...range, state: "open", kind: thread.placement });
			}
			bridge.setDecor({ anchors: marks });
			const ids = new Set(marks.map((m) => m.id));
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
	}, [bridge, threads]);

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
	const [lines, setLines] = useState<PassageLine[]>([]);
	useLayoutEffect(() => {
		const view = bridge.view, text = bridge.text();
		const range = live?.quote && text ? quoteRange(text, live.quote) : null;
		const next = view && range && column ? rangeLines(view, range.from, range.to, column.getBoundingClientRect()) : [];
		setLines((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
	}, [bridge, column, live?.quote, tick]);

	const margin: NotebookThread[] = [];
	const inline: NotebookThread[] = [];
	for (const thread of threads) {
		if (thread.placement === "inline" && anchored.has(thread.id)) inline.push(thread);
		else margin.push(thread);
	}

	return (
		<div className="nb-thinking" data-layout={shownLayout}>
			{live?.quote && <ReadingMarks lines={lines} leaving={live.leaving} />}
			<Margin bridge={bridge} column={column} threads={margin} layout={shownLayout} fresh={fresh} tick={tick} />
			<InlineReplies bridge={bridge} column={column} threads={inline} fresh={fresh} tick={tick} />
		</div>
	);
}
