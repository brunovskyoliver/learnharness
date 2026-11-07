/**
 * A diagram as a standalone SVG (feature 022): the export and every preview.
 * Pure, so the escaping is testable. Learner text only ever reaches the output
 * through `escapeXml`, inside <text> and <title>; it is never markup, an attribute
 * name or a style. No script, link or external reference is written.
 */
import { diagramNodeName, type DiagramDoc, type DiagramNode } from "./diagram.ts";

/** Also drops characters XML 1.0 can't hold, which would make the file unreadable. */
export function escapeXml(text: string): string {
	return text
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f￾￿]/g, "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** Paper light as literal colours (app/paper.css: paper, shelf, ink, graphite, faint, rule;
 *  feature 025 T051): a downloaded file can't read the app's tokens, and a file on light
 *  paper reads the same in any viewer. */
const COLOR = { ground: "#f8f7f4", raised: "#f1f0ec", raised2: "#f8f7f4", ink: "#1d1c1a", ink2: "#5c5953", edge: "#716d67", rule: "#dedbd4" } as const;
const FONT_SIZE = 14;
const LINE = 19;
const PAD_X = 12;
const PAD_Y = 10;
const WRAP_CHARS = 26;
const MARGIN = 32;
const CHAR_WIDTH = 7.6;

function wrap(text: string, width = WRAP_CHARS): string[] {
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		let line = "";
		for (let word of paragraph.split(/\s+/)) {
			while (word.length > width) {
				if (line) { lines.push(line); line = ""; }
				lines.push(word.slice(0, width));
				word = word.slice(width);
			}
			if (!word) continue;
			if (line && line.length + 1 + word.length > width) { lines.push(line); line = word; }
			else line = line ? `${line} ${word}` : word;
		}
		lines.push(line);
	}
	return lines.length > 1 ? lines.filter((line, i) => line || i < lines.length - 1) : lines;
}

export interface DiagramBox { x: number; y: number; width: number; height: number; lines: string[] }

/** The size a node draws at, worked out from its text so export needs no browser. */
export function diagramNodeBox(node: DiagramNode): DiagramBox {
	if (node.type === "stroke") {
		const xs = (node.points ?? []).map((p) => p[0]);
		const ys = (node.points ?? []).map((p) => p[1]);
		return { x: node.x, y: node.y, width: Math.max(1, ...xs), height: Math.max(1, ...ys), lines: [] };
	}
	const lines = wrap(diagramNodeName(node));
	const width = Math.max(node.type === "sticky" ? 180 : 120, Math.max(...lines.map((line) => line.length)) * CHAR_WIDTH + PAD_X * 2);
	const height = Math.max(node.type === "sticky" ? 120 : 40, lines.length * LINE + PAD_Y * 2);
	return { x: node.x, y: node.y, width: Math.round(width), height: Math.round(height), lines };
}

const n = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** Where a line from the box's centre towards (tx, ty) leaves the box. */
function boxEdge(box: DiagramBox, tx: number, ty: number): [number, number] {
	const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
	const dx = tx - cx, dy = ty - cy;
	if (dx === 0 && dy === 0) return [cx, cy];
	const scale = Math.min(dx ? (box.width / 2) / Math.abs(dx) : Infinity, dy ? (box.height / 2) / Math.abs(dy) : Infinity);
	return [cx + dx * scale, cy + dy * scale];
}

export function diagramToSvg(doc: DiagramDoc, title?: string): string {
	const boxes = new Map(doc.nodes.map((node) => [node.id, diagramNodeBox(node)]));
	const all = [...boxes.values()];
	const minX = all.length ? Math.min(...all.map((b) => b.x)) - MARGIN : 0;
	const minY = all.length ? Math.min(...all.map((b) => b.y)) - MARGIN : 0;
	const maxX = all.length ? Math.max(...all.map((b) => b.x + b.width)) + MARGIN : 320;
	const maxY = all.length ? Math.max(...all.map((b) => b.y + b.height)) + MARGIN : 160;
	const width = Math.max(1, Math.ceil(maxX - minX));
	const height = Math.max(1, Math.ceil(maxY - minY));
	const parts: string[] = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${n(minX)} ${n(minY)} ${width} ${height}" role="img" font-family="'Source Sans 3', 'Helvetica Neue', Arial, sans-serif" font-size="${FONT_SIZE}">`,
		...(title ? [`<title>${escapeXml(title)}</title>`] : []),
		`<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${COLOR.edge}"/></marker></defs>`,
		`<rect x="${n(minX)}" y="${n(minY)}" width="${width}" height="${height}" fill="${COLOR.ground}"/>`,
	];
	for (const edge of doc.edges) {
		const from = boxes.get(edge.from), to = boxes.get(edge.to);
		if (!from || !to) continue;
		const [x1, y1] = boxEdge(from, to.x + to.width / 2, to.y + to.height / 2);
		const [x2, y2] = boxEdge(to, from.x + from.width / 2, from.y + from.height / 2);
		parts.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${COLOR.edge}" stroke-width="1.5" marker-end="url(#arrow)"/>`);
		if (edge.label.trim()) {
			const lines = wrap(edge.label.trim().replace(/\s+/g, " "));
			const longest = Math.max(...lines.map((line) => line.length)) * CHAR_WIDTH;
			const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
			parts.push(`<rect x="${n(cx - longest / 2 - 4)}" y="${n(cy - (lines.length * LINE) / 2)}" width="${n(longest + 8)}" height="${lines.length * LINE}" fill="${COLOR.ground}"/>`);
			lines.forEach((line, i) => parts.push(`<text x="${n(cx)}" y="${n(cy - ((lines.length - 1) * LINE) / 2 + i * LINE + 5)}" text-anchor="middle" fill="${COLOR.ink2}">${escapeXml(line)}</text>`));
		}
	}
	for (const node of doc.nodes) {
		const box = boxes.get(node.id)!;
		if (node.type === "stroke") {
			const path = (node.points ?? []).map(([x, y], i) => `${i ? "L" : "M"}${n(node.x + x)} ${n(node.y + y)}`).join("");
			parts.push(`<path d="${path}" fill="none" stroke="${COLOR.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
			continue;
		}
		parts.push(`<rect x="${n(box.x)}" y="${n(box.y)}" width="${box.width}" height="${box.height}" rx="${node.type === "sticky" ? 10 : 6}" fill="${node.type === "sticky" ? COLOR.raised2 : COLOR.raised}" stroke="${COLOR.rule}" stroke-width="1"/>`);
		const textTop = box.y + box.height / 2 - ((box.lines.length - 1) * LINE) / 2 + 5;
		box.lines.forEach((line, i) => parts.push(`<text x="${n(box.x + box.width / 2)}" y="${n(textTop + i * LINE)}" text-anchor="middle" fill="${COLOR.ink}">${escapeXml(line)}</text>`));
	}
	parts.push("</svg>");
	return parts.join("\n");
}
