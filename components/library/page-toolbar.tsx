"use client";

import { posToDOMRect, type Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { KIND_LABEL, type LibraryItem } from "@/src/core";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
	BoldIcon, CodeIcon, ImageIcon, ItalicIcon, LinkIcon, ListChecksIcon, ListIcon, ListOrderedIcon,
	MessageSquareIcon, QuoteIcon, Redo2Icon, SigmaIcon, StrikethroughIcon, TableIcon, Undo2Icon,
} from "lucide-react";
import { SelectionAction, SelectionFormatRows, useSelectionFormat } from "@/components/paper/selection-card";
import { insertFormula, normalizeLinkAddress } from "./page-editor-extras.ts";
import { filterSlashItems, slashEmptyText, type SlashItem } from "./page-slash.ts";
import { TUTOR_ACTION_LABEL, TUTOR_ACTIONS, type TutorAction } from "./page-tutor-actions.ts";

/** What the page offers the tutor: unavailable with a sentence, or a handler. */
export type PageTutor = { blocked: string } | { blocked: null; run: (action: TutorAction, text: string) => void };

/** The selected text, or with none the text of the block the caret is in. */
export function tutorText(editor: Editor): string {
	const { from, to, empty, $from } = editor.state.selection;
	return empty ? $from.parent.textContent : editor.state.doc.textBetween(from, to, "\n", (leaf) => (leaf.type.name === "wikiLink" ? `[[${String(leaf.attrs.target)}]]` : " "));
}

/** "Ctrl" or "⌘" in names, matching the key the learner presses. */
export function shortcutLabel(keys: string, mac: boolean): string {
	return mac ? keys.replace(/\bCtrl\b/g, "⌘") : keys;
}
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function Divider() {
	return <span aria-hidden="true" className="lh-page-tools-gap" />;
}

