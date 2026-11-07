/**
 * Ink-in for streamed Markdown (feature 025, research R9): the rehype twin
 * of Notebook's InkText (feature 024, visual-reference §12). While a tutor
 * reply streams, each word of its LAST block becomes `span.nb-ink-word`
 * (app/paper.css: .64s, wet ink to dry), staggered by `inkStepMs`. Words
 * already shown keep the delay they first got, so a re-render never
 * restarts them and React keeps their spans; only words that arrive ink in.
 * Settled replies never run the plugin, so history never animates. Under
 * reduced motion app/paper.css turns the animation off and the spans are
 * plain text.
 *
 * Elements that ink carry `nb-ink-block` (Streamdown re-renders a block only
 * when its class or source position changes).
 *
 * Units: a word with the spaces after it; an inline code span, inline math,
 * a link or a bold run inks in as one unit (bold runs stay whole so a bold
 * demo title still links to its demo while it streams). Code blocks,
 * display math, quotes (their callout marker is read from the first text)
 * and SVG are left alone.
 */
import type { Element, ElementContent, Root, RootContent } from "hast";

/** InkText's per-word delay step (§12): `min(70, 1800 / words)` ms. */
export const inkStepMs = (words: number): number => (words <= 0 ? 0 : Math.min(70, 1800 / words));

/** One streaming reply's memory: which block inks, its step, each unit's delay. */
export interface InkWordsState {
	/** Index of the root child that inked last (a new last block starts over). */
	block: number | null;
	step: number | null;
	delays: number[];
	/** Streamdown caches its processor by the plugins' JSON: one key per reply, however the state grows. */
	toJSON(): string;
}

export function inkWordsState(id: string): InkWordsState {
	return { block: null, step: null, delays: [], toJSON: () => `ink:${id}` };
}

/** Elements that ink in as one unit. */
const UNIT = new Set(["a", "strong", "b", "code", "kbd", "img", "sup", "sub"]);
/** Elements whose insides are left as they are. */
const SKIP = new Set(["pre", "blockquote", "svg", "math", "script", "style", "input", "br", "hr"]);

const classes = (el: Element): string[] => {
	const value: unknown = el.properties?.className;
	return Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(/\s+/) : [];
};
const isMath = (el: Element) => classes(el).some((c) => c.startsWith("math") || c === "language-math" || c.startsWith("katex"));

const isBlock = (node: RootContent): node is Element => node.type === "element";

export function rehypeInkWords(state: InkWordsState) {
	return (tree: Root) => {
		let index = -1;
		for (let i = tree.children.length - 1; i >= 0; i--) {
			if (isBlock(tree.children[i]!)) { index = i; break; }
		}
		if (index < 0) return;
		const block = tree.children[index] as Element;
		if (SKIP.has(block.tagName) || (block.tagName === "div" && isMath(block))) return;
		if (state.block !== index) { state.block = index; state.step = null; state.delays = []; }

		// Wrap in document order, counting units; delays are set once the total is known.
		const units: Element[] = [];
		const unit = (children: ElementContent[]): Element => {
			const span: Element = { type: "element", tagName: "span", properties: { className: ["nb-ink-word"] }, children };
			units.push(span);
			return span;
		};
		const walk = (parent: Element) => {
			// Streamdown memoizes its block components on className and source
			// position, so every element whose words ink carries a mark: when it
			// stops being the inking block (or the reply settles) the mark goes,
			// and the element re-renders without its spans.
			parent.properties = { ...parent.properties, className: [...classes(parent), "nb-ink-block"] };
			const next: ElementContent[] = [];
			for (const child of parent.children) {
				if (child.type === "text") {
					for (const piece of child.value.match(/\S+\s*|\s+/g) ?? []) {
						next.push(/\S/.test(piece) ? unit([{ type: "text", value: piece }]) : { type: "text", value: piece });
					}
				} else if (child.type === "element") {
					if (SKIP.has(child.tagName)) next.push(child);
					else if (UNIT.has(child.tagName) || isMath(child)) next.push(unit([child]));
					else { walk(child); next.push(child); }
				} else {
					next.push(child);
				}
			}
			parent.children = next;
		};
		walk(block);

		state.step ??= inkStepMs(units.length);
		const before = state.delays.length;
		for (let at = before; at < units.length; at++) state.delays.push((at - before) * state.step);
		units.forEach((span, i) => { span.properties.style = `animation-delay: ${Math.round(state.delays[i] ?? 0)}ms`; });
	};
}
