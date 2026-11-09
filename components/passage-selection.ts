/** A lesson selection as Markdown and a source (feature 017). Only teacher prose
 *  counts: `data-source-message-id` marks it. KaTeX draws a formula twice, so a
 *  formula is read from its TeX annotation, never from what's drawn. Controls in
 *  the selection (Copy buttons) aren't text. */
import { passageMarkdown, type PassageSegment } from "@/src/core";

export interface PassageSelection { markdown: string; messageId: string; rect: { left: number; top: number; bottom: number } }

const BLOCK = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TABLE", "TR", "SECTION"]);

function teXOf(element: Element): string | null {
	return element.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? null;
}

export function walk(node: Node, out: PassageSegment[]) {
	if (node.nodeType === 3) {
		if (node.textContent) out.push({ text: node.textContent });
		return;
	}
	if (node.nodeType !== 1 && node.nodeType !== 11) return;
	const element = node as Element;
	if (node.nodeType === 1) {
		if (element.matches("button, [role=button], svg, script, style")) return;
		// A reference chip (feature 027) saves the text it stands for, as before it was drawn.
		if (element instanceof HTMLElement && element.dataset.source !== undefined) { out.push({ text: element.dataset.source }); return; }
		if (element.matches(".katex-display, .katex")) {
			const tex = teXOf(element);
			if (tex !== null) { out.push({ tex, display: element.matches(".katex-display") }); return; }
		}
	}
	const block = node.nodeType === 1 && BLOCK.has(element.tagName);
	if (block) out.push({ text: "\n\n" });
	for (const child of node.childNodes) walk(child, out);
	if (block) out.push({ text: "\n\n" });
}

/** Whitespace left by the DOM's line structure collapses; the blank lines between blocks stay. */
export function tidySegments(segments: readonly PassageSegment[]): PassageSegment[] {
	return segments.map((segment) => ("text" in segment ? { text: segment.text.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n") } : segment));
}

const passageOf = (node: Node | null) => (node?.nodeType === 1 ? node as Element : node?.parentElement ?? null)?.closest<HTMLElement>("[data-source-message-id]") ?? null;

/** The current selection as a passage, or null when it isn't lesson text. */
export function readPassageSelection(selection: Selection | null, scope: HTMLElement | null): PassageSelection | null {
	if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !scope) return null;
	const range = selection.getRangeAt(0).cloneRange();
	const start = passageOf(range.startContainer);
	const end = passageOf(range.endContainer);
	if (!start || !end || !scope.contains(start) || !scope.contains(end)) return null;
	const messageId = start.dataset.sourceMessageId;
	if (!messageId) return null;
	// A selection that starts or ends inside a drawn formula takes the whole formula.
	const startMath = (range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement)?.closest(".katex");
	if (startMath) range.setStartBefore(startMath);
	const endMath = (range.endContainer.nodeType === 1 ? range.endContainer as Element : range.endContainer.parentElement)?.closest(".katex");
	if (endMath) range.setEndAfter(endMath);
	const segments: PassageSegment[] = [];
	walk(range.cloneContents(), segments);
	const markdown = passageMarkdown(tidySegments(segments));
	if (!markdown) return null;
	const box = range.getBoundingClientRect();
	return { markdown, messageId, rect: { left: box.left + box.width / 2, top: box.top, bottom: box.bottom } };
}
