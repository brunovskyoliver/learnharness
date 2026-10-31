"use client";

import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { createPageCodec, pageExtensions } from "./page-markdown.ts";
import { OPEN_MATH_SOURCE_EVENT } from "./page-math-view.ts";

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

	const extensions = useMemo(() => pageExtensions({
		onSave: () => { emit(); saveRef.current?.(); },
	}), [emit]);

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

	useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
	useImperativeHandle(handle, () => ({
		flush: () => { if (timer.current) emit(); },
		focus: () => { editorRef.current?.commands.focus(); },
	}), [emit]);

	return <EditorContent editor={editor} className="lh-page-editor-host min-h-0 flex-1 overflow-y-auto" />;
}
