/** Editor-only pieces (feature 010, US1): the placeholder, the formula and
 *  slash-menu commands. Kept out of pageExtensions(), which the Node codec
 *  shares, because none of this may reach what is stored. */
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { OPEN_MATH_SOURCE_EVENT } from "./page-math-view.ts";
import type { SlashBlock } from "./page-slash.ts";

export const PAGE_PLACEHOLDER = "Start writing, or type / for headings, lists, tables and formulas.";

/** A decoration on the one empty paragraph of an empty page: shown, never stored. */
export const PagePlaceholder = Extension.create({
	name: "pagePlaceholder",
	addProseMirrorPlugins() {
		return [new Plugin({
			key: new PluginKey("pagePlaceholder"),
			props: {
				decorations: (state) => {
					const { doc } = state;
					const only = doc.childCount === 1 ? doc.firstChild : null;
					if (!only || only.type.name !== "paragraph" || only.content.size > 0 || !this.editor.isEditable) return null;
					return DecorationSet.create(doc, [Decoration.node(0, only.nodeSize, { class: "lh-page-placeholder", "data-placeholder": PAGE_PLACEHOLDER })]);
				},
			},
		})];
	},
});

/** Opens the source of the formula node at `pos`, once the view has drawn it. */
function openMathAt(editor: Editor, pos: number) {
	requestAnimationFrame(() => editor.view.nodeDOM(pos)?.dispatchEvent(new Event(OPEN_MATH_SOURCE_EVENT)));
}

/** Ctrl/Cmd+Shift+M: the selection becomes inline TeX, or an empty formula opens for typing. */
export function insertFormula(editor: Editor): boolean {
	const { from, to, empty } = editor.state.selection;
	const selected = empty ? "" : editor.state.doc.textBetween(from, to, " ");
	if (selected.includes("\n")) return false;
	const ok = editor.chain().focus().insertContentAt({ from, to }, { type: "inlineMath", attrs: { latex: selected } }).run();
	if (ok && !selected) openMathAt(editor, from);
	return ok;
}

/** Removes the "/query" text, then makes the chosen block in its place. */
export function runSlashBlock(editor: Editor, block: SlashBlock, range: { from: number; to: number }, onImage?: () => void): boolean {
	const chain = editor.chain().focus().deleteRange(range);
	switch (block) {
		case "heading1": return chain.setNode("heading", { level: 1 }).run();
		case "heading2": return chain.setNode("heading", { level: 2 }).run();
		case "heading3": return chain.setNode("heading", { level: 3 }).run();
		case "bulletList": return chain.toggleBulletList().run();
		case "orderedList": return chain.toggleOrderedList().run();
		case "taskList": return chain.toggleTaskList().run();
		case "blockquote": return chain.setBlockquote().run();
		case "codeBlock": return chain.setCodeBlock().run();
		case "divider": return chain.setHorizontalRule().run();
		case "table": return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
		case "image": {
			const ok = chain.run();
			onImage?.();
			return ok;
		}
		case "blockMath": {
			const ok = chain.insertContent({ type: "blockMath", attrs: { latex: "" } }).run();
			let found = -1;
			if (ok) editor.state.doc.descendants((node, pos) => {
				if (found < 0 && node.type.name === "blockMath" && !node.attrs.latex) found = pos;
				return found < 0;
			});
			if (found >= 0) openMathAt(editor, found);
			return ok;
		}
	}
}

