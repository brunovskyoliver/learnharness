"use client";

/**
 * Margin notes (feature 024, US2, visual-reference §8, §11): each open
 * margin thread sits beside the first line of its passage. Both margins:
 * a thread keeps the side it was given (neighbours alternate), left notes
 * right-aligned hugging the column; Right margin: all on the right.
 * Collided notes settle as a packed cluster (nb-geometry placeStack). A
 * note that had to move gets a faint tether; a fresh note's tether draws
 * itself once. Threads whose words are gone stack at the top of the right
 * margin. Collapsed notes only here: expanding, writing back, resolving
 * and dismissing come with the thread view (Phase 5).
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { EditorView } from "@tiptap/pm/view";
import { replyCount, replyCountLabel, type NotebookLayout, type NotebookThread } from "@/src/core";
import { InkDot } from "./blot";
import { InkText } from "./ink-text";
import { drawnSide, LEFT_TEXT_GAP, marginWidths, mergeLines, NOTE_LINE, NOTE_WIDTH, placeStack, RIGHT_TEXT_GAP, type PassageLine, type Side } from "./nb-geometry";
import type { NoteBridge } from "./nb-plugins";
import { Tether } from "./tether";

/** A document range's visual lines in the column's coordinates. */
export function rangeLines(view: EditorView, from: number, to: number, column: DOMRect): PassageLine[] {
	try {
		const size = view.state.doc.content.size;
		const start = view.domAtPos(Math.max(0, Math.min(size, from)));
		const end = view.domAtPos(Math.max(0, Math.min(size, to)));
		const range = document.createRange();
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
		const rects = [...range.getClientRects()].map((r) => ({ left: r.left - column.left, right: r.right - column.left, top: r.top - column.top, bottom: r.bottom - column.top }));
		return mergeLines(rects);
	} catch {
		return [];
	}
}

/** The centre of a range's first line, column coordinates. */
function firstLineCentre(view: EditorView, from: number, column: DOMRect): number | null {
	try {
		const coords = view.coordsAtPos(Math.max(0, Math.min(view.state.doc.content.size, from)), 1);
		return (coords.top + coords.bottom) / 2 - column.top;
	} catch {
		return null;
	}
}

interface Placed { top: number; side: Side; width: number; passageY: number | null }

const same = (a: Record<string, Placed>, b: Record<string, Placed>) => {
	const ka = Object.keys(a), kb = Object.keys(b);
	if (ka.length !== kb.length) return false;
	return ka.every((k) => {
		const x = a[k], y = b[k];
		return !!y && x!.side === y.side && x!.width === y.width && Math.abs(x!.top - y.top) < 0.5 && (x!.passageY === null) === (y.passageY === null) && Math.abs((x!.passageY ?? 0) - (y.passageY ?? 0)) < 0.5;
	});
};

export const DETACHED_LINE = "The words this was about are gone.";

export function Margin({ bridge, column, threads, layout, fresh, tick }: {
	bridge: NoteBridge;
	column: HTMLElement | null;
	/** Open threads shown in the margin (inline threads whose words are gone come here too). */
	threads: readonly NotebookThread[];
	layout: NotebookLayout;
	fresh: ReadonlySet<string>;
	tick: number;
}) {
	const notes = useRef(new Map<string, HTMLDivElement>());
	const [placed, setPlaced] = useState<Record<string, Placed>>({});
	const [columnWidth, setColumnWidth] = useState(0);
	const [pointed, setPointed] = useState<string | null>(null);

	useLayoutEffect(() => {
		const view = bridge.view;
		if (!view || view.isDestroyed || !column || layout === "marks") return;
		const rect = column.getBoundingClientRect();
		const widths = marginWidths({ columnLeft: rect.left, columnWidth: rect.width, viewportWidth: document.documentElement.clientWidth });
		const anchors = new Map((bridge.decor()?.anchors ?? []).map((a) => [a.id, a]));
		const stacks: Record<Side, { id: string; want: number; height: number }[]> = { left: [], right: [] };
		const meta: Record<string, { side: Side; passageY: number | null }> = {};
		for (const thread of threads) {
			const anchor = anchors.get(thread.id);
			const passageY = anchor ? firstLineCentre(view, anchor.from, rect) : null;
			const wanted: Side = !anchor || layout === "right" ? "right" : thread.side;
			const side = drawnSide(wanted, widths);
			if (!side) continue;
			const height = notes.current.get(thread.id)?.offsetHeight || NOTE_LINE * 3;
			stacks[side].push({ id: thread.id, want: passageY === null ? 0 : passageY - NOTE_LINE / 2, height });
			meta[thread.id] = { side, passageY };
		}
		const next: Record<string, Placed> = {};
		for (const side of ["left", "right"] as const) {
			for (const [id, top] of placeStack(stacks[side])) next[id] = { top, side, width: widths[side]!, passageY: meta[id]!.passageY };
		}
		setColumnWidth((w) => (Math.abs(w - rect.width) < 0.5 ? w : rect.width));
		setPlaced((prev) => (same(prev, next) ? prev : next));
		// Heights measured at the new widths settle on the next pass; equal results stop it.
	}, [bridge, column, threads, layout, tick, placed]);

	if (layout === "marks") return null;
	const tethers = threads.flatMap((thread) => {
		const at = placed[thread.id];
		if (!at || at.passageY === null) return [];
		const noteY = at.top + NOTE_LINE / 2;
		if (!fresh.has(thread.id) && pointed !== thread.id) return [];
		return [<Tether key={thread.id} threadId={thread.id} side={at.side} columnWidth={columnWidth} noteY={noteY} passageY={at.passageY} faint={!fresh.has(thread.id)} />];
	});

	return (
		<div className="nb-margin" data-testid="nb-margin">
			<svg className="nb-tether" aria-hidden="true">{tethers}</svg>
			{threads.map((thread) => {
				const at = placed[thread.id];
				const first = thread.messages[0];
				const count = replyCountLabel(replyCount(thread));
				const detached = at?.passageY === null;
				const style: React.CSSProperties = at
					? { top: at.top, width: at.width, left: at.side === "left" ? -LEFT_TEXT_GAP - at.width : columnWidth + RIGHT_TEXT_GAP }
					: { top: 0, left: 0, width: NOTE_WIDTH, visibility: "hidden" };
				return (
					<div
						key={thread.id}
						ref={(el) => { if (el) notes.current.set(thread.id, el); else notes.current.delete(thread.id); }}
						className="nb-note"
						data-side={at?.side ?? "right"}
						data-thread={thread.id}
						data-testid="nb-margin-note"
						data-fresh={fresh.has(thread.id) ? "true" : undefined}
						role="note"
						aria-roledescription="note"
						aria-label="Margin note"
						style={style}
						onPointerEnter={() => setPointed(thread.id)}
						onPointerLeave={() => setPointed((id) => (id === thread.id ? null : id))}
						onFocus={() => setPointed(thread.id)}
						onBlur={() => setPointed((id) => (id === thread.id ? null : id))}
					>
						<InkDot fresh={fresh.has(thread.id)} className="nb-note-dot" />
						<p className="nb-note-text nb-voice"><InkText text={first?.text ?? ""} animate={fresh.has(thread.id)} /></p>
						{detached && <p className="nb-note-meta">{DETACHED_LINE}</p>}
						{count && <p className="nb-note-meta nb-note-count" data-testid="nb-reply-count">{count}</p>}
					</div>
				);
			})}
		</div>
	);
}