function ToolButton({ label, keys, pressed, disabled, onClick, children }: { label: string; keys?: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
	const mac = isMac();
	const name = keys ? `${label} (${shortcutLabel(keys, mac)})` : label;
	return (
		<button
			type="button"
			aria-label={name}
			title={name}
			aria-pressed={pressed === undefined ? undefined : pressed}
			disabled={disabled}
			// Keeps the editor's selection while the pointer presses.
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
			className="nb-sel-format"
		>{children}</button>
	);
}

type TextStyle = "paragraph" | "1" | "2" | "3";

/** The formatting toolbar (contracts/ui-contract.md, Toolbar). */
export function PageToolbar({ editor, onLink, tutor, onImage }: { editor: Editor; onLink: () => void; tutor?: PageTutor; onImage?: () => void }) {
	const state = useEditorState({
		editor,
		selector: ({ editor: e }) => ({
			bold: e.isActive("bold"),
			italic: e.isActive("italic"),
			strike: e.isActive("strike"),
			code: e.isActive("code"),
			link: e.isActive("link"),
			bullet: e.isActive("bulletList"),
			ordered: e.isActive("orderedList"),
			task: e.isActive("taskList"),
			quote: e.isActive("blockquote"),
			table: e.isActive("table"),
			style: (e.isActive("heading", { level: 1 }) ? "1" : e.isActive("heading", { level: 2 }) ? "2" : e.isActive("heading", { level: 3 }) ? "3" : "paragraph") as TextStyle,
			undo: e.can().undo(),
			redo: e.can().redo(),
		}),
	});
	const chain = () => editor.chain().focus();
	const setStyle = (value: TextStyle) => {
		if (value === "paragraph") chain().setParagraph().run();
		else chain().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
	};
	return (
		<div className="flex shrink-0 flex-col px-4 pb-1">
			<div role="toolbar" aria-label="Formatting" aria-orientation="horizontal" data-testid="page-toolbar" className="lh-page-tools">
				<ToolButton label="Undo" keys="Ctrl Z" disabled={!state.undo} onClick={() => chain().undo().run()}><Undo2Icon aria-hidden="true" /></ToolButton>
				<ToolButton label="Redo" keys="Ctrl Shift Z" disabled={!state.redo} onClick={() => chain().redo().run()}><Redo2Icon aria-hidden="true" /></ToolButton>
				<Divider />
				<label className="sr-only" htmlFor={`${editor.instanceId}-style`}>Text style</label>
				<select
					id={`${editor.instanceId}-style`}
					value={state.style}
					onChange={(event) => setStyle(event.currentTarget.value as TextStyle)}
					data-testid="page-text-style"
					className="lh-page-style"
				>
					<option value="paragraph">Paragraph</option>
					<option value="1">Heading 1</option>
					<option value="2">Heading 2</option>
					<option value="3">Heading 3</option>
				</select>
				<Divider />
				<ToolButton label="Bold" keys="Ctrl B" pressed={state.bold} onClick={() => chain().toggleBold().run()}><BoldIcon aria-hidden="true" /></ToolButton>
				<ToolButton label="Italic" keys="Ctrl I" pressed={state.italic} onClick={() => chain().toggleItalic().run()}><ItalicIcon aria-hidden="true" /></ToolButton>
				<ToolButton label="Strikethrough" keys="Ctrl Shift S" pressed={state.strike} onClick={() => chain().toggleStrike().run()}><StrikethroughIcon aria-hidden="true" /></ToolButton>
				<ToolButton label="Inline code" keys="Ctrl E" pressed={state.code} onClick={() => chain().toggleCode().run()}><CodeIcon aria-hidden="true" /></ToolButton>
				<ToolButton label="Link" keys="Ctrl K" pressed={state.link} onClick={onLink}><LinkIcon aria-hidden="true" /></ToolButton>
				<Divider />
				<ToolButton label="Bulleted list" keys="Ctrl Shift 8" pressed={state.bullet} onClick={() => chain().toggleBulletList().run()}><ListIcon aria-hidden="true" /></ToolButton>
				<ToolButton label="Numbered list" keys="Ctrl Shift 7" pressed={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrderedIcon aria-hidden="true" /></ToolButton>
				<ToolButton label="Checklist" keys="Ctrl Shift 9" pressed={state.task} onClick={() => chain().toggleTaskList().run()}><ListChecksIcon aria-hidden="true" /></ToolButton>
				<ToolButton label="Quote" keys="Ctrl Shift B" pressed={state.quote} onClick={() => chain().toggleBlockquote().run()}><QuoteIcon aria-hidden="true" /></ToolButton>
				<Divider />
				<ToolButton label="Formula" keys="Ctrl Shift M" onClick={() => insertFormula(editor)}><SigmaIcon aria-hidden="true" /></ToolButton>
				<ToolButton label="Table" pressed={state.table} onClick={() => { if (!state.table) chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }}><TableIcon aria-hidden="true" /></ToolButton>
				{onImage && <ToolButton label="Image" onClick={onImage}><ImageIcon aria-hidden="true" /></ToolButton>}
				{tutor && (
					<>
						<span className="min-w-0 flex-1" />
						<button
							type="button"
							className="lh-tool lh-page-ask"
							disabled={tutor.blocked !== null}
							title={tutor.blocked ?? undefined}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => { if (tutor.blocked === null) tutor.run("ask", tutorText(editor)); }}
							data-testid="page-ask-tutor"
						>
							<MessageSquareIcon aria-hidden="true" />
							Ask the tutor
						</button>
					</>
				)}
			</div>
			{state.table && (
				<div role="toolbar" aria-label="Table" data-testid="page-table-controls" className="lh-page-table-tools">
					<button type="button" className="lh-text-action" onMouseDown={(event) => event.preventDefault()} onClick={() => chain().addRowAfter().run()}>Add row</button>
					<button type="button" className="lh-text-action" onMouseDown={(event) => event.preventDefault()} onClick={() => chain().deleteRow().run()}>Delete row</button>
					<button type="button" className="lh-text-action" onMouseDown={(event) => event.preventDefault()} onClick={() => chain().addColumnAfter().run()}>Add column</button>
					<button type="button" className="lh-text-action" onMouseDown={(event) => event.preventDefault()} onClick={() => chain().deleteColumn().run()}>Delete column</button>
					<button type="button" className="lh-text-action" onMouseDown={(event) => event.preventDefault()} onClick={() => chain().deleteTable().run()}>Delete table</button>
				</div>
			)}
		</div>
	);
}

/** The box of the selected text (also used by Notebook, feature 024). Select-all ends on block boundaries, whose box
 * is the whole block's width, so it measures from the first and last text inside. */
export function selectedTextReference(editor: Editor) {
	const { doc, selection } = editor.state;
	const from = TextSelection.findFrom(doc.resolve(selection.from), 1, true)?.from ?? selection.from;
	const to = TextSelection.findFrom(doc.resolve(selection.to), -1, true)?.to ?? selection.to;
	const rect = () => posToDOMRect(editor.view, from, Math.max(from, to));
	return { getBoundingClientRect: rect, getClientRects: () => [rect()] };
}

/** Over selected text: Notebook's selection card (feature 025 T047): the block style,
 *  marks with Link, and inks on top, then the tutor's actions as the card's list in the
 *  voice, or the one sentence saying why they're unavailable. */
export function PageBubble({ editor, tutor, onLink, scrollHost }: { editor: Editor; tutor?: PageTutor; onLink: () => void; scrollHost: HTMLElement }) {
	// In the workspace, not the scrolling editor: inside it the first lines have
	// no room above them, so the bubble flipped below the selection.
	const workspace = scrollHost.closest<HTMLElement>(".page-workspace") ?? undefined;
	const state = useSelectionFormat(editor);
	return (
		<BubbleMenu
			editor={editor}
			shouldShow={({ editor: e, state: s, from, to }) => e.isEditable && from !== to && !(s.selection instanceof NodeSelection) && !e.isActive("codeBlock") && !e.isActive("rawBlock")}
			appendTo={workspace}
			getReferencedVirtualElement={() => selectedTextReference(editor)}
			className="nb-sel-host"
			options={{
				placement: "top",
				offset: 8,
				scrollTarget: scrollHost,
				flip: { boundary: workspace, padding: 8 },
				shift: { boundary: workspace, padding: 8 },
				hide: { boundary: scrollHost },
				// A tall card in a short pane scrolls inside itself rather than covering the text.
				size: { boundary: workspace, padding: 8, apply: ({ availableHeight, elements }) => { elements.floating.style.setProperty("--lh-sel-max-h", `${Math.max(160, Math.floor(availableHeight))}px`); } },
			}}
		>
			<div role="group" aria-label="Selection" data-testid="page-bubble" className="nb-sel-menu lh-page-bubble">
				<SelectionFormatRows editor={editor} state={state} onLink={onLink} />
				{tutor && tutor.blocked !== null && <p role="status" className="lh-page-bubble-blocked" data-testid="page-bubble-blocked">{tutor.blocked}</p>}
				{tutor && tutor.blocked === null && (
					<div role="group" aria-label="Ask the tutor" className="nb-sel-actions">
						{TUTOR_ACTIONS.map((action) => (
							<SelectionAction key={action} testId={`page-tutor-${action}`} label={TUTOR_ACTION_LABEL[action]} onRun={() => tutor.run(action, tutorText(editor))} />
						))}
					</div>
				)}
			</div>
		</BubbleMenu>
	);
}

/** Where a floating panel sits inside the editor host, below the selection. */
export function anchorBelowSelection(editor: Editor, host: HTMLElement | null): { left: number; top: number } {
	if (!host) return { left: 0, top: 0 };
	const coords = editor.view.coordsAtPos(editor.state.selection.from);
	const box = host.getBoundingClientRect();
	const left = Math.max(0, Math.min(coords.left - box.left, box.width - 296));
	return { left, top: coords.bottom - box.top + host.scrollTop + 4 };
}

/** Add, edit, open or remove a link. Escape closes and hands the caret back. */
export function LinkPopover({ editor, at, onClose }: { editor: Editor; at: { left: number; top: number }; onClose: () => void }) {
	const id = useId();
	const current = String(editor.getAttributes("link").href ?? "");
	const [value, setValue] = useState(current);
	const [error, setError] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
	const close = () => { onClose(); editor.commands.focus(); };
	const apply = () => {
		const href = normalizeLinkAddress(value);
		if (!href) { setError(true); return; }
		const { empty } = editor.state.selection;
		if (empty && !editor.isActive("link")) {
			editor.chain().focus().insertContent({ type: "text", text: value.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
		} else {
			editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
		}
		onClose();
	};
	return (
		<div
			role="dialog"
			aria-label="Link"
			data-testid="page-link-popover"
			style={{ left: at.left, top: at.top }}
			className="lh-float-card absolute z-20 flex w-[min(18.5rem,calc(100%-1rem))] flex-col gap-1.5"
			onKeyDown={(event) => {
				if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
			}}
		>
			<label htmlFor={id} className="lh-float-label">Link address</label>
			<span className="nb-reply-line block">
				<input
					ref={input}
					id={id}
					value={value}
					onChange={(event) => { setValue(event.currentTarget.value); setError(false); }}
					onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); apply(); } }}
					aria-invalid={error || undefined}
					aria-describedby={error ? `${id}-error` : undefined}
					autoComplete="off"
					spellCheck={false}
					data-testid="page-link-input"
					className="lh-line-field"
				/>
			</span>
			{error && <p id={`${id}-error`} role="alert" className="text-sm text-red">Enter a web address, like https://example.com.</p>}
			<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
				{current && <button type="button" className="lh-text-action" onClick={() => window.open(current, "_blank", "noopener,noreferrer")}>Open link</button>}
				{current && <button type="button" className="lh-text-action" data-danger="" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }} data-testid="page-link-remove">Remove link</button>}
				<button type="button" className="nb-pill ml-auto" onClick={apply} data-testid="page-link-apply">Apply</button>
			</div>
		</div>
	);
}