/** A link address the popover accepts: http(s) or mailto; a bare host gets https. */
export function normalizeLinkAddress(raw: string): string | null {
	const value = raw.trim();
	if (!value || /\s/.test(value)) return null;
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : /^[\w-]+(\.[\w-]+)+(\/|$|\?|#|:)/.test(value) ? `https://${value}` : null;
	if (!withScheme) return null;
	try {
		const url = new URL(withScheme);
		if (url.protocol === "mailto:") return url.pathname.includes("@") ? withScheme : null;
		return url.protocol === "http:" || url.protocol === "https:" ? withScheme : null;
	} catch {
		return null;
	}
}

/** What the tutor changed, in the editor's own Markdown form (feature 010, US3). */
export interface TutorHighlights {
	/** Blocks the tutor wrote that are still to be pointed at. */
	added: string[];
	/** Text the tutor removed, shown struck through after `anchor` (null: the top). */
	removed: { anchor: string | null; before: string | null; blocks: string[] }[];
}

export const tutorHighlightsKey = new PluginKey<{ highlights: TutorHighlights | null; set: DecorationSet }>("tutorHighlights");

/** A top-level node's Markdown, cached per node: nodes are immutable and reused. */
function nodeKeyCache(toKey: (json: unknown) => string) {
	const cache = new WeakMap<object, string>();
	return (node: { toJSON(): unknown }) => {
		let key = cache.get(node);
		if (key === undefined) { key = toKey(node.toJSON()); cache.set(node, key); }
		return key;
	};
}

function removedWidget(blocks: string[]): HTMLElement {
	const el = document.createElement("div");
	el.className = "lh-tutor-removed";
	el.dataset.testid = "page-tutor-removed";
	const label = document.createElement("span");
	label.className = "sr-only";
	label.textContent = "Removed: ";
	el.append(label, blocks.join("\n\n"));
	return el;
}

/** Highlights the tutor's blocks and shows removed text, as decorations only:
 *  nothing here is in the document, so nothing here can be stored. */
export function createTutorHighlights(toKey: (json: unknown) => string) {
	const keyOf = nodeKeyCache(toKey);
	const build = (doc: import("@tiptap/pm/model").Node, highlights: TutorHighlights | null): DecorationSet => {
		if (!highlights) return DecorationSet.empty;
		const added = new Set(highlights.added);
		const decorations: Decoration[] = [];
		const starts: { key: string; pos: number }[] = [];
		doc.forEach((node, offset) => {
			const key = keyOf(node);
			starts.push({ key, pos: offset });
			if (added.has(key)) decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: "lh-tutor-added", "data-tutor-change": "" }));
		});
		for (const removal of highlights.removed) {
			// After the anchor, or before the block that now follows it.
			let pos = 0;
			if (removal.anchor !== null) {
				const i = starts.findIndex((s) => s.key === removal.anchor);
				if (i < 0) continue;
				pos = i + 1 < starts.length ? starts[i + 1]!.pos : doc.content.size;
			} else if (removal.before !== null) {
				const i = starts.findIndex((s) => s.key === removal.before);
				pos = i >= 0 ? starts[i]!.pos : 0;
			}
			decorations.push(Decoration.widget(pos, () => removedWidget(removal.blocks), { side: -1, key: `removed-${pos}-${removal.blocks.join("|").length}` }));
		}
		return DecorationSet.create(doc, decorations);
	};
	return Extension.create({
		name: "tutorHighlights",
		addProseMirrorPlugins() {
			return [new Plugin({
				key: tutorHighlightsKey,
				state: {
					init: (): { highlights: TutorHighlights | null; set: DecorationSet } => ({ highlights: null, set: DecorationSet.empty }),
					apply: (tr, value, _old, state) => {
						const next = tr.getMeta(tutorHighlightsKey) as TutorHighlights | null | undefined;
						if (next !== undefined) return { highlights: next, set: build(state.doc, next) };
						if (!tr.docChanged || !value.highlights) return value;
						return { highlights: value.highlights, set: build(state.doc, value.highlights) };
					},
				},
				props: { decorations: (state) => tutorHighlightsKey.getState(state)?.set ?? null },
			})];
		},
	});
}

export interface PageHeading { level: 1 | 2 | 3; text: string; pos: number }
export interface PageStats { words: number; headings: PageHeading[] }

const UNCOUNTED = new Set(["inlineMath", "blockMath", "codeBlock", "rawBlock", "rawInline", "pageImage"]);

/** Words in prose (not formulas, code or raw source) and the h1–h3 outline. */
export function pageStats(doc: import("@tiptap/pm/model").Node, count: (text: string) => number): PageStats {
	const parts: string[] = [];
	const headings: PageHeading[] = [];
	doc.descendants((node, pos) => {
		if (UNCOUNTED.has(node.type.name)) return false;
		if (node.type.name === "heading" && node.attrs.level <= 3) headings.push({ level: node.attrs.level as 1 | 2 | 3, text: node.textContent, pos });
		if (node.isText && !node.marks.some((m) => m.type.name === "code")) parts.push(node.text ?? "");
		if (node.isBlock) parts.push(" ");
		return true;
	});
	return { words: count(parts.join("")), headings };
}
