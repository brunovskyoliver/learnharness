"use client";

/**
 * Inline replies (feature 024, US2 scenario 5, visual-reference §13): when
 * the AI answers a line that asked it something, the answer sits under
 * that block, indented 22px with its dot at 3px. The editor gets a spacer
 * widget after the block (`.riddle-spacer`), as tall as the reply, so his
 * text below moves down; the reply itself is drawn over the spacer and is
 * never part of his page. In Marks only (and on narrow screens) an opened
 * "?" puts its thread here too, and threads whose words are gone stack at
 * the top of the note. Each one is a thread (thread.tsx) that expands in
 * place.
 */
import { useLayoutEffect, useState } from "react";
import type { NotebookThread } from "@/src/core";
import { useMeasuredRefs } from "./margin";
import { blockEnd, type NoteBridge, type SpacerMark } from "./nb-plugins";
import { Thread } from "./thread";

export { SketchStill } from "./thread";

/** Room above an inline reply (§13: ≈21px from the block's last line to the reply's first). */
export const INLINE_GAP = 21;

export function InlineReplies({ bridge, column, threads, anchored, fresh, tick }: {
	bridge: NoteBridge;
	column: HTMLElement | null;
	/** Threads shown under their block (or, with no passage, at the top of the note), and ones leaving. */
	threads: readonly NotebookThread[];
	/** Threads whose passage is on the page (the rest have lost their words). */
	anchored: ReadonlySet<string>;
	fresh: ReadonlySet<string>;
	tick: number;
}) {
	const { elements: replies, refFor, bump } = useMeasuredRefs();
	const [tops, setTops] = useState<Record<string, number>>({});
	const [positions, setPositions] = useState<Record<string, number>>({});

	useLayoutEffect(() => {
		const view = bridge.view;
		if (!view || view.isDestroyed || !column) return;
		const anchors = new Map((bridge.decor()?.anchors ?? []).map((a) => [a.id, a]));
		const spacers: SpacerMark[] = [];
		const order: Record<string, number> = {};
		for (const thread of threads) {
			const anchor = anchors.get(thread.id);
			const el = replies.get(thread.id);
			order[thread.id] = anchor ? anchor.from : -1;
			if (!el) continue;
			spacers.push({ id: thread.id, pos: anchor ? blockEnd(view.state.doc, anchor.from) : 0, height: Math.ceil(el.offsetHeight) + INLINE_GAP });
		}
		const current = bridge.decor()?.spacers ?? [];
		const changed = current.length !== spacers.length || spacers.some((s, i) => current[i]?.id !== s.id || current[i]?.pos !== s.pos || current[i]?.height !== s.height);
		if (changed) bridge.setDecor({ spacers });
		const rect = column.getBoundingClientRect();
		const next: Record<string, number> = {};
		for (const el of view.dom.querySelectorAll<HTMLElement>(".nb-spacer[data-thread]")) {
			next[el.dataset.thread!] = el.getBoundingClientRect().top - rect.top + INLINE_GAP;
		}
		setTops((prev) => {
			const keys = Object.keys(next);
			return keys.length === Object.keys(prev).length && keys.every((k) => Math.abs((prev[k] ?? -1) - next[k]!) < 0.5) ? prev : next;
		});
		setPositions((prev) => (JSON.stringify(prev) === JSON.stringify(order) ? prev : order));
	}, [bridge, column, threads, tick, tops, bump]);

	return (
		<>
			{threads.map((thread) => {
				const top = tops[thread.id];
				const from = positions[thread.id] ?? -1;
				return (
					<Thread
						key={thread.id}
						thread={thread}
						variant="inline"
						fresh={fresh.has(thread.id)}
						detached={!anchored.has(thread.id)}
						order={from}
						rootRef={refFor(thread.id)}
						style={top === undefined ? { top: 0, opacity: 0, pointerEvents: "none" } : { top }}
					/>
				);
			})}
		</>
	);
}