/** The slash menu's list. Focus stays in the editor; keys arrive from it. */
export function SlashMenu({ items, query, active, at, onPick }: { items: SlashItem[]; query: string; active: number; at: { left: number; top: number }; onPick: (item: SlashItem) => void }) {
	const list = useRef<HTMLDivElement>(null);
	useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);
	return (
		<div
			ref={list}
			role="listbox"
			aria-label="Insert a block"
			data-testid="page-slash-menu"
			style={{ left: at.left, top: at.top }}
			className="absolute flex max-h-[min(18rem,50dvh)] w-[min(17.5rem,calc(100%-1rem))] flex-col gap-0.5 overflow-y-auto overscroll-contain"
		>
			{items.length === 0 && <div role="status" className="px-2.5 py-2 text-sm text-graphite">{slashEmptyText(query)}</div>}
			{items.map((item, index) => (
				<div
					key={item.id}
					role="option"
					aria-selected={index === active}
					data-testid="page-slash-option"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onPick(item)}
					className="flex cursor-pointer items-center px-2.5 hover:bg-shelf pointer-coarse:min-h-11"
				>{item.label}</div>
			))}
		</div>
	);
}

export { filterSlashItems };

export type WikiMenuRow = { kind: "item"; item: LibraryItem } | { kind: "new"; target: string };

