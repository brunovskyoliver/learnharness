"use client";

/**
 * The note's body (feature 024, research R2): Notebook's own TipTap editor
 * on the Library's `pageExtensions()` and `createPageCodec()`, so a page
 * round-trips byte for byte between Study and Notebook. Holds no storage
 * logic: it takes the stored Markdown and answers with Markdown through
 * `onChange` (the note view hands that to `usePageDraft`). The slash menu
 * and the `[[` list are Study's, drawn in Notebook's tokens.
 */
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { isWikiTarget, matchMentions, wikiQuery, type LibraryItem, type NoteMode } from "@/src/core";
import { insertFormula, runSlashBlock } from "@/components/library/page-editor-extras";
import { createPageCodec, pageExtensions } from "@/components/library/page-markdown";
import { OPEN_MATH_SOURCE_EVENT } from "@/components/library/page-math-view";
import type { WikiBridge } from "@/components/library/page-note-views";
import { slashQuery, type SlashItem } from "@/components/library/page-slash";
import { anchorBelowSelection, filterSlashItems, SlashMenu, WikiMenu, type WikiMenuRow } from "@/components/library/page-toolbar";

const CHANGE_DELAY_MS = 120;

/** ui-contract.md "Chrome": the empty body's two lines. */
export function bodyPlaceholder(mode: NoteMode): string {
	return `Start writing. Type / for blocks.\n${mode === "ask" ? "Nothing here is read unless you ask." : "Nothing here is read until you pause."}`;
}

export interface NoteEditorHandle {
	/** Hand over text still inside the short serialize delay. */
	flush: () => void;
	/** Caret at the start of the body (Enter in the title). */
	focusStart: () => void;
}

const placeholderKey = new PluginKey("nbPlaceholder");

/** The empty note's placeholder, re-read on every transaction so a mode change shows. */
function notePlaceholder(text: () => string) {
	return Extension.create({
		name: "nbPlaceholder",
		addProseMirrorPlugins() {
			return [new Plugin({
				key: placeholderKey,
				props: {
					decorations: (state) => {
						const { doc } = state;
						const only = doc.childCount === 1 ? doc.firstChild : null;
						if (!only || only.type.name !== "paragraph" || only.content.size > 0 || !this.editor.isEditable) return null;
						return DecorationSet.create(doc, [Decoration.node(0, only.nodeSize, { class: "nb-placeholder", "data-placeholder": text() })]);
					},
				},
			})];
		},
	});
}

