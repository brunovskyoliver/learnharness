/**
 * Notebook sketches (feature 024, research R6): our own small drawing
 * schema, validated, and a pure SVG renderer. The model never writes SVG
 * or HTML; it sends these primitives, each tagged with the step that
 * reveals it, and only this file turns them into markup. The same SVG
 * serves the page, the larger dialog and the exports.
 *
 * Animation hooks (notebook.css §16): strokes get `nb-sketch-line` with
 * pathLength=1 (pencil draw), bars `nb-sketch-bar` (grow), dots
 * `nb-sketch-dot-static` (dot pop), text `nb-sketch-pop-in` (pop). Each
 * step is a `<g data-step>`; steps after the current one render at
 * opacity 0, so changing steps is a CSS opacity transition.
 */

export type SketchTextSize = "s" | "m" | "l";

interface ItemBase { step: number }
export type SketchItem = ItemBase & (
	/** `cell` wide; `cellH` tall when the cells are not square. */
	| { kind: "grid"; x: number; y: number; cols: number; rows: number; cell: number; cellH?: number }
	| { kind: "text"; x: number; y: number; text: string; size?: SketchTextSize; voice?: boolean; anchor?: "start" | "middle" | "end" }
	| { kind: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; curve?: number }
	| { kind: "rect"; x: number; y: number; w: number; h: number; r?: number }
	| { kind: "circle"; cx: number; cy: number; r: number }
	| { kind: "dot"; cx: number; cy: number }
	| { kind: "bar"; x: number; y: number; w: number; h: number }
	| { kind: "path"; d: string }
);
export type SketchItemKind = SketchItem["kind"];

export interface SketchStep {
	caption: string;
	/** The big serif line under the drawing. */
	note?: string;
}

export interface Sketch {
	title: string;
	subtitle?: string;
	w: number;
	h: number;
	items: SketchItem[];
	steps: SketchStep[];
}

export const SKETCH_LIMITS = {
	title: 80,
	subtitle: 120,
	caption: 160,
	note: 120,
	text: 40,
	path: 400,
	items: 80,
	steps: 6,
	w: [120, 640] as const,
	h: [80, 480] as const,
	gridCells: 8,
} as const;

export const SKETCH_ITEM_KINDS = ["grid", "text", "line", "arrow", "rect", "circle", "dot", "bar", "path"] as const satisfies readonly SketchItemKind[];

export const SKETCH_FAILED_TEXT = "The drawing didn’t come through.";

// ─── validation ──────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const str = (value: unknown, max: number, min = 0): value is string => typeof value === "string" && value.trim().length >= min && value.length <= max;

/** Path data: M, L, Q, C and Z only, absolute, numbers between. */
const PATH_TOKEN = /([MLQCZmlqcz])|(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)/g;
const PATH_ARGS: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

function pathProblem(d: string, w: number, h: number): string | null {
	if (!/^[MLQCZ\d\s.,eE-]+$/.test(d)) return "path may use only M, L, Q, C and Z with numbers";
	const tokens = [...d.matchAll(PATH_TOKEN)].map((m) => m[0]);
	if (tokens.length === 0 || tokens[0] !== "M") return "path must start with M";
	let i = 0;
	while (i < tokens.length) {
		const command = tokens[i]!;
		const args = PATH_ARGS[command];
		if (args === undefined) return "path has a number where a command belongs";
		i++;
		if (args === 0) continue;
		// A command may repeat its arguments (M 1 2 3 4 = M then L, as SVG reads it).
		let groups = 0;
		while (i < tokens.length && PATH_ARGS[tokens[i]!] === undefined) {
			const group = tokens.slice(i, i + args).map(Number);
			if (group.length < args || group.some((n) => !Number.isFinite(n))) return "path has a command with too few numbers";
			for (let k = 0; k < group.length; k += 2) if (group[k]! < 0 || group[k]! > w || group[k + 1]! < 0 || group[k + 1]! > h) return "path leaves the drawing";
			i += args;
			groups++;
		}
		if (groups === 0) return "path has a command with no numbers";
	}
	return null;
}

