import { fromMarkdown } from "mdast-util-from-markdown";
import { math } from "micromark-extension-math";
import { mathFromMarkdown } from "mdast-util-math";

interface PositionedNode {
	type: string;
	position?: { start: { offset?: number }; end: { offset?: number } };
	children?: readonly PositionedNode[];
}

function closedFence(source: string, mathBlock: boolean): boolean {
	const lines = source.split(/\r?\n/);
	const opener = lines[0]?.match(mathBlock ? /^ {0,3}(\${2,})/ : /^ {0,3}(`{3,}|~{3,})/);
	if (!opener) return false;
	const fence = opener[1]!;
	const character = fence[0] === "$" ? "\\$" : fence[0];
	const closer = new RegExp(`^ {0,3}${character}{${fence.length},}[ \\t]*$`);
	return lines.slice(1).some((line) => closer.test(line));
}

/** A source prefix containing complete Markdown blocks, never a repaired tail.
 * Call after delimiter normalization. EOF is handled by the caller by passing
 * the whole final source, including an interrupted response's retained text. */
export function completedMarkdownPrefix(source: string): string {
	if (!source) return "";
	const tree = fromMarkdown(source, { extensions: [math()], mdastExtensions: [mathFromMarkdown()] });
	const last = tree.children.at(-1);
	if (!last) return "";
	const start = last.position?.start.offset ?? 0;
	const end = last.position?.end.offset ?? source.length;
	const raw = source.slice(start, end);
	const tail = source.slice(end);
	let complete = false;
	if (last.type === "code") complete = closedFence(raw, false);
	else if (last.type === "math") complete = closedFence(raw, true);
	else if (last.type === "heading" || last.type === "thematicBreak") complete = /\r?\n$/.test(source);
	else if (last.type !== "list" && last.type !== "blockquote") complete = /\r?\n[ \t]*\r?\n/.test(tail);
	let boundary = complete ? source.length : start;

	// A legacy math opener with no closer has deliberately not been converted
	// by transformMathDelimiters. Blank lines inside it cannot complete prose.
	const codeRanges: Array<[number, number]> = [];
	const visit = (node: PositionedNode) => {
		if (node.type === "code" || node.type === "inlineCode") codeRanges.push([node.position?.start.offset ?? 0, node.position?.end.offset ?? source.length]);
		for (const child of node.children ?? []) visit(child);
	};
	visit(tree);
	for (let index = 0; index < boundary; index++) {
		if (source[index] !== "\\" || !["[", "("].includes(source[index + 1] ?? "")) continue;
		let escapes = 0;
		for (let before = index - 1; before >= 0 && source[before] === "\\"; before--) escapes++;
		if (escapes % 2 || codeRanges.some(([a, b]) => index >= a && index < b)) continue;
		const closer = source.indexOf(source[index + 1] === "[" ? "\\]" : "\\)", index + 2);
		if (closer >= 0) { index = closer + 1; continue; }
		const owner = tree.children.find((node) => (node.position?.start.offset ?? 0) <= index && (node.position?.end.offset ?? source.length) > index);
		boundary = Math.min(boundary, owner?.position?.start.offset ?? index);
		break;
	}
	return source.slice(0, boundary);
}
