"use client";

import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createPageCodec, pageExtensions } from "./page-markdown.ts";

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

interface MathEdit { pos: number; kind: "inlineMath" | "blockMath"; latex: string }

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
	const [mathEdit, setMathEdit] = useState<MathEdit | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const saveRef = useRef(onSaveShortcut);
	saveRef.current = onSaveShortcut;
	// The stored text at load only. The parent passes each edit back in `value`,
	// and a new text from outside arrives with a new key.
	const [codec] = useState(() => createPageCodec(value));
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);

	const openMath = useCallback((kind: MathEdit["kind"], pos: number) => {
		const node = editorRef.current?.state.doc.nodeAt(pos);
		if (node?.type.name === kind) setMathEdit({ pos, kind, latex: String(node.attrs.latex ?? "") });
	}, []);

	const extensions = useMemo(() => pageExtensions({
		onInline: (pos) => openMath("inlineMath", pos),
		onBlock: (pos) => openMath("blockMath", pos),
	}), [openMath]);

	const emit = useCallback(() => {
		if (timer.current) { clearTimeout(timer.current); timer.current = null; }
		const editor = editorRef.current;
		if (editor && !editor.isDestroyed) onChangeRef.current(codec.toMarkdown(editor.getJSON()));
	}, [codec]);

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
					openMath(selection.node.type.name, selection.from);
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

	const saveMath = () => {
		if (!editor || !mathEdit || !mathEdit.latex.trim()) return;
		const { pos, kind, latex } = mathEdit;
		if (kind === "inlineMath") editor.chain().focus().updateInlineMath({ latex, pos }).run();
		else editor.chain().focus().updateBlockMath({ latex, pos }).run();
		setMathEdit(null);
	};

	return (
		<>
			<EditorContent editor={editor} className="lh-page-editor-host min-h-0 flex-1 overflow-y-auto" />
			<Dialog open={mathEdit !== null} onOpenChange={(open) => { if (!open) setMathEdit(null); }}>
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="page-math-dialog" className="gap-3 rounded-[10px] border-0 bg-card sm:max-w-md">
					<DialogTitle className="text-base font-semibold">Edit math</DialogTitle>
					<Textarea
						autoFocus
						aria-label="TeX source"
						spellCheck={false}
						data-testid="page-math-source"
						className="min-h-24 font-mono text-sm"
						value={mathEdit?.latex ?? ""}
						onChange={(event) => setMathEdit((current) => (current ? { ...current, latex: event.target.value } : current))}
					/>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" className="pointer-coarse:h-11" onClick={() => setMathEdit(null)}>Cancel</Button>
						<Button type="button" disabled={!mathEdit?.latex.trim()} className="bg-accent text-foreground pointer-coarse:h-11" data-testid="page-math-save" onClick={saveMath}>Save</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