export default function NoteEditor({ value, onChange, onSave, onExitTop, readOnly = false, ariaLabel, mode, handle, wiki, wikiMenu }: {
	value: string;
	onChange: (markdown: string) => void;
	onSave?: () => void;
	/** ArrowUp on the first line: back to the title. */
	onExitTop?: () => void;
	readOnly?: boolean;
	ariaLabel: string;
	mode: NoteMode;
	handle?: Ref<NoteEditorHandle>;
	wiki?: WikiBridge;
	wikiMenu?: () => { items: readonly LibraryItem[]; status: string | null };
}) {
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const saveRef = useRef(onSave);
	saveRef.current = onSave;
	const exitRef = useRef(onExitTop);
	exitRef.current = onExitTop;
	const placeholderRef = useRef(bodyPlaceholder(mode));
	placeholderRef.current = bodyPlaceholder(mode);
	// The stored text at load only; a new text from outside arrives with a new key.
	const [codec] = useState(() => createPageCodec(value));
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);

	const emit = useCallback(() => {
		if (timer.current) { clearTimeout(timer.current); timer.current = null; }
		const editor = editorRef.current;
		if (editor && !editor.isDestroyed) onChangeRef.current(codec.toMarkdown(editor.getJSON()));
	}, [codec]);

	const wikiRef = useRef<WikiBridge | undefined>(wiki);
	const extensions = useMemo(() => [
		...pageExtensions({ onSave: () => { emit(); saveRef.current?.(); }, wiki: wikiRef.current }),
		notePlaceholder(() => placeholderRef.current),
	], [emit]);
	const host = useRef<HTMLDivElement>(null);

	// The slash menu: open while the caret ends a paragraph that holds "/query".
	const [slashActive, setSlashActive] = useState(0);
	const slashDismissed = useRef<string | null>(null);
	const slashRef = useRef<{ items: SlashItem[]; range: { from: number; to: number } } | null>(null);
	const [wikiActive, setWikiActive] = useState(0);
	const wikiDismissed = useRef<string | null>(null);
	const wikiMenuRef = useRef<{ rows: WikiMenuRow[]; range: { from: number; to: number } } | null>(null);
	const pickSlashRef = useRef<(item: SlashItem) => void>(() => {});
	const pickWikiRef = useRef<(row: WikiMenuRow) => void>(() => {});
	const slashActiveRef = useRef(0);
	const wikiActiveRef = useRef(0);
	const [, redraw] = useState(0);

	const menuKeys = (view: import("@tiptap/pm/view").EditorView, event: KeyboardEvent, open: { rows: number; range: { from: number; to: number } } | null, setActive: (fn: (i: number) => number) => void, pick: () => void, dismissed: { current: string | null }): boolean => {
		if (!open || event.isComposing) return false;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const n = Math.max(1, open.rows);
			setActive((i) => (i + (event.key === "ArrowDown" ? 1 : n - 1)) % n);
			return true;
		}
		if ((event.key === "Enter" || event.key === "Tab") && open.rows > 0) {
			event.preventDefault();
			pick();
			return true;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			dismissed.current = view.state.doc.textBetween(open.range.from, open.range.to);
			redraw((n) => n + 1);
			return true;
		}
		return false;
	};

	const editor = useEditor({
		extensions,
		content: codec.doc,
		editable: !readOnly,
		immediatelyRender: false,
		editorProps: {
			attributes: {
				role: "textbox",
				"aria-multiline": "true",
				"aria-label": ariaLabel,
				class: "lh-page-editor nb-prose",
				"data-testid": "nb-editor",
				spellcheck: "true",
			},
			handleTextInput: (view) => {
				const selection = view.state.selection;
				return selection instanceof NodeSelection && (selection.node.type.name === "inlineMath" || selection.node.type.name === "blockMath");
			},
			handleKeyDown: (view, event) => {
				const wikiOpen = wikiMenuRef.current;
				if (menuKeys(view, event, wikiOpen && { rows: wikiOpen.rows.length, range: wikiOpen.range }, setWikiActive, () => pickWikiRef.current(wikiOpen!.rows[Math.min(wikiActiveRef.current, wikiOpen!.rows.length - 1)]!), wikiDismissed)) return true;
				const slash = slashRef.current;
				if (menuKeys(view, event, slash && { rows: slash.items.length, range: slash.range }, setSlashActive, () => pickSlashRef.current(slash!.items[Math.min(slashActiveRef.current, slash!.items.length - 1)]!), slashDismissed)) return true;
				const mod = event.metaKey || event.ctrlKey;
				if (mod && event.shiftKey && event.key.toLowerCase() === "m") {
					event.preventDefault();
					if (editorRef.current) insertFormula(editorRef.current);
					return true;
				}
				if (mod && !event.shiftKey && event.key.toLowerCase() === "s") {
					event.preventDefault();
					emit();
					saveRef.current?.();
					return true;
				}
				if (event.key === "ArrowUp" && !mod && !event.shiftKey && exitRef.current) {
					const { $from, empty } = view.state.selection;
					const atFirstLine = empty && $from.before(1) === 0 && view.endOfTextblock("up");
					if (atFirstLine) { event.preventDefault(); exitRef.current(); return true; }
				}
				const selection = view.state.selection;
				if (event.key === "Enter" && selection instanceof NodeSelection && (selection.node.type.name === "inlineMath" || selection.node.type.name === "blockMath")) {
					event.preventDefault();
					view.nodeDOM(selection.from)?.dispatchEvent(new Event(OPEN_MATH_SOURCE_EVENT));
					return true;
				}
				return false;
			},
		},
		onCreate: ({ editor: created }) => { codec.settle(created.getJSON()); },
		onUpdate: () => {
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(emit, CHANGE_DELAY_MS);
		},
		onBlur: () => { if (timer.current) emit(); },
	}, [extensions]);
	editorRef.current = editor;

	// A mode change rewrites the second placeholder line.
	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		editor.view.dispatch(editor.state.tr.setMeta(placeholderKey, mode).setMeta("addToHistory", false));
	}, [editor, mode]);

	const slashState = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			if (!e || !e.isEditable) return null;
			const { $from, empty } = e.state.selection;
			if (!empty || $from.parent.type.name !== "paragraph") return null;
			const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "￼");
			const after = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, "\n", "￼");
			const query = slashQuery(before, after);
			return query === null ? null : { query, from: $from.start(), to: $from.pos };
		},
		equalityFn: (a, b) => a?.query === b?.query && a?.from === b?.from && a?.to === b?.to,
	});
	const slashText = slashState ? `/${slashState.query}` : null;
	if (slashText === null || (slashDismissed.current !== null && slashDismissed.current !== slashText)) slashDismissed.current = null;
	const slashOpen = !!slashState && slashDismissed.current === null;
	const slashItems = useMemo(() => (slashState ? filterSlashItems(slashState.query).filter((item) => item.id !== "image") : []), [slashState]);
	slashRef.current = slashOpen && slashState ? { items: slashItems, range: { from: slashState.from, to: slashState.to } } : null;
	slashActiveRef.current = slashActive;
	useEffect(() => { setSlashActive(0); }, [slashState?.query]);
	pickSlashRef.current = (item) => {
		const range = slashRef.current?.range;
		if (editor && range) runSlashBlock(editor, item.id, range);
	};

	const wikiState = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			if (!e || !e.isEditable) return null;
			const { $from, empty } = e.state.selection;
			if (!empty || !$from.parent.inlineContent || $from.parent.type.spec.code || $from.parent.type.name === "collapsibleSummary") return null;
			const found = wikiQuery($from.parent.textBetween(0, $from.parentOffset, "\n", "￼"));
			return found ? { query: found.query, from: $from.start() + found.start, to: $from.pos } : null;
		},
		equalityFn: (a, b) => a?.query === b?.query && a?.from === b?.from && a?.to === b?.to,
	});
	const wikiText = wikiState ? `[[${wikiState.query}` : null;
	if (wikiText === null || (wikiDismissed.current !== null && wikiDismissed.current !== wikiText)) wikiDismissed.current = null;
	const wikiOpen = Boolean(wikiState && wiki && wikiMenu && wikiDismissed.current === null);
	const wikiSource = wikiOpen ? wikiMenu!() : null;
	const wikiRows: WikiMenuRow[] = useMemo(() => {
		if (!wikiState || !wikiSource) return [];
		const typed = wikiState.query.trim();
		const items = matchMentions(wikiSource.items.filter((item) => isWikiTarget(item.name)), typed).slice(0, 8);
		const exact = items.some((item) => item.name.toLowerCase() === typed.toLowerCase());
		return [...items.map((item): WikiMenuRow => ({ kind: "item", item })), ...(typed && !exact && isWikiTarget(typed) ? [{ kind: "new", target: typed } as WikiMenuRow] : [])];
	}, [wikiState, wikiSource]);
	wikiMenuRef.current = wikiOpen && wikiState ? { rows: wikiRows, range: { from: wikiState.from, to: wikiState.to } } : null;
	wikiActiveRef.current = wikiActive;
	useEffect(() => { setWikiActive(0); }, [wikiState?.query]);
	pickWikiRef.current = (row) => {
		const range = wikiMenuRef.current?.range;
		if (!editor || !range) return;
		const target = row.kind === "item" ? row.item.name : row.target;
		editor.chain().focus().insertContentAt(range, { type: "wikiLink", attrs: { target } }).run();
	};
	useEffect(() => wiki?.subscribe(() => redraw((n) => n + 1)), [wiki]);

	// Unmounting hands over what is still waiting; TipTap destroys the editor a tick later.
	useEffect(() => () => { if (timer.current) emit(); }, [emit]);
	useImperativeHandle(handle, () => ({
		flush: () => { if (timer.current) emit(); },
		focusStart: () => { editorRef.current?.chain().focus("start").run(); },
	}), [emit]);

	return (
		<div ref={host} className="nb-editor-host">
			<EditorContent editor={editor} />
			{editor && wikiOpen && wikiSource && <WikiMenu rows={wikiRows} status={wikiSource.status ?? (wikiRows.length === 0 ? "Keep typing a page name." : null)} active={Math.min(wikiActive, Math.max(0, wikiRows.length - 1))} at={anchorBelowSelection(editor, host.current)} onPick={(row) => pickWikiRef.current(row)} />}
			{editor && slashOpen && <SlashMenu items={slashItems} query={slashState!.query} active={Math.min(slashActive, Math.max(0, slashItems.length - 1))} at={anchorBelowSelection(editor, host.current)} onPick={(item) => pickSlashRef.current(item)} />}
		</div>
	);
}
