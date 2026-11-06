/**
 * Notebook's editor layer (feature 024, research R2/R5): the note's plain
 * text (what a read sends and what thread anchors are matched against),
 * a bridge so the margin, the reading marks and the pause timer can follow
 * the editor, and one ProseMirror plugin that draws the AI's marks into the
 * text without touching it: passage anchors (`nb-anchor`, Riddled's
 * `.riddle-anchor` states), the asking wash (`nb-asking`) and the spacers
 * that reserve room under a block for an inline reply (`.riddle-spacer`).
 */
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { resolveAnchor, type ThreadAnchor } from "@/src/core";

// ─── the note's plain text ───────────────────────────────────────────────────

export interface NoteText {
	text: string;
	/** Document position of each character (index text.length = after the last). */
	positions: Int32Array;
}

/**
 * The note as plain text: textblocks separated by a blank line, list items
 * led by "- " or "1. ", headings by "#", hard breaks as newlines. Inline
 * atoms (math, wiki links) give their leaf text. Each character maps back
 * to a document position, so a quote found in the text is a range in the
 * editor.
 */
export function noteText(doc: PMNode): NoteText {
	let text = "";
	const positions: number[] = [];
	let first = true;
	const push = (chars: string, pos: number, step: boolean) => {
		for (let i = 0; i < chars.length; i++) positions.push(step ? pos + i : pos);
		text += chars;
	};
	doc.descendants((node, pos, parent) => {
		if (!node.isTextblock) return true;
		const start = pos + 1;
		if (!first) push("\n\n", start, false);
		first = false;
		let lead = "";
		if (node.type.name === "heading") lead = `${"#".repeat(Number(node.attrs.level) || 1)} `;
		if (parent && (parent.type.name === "listItem" || parent.type.name === "taskItem") && parent.firstChild === node) {
			const list = doc.resolve(pos).node(-1);
			if (list.type.name === "orderedList") {
				let at = 0;
				list.forEach((child, _offset, i) => { if (child === parent) at = i; });
				lead = `${(Number(list.attrs.start) || 1) + at}. `;
			} else lead = "- ";
		}
		if (lead) push(lead, start, false);
		node.forEach((child, offset) => {
			const at = start + offset;
			if (child.isText) push(child.text ?? "", at, true);
			else if (child.type.name === "hardBreak") push("\n", at, false);
			else {
				const leaf = child.type.spec.leafText?.(child) ?? child.textContent;
				push(leaf, at, false);
			}
		});
		return false;
	});
	// The end index maps to the position after the last character.
	positions.push(text.length ? positions[text.length - 1]! + 1 : 0);
	return { text, positions: Int32Array.from(positions) };
}

/** A thread anchor as a document range in this text, or null (detached). */
export function anchorRange(note: NoteText, anchor: ThreadAnchor): { from: number; to: number } | null {
	const found = resolveAnchor(note.text, anchor);
	if ("detached" in found) return null;
	return textRange(note, found.start, found.end);
}

/** A span of the plain text as a document range (leading synthetic markers skipped). */
export function textRange(note: NoteText, start: number, end: number): { from: number; to: number } | null {
	if (end <= start) return null;
	const from = note.positions[start] ?? 0;
	const to = Math.max(from + 1, (note.positions[end - 1] ?? from) + 1);
	return { from, to };
}

/** The first occurrence of a quote (the passage a read is considering). */
export function quoteRange(note: NoteText, quote: string): { from: number; to: number } | null {
	const at = note.text.indexOf(quote);
	return at < 0 ? null : textRange(note, at, at + quote.length);
}

// ─── the bridge ──────────────────────────────────────────────────────────────

/** "doc": the text changed (any cause); "edit": he changed it, typing in the focused editor. */
export type BridgeEvent = "doc" | "edit" | "view" | "decor" | "composition-start" | "composition-end";

/** Lets Notebook's layers follow the editor without owning it. */
export class NoteBridge {
	view: EditorView | null = null;
	private listeners = new Set<(event: BridgeEvent) => void>();
	private cleanup: (() => void) | null = null;
	private cached: { doc: PMNode; text: NoteText } | null = null;

	attach(view: EditorView | null): void {
		this.cleanup?.();
		this.cleanup = null;
		this.view = view;
		if (view) {
			const start = () => this.emit("composition-start");
			const end = () => this.emit("composition-end");
			view.dom.addEventListener("compositionstart", start);
			view.dom.addEventListener("compositionend", end);
			this.cleanup = () => {
				view.dom.removeEventListener("compositionstart", start);
				view.dom.removeEventListener("compositionend", end);
			};
		}
		this.emit("view");
	}

	subscribe(fn: (event: BridgeEvent) => void): () => void {
		this.listeners.add(fn);
		return () => { this.listeners.delete(fn); };
	}

	emit(event: BridgeEvent): void {
		for (const fn of [...this.listeners]) fn(event);
	}

