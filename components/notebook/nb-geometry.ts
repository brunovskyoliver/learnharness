/**
 * Notebook's margin geometry (feature 024, US2), pure and DOM-free so it
 * can be unit tested: where margin notes sit beside the column, how a
 * collided stack settles, the tether's path from a note to its passage,
 * the pencil underline under a passage being read, and the word stagger of
 * new AI text. Measurements are from contracts/visual-reference.md §8-§13
 * (frames margin-notes / margin-thread / inline-sketch at 1:1).
 */

/** Margin note type (§8, measured ≈): 16px serif on a 23.5px line. */
export const NOTE_LINE = 23.5;
/** A note's full width at most (§8 measured ≈376px; at 15px our Newsreader needs 384px to break lines where the frame does). */
export const NOTE_WIDTH = 384;
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
/** A note further than this from its passage's line counts as displaced (it gets a tether). */
export const DISPLACED_PX = 4;

export type Side = "left" | "right";

export interface MarginSpace {
	/** Column's left edge and width, in viewport px. */
	columnLeft: number;
	columnWidth: number;
	viewportWidth: number;
}

/** Each margin's note width, or null when that margin is too narrow. */
export function marginWidths(space: MarginSpace): Record<Side, number | null> {
	const left = space.columnLeft - LEFT_TEXT_GAP - EDGE_GAP;
	const right = space.viewportWidth - (space.columnLeft + space.columnWidth + RIGHT_TEXT_GAP) - EDGE_GAP;
	const fit = (room: number) => (room >= NOTE_MIN_WIDTH ? Math.min(NOTE_WIDTH, Math.floor(room)) : null);
	return { left: fit(left), right: fit(right) };
}

/** The side a note is drawn on: its own, else the other margin when its own is too narrow. */
export function drawnSide(wanted: Side, widths: Record<Side, number | null>): Side | null {
	if (widths[wanted] !== null) return wanted;
	const other: Side = wanted === "left" ? "right" : "left";
	return widths[other] !== null ? other : null;
}

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

/** The note's top that puts its first line level with a passage line (centres aligned). */
export const alignedTop = (lineTop: number, lineHeight: number): number => lineTop + lineHeight / 2 - NOTE_LINE / 2;

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

/** InkText's per-word delay step (§12): `min(70, 1800 / words)` ms. */
export const inkStepMs = (words: number): number => (words <= 0 ? 0 : Math.min(70, 1800 / words));

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

/** Our ink blot (not Riddled's logo glyph): an irregular blob of 14 points
 *  joined by midpoint quadratics plus two droplets, in a 26-unit box
 *  centred on 0 (the §10.4 splash recipe with our own seed). */
export function blotPath(seed = 2.4, radius = 7.4): { d: string; drops: { cx: number; cy: number; r: number }[] } {
	const n = 14;
	const pts = Array.from({ length: n }, (_, i) => {
		const a = (i / n) * Math.PI * 2;
		const rad = radius * (1 + 0.16 * Math.sin(3 * a + seed) + 0.09 * Math.sin(7 * a + 2.3 * seed));
		return { x: Math.cos(a) * rad, y: Math.sin(a) * rad };
	});
	const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
	const start = mid(pts[n - 1]!, pts[0]!);
	let d = `M ${r(start.x)} ${r(start.y)}`;
	for (let i = 0; i < n; i++) {
		const p = pts[i]!, m = mid(p, pts[(i + 1) % n]!);
		d += ` Q ${r(p.x)} ${r(p.y)} ${r(m.x)} ${r(m.y)}`;
	}
	const drops = [0, 1].map((i) => {
		const a = 1.7 * seed + 1.33 * i + 0.9;
		const dist = radius * (1.35 + 0.5 * Math.abs(Math.sin(seed + i)));
		return { cx: r(Math.cos(a) * dist), cy: r(Math.sin(a) * dist), r: r(radius * (0.08 + 0.07 * Math.abs(Math.cos(3 * seed + i)))) };
	});
	return { d: `${d} Z`, drops };
}
