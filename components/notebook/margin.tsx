"use client";

/**
 * Margin notes (feature 024, US2, visual-reference §8, §11): each open
 * margin thread sits beside the first line of its passage. Both margins:
 * a thread keeps the side it was given (neighbours alternate), left notes
 * right-aligned hugging the column; Right margin: all on the right.
 * Collided notes settle as a packed cluster (nb-geometry placeStack). A
 * note that had to move gets a faint tether; a fresh note's tether draws
 * itself once. Threads whose words are gone stack at the top of the right
 * margin. An open thread (thread.tsx) widens in place, the others fade, and
 * its tether and rail stay drawn; hovering a passage shows its note's
 * faint tether.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditorView } from "@tiptap/pm/view";
import type { NotebookLayout, NotebookThread } from "@/src/core";
import { drawnSide, EXPANDED_WIDTH, LEFT_TEXT_GAP, MARGIN_TOP, marginWidths, mergeLines, NOTE_LINE, NOTE_WIDTH, placeStack, RIGHT_TEXT_GAP, STACK_GAP, type MarginSpace, type PassageLine, type Side } from "./nb-geometry";
import type { NoteBridge } from "./nb-plugins";
import { Tether } from "./tether";
import { Thread } from "./thread";
import { useThreads } from "./use-threads";

export { DETACHED_LINE } from "./thread";

/** A document range's visual lines in the column's coordinates. */
/** The column's place for margin widths, without the slide of an open sidebar or chat panel
 *  (`.nb-sheet` / `.nb-page` transforms): the notes move with the page, so the room beside the
 *  column is the room it has at rest, and notes do not change sides while a panel opens. */
export function columnSpace(column: HTMLElement, rect = column.getBoundingClientRect()): MarginSpace {
	let shift = 0;
	for (let el: HTMLElement | null = column.parentElement; el && !el.classList.contains("nb-root"); el = el.parentElement) {
		const transform = getComputedStyle(el).transform;
		if (transform && transform !== "none") shift += new DOMMatrixReadOnly(transform).m41;
	}
	return { columnLeft: rect.left - shift, columnWidth: rect.width, viewportWidth: document.documentElement.clientWidth };
}

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

interface Placed { top: number; side: Side; width: number; passageY: number | null; from: number }

const same = (a: Record<string, Placed>, b: Record<string, Placed>) => {
	const ka = Object.keys(a), kb = Object.keys(b);
	if (ka.length !== kb.length) return false;
	return ka.every((k) => {
		const x = a[k], y = b[k];
		return !!y && x!.side === y.side && x!.width === y.width && x!.from === y.from && Math.abs(x!.top - y.top) < 0.5 && (x!.passageY === null) === (y.passageY === null) && Math.abs((x!.passageY ?? 0) - (y.passageY ?? 0)) < 0.5;
	});
};

/**
 * Elements by thread id, each watched for size changes (a thread opening,
 * an answer growing); `bump` moves when one changes. The ref callbacks are
 * stable per id, so a re-render never re-observes.
 */
export function useMeasuredRefs(): { elements: Map<string, HTMLDivElement>; refFor: (id: string) => (el: HTMLDivElement | null) => void; bump: number } {
	const [bump, setBump] = useState(0);
	const elements = useRef(new Map<string, HTMLDivElement>()).current;
	const callbacks = useRef(new Map<string, (el: HTMLDivElement | null) => void>()).current;
	const observer = useRef<ResizeObserver | null>(null);
	useEffect(() => () => observer.current?.disconnect(), []);
	const refFor = (id: string) => {
		let fn = callbacks.get(id);
		if (!fn) {
			fn = (el) => {
				if (typeof ResizeObserver !== "undefined") observer.current ??= new ResizeObserver(() => setBump((n) => n + 1));
				const before = elements.get(id);
				if (before && before !== el) observer.current?.unobserve(before);
				if (el) { elements.set(id, el); observer.current?.observe(el); } else { elements.delete(id); callbacks.delete(id); }
			};
			callbacks.set(id, fn);
		}
		return fn;
	};
	return { elements, refFor, bump };
}

