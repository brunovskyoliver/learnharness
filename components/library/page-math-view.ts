import katex from "katex";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/** Asks a formula's node view to open its source. */
export const OPEN_MATH_SOURCE_EVENT = "lh-open-math-source";

const isModS = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";

/** A formula edited in place as source, between its own delimiters (owner,
 *  2026-10-31: no pop-up). Each keystroke goes into the document, so a reload
 *  keeps the edit like any other typing. Escape puts back the TeX it opened
 *  with; clearing the source and leaving removes the formula. */
export function mathNodeView({ node: initial, view, getPos, kind, katexOptions, onSave }: {
	node: PmNode;
	view: EditorView;
	getPos: () => number | undefined;
	kind: "inline" | "block";
	katexOptions: Record<string, unknown>;
	onSave: () => void;
}) {
	let node = initial;
	let source: HTMLTextAreaElement | null = null;
	let opened = "";
	const dom = document.createElement(kind === "inline" ? "span" : "div");
	const baseClass = view.editable ? "tiptap-mathematics-render tiptap-mathematics-render--editable" : "tiptap-mathematics-render";
	dom.dataset.type = `${kind}-math`;

	function render() {
		dom.className = baseClass;
		dom.setAttribute("data-latex", String(node.attrs.latex));
		const inner = document.createElement(kind === "inline" ? "span" : "div");
		inner.className = `${kind}-math-inner`;
		try { katex.render(String(node.attrs.latex), inner, katexOptions); }
		catch { inner.textContent = String(node.attrs.latex); dom.classList.add(`${kind}-math-error`); }
		dom.replaceChildren(inner);
	}

	function setLatex(latex: string) {
		const pos = getPos();
		if (pos === undefined || latex === node.attrs.latex) return;
		view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex }));
	}

	/** Leaves the source; `refocus` hands the caret back to the editor (keyboard exits). */
	function close(refocus: boolean) {
		if (!source) return;
		const empty = !source.value.trim();
		source = null;
		const pos = getPos();
		if (empty && pos !== undefined) {
			view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
		} else {
			render();
		}
		if (refocus) view.focus();
	}

	function open() {
		if (source || !view.editable) return;
		opened = String(node.attrs.latex);
		const delimiter = (text: string) => {
			const part = document.createElement("span");
			part.className = "lh-math-delimiter";
			part.setAttribute("aria-hidden", "true");
			part.textContent = text.trim();
			return part;
		};
		const field = document.createElement("textarea");
		field.className = "lh-math-input";
		field.value = opened;
		field.rows = 1;
		field.spellcheck = false;
		field.setAttribute("aria-label", "TeX source");
		field.dataset.testid = "page-math-source";
		field.addEventListener("input", () => { if (field.value.trim()) setLatex(field.value); });
		field.addEventListener("blur", () => { if (source === field) close(false); });
		field.addEventListener("keydown", (event) => {
			// Claimed here so document-level lesson and pane keys don't also act.
			event.stopPropagation();
			if (isModS(event)) { event.preventDefault(); if (field.value.trim()) setLatex(field.value); onSave(); return; }
			if (event.key === "Escape") {
				event.preventDefault();
				field.value = opened;
				setLatex(opened);
				close(true);
				return;
			}
			if (event.key === "Enter" && (kind === "inline" || event.metaKey || event.ctrlKey) && !event.isComposing) {
				event.preventDefault();
				close(true);
			}
		});
		source = field;
		dom.className = "lh-math-source";
		dom.replaceChildren(delimiter(String(node.attrs.open)), field, delimiter(String(node.attrs.close)));
		field.focus();
		field.setSelectionRange(field.value.length, field.value.length);
	}

	const onClick = (event: Event) => {
		if (source || !view.editable) return;
		event.preventDefault();
		event.stopPropagation();
		open();
	};
	dom.addEventListener("click", onClick);
	dom.addEventListener(OPEN_MATH_SOURCE_EVENT, open);
	render();

	return {
		dom,
		update(next: PmNode) {
			if (next.type !== node.type) return false;
			node = next;
			if (!source) render();
			return true;
		},
		// The field owns its own keys, selection and pointer while it's open.
		stopEvent: (event: Event) => Boolean(source && event.target === source),
		ignoreMutation: () => true,
		destroy() {
			dom.removeEventListener("click", onClick);
			dom.removeEventListener(OPEN_MATH_SOURCE_EVENT, open);
		},
	};
}