function itemProblem(raw: unknown, sketch: { w: number; h: number; steps: number }): string | null {
	if (!isRecord(raw)) return "item must be an object";
	const { w, h } = sketch;
	if (!Number.isInteger(raw.step) || (raw.step as number) < 0 || (raw.step as number) >= sketch.steps) return "item step must name one of the steps (0-based)";
	const inX = (x: unknown) => num(x) && x >= 0 && x <= w;
	const inY = (y: unknown) => num(y) && y >= 0 && y <= h;
	switch (raw.kind) {
		case "grid": {
			const { x, y, cols, rows, cell } = raw;
			if (!inX(x) || !inY(y)) return "grid must start inside the drawing";
			if (!Number.isInteger(cols) || (cols as number) < 1 || (cols as number) > SKETCH_LIMITS.gridCells) return `grid cols must be 1-${SKETCH_LIMITS.gridCells}`;
			if (!Number.isInteger(rows) || (rows as number) < 1 || (rows as number) > SKETCH_LIMITS.gridCells) return `grid rows must be 1-${SKETCH_LIMITS.gridCells}`;
			if (!num(cell) || cell <= 0) return "grid cell must be a positive size";
			if (raw.cellH !== undefined && (!num(raw.cellH) || raw.cellH <= 0)) return "grid cellH must be a positive size";
			const tall = num(raw.cellH) ? raw.cellH : cell;
			if ((x as number) + (cols as number) * cell > w + 1e-9 || (y as number) + (rows as number) * tall > h + 1e-9) return "grid leaves the drawing";
			return null;
		}
		case "text": {
			if (!inX(raw.x) || !inY(raw.y)) return "text must sit inside the drawing";
			if (!str(raw.text, SKETCH_LIMITS.text, 1)) return `text must be 1-${SKETCH_LIMITS.text} characters`;
			if (raw.size !== undefined && raw.size !== "s" && raw.size !== "m" && raw.size !== "l") return 'text size must be "s", "m" or "l"';
			if (raw.voice !== undefined && typeof raw.voice !== "boolean") return "text voice must be true or false";
			if (raw.anchor !== undefined && raw.anchor !== "start" && raw.anchor !== "middle" && raw.anchor !== "end") return 'text anchor must be "start", "middle" or "end"';
			return null;
		}
		case "line":
		case "arrow": {
			if (!inX(raw.x1) || !inY(raw.y1) || !inX(raw.x2) || !inY(raw.y2)) return `${raw.kind} must stay inside the drawing`;
			if (raw.curve !== undefined && (!num(raw.curve) || Math.abs(raw.curve) > 1)) return `${raw.kind} curve must be between -1 and 1`;
			return null;
		}
		case "rect":
		case "bar": {
			const { x, y, w: rw, h: rh } = raw;
			if (!inX(x) || !inY(y) || !num(rw) || !num(rh) || rw <= 0 || rh <= 0) return `${raw.kind} needs x, y and a positive w and h`;
			if ((x as number) + rw > w + 1e-9 || (y as number) + rh > h + 1e-9) return `${raw.kind} leaves the drawing`;
			if (raw.kind === "rect" && raw.r !== undefined && (!num(raw.r) || raw.r < 0)) return "rect r must not be negative";
			return null;
		}
		case "circle": {
			const { cx, cy, r } = raw;
			if (!inX(cx) || !inY(cy) || !num(r) || r <= 0) return "circle needs cx, cy inside and a positive r";
			if ((cx as number) - r < 0 || (cx as number) + r > w || (cy as number) - r < 0 || (cy as number) + r > h) return "circle leaves the drawing";
			return null;
		}
		case "dot":
			return inX(raw.cx) && inY(raw.cy) ? null : "dot must sit inside the drawing";
		case "path":
			if (!str(raw.d, SKETCH_LIMITS.path, 1)) return `path d must be 1-${SKETCH_LIMITS.path} characters`;
			return pathProblem(raw.d as string, w, h);
		default:
			return `unknown item kind ${JSON.stringify(raw.kind)}; use ${SKETCH_ITEM_KINDS.join(", ")}`;
	}
}

const ITEM_FIELDS: Record<SketchItemKind, readonly string[]> = {
	grid: ["x", "y", "cols", "rows", "cell", "cellH"],
	text: ["x", "y", "text", "size", "voice", "anchor"],
	line: ["x1", "y1", "x2", "y2", "curve"],
	arrow: ["x1", "y1", "x2", "y2", "curve"],
	rect: ["x", "y", "w", "h", "r"],
	circle: ["cx", "cy", "r"],
	dot: ["cx", "cy"],
	bar: ["x", "y", "w", "h"],
	path: ["d"],
};

/** Keeps the fields an item's kind has, dropping anything else a model sent. */
function cleanItem(raw: Raw): SketchItem {
	const kind = raw.kind as SketchItemKind;
	const out: Raw = { kind, step: raw.step };
	for (const key of ITEM_FIELDS[kind]) if (raw[key] !== undefined && raw[key] !== null) out[key] = raw[key];
	return out as unknown as SketchItem;
}

