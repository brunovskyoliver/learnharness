"use client";

import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
	BoldIcon, CodeIcon, ImageIcon, ItalicIcon, LinkIcon, ListChecksIcon, ListIcon, ListOrderedIcon,
	MessageSquareIcon, QuoteIcon, Redo2Icon, SigmaIcon, StrikethroughIcon, TableIcon, Undo2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { insertFormula, normalizeLinkAddress } from "./page-editor-extras.ts";
import { filterSlashItems, slashEmptyText, type SlashItem } from "./page-slash.ts";
import { TUTOR_ACTION_LABEL, type TutorAction } from "./page-tutor-actions.ts";

/** What the page offers the tutor: unavailable with a sentence, or a handler. */
export type PageTutor = { blocked: string } | { blocked: null; run: (action: TutorAction, text: string) => void };

/** The selected text, or with none the text of the block the caret is in. */
export function tutorText(editor: Editor): string {
	const { from, to, empty, $from } = editor.state.selection;
	return empty ? $from.parent.textContent : editor.state.doc.textBetween(from, to, "\n", " ");
}

/** "Ctrl" or "⌘" in names, matching the key the learner presses. */
export function shortcutLabel(keys: string, mac: boolean): string {
	return mac ? keys.replace(/\bCtrl\b/g, "⌘") : keys;
}
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const ICON_BUTTON = "ui-icon-button text-ink-2 hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground disabled:text-muted-foreground disabled:hover:bg-transparent";
const TEXT_BUTTON = "inline-flex h-8 shrink-0 items-center gap-2 rounded-[6px] px-2 text-sm text-ink-2 hover:bg-accent hover:text-foreground pointer-coarse:min-h-11";

function Divider() {
	return <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-input" />;
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
			className={ICON_BUTTON}
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
		<div className="flex shrink-0 flex-col gap-1 px-3 pb-2">
			<div role="toolbar" aria-label="Formatting" aria-orientation="horizontal" data-testid="page-toolbar" className="flex flex-wrap items-center gap-1 rounded-[10px] bg-card px-2 py-1">
				<ToolButton label="Undo" keys="Ctrl Z" disabled={!state.undo} onClick={() => chain().undo().run()}><Undo2Icon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Redo" keys="Ctrl Shift Z" disabled={!state.redo} onClick={() => chain().redo().run()}><Redo2Icon className="ui-icon" aria-hidden="true" /></ToolButton>
				<Divider />
				<label className="sr-only" htmlFor={`${editor.instanceId}-style`}>Text style</label>
				<select
					id={`${editor.instanceId}-style`}
					value={state.style}
					onChange={(event) => setStyle(event.currentTarget.value as TextStyle)}
					data-testid="page-text-style"
					className="h-8 shrink-0 rounded-[6px] bg-transparent px-2 text-sm text-ink-2 hover:bg-accent pointer-coarse:min-h-11"
				>
					<option value="paragraph">Paragraph</option>
					<option value="1">Heading 1</option>
					<option value="2">Heading 2</option>
					<option value="3">Heading 3</option>
				</select>
				<Divider />
				<ToolButton label="Bold" keys="Ctrl B" pressed={state.bold} onClick={() => chain().toggleBold().run()}><BoldIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Italic" keys="Ctrl I" pressed={state.italic} onClick={() => chain().toggleItalic().run()}><ItalicIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Strikethrough" keys="Ctrl Shift S" pressed={state.strike} onClick={() => chain().toggleStrike().run()}><StrikethroughIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Inline code" keys="Ctrl E" pressed={state.code} onClick={() => chain().toggleCode().run()}><CodeIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Link" keys="Ctrl K" pressed={state.link} onClick={onLink}><LinkIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<Divider />
				<ToolButton label="Bulleted list" keys="Ctrl Shift 8" pressed={state.bullet} onClick={() => chain().toggleBulletList().run()}><ListIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Numbered list" keys="Ctrl Shift 7" pressed={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrderedIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Checklist" keys="Ctrl Shift 9" pressed={state.task} onClick={() => chain().toggleTaskList().run()}><ListChecksIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Quote" keys="Ctrl Shift B" pressed={state.quote} onClick={() => chain().toggleBlockquote().run()}><QuoteIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<Divider />
				<ToolButton label="Formula" keys="Ctrl Shift M" onClick={() => insertFormula(editor)}><SigmaIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Table" pressed={state.table} onClick={() => { if (!state.table) chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }}><TableIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				{onImage && <ToolButton label="Image" onClick={onImage}><ImageIcon className="ui-icon" aria-hidden="true" /></ToolButton>}
				{tutor && (
					<>
						<span className="min-w-0 flex-1" />
						<button
							type="button"
							className={cn(TEXT_BUTTON, "bg-accent text-foreground disabled:bg-transparent disabled:text-muted-foreground")}
							disabled={tutor.blocked !== null}
							title={tutor.blocked ?? undefined}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => { if (tutor.blocked === null) tutor.run("ask", tutorText(editor)); }}
							data-testid="page-ask-tutor"
						>
							<MessageSquareIcon className="ui-icon" aria-hidden="true" />
							Ask the tutor
						</button>
					</>
				)}
			</div>
			{state.table && (
				<div role="toolbar" aria-label="Table" data-testid="page-table-controls" className="flex flex-wrap items-center gap-1">
					<button type="button" className={TEXT_BUTTON} onMouseDown={(event) => event.preventDefault()} onClick={() => chain().addRowAfter().run()}>Add row</button>
					<button type="button" className={TEXT_BUTTON} onMouseDown={(event) => event.preventDefault()} onClick={() => chain().deleteRow().run()}>Delete row</button>
					<button type="button" className={TEXT_BUTTON} onMouseDown={(event) => event.preventDefault()} onClick={() => chain().addColumnAfter().run()}>Add column</button>
					<button type="button" className={TEXT_BUTTON} onMouseDown={(event) => event.preventDefault()} onClick={() => chain().deleteColumn().run()}>Delete column</button>
					<button type="button" className={TEXT_BUTTON} onMouseDown={(event) => event.preventDefault()} onClick={() => chain().deleteTable().run()}>Delete table</button>
				</div>
			)}
		</div>
	);
}