	/** The plain text of the current document (cached per document). */
	text(): NoteText | null {
		const view = this.view;
		if (!view || view.isDestroyed) return null;
		if (this.cached?.doc !== view.state.doc) this.cached = { doc: view.state.doc, text: noteText(view.state.doc) };
		return this.cached.text;
	}

	/** Changes the AI marks (no history, no change to his text). */
	setDecor(patch: DecorPatch): void {
		const view = this.view;
		if (!view || view.isDestroyed) return;
		view.dispatch(view.state.tr.setMeta(nbDecorKey, patch).setMeta("addToHistory", false));
		this.emit("decor");
	}

	decor(): DecorState | null {
		const view = this.view;
		return view && !view.isDestroyed ? nbDecorKey.getState(view.state) ?? null : null;
	}
}

// ─── the plugin ──────────────────────────────────────────────────────────────

export interface AnchorMark {
	id: string;
	from: number;
	to: number;
	state: "open" | "resolved";
	active?: boolean;
	kind?: "margin" | "inline";
}

export interface SpacerMark { id: string; pos: number; height: number }

export interface DecorState {
	anchors: AnchorMark[];
	asking: { from: number; to: number } | null;
	spacers: SpacerMark[];
	deco: DecorationSet;
}

export type DecorPatch = Partial<Pick<DecorState, "anchors" | "asking" | "spacers">>;

export const nbDecorKey = new PluginKey<DecorState>("nbDecor");

function spacerWidget(spacer: SpacerMark) {
	return Decoration.widget(spacer.pos, () => {
		const el = document.createElement("div");
		el.className = "nb-spacer";
		el.contentEditable = "false";
		el.setAttribute("aria-hidden", "true");
		el.dataset.thread = spacer.id;
		el.style.height = `${spacer.height}px`;
		return el;
	}, { key: `nb-spacer-${spacer.id}-${Math.round(spacer.height)}`, side: -1, ignoreSelection: true });
}

function build(doc: PMNode, anchors: AnchorMark[], asking: DecorState["asking"], spacers: SpacerMark[]): DecorationSet {
	const size = doc.content.size;
	const clamp = (n: number) => Math.max(0, Math.min(size, n));
	const decos: Decoration[] = [];
	for (const a of anchors) {
		const from = clamp(a.from), to = clamp(a.to);
		if (to <= from) continue;
		decos.push(Decoration.inline(from, to, {
			class: "nb-anchor",
			"data-state": a.state,
			"data-thread": a.id,
			...(a.active ? { "data-active": "true" } : {}),
			...(a.kind === "inline" ? { "data-kind": "reply" } : {}),
		}));
	}
	if (asking && asking.to > asking.from) decos.push(Decoration.inline(clamp(asking.from), clamp(asking.to), { class: "nb-asking" }));
	for (const s of spacers) decos.push(spacerWidget({ ...s, pos: clamp(s.pos) }));
	return DecorationSet.create(doc, decos);
}

const mapRange = <T extends { from: number; to: number }>(r: T, map: (pos: number, assoc: number) => number): T => ({ ...r, from: map(r.from, 1), to: map(r.to, -1) });

/** The plugin as a TipTap extension, for the note editor's extension list. */
export const NotebookDecor = Extension.create({
	name: "nbDecor",
	addProseMirrorPlugins() {
		return [new Plugin<DecorState>({
			key: nbDecorKey,
			state: {
				init: (_config, state: EditorState) => ({ anchors: [], asking: null, spacers: [], deco: DecorationSet.create(state.doc, []) }),
				apply: (tr, prev) => {
					const patch = tr.getMeta(nbDecorKey) as DecorPatch | undefined;
					if (!patch && !tr.docChanged) return prev;
					const map = (pos: number, assoc: number) => tr.mapping.map(pos, assoc);
					let anchors = tr.docChanged ? prev.anchors.map((a) => mapRange(a, map)).filter((a) => a.to > a.from) : prev.anchors;
					let asking = tr.docChanged && prev.asking ? mapRange(prev.asking, map) : prev.asking;
					let spacers = tr.docChanged ? prev.spacers.map((s) => ({ ...s, pos: map(s.pos, -1) })) : prev.spacers;
					if (patch?.anchors) anchors = patch.anchors;
					if (patch && "asking" in patch) asking = patch.asking ?? null;
					if (patch?.spacers) spacers = patch.spacers;
					return { anchors, asking, spacers, deco: build(tr.doc, anchors, asking, spacers) };
				},
			},
			props: { decorations: (state) => nbDecorKey.getState(state)?.deco ?? null },
		})];
	},
});

/** Where an inline reply goes: after the top-level block holding `pos`. */
export function blockEnd(doc: PMNode, pos: number): number {
	const $pos = doc.resolve(Math.max(0, Math.min(doc.content.size, pos)));
	return $pos.depth >= 1 ? $pos.after(1) : $pos.pos;
}