/** A sketch from untrusted input, or the first thing wrong with it. */
export function validateSketch(raw: unknown): { ok: true; sketch: Sketch } | { ok: false; problem: string } {
	if (!isRecord(raw)) return { ok: false, problem: "sketch must be an object" };
	if (!str(raw.title, SKETCH_LIMITS.title, 1)) return { ok: false, problem: `title must be 1-${SKETCH_LIMITS.title} characters` };
	if (raw.subtitle !== undefined && raw.subtitle !== null && !str(raw.subtitle, SKETCH_LIMITS.subtitle)) return { ok: false, problem: `subtitle must be at most ${SKETCH_LIMITS.subtitle} characters` };
	const { w, h } = raw;
	if (!num(w) || w < SKETCH_LIMITS.w[0] || w > SKETCH_LIMITS.w[1]) return { ok: false, problem: `w must be ${SKETCH_LIMITS.w[0]}-${SKETCH_LIMITS.w[1]}` };
	if (!num(h) || h < SKETCH_LIMITS.h[0] || h > SKETCH_LIMITS.h[1]) return { ok: false, problem: `h must be ${SKETCH_LIMITS.h[0]}-${SKETCH_LIMITS.h[1]}` };
	if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > SKETCH_LIMITS.steps) return { ok: false, problem: `steps must hold 1-${SKETCH_LIMITS.steps} steps` };
	const steps: SketchStep[] = [];
	for (const [i, step] of raw.steps.entries()) {
		if (!isRecord(step) || !str(step.caption, SKETCH_LIMITS.caption, 1)) return { ok: false, problem: `step ${i} caption must be 1-${SKETCH_LIMITS.caption} characters` };
		if (step.note !== undefined && step.note !== null && !str(step.note, SKETCH_LIMITS.note)) return { ok: false, problem: `step ${i} note must be at most ${SKETCH_LIMITS.note} characters` };
		steps.push({ caption: step.caption as string, ...(typeof step.note === "string" && step.note.trim() ? { note: step.note } : {}) });
	}
	if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > SKETCH_LIMITS.items) return { ok: false, problem: `items must hold 1-${SKETCH_LIMITS.items} items` };
	const items: SketchItem[] = [];
	for (const [i, item] of raw.items.entries()) {
		const problem = itemProblem(item, { w, h, steps: steps.length });
		if (problem) return { ok: false, problem: `item ${i}: ${problem}` };
		items.push(cleanItem(item as Raw));
	}
	return {
		ok: true,
		sketch: { title: raw.title as string, ...(typeof raw.subtitle === "string" && raw.subtitle.trim() ? { subtitle: raw.subtitle } : {}), w, h, items, steps },
	};
}

// ─── rendering ───────────────────────────────────────────────────────────────

const escapeXml = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const n = (value: number): string => String(Math.round(value * 100) / 100);

const TEXT_SIZE: Record<SketchTextSize, number> = { s: 12, m: 15, l: 17 };
const FONT_VOICE = "var(--nb-font-voice), Georgia, serif";
const FONT_SANS = "var(--nb-font-sans), system-ui, sans-serif";

