/**
 * Thread geometry shared by Notebook's margin (feature 024, US2) and Study's
 * check threads (feature 025, R8), pure and DOM-free: the margin note's
 * measures, how a collided stack settles, and the tether's path from a
 * note to its passage. Lifted from components/notebook/nb-geometry.ts
 * (which re-exports it); measurements are 024's visual-reference §8-§13.
 */

/** Margin note type (§8, measured ≈): 16px serif on a 23.5px line. */
export const NOTE_LINE = 23.5;
/** A note's full width at most (§8, frame margin-notes: the widest left-note line spans ≈376px, and "⋯" sits
 *  22px outside it). Geometry, not line breaks: Linux Chromium sets text ≈3% wider than the macOS frames
 *  (same font files, same widths as riddled.ai in one browser), so some lines break earlier than the frame's. */
export const NOTE_WIDTH = 376;
/** An open thread's measure (§8.1, frame margin-thread: x 156-566, the same right edge as collapsed). */
export const EXPANDED_WIDTH = 410;
/** Narrower than this and a margin is too tight for notes. */
export const NOTE_MIN_WIDTH = 180;
/** Left notes: text right edge this far left of the column; the dot centre at 36px. */
export const LEFT_TEXT_GAP = 59;
export const LEFT_DOT = 36;
/** Right notes: dot centre 51px right of the column, text from 71px. */
export const RIGHT_DOT = 51;
export const RIGHT_TEXT_GAP = 71;
/** Space kept clear at the viewport's edges. */
export const EDGE_GAP = 16;
/** Between stacked notes (§8: ≈34px from a reply count to the next note's first line). */
export const STACK_GAP = 14;
/** How far above the column's top a margin note may sit (frame margin-thread: an open thread pushed
 *  up against the top starts its first line 6px above the toolbar row's top). */
export const MARGIN_TOP = -6;
/** A note further than this from its passage's line counts as displaced (it gets a tether). */
export const DISPLACED_PX = 4;

export type Side = "left" | "right";

export interface StackItem {
	id: string;
	/** Where the note would like its top (aligned with its passage). */
	want: number;
	height: number;
}

/**
 * Settles one margin's notes without overlap. Notes that collide form a
 * cluster packed with `gap` between them, and the cluster sits where its
 * notes are, on average, closest to their passages (least squares), so a
 * crowded note can move up as well as down, as in frame margin-notes
 * (three left notes at 287, 466 and 598 for passages at 377, 469 and 501).
 * Nothing goes above `minTop`.
 */
export function placeStack(items: readonly StackItem[], gap = STACK_GAP, minTop = 0): Map<string, number> {
	interface Cluster { members: StackItem[]; offsets: number[]; top: number; height: number }
	const sorted = [...items].sort((a, b) => a.want - b.want || a.id.localeCompare(b.id));
	const clusters: Cluster[] = [];
	const settle = (c: Cluster) => {
		let sum = 0;
		c.members.forEach((m, i) => { sum += m.want - c.offsets[i]!; });
		c.top = Math.max(minTop, sum / c.members.length);
	};
	for (const item of sorted) {
		let current: Cluster = { members: [item], offsets: [0], top: Math.max(minTop, item.want), height: item.height };
		for (;;) {
			const previous = clusters.at(-1);
			if (!previous || previous.top + previous.height + gap <= current.top) break;
			clusters.pop();
			const shift = previous.height + gap;
			current = {
				members: [...previous.members, ...current.members],
				offsets: [...previous.offsets, ...current.offsets.map((o) => o + shift)],
				top: 0,
				height: shift + current.height,
			};
			settle(current);
		}
		clusters.push(current);
	}
	const out = new Map<string, number>();
	for (const c of clusters) c.members.forEach((m, i) => out.set(m.id, c.top + c.offsets[i]!));
	return out;
}

const r = (n: number) => Math.round(n * 10) / 10;

export interface TetherPaths { tie: string; spine: string | null }

/**
 * A tether from a note's dot to its passage's line (§11): a short tie out
 * of the dot into the gutter, then a spine down (or up) the gutter as a
 * gentle S that turns into the passage's line at the column edge. Points
 * are in column coordinates (x = 0 is the column's left edge).
 */
export function tetherPaths(input: { side: Side; columnWidth: number; noteY: number; passageY: number }): TetherPaths {
	const { side, columnWidth, noteY, passageY } = input;
	const dir = side === "left" ? -1 : 1;
	const edge = side === "left" ? 0 : columnWidth;
	const dotX = edge + dir * (side === "left" ? LEFT_DOT : RIGHT_DOT);
	const startX = dotX - dir * 7; // just outside the 14px dot
	const endX = edge + dir * 6;
	if (Math.abs(noteY - passageY) <= DISPLACED_PX) {
		return { tie: `M ${r(startX)} ${r(noteY)} L ${r(endX)} ${r(passageY)}`, spine: null };
	}
	const down = passageY > noteY ? 1 : -1;
	const gutterX = edge + dir * 15;
	const knee = { x: gutterX, y: noteY + down * Math.min(12, Math.abs(passageY - noteY) / 3) };
	const tie = `M ${r(startX)} ${r(noteY)} C ${r(gutterX)} ${r(noteY)}, ${r(knee.x)} ${r(noteY)}, ${r(knee.x)} ${r(knee.y)}`;
	const midY = (knee.y + passageY) / 2;
	const spine = `M ${r(knee.x)} ${r(knee.y)} C ${r(knee.x)} ${r(midY)}, ${r(endX)} ${r(midY)}, ${r(endX)} ${r(passageY)}`;
	return { tie, spine };
}

