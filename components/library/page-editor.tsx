"use client";

import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { insertFormula, PagePlaceholder, runSlashBlock } from "./page-editor-extras.ts";
import { createPageCodec, pageExtensions } from "./page-markdown.ts";
import { OPEN_MATH_SOURCE_EVENT } from "./page-math-view.ts";
import { slashQuery, type SlashItem } from "./page-slash.ts";
import { anchorBelowSelection, filterSlashItems, LinkPopover, PageToolbar, SlashMenu } from "./page-toolbar.tsx";

const CHANGE_DELAY_MS = 120;

export interface PageEditorHandle {
	/** Hand over text still inside the short serialize delay. */
	flush: () => void;
	focus: () => void;
}

/** What makes the surface a named, focusable text field. */
export function pageEditorAttributes(ariaLabel: string): Record<string, string> {
	return {
		role: "textbox",
		"aria-multiline": "true",
		"aria-label": ariaLabel,
		class: "lh-prose lh-page-editor",
		"data-testid": "page-editor",
	};
}

/** The one rich-text surface, loaded on demand. Holds no storage logic: it takes
 *  stored Markdown, and answers with Markdown that is byte-identical until
 *  something is really edited (components/library/page-markdown.ts). A new
 *  `value` from outside comes with a new React key. */
export function PageEditor({ value, onChange, onSaveShortcut, readOnly = false, ariaLabel, handle }: {
	value: string;
	onChange: (markdown: string) => void;
	onSaveShortcut?: () => void;
	readOnly?: boolean;
	ariaLabel: string;
	handle?: Ref<PageEditorHandle>;
}) {
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const saveRef = useRef(onSaveShortcut);
	saveRef.current = onSaveShortcut;
	// The stored text at load only. The parent passes each edit back in `value`,
	// and a new text from outside arrives with a new key.
	const [codec] = useState(() => createPageCodec(value));
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);

	const emit = useCallback(() => {
		if (timer.current) { clearTimeout(timer.current); timer.current = null; }
		const editor = editorRef.current;
		if (editor && !editor.isDestroyed) onChangeRef.current(codec.toMarkdown(editor.getJSON()));
	}, [codec]);

	const extensions = useMemo(() => [
		...pageExtensions({ onSave: () => { emit(); saveRef.current?.(); } }),
		PagePlaceholder,
	], [emit]);
	const host = useRef<HTMLDivElement>(null);
	const [linkAt, setLinkAt] = useState<{ left: number; top: number } | null>(null);
	const openLinkRef = useRef<() => void>(() => {});
	// The slash menu: open while the caret ends a paragraph that holds "/query".
	// Escape hides it until the query changes.
	const [slashActive, setSlashActive] = useState(0);
	const slashDismissed = useRef<string | null>(null);
	const slashRef = useRef<{ items: SlashItem[]; range: { from: number; to: number } } | null>(null);

	const editor = useEditor({
		extensions,
		content: codec.doc,
		editable: !readOnly,
		immediatelyRender: false,
		editorProps: {
			attributes: pageEditorAttributes(ariaLabel),
			// A selected formula is not overwritten by a stray key; Backspace still removes it.
			handleTextInput: (view) => {
				const selection = view.state.selection;
				return selection instanceof NodeSelection && (selection.node.type.name === "inlineMath" || selection.node.type.name === "blockMath");
			},
			handleKeyDown: (view, event) => {
				const slash = slashRef.current;
				if (slash && !event.isComposing) {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						const n = Math.max(1, slash.items.length);
						setSlashActive((i) => (i + (event.key === "ArrowDown" ? 1 : n - 1)) % n);
						return true;
					}
					if ((event.key === "Enter" || event.key === "Tab") && slash.items.length > 0) {
						event.preventDefault();
						pickSlashRef.current(slash.items[Math.min(slashActiveRef.current, slash.items.length - 1)]!);
						return true;
					}
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						slashDismissed.current = view.state.doc.textBetween(slash.range.from, slash.range.to);
						forceSlash((n) => n + 1);
						return true;
					}
				}
				const mod = event.metaKey || event.ctrlKey;
				if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
					event.preventDefault();
					openLinkRef.current();
					return true;
				}
				if (mod && event.shiftKey && event.key.toLowerCase() === "m") {
					event.preventDefault();
					if (editorRef.current) insertFormula(editorRef.current);
					return true;
				}
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
					event.preventDefault();
					emit();
					saveRef.current?.();
					return true;
				}
				// A selected formula opens with Enter, the keyboard path to its TeX.
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

	const [, forceSlash] = useState(0);
	const slashState = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			if (!e || !e.isEditable) return null;
			const { selection } = e.state;
			const { $from, empty } = selection;
			if (!empty || $from.parent.type.name !== "paragraph") return null;
			const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\uFFFC");
			const after = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, "\n", "\uFFFC");
			const query = slashQuery(before, after);
			if (query === null) return null;
			return { query, from: $from.start(), to: $from.pos };
		},
		equalityFn: (a, b) => a?.query === b?.query && a?.from === b?.from && a?.to === b?.to,
	});
	const slashText = slashState ? `/${slashState.query}` : null;
	if (slashText === null || (slashDismissed.current !== null && slashDismissed.current !== slashText)) slashDismissed.current = null;
	const slashOpen = !!slashState && slashDismissed.current === null;
	const slashItems = useMemo(() => (slashState ? filterSlashItems(slashState.query).filter((item) => item.id !== "image") : []), [slashState]);
	slashRef.current = slashOpen && slashState ? { items: slashItems, range: { from: slashState.from, to: slashState.to } } : null;
	const slashActiveRef = useRef(0);
	slashActiveRef.current = slashActive;
	useEffect(() => { setSlashActive(0); }, [slashState?.query]);
	const pickSlash = (item: SlashItem) => {
		const range = slashRef.current?.range;
		if (!editor || !range) return;
		runSlashBlock(editor, item.id, range);
	};
	const pickSlashRef = useRef(pickSlash);
	pickSlashRef.current = pickSlash;

	openLinkRef.current = () => {
		if (!editor || readOnly) return;
		setLinkAt(anchorBelowSelection(editor, host.current));
	};

	// Unmounting (History, a reload from outside) hands over what is still waiting;
	// TipTap destroys the editor a tick later, so it can still be read here.
	useEffect(() => () => { if (timer.current) emit(); }, [emit]);
	useImperativeHandle(handle, () => ({
		flush: () => { if (timer.current) emit(); },
		focus: () => { editorRef.current?.commands.focus(); },
	}), [emit]);

	return (
		<>
			{editor && !readOnly && <PageToolbar editor={editor} onLink={() => openLinkRef.current()} />}
			<div ref={host} className="lh-page-editor-host relative min-h-0 flex-1 overflow-y-auto">
				<EditorContent editor={editor} className="min-h-full" />
				{editor && linkAt && <LinkPopover editor={editor} at={linkAt} onClose={() => setLinkAt(null)} />}
				{editor && slashOpen && <SlashMenu items={slashItems} query={slashState!.query} active={Math.min(slashActive, Math.max(0, slashItems.length - 1))} at={anchorBelowSelection(editor, host.current)} onPick={pickSlash} />}
			</div>
		</>
	);
}
