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