function lineD(x1: number, y1: number, x2: number, y2: number, curve: number | undefined): string {
	if (!curve) return `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
	const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
	const dx = x2 - x1, dy = y2 - y1;
	// Bend sideways by a share of the length.
	const cx = mx - dy * curve * 0.5, cy = my + dx * curve * 0.5;
	return `M${n(x1)} ${n(y1)}Q${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}`;
}

function arrowHead(x1: number, y1: number, x2: number, y2: number, curve: number | undefined): string {
	// The direction at the end: from the control point for a curve.
	let fx = x1, fy = y1;
	if (curve) {
		const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
		fx = mx - (y2 - y1) * curve * 0.5;
		fy = my + (x2 - x1) * curve * 0.5;
	}
	const angle = Math.atan2(y2 - fy, x2 - fx);
	const size = 6, spread = Math.PI / 7;
	const ax = x2 - size * Math.cos(angle - spread), ay = y2 - size * Math.sin(angle - spread);
	const bx = x2 - size * Math.cos(angle + spread), by = y2 - size * Math.sin(angle + spread);
	return `M${n(ax)} ${n(ay)}L${n(x2)} ${n(y2)}L${n(bx)} ${n(by)}`;
}

const stroke = (d: string, extra = "") => `<path class="nb-sketch-line" pathLength="1" d="${d}"${extra}/>`;

function renderItem(item: SketchItem): string {
	switch (item.kind) {
		case "grid": {
			const parts: string[] = [];
			const tall = item.cellH ?? item.cell;
			const right = item.x + item.cols * item.cell, bottom = item.y + item.rows * tall;
			for (let c = 0; c <= item.cols; c++) {
				const x = item.x + c * item.cell;
				parts.push(`<path class="nb-sketch-line" pathLength="1" style="stroke:var(--rule);stroke-width:1px" d="M${n(x)} ${n(item.y)}L${n(x)} ${n(bottom)}"/>`);
			}
			for (let r = 0; r <= item.rows; r++) {
				const y = item.y + r * tall;
				parts.push(`<path class="nb-sketch-line" pathLength="1" style="stroke:var(--rule);stroke-width:1px" d="M${n(item.x)} ${n(y)}L${n(right)} ${n(y)}"/>`);
			}
			return `<g data-kind="grid">${parts.join("")}</g>`;
		}
		case "text": {
			const size = TEXT_SIZE[item.size ?? "m"];
			const voice = item.voice ?? true;
			return `<text class="nb-sketch-pop-in" x="${n(item.x)}" y="${n(item.y)}" text-anchor="${item.anchor ?? "middle"}" dominant-baseline="middle" font-size="${size}" style="transform-box:fill-box;transform-origin:center;font-family:${voice ? FONT_VOICE : FONT_SANS};fill:var(${voice ? "--ink" : "--graphite"});paint-order:stroke;stroke:var(--paper);stroke-width:4px;stroke-linejoin:round">${escapeXml(item.text)}</text>`;
		}
		case "line":
			return stroke(lineD(item.x1, item.y1, item.x2, item.y2, item.curve));
		case "arrow":
			return `<g data-kind="arrow">${stroke(lineD(item.x1, item.y1, item.x2, item.y2, item.curve))}${stroke(arrowHead(item.x1, item.y1, item.x2, item.y2, item.curve))}</g>`;
		case "rect":
			return `<rect class="nb-sketch-line" pathLength="1" x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}"${item.r ? ` rx="${n(item.r)}"` : ""}/>`;
		case "circle":
			return `<circle class="nb-sketch-line" pathLength="1" cx="${n(item.cx)}" cy="${n(item.cy)}" r="${n(item.r)}"/>`;
		case "dot":
			return `<circle class="nb-sketch-dot-static" cx="${n(item.cx)}" cy="${n(item.cy)}" r="3.5" style="transform-box:fill-box;transform-origin:center;fill:var(--riddle)"/>`;
		case "bar":
			return `<rect class="nb-sketch-bar" x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" rx="${n(Math.min(item.h, item.w) / 2)}" style="transform-box:fill-box;transform-origin:0 50%;fill:var(--riddle)"/>`;
		case "path":
			return stroke(escapeXml(item.d));
	}
}

export interface SketchRenderOptions {
	/** 0-based step shown; later steps render hidden. Default: the last. */
	step?: number;
	/** Serif title and sans subtitle inside the SVG (exports). Default false:
	 *  the page draws them as HTML above the drawing. */
	withTitle?: boolean;
}

/** The accessible name: every caption, in order; a caption's $math$ is read as its symbols. */
export const sketchLabel = (sketch: Sketch): string =>
	[sketch.title, ...sketch.steps.map((s) => s.caption)].map((t) => t.replace(/\$\$?([^$]+?)\$\$?/g, "$1").trim().replace(/[.!?]*$/, ".")).join(" ");

/** The sketch as an SVG string. Pure and deterministic: same input, same bytes. */
export function renderSketchSvg(sketch: Sketch, options: SketchRenderOptions = {}): string {
	const last = sketch.steps.length - 1;
	const current = Math.max(0, Math.min(last, options.step ?? last));
	const top = options.withTitle ? (sketch.subtitle ? 44 : 30) : 0;
	const groups = sketch.steps.map((_, i) => {
		const items = sketch.items.filter((item) => item.step === i).map(renderItem).join("");
		return `<g data-step="${i}"${i > current ? ' opacity="0"' : ""}>${items}</g>`;
	});
	const head = options.withTitle
		? `<text x="${n(sketch.w / 2)}" y="20" text-anchor="middle" font-size="17" style="font-family:${FONT_VOICE};fill:var(--ink)">${escapeXml(sketch.title)}</text>${sketch.subtitle ? `<text x="${n(sketch.w / 2)}" y="37" text-anchor="middle" font-size="11" style="font-family:${FONT_SANS};fill:var(--faint)">${escapeXml(sketch.subtitle)}</text>` : ""}`
		: "";
	const body = top ? `<g transform="translate(0 ${top})">${groups.join("")}</g>` : groups.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" class="nb-drawing" viewBox="0 0 ${n(sketch.w)} ${n(sketch.h + top)}" role="img" aria-label="${escapeXml(sketchLabel(sketch))}" fill="none" stroke="var(--graphite)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${head}${body}</svg>`;
}
