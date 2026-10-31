/** Browser drawing for wiki links, callouts and collapsible sections (feature
 *  016). No DOM at import, because the Node codec shares page-markdown.ts. */
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import type { WikiResolution } from "@/src/core";

/** What the page pane offers its links. Absent (tests, read-only): plain text. */
export interface WikiBridge {
	/** Null: not known yet, or the Library could not be read. */
	resolve: (target: string) => WikiResolution | null;
	/** Called back whenever resolutions may have changed; returns the unsubscribe. */
	subscribe: (listener: () => void) => () => void;
	follow: (target: string) => void;
}

/** What a reader hears and sees for each state, rename included. */
export function wikiLinkView(target: string, resolution: WikiResolution | null): { text: string; name: string; state: string } {
	if (!resolution) return { text: target, name: `Open ${target}`, state: "unknown" };
	if (resolution.state === "missing") return { text: target, name: `${target}, no such page yet`, state: "missing" };
	if (resolution.state === "deleted") return { text: target, name: `${target}, deleted from your Library`, state: "deleted" };
	const text = resolution.name ?? target;
	return { text, name: `Open ${text}`, state: "live" };
}

export function wikiLinkNodeView(node: PmNode, bridge?: WikiBridge) {
	const dom = document.createElement("a");
	dom.className = "lh-wiki-link";
	dom.dataset.testid = "page-wiki-link";
	dom.dataset.wikiLink = "";
	const target = String(node.attrs.target);
	dom.dataset.wikiTarget = target;
	const draw = () => {
		const view = wikiLinkView(target, bridge?.resolve(target) ?? null);
		dom.textContent = view.text;
		dom.dataset.state = view.state;
		dom.setAttribute("aria-label", view.name);
		dom.title = view.name;
	};
	draw();
	const stop = bridge?.subscribe(draw);
	dom.addEventListener("click", (event) => {
		event.preventDefault();
		bridge?.follow(target);
	});
	return { dom, destroy: () => stop?.(), ignoreMutation: () => true };
}

type GetPos = () => number | undefined;

const CALLOUT_LABEL: Record<string, string> = { NOTE: "Note", TIP: "Tip", IMPORTANT: "Important", WARNING: "Warning", CAUTION: "Caution" };

export function calloutNodeView(initial: PmNode, view: EditorView, getPos: GetPos) {
	const dom = document.createElement("aside");
	dom.className = "lh-callout";
	dom.dataset.testid = "page-callout";
	const head = document.createElement("div");
	head.className = "lh-callout-head";
	head.contentEditable = "false";
	const select = document.createElement("select");
	select.setAttribute("aria-label", "Callout type");
	select.className = "lh-callout-kind";
	select.dataset.testid = "page-callout-kind";
	for (const [value, label] of Object.entries(CALLOUT_LABEL)) select.add(new Option(label, value));
	const title = document.createElement("input");
	title.type = "text";
	title.className = "lh-callout-title";
	title.placeholder = "Title";
	title.autocomplete = "off";
	title.setAttribute("aria-label", "Callout title");
	title.dataset.testid = "page-callout-title";
	head.append(select, title);
	const contentDOM = document.createElement("div");
	contentDOM.className = "lh-callout-body";
	dom.append(head, contentDOM);
	const setAttr = (name: string, value: string) => {
		const pos = getPos();
		if (pos === undefined) return;
		view.dispatch(view.state.tr.setNodeAttribute(pos, name, value));
	};
	let node = initial;
	const draw = () => {
		const kind = String(node.attrs.kind).toUpperCase();
		dom.dataset.kind = kind.toLowerCase();
		select.value = kind in CALLOUT_LABEL ? kind : "NOTE";
		if (title.value !== String(node.attrs.title ?? "")) title.value = String(node.attrs.title ?? "");
		select.disabled = title.disabled = !view.editable;
	};
	draw();
	select.addEventListener("change", () => setAttr("kind", select.value));
	title.addEventListener("input", () => setAttr("title", title.value.replace(/\s*\n\s*/g, " ")));
	const backToText = (event: KeyboardEvent) => {
		if (event.key !== "Escape" && event.key !== "Enter") return;
		event.preventDefault();
		event.stopPropagation();
		view.focus();
	};
	title.addEventListener("keydown", backToText);
	select.addEventListener("keydown", (event) => { if (event.key === "Escape") backToText(event); });
	return {
		dom,
		contentDOM,
		update: (next: PmNode) => {
			if (next.type !== initial.type) return false;
			node = next;
			draw();
			return true;
		},
		stopEvent: (event: Event) => head.contains(event.target as Node),
		ignoreMutation: (mutation: { target: Node; type: string }) => head.contains(mutation.target),
	};
}

export function collapsibleNodeView(initial: PmNode, view: EditorView, getPos: GetPos) {
	const dom = document.createElement("div");
	dom.className = "lh-collapsible";
	dom.dataset.testid = "page-collapsible";
	const toggle = document.createElement("button");
	toggle.type = "button";
	toggle.contentEditable = "false";
	toggle.className = "lh-collapsible-toggle";
	toggle.dataset.testid = "page-collapsible-toggle";
	const contentDOM = document.createElement("div");
	contentDOM.className = "lh-collapsible-content";
	dom.append(toggle, contentDOM);
	let node = initial;
	const titleOf = () => node.child(0).textContent.trim() || "Untitled section";
	const draw = () => {
		const open = Boolean(node.attrs.open);
		dom.dataset.open = String(open);
		toggle.setAttribute("aria-expanded", String(open));
		toggle.setAttribute("aria-label", `${open ? "Collapse" : "Expand"} ${titleOf()}`);
		// A chevron drawn in CSS; the name carries the meaning.
	};
	draw();
	// The pointer press stays on the button, so the caret doesn't jump.
	toggle.addEventListener("mousedown", (event) => event.preventDefault());
	toggle.addEventListener("click", () => {
		const pos = getPos();
		if (pos === undefined) return;
		if (!view.editable) { node = node.type.create({ ...node.attrs, open: !node.attrs.open }, node.content); draw(); return; }
		view.dispatch(view.state.tr.setNodeAttribute(pos, "open", !node.attrs.open));
	});
	return {
		dom,
		contentDOM,
		update: (next: PmNode) => {
			if (next.type !== initial.type) return false;
			node = next;
			draw();
			return true;
		},
		stopEvent: (event: Event) => toggle.contains(event.target as Node),
		ignoreMutation: (mutation: { target: Node; type: string }) => toggle.contains(mutation.target),
	};
}