export function Margin({ bridge, column, threads, layout, fresh, tick }: {
	bridge: NoteBridge;
	column: HTMLElement | null;
	/** Threads shown in the margin (inline threads whose words are gone come here too), and ones leaving. */
	threads: readonly NotebookThread[];
	layout: NotebookLayout;
	fresh: ReadonlySet<string>;
	tick: number;
}) {
	const api = useThreads();
	const { elements: notes, refFor, bump } = useMeasuredRefs();
	const [placed, setPlaced] = useState<Record<string, Placed>>({});
	const [columnWidth, setColumnWidth] = useState(0);
	const [pointed, setPointed] = useState<string | null>(null);
	const openId = api.openId;

	// Hovering a passage shows its note's faint tether.
	useEffect(() => {
		const dom = bridge.view?.dom;
		if (!dom) return;
		const over = (event: PointerEvent) => {
			const id = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".nb-anchor[data-thread]")?.dataset.thread ?? null;
			setPointed((prev) => (prev === id ? prev : id));
		};
		const out = () => setPointed(null);
		dom.addEventListener("pointerover", over);
		dom.addEventListener("pointerleave", out);
		return () => { dom.removeEventListener("pointerover", over); dom.removeEventListener("pointerleave", out); };
	}, [bridge, tick]);

	useLayoutEffect(() => {
		const view = bridge.view;
		if (!view || view.isDestroyed || !column || layout === "marks") return;
		const rect = column.getBoundingClientRect();
		const space = columnSpace(column, rect);
		const widths = marginWidths(space);
		const wide = marginWidths(space, EXPANDED_WIDTH);
		const anchors = new Map((bridge.decor()?.anchors ?? []).map((a) => [a.id, a]));
		const stacks: Record<Side, { id: string; want: number; height: number }[]> = { left: [], right: [] };
		const meta: Record<string, { side: Side; passageY: number | null; from: number }> = {};
		for (const thread of threads) {
			const anchor = anchors.get(thread.id);
			const passageY = anchor ? firstLineCentre(view, anchor.from, rect) : null;
			const wanted: Side = !anchor || layout === "right" ? "right" : thread.side;
			const side = drawnSide(wanted, widths);
			if (!side) continue;
			const height = notes.get(thread.id)?.offsetHeight || NOTE_LINE * 3;
			stacks[side].push({ id: thread.id, want: passageY === null ? 0 : passageY - NOTE_LINE / 2, height });
			meta[thread.id] = { side, passageY, from: anchor ? anchor.from : -1 };
		}
		const next: Record<string, Placed> = {};
		for (const side of ["left", "right"] as const) {
			for (const [id, top] of placeStack(stacks[side], STACK_GAP, MARGIN_TOP)) {
				const width = id === openId ? wide[side] ?? widths[side]! : widths[side]!;
				next[id] = { top, side, width, passageY: meta[id]!.passageY, from: meta[id]!.from };
			}
		}
		setColumnWidth((w) => (Math.abs(w - rect.width) < 0.5 ? w : rect.width));
		setPlaced((prev) => (same(prev, next) ? prev : next));
		// Heights measured at the new widths settle on the next pass; equal results stop it.
	}, [bridge, column, threads, layout, tick, placed, openId, bump]);

	if (layout === "marks") return null;
	const tethers = threads.flatMap((thread) => {
		const at = placed[thread.id];
		if (!at || at.passageY === null || api.leaving(thread.id)) return [];
		const open = openId === thread.id;
		if (!open && !fresh.has(thread.id) && pointed !== thread.id) return [];
		const noteY = at.top + NOTE_LINE / 2;
		return [<Tether key={`${thread.id}${open ? "-open" : ""}`} threadId={thread.id} side={at.side} columnWidth={columnWidth} noteY={noteY} passageY={at.passageY} faint={!open && !fresh.has(thread.id)} />];
	});

	return (
		<div className="nb-margin" data-testid="nb-margin" data-open={openId ? "true" : undefined}>
			<svg className="nb-tether" aria-hidden="true">{tethers}</svg>
			{threads.map((thread) => {
				const at = placed[thread.id];
				const style: React.CSSProperties = at
					? { top: at.top, width: at.width, left: at.side === "left" ? -LEFT_TEXT_GAP - at.width : columnWidth + RIGHT_TEXT_GAP }
					: { top: 0, left: 0, width: NOTE_WIDTH, opacity: 0, pointerEvents: "none" };
				return (
					<Thread
						key={thread.id}
						thread={thread}
						variant="margin"
						side={at?.side ?? "right"}
						fresh={fresh.has(thread.id)}
						detached={at?.passageY === null}
						order={at?.from ?? -1}
						faded={openId !== null && openId !== thread.id && pointed !== thread.id}
						style={style}
						rootRef={refFor(thread.id)}
						onPointerEnter={() => setPointed(thread.id)}
						onPointerLeave={() => setPointed((id) => (id === thread.id ? null : id))}
					/>
				);
			})}
		</div>
	);
}