/** The `[[` list. Focus stays in the editor, as in the slash menu. */
export function WikiMenu({ rows, status, active, at, onPick }: { rows: WikiMenuRow[]; status: string | null; active: number; at: { left: number; top: number }; onPick: (row: WikiMenuRow) => void }) {
	const list = useRef<HTMLDivElement>(null);
	useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);
	return (
		<div
			ref={list}
			role="listbox"
			aria-label="Link to a page"
			data-testid="page-wiki-menu"
			style={{ left: at.left, top: at.top }}
			className="absolute flex max-h-[min(18rem,50dvh)] w-[min(20rem,calc(100%-1rem))] flex-col gap-0.5 overflow-y-auto overscroll-contain"
		>
			{status && <div role="status" className="px-2.5 py-2 text-sm text-graphite">{status}</div>}
			{rows.map((row, index) => (
				<div
					key={row.kind === "item" ? row.item.id : "new"}
					role="option"
					aria-selected={index === active}
					data-testid="page-wiki-option"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onPick(row)}
					className="flex cursor-pointer flex-col justify-center px-2.5 py-1 hover:bg-shelf pointer-coarse:min-h-11"
				>
					{row.kind === "item" ? (
						<>
							<span className="[overflow-wrap:anywhere]">{row.item.name}</span>
							<span className="text-meta text-faint">{KIND_LABEL[row.item.kind]}</span>
						</>
					) : (
						<>
							<span className="[overflow-wrap:anywhere]">{row.target}</span>
							<span className="text-meta text-faint">Link it now, make the page later</span>
						</>
					)}
				</div>
			))}
		</div>
	);
}

/** With an image selected: its alt text, editable (feature 010, US6). */
export function ImageAltPopover({ editor, host }: { editor: Editor; host: HTMLElement | null }) {
	const id = useId();
	const image = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			const { selection } = e.state;
			return selection instanceof NodeSelection && selection.node.type.name === "pageImage"
				? { pos: selection.from, alt: String(selection.node.attrs.alt ?? "") }
				: null;
		},
		equalityFn: (a, b) => a?.pos === b?.pos && a?.alt === b?.alt,
	});
	const [value, setValue] = useState("");
	useEffect(() => { setValue(image?.alt ?? ""); }, [image?.pos, image?.alt]);
	if (!image) return null;
	const save = () => {
		editor.chain().focus().command(({ tr }) => {
			const node = tr.doc.nodeAt(image.pos);
			if (!node || node.type.name !== "pageImage") return false;
			tr.setNodeMarkup(image.pos, undefined, { ...node.attrs, alt: value.trim() });
			return true;
		}).run();
	};
	const at = anchorBelowSelection(editor, host);
	return (
		<div style={{ left: at.left, top: at.top }} className="lh-float-card absolute z-20 flex w-[min(18.5rem,calc(100%-1rem))] items-end gap-3" data-testid="page-image-alt">
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<label htmlFor={id} className="lh-float-label">Alt text</label>
				<span className="nb-reply-line block">
					<input
						id={id}
						value={value}
						onChange={(event) => setValue(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") { event.preventDefault(); save(); }
							if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); editor.commands.focus(); }
						}}
						autoComplete="off"
						data-testid="page-image-alt-input"
						className="lh-line-field"
					/>
				</span>
			</span>
			<button type="button" className="nb-pill" onClick={save}>Save</button>
		</div>
	);
}
