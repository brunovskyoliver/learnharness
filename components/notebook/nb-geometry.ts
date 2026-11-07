/**
 * Notebook's margin geometry (feature 024, US2), pure and DOM-free so it
 * can be unit tested: where margin notes sit beside the column, how a
 * collided stack settles, the tether's path from a note to its passage,
 * the pencil underline under a passage being read, and the word stagger of
 * new AI text. Measurements are from contracts/visual-reference.md §8-§13
 * (frames margin-notes / margin-thread / inline-sketch at 1:1).
 */

import { NOTE_LINE, NOTE_WIDTH, EXPANDED_WIDTH, NOTE_MIN_WIDTH, LEFT_TEXT_GAP, LEFT_DOT, RIGHT_DOT, RIGHT_TEXT_GAP, EDGE_GAP, STACK_GAP, MARGIN_TOP, DISPLACED_PX, placeStack, tetherPaths, type Side, type StackItem, type TetherPaths } from "../paper/thread-geometry";
export { NOTE_LINE, NOTE_WIDTH, EXPANDED_WIDTH, NOTE_MIN_WIDTH, LEFT_TEXT_GAP, LEFT_DOT, RIGHT_DOT, RIGHT_TEXT_GAP, EDGE_GAP, STACK_GAP, MARGIN_TOP, DISPLACED_PX, placeStack, tetherPaths, type Side, type StackItem, type TetherPaths } from "../paper/thread-geometry";

export interface MarginSpace {
	/** Column's left edge and width, in viewport px. */
	columnLeft: number;
	columnWidth: number;
	viewportWidth: number;
}

/** Each margin's note width (`cap`: NOTE_WIDTH, or EXPANDED_WIDTH for an open thread), or null when that margin is too narrow. */
export function marginWidths(space: MarginSpace, cap = NOTE_WIDTH): Record<Side, number | null> {
	const left = space.columnLeft - LEFT_TEXT_GAP - EDGE_GAP;
	const right = space.viewportWidth - (space.columnLeft + space.columnWidth + RIGHT_TEXT_GAP) - EDGE_GAP;
	const fit = (room: number) => (room >= NOTE_MIN_WIDTH ? Math.min(cap, Math.floor(room)) : null);
	return { left: fit(left), right: fit(right) };
}

/** The side a note is drawn on: its own, else the other margin when its own is too narrow. */
export function drawnSide(wanted: Side, widths: Record<Side, number | null>): Side | null {
	if (widths[wanted] !== null) return wanted;
	const other: Side = wanted === "left" ? "right" : "left";
	return widths[other] !== null ? other : null;
}

/** The note's top that puts its first line level with a passage line (centres aligned). */
export const alignedTop = (lineTop: number, lineHeight: number): number => lineTop + lineHeight / 2 - NOTE_LINE / 2;

const r = (n: number) => Math.round(n * 10) / 10;

/** One visual line of a passage: x from-to and the line's bottom, column coordinates. */
export interface PassageLine { x1: number; x2: number; top: number; bottom: number }

export interface PencilStroke { d: string; width: number; draw: number; delay: number }

/**
 * The pencil underline Riddled draws while it reads (§9.1): one wobbly
 * stroke per line (up to three lines), drawn left to right line after line
 * at ≥650 px/s; four or more lines get one side bracket instead.
 */
export function pencilStrokes(lines: readonly PassageLine[]): { strokes: PencilStroke[]; total: number; side: boolean } {
	if (lines.length === 0) return { strokes: [], total: 0, side: false };
	if (lines.length >= 4) {
		const first = lines[0]!, last = lines.at(-1)!;
		const minX = Math.min(...lines.map((l) => l.x1));
		const pitch = first.bottom - first.top;
		const x = minX - 14;
		const y1 = first.bottom - 0.85 * pitch, y2 = last.bottom - 2;
		const h = y2 - y1;
		const segments = Math.max(2, Math.round(h / 40));
		let d = `M ${r(x)} ${r(y1)}`;
		for (let i = 1; i <= segments; i++) {
			const y = y1 + (h * i) / segments;
			const cy = y1 + (h * (i - 0.5)) / segments;
			d += ` Q ${r(x + 0.7 * Math.sin(78.233 * i + 4.1))} ${r(cy)} ${r(x)} ${r(y)}`;
		}
		return { strokes: [{ d, width: 1.4, draw: 0.9, delay: 0 }], total: 0.9, side: true };
	}
	const widths = lines.map((l) => Math.max(1, l.x2 - l.x1));
	const totalWidth = widths.reduce((a, b) => a + b, 0);
	const speed = Math.max(650, totalWidth / 1.6);
	const strokes: PencilStroke[] = [];
	let delay = 0;
	lines.forEach((line, n) => {
		const w = widths[n]!;
		const y = line.bottom + 1;
		const segments = Math.max(2, Math.round(w / 34));
		let d = `M ${r(line.x1)} ${r(y)}`;
		for (let i = 1; i <= segments; i++) {
			const x = line.x1 + (w * i) / segments;
			const cx = line.x1 + (w * (i - 0.5)) / segments;
			const wobble = 0.75 * Math.sin(12.9898 * n + 78.233 * i);
			d += ` Q ${r(cx)} ${r(y + wobble)} ${r(x)} ${r(i === segments ? y - 0.9 : y)}`;
		}
		const draw = w / speed;
		strokes.push({ d, width: 1.3, draw, delay });
		delay += draw;
	});
	return { strokes, total: delay, side: false };
}

/** How long the reading mark stays before the note shows (§10.2): the pencil's time plus 1.3 s. */
export function readingHoldMs(lines: readonly PassageLine[]): number {
	const width = lines.reduce((sum, l) => sum + Math.max(0, l.x2 - l.x1), 0);
	return Math.min((width / 650) * 1000, 1600) + 1300;
}

/** InkText's per-word delay step (§12): lifted to components/paper/rehype-ink-words.ts (feature 025). */
export { inkStepMs } from "../paper/rehype-ink-words";

/** Merges a range's client rects into visual lines (rects whose vertical centres overlap). */
export function mergeLines(rects: readonly { left: number; right: number; top: number; bottom: number }[]): PassageLine[] {
	const lines: PassageLine[] = [];
	for (const rect of rects) {
		if (rect.right - rect.left < 0.5) continue;
		const mid = (rect.top + rect.bottom) / 2;
		const line = lines.find((l) => mid >= l.top && mid <= l.bottom);
		if (line) {
			line.x1 = Math.min(line.x1, rect.left);
			line.x2 = Math.max(line.x2, rect.right);
			line.top = Math.min(line.top, rect.top);
			line.bottom = Math.max(line.bottom, rect.bottom);
		} else {
			lines.push({ x1: rect.left, x2: rect.right, top: rect.top, bottom: rect.bottom });
		}
	}
	return lines.sort((a, b) => a.top - b.top);
}

/** Our ink blot: lifted to components/paper/blot.tsx (feature 025). */
export { blotPath } from "../paper/blot";
