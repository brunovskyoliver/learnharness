"use client";

/**
 * Inline replies (feature 024, US2 scenario 5, visual-reference §13): when
 * the AI answers a line that asked it something, the answer sits under
 * that block, indented 22px with its dot at 3px. The editor gets a spacer
 * widget after the block (`.riddle-spacer`), as tall as the reply, so his
 * text below moves down; the reply itself is drawn over the spacer and is
 * never part of his page. A sketch shows as its finished drawing here; the
 * stepper comes with Phase 6.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { renderSketchSvg, replyCount, replyCountLabel, type NotebookThread, type Sketch } from "@/src/core";
import { InkDot } from "./blot";
import { InkText } from "./ink-text";
import { blockEnd, type NoteBridge, type SpacerMark } from "./nb-plugins";

/** Room above an inline reply (§13: ≈21px from the block's last line to the reply's first). */
export const INLINE_GAP = 21;

function SketchStill({ sketch, animate }: { sketch: Sketch; animate: boolean }) {
	const last = sketch.steps.at(-1);
	return (
		<figure className="nb-sketch-still" data-testid="nb-sketch" data-static={animate ? undefined : ""}>
			<figcaption className="nb-sketch-head">
				<span className="nb-sketch-title nb-voice">{sketch.title}</span>
				{sketch.subtitle && <span className="nb-sketch-subtitle">{sketch.subtitle}</span>}
			</figcaption>
			<div className="nb-sketch-art" style={{ maxWidth: sketch.w }} dangerouslySetInnerHTML={{ __html: renderSketchSvg(sketch) }} />
			{last?.note && <p className="nb-sketch-note nb-voice">{last.note}</p>}
			{last && <p className="nb-sketch-caption">{last.caption}</p>}
		</figure>
	);
}

export function InlineReplies({ bridge, column, threads, fresh, tick }: {
	bridge: NoteBridge;
	column: HTMLElement | null;
	/** Open inline threads whose passage is on the page. */
	threads: readonly NotebookThread[];
	fresh: ReadonlySet<string>;
	tick: number;
}) {
	const replies = useRef(new Map<string, HTMLDivElement>());
	const [tops, setTops] = useState<Record<string, number>>({});

	useLayoutEffect(() => {
		const view = bridge.view;
		if (!view || view.isDestroyed || !column) return;
		const anchors = new Map((bridge.decor()?.anchors ?? []).map((a) => [a.id, a]));
		const spacers: SpacerMark[] = [];
		for (const thread of threads) {
			const anchor = anchors.get(thread.id);
			const el = replies.current.get(thread.id);
			if (!anchor || !el) continue;
			spacers.push({ id: thread.id, pos: blockEnd(view.state.doc, anchor.from), height: Math.ceil(el.offsetHeight) + INLINE_GAP });
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
	}, [bridge, column, threads, tick, tops]);

	return (
		<>
			{threads.map((thread) => {
				const top = tops[thread.id];
				const first = thread.messages[0];
				const count = replyCountLabel(replyCount(thread));
				return (
					<div
						key={thread.id}
						ref={(el) => { if (el) replies.current.set(thread.id, el); else replies.current.delete(thread.id); }}
						className="nb-inline"
						data-thread={thread.id}
						data-testid="nb-inline-reply"
						role="note"
						aria-roledescription="note"
						aria-label="Note under the passage"
						style={top === undefined ? { top: 0, visibility: "hidden" } : { top }}
					>
						<InkDot fresh={fresh.has(thread.id)} className="nb-inline-dot" />
						<div className="nb-inline-text nb-voice"><InkText text={first?.text ?? ""} animate={fresh.has(thread.id)} /></div>
						{first?.sketch && <SketchStill sketch={first.sketch} animate={fresh.has(thread.id)} />}
						{count && <p className="nb-note-meta nb-note-count">{count}</p>}
					</div>
				);
			})}
		</>
	);
}