/** Over selected text: formatting, and the tutor's actions or why they're unavailable. */
export function PageBubble({ editor, tutor, onLink }: { editor: Editor; tutor?: PageTutor; onLink: () => void }) {
	const state = useEditorState({ editor, selector: ({ editor: e }) => ({ bold: e.isActive("bold"), italic: e.isActive("italic"), link: e.isActive("link") }) });
	const chain = () => editor.chain().focus();
	const button = "inline-flex h-8 shrink-0 items-center rounded-[6px] px-2 text-sm text-foreground hover:bg-card pointer-coarse:min-h-11";
	return (
		<BubbleMenu
			editor={editor}
			shouldShow={({ editor: e, state: s, from, to }) => e.isEditable && from !== to && !(s.selection instanceof NodeSelection) && !e.isActive("codeBlock") && !e.isActive("rawBlock")}
			options={{ placement: "top", offset: 8 }}
		>
			<div role="toolbar" aria-label="Selection" data-testid="page-bubble" className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-[10px] bg-popover p-1">
				<ToolButton label="Bold" pressed={state.bold} onClick={() => chain().toggleBold().run()}><BoldIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Italic" pressed={state.italic} onClick={() => chain().toggleItalic().run()}><ItalicIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				<ToolButton label="Link" pressed={state.link} onClick={onLink}><LinkIcon className="ui-icon" aria-hidden="true" /></ToolButton>
				{tutor && <Divider />}
				{tutor && tutor.blocked !== null && <span role="status" className="px-2 text-sm text-ink-2" data-testid="page-bubble-blocked">{tutor.blocked}</span>}
				{tutor && tutor.blocked === null && (["explain", "simpler", "quiz", "ask"] as const).map((action) => (
					<button
						key={action}
						type="button"
						className={button}
						data-testid={`page-tutor-${action}`}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => tutor.run(action, tutorText(editor))}
					>{TUTOR_ACTION_LABEL[action]}</button>
				))}
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
			className="absolute z-20 flex w-[min(18.5rem,calc(100%-1rem))] flex-col gap-2 rounded-[10px] bg-popover p-3"
			onKeyDown={(event) => {
				if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
			}}
		>
			<label htmlFor={id} className="text-sm font-medium text-ink-2">Link address</label>
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
				className="h-8 w-full rounded-[6px] border border-input bg-transparent px-2 text-base text-foreground pointer-coarse:h-11"
			/>
			{error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">Enter a web address, like https://example.com.</p>}
			<div className="flex flex-wrap gap-2">
				<button type="button" className="prompt-secondary" onClick={apply} data-testid="page-link-apply">Apply</button>
				{current && <button type="button" className="prompt-secondary" onClick={() => window.open(current, "_blank", "noopener,noreferrer")}>Open link</button>}
				{current && <button type="button" className="prompt-secondary" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onClose(); }} data-testid="page-link-remove">Remove link</button>}
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
			className="absolute z-20 flex max-h-[min(18rem,50dvh)] w-[min(17.5rem,calc(100%-1rem))] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-[10px] bg-popover p-1"
		>
			{items.length === 0 && <div role="status" className="px-2 py-2 text-sm text-ink-2">{slashEmptyText(query)}</div>}
			{items.map((item, index) => (
				<div
					key={item.id}
					role="option"
					aria-selected={index === active}
					data-testid="page-slash-option"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onPick(item)}
					className={cn("flex min-h-9 cursor-pointer items-center rounded-[6px] px-2 text-base text-foreground pointer-coarse:min-h-11", index === active && "bg-card outline-1 outline-ring outline-solid")}
				>{item.label}</div>
			))}
		</div>
	);
}

export { filterSlashItems };

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
		<div style={{ left: at.left, top: at.top }} className="absolute z-20 flex w-[min(18.5rem,calc(100%-1rem))] items-end gap-2 rounded-[10px] bg-popover p-3" data-testid="page-image-alt">
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<label htmlFor={id} className="text-sm font-medium text-ink-2">Alt text</label>
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
					className="h-8 w-full rounded-[6px] border border-input bg-transparent px-2 text-base text-foreground pointer-coarse:h-11"
				/>
			</span>
			<button type="button" className="prompt-secondary" onClick={save}>Save</button>
		</div>
	);
}
