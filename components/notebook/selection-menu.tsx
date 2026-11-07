"use client";

/**
 * The selection menu (feature 024, US4; ui-contract "Selection menu";
 * visual-reference §15): a lifted paper card in the right margin, level
 * with the selection's first line. Rows: the block style (Text, Heading 1,
 * Heading 2), the marks (Bold, Italic, Underline, Strikethrough, Code), the
 * ink colours, then the actions: Think about this, Ask about this,
 * Visualize, Make flashcards. Formatting is his text (it saves like any
 * edit); the actions go to the thinking layer through the bridge.
 *
 * Keyboard: Shift+F10 (or Alt+F10) from a selection moves into the menu,
 * Tab walks it, Escape leaves it with the selection kept; Escape in the
 * text hides it first (Escape order: menu → selection menu → thread).
 * Mod+Enter on a selection is "Think about this".
 */
import { type Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus";
import { BoldIcon, CodeXmlIcon, Heading1Icon, Heading2Icon, ItalicIcon, StrikethroughIcon, TypeIcon, UnderlineIcon } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { INK_COLORS, type InkColor } from "@/components/library/page-ink";
import { selectedTextReference } from "@/components/library/page-toolbar";
import type { NoteBridge, SelectionAction } from "./nb-plugins";
import { useNotebook } from "./nb-shared";

/** Gap from the column's right edge to the menu (frame inline-sketch-and-selection: menu x≈1229 in the viewport; our column ends at 1163). */
export const MENU_GAP = 66;
/** The menu's top sits 7px above the selection's line box (frame: line ≈212, card ≈205); the text box starts 4px lower. */
const MENU_RISE = 11;

export const INK_NAMES: Record<InkColor | "default", string> = {
	default: "Default", gray: "Gray", brown: "Brown", red: "Red", orange: "Orange", green: "Green", blue: "Blue", purple: "Purple",
};

export const ACTIONS: readonly { action: SelectionAction; label: string; hint?: "mod-enter" | string }[] = [
	{ action: "think", label: "Think about this", hint: "mod-enter" },
	{ action: "ask", label: "Ask about this", hint: "Your own question" },
	{ action: "visualize", label: "Visualize", hint: "See it drawn out" },
	{ action: "flashcards", label: "Make flashcards" },
];

type Style = "paragraph" | "h1" | "h2" | "other";

/** Right of the column, level with the selection; with no room there, left of it, then under or over. */
const MENU_OPTIONS: NonNullable<BubbleMenuProps["options"]> = {
	strategy: "fixed",
	placement: "right-start",
	offset: { mainAxis: MENU_GAP, crossAxis: -MENU_RISE },
	flip: { fallbackPlacements: ["left-start", "bottom-start", "top-start"], padding: 8 },
	shift: { padding: 8 },
};

const selectable = (editor: Editor): boolean => {
	const { selection } = editor.state;
	if (selection.empty || selection instanceof NodeSelection) return false;
	if (editor.isActive("codeBlock") || editor.isActive("rawBlock")) return false;
	return editor.state.doc.textBetween(selection.from, selection.to, " ", " ").trim().length > 0;
};

function FormatButton({ label, pressed, onPress, children, className = "" }: { label: string; pressed: boolean; onPress: () => void; children: ReactNode; className?: string }) {
	return (
		<button
			type="button"
			className={`nb-sel-format ${className}`}
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			// The editor keeps its selection while the pointer presses.
			onMouseDown={(event) => event.preventDefault()}
			onClick={onPress}
		>{children}</button>
	);
}

export function SelectionMenu({ editor, bridge }: { editor: Editor; bridge: NoteBridge }) {
	const nb = useNotebook();
	const mac = nb.mac;
	const card = useRef<HTMLDivElement>(null);
	// Escape hides the menu for this selection; a new selection brings it back.
	const dismissed = useRef<{ from: number; to: number } | null>(null);
	const recheck = useRef(0);
	useEffect(() => () => window.clearTimeout(recheck.current), []);

	const state = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			const style: Style = e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("paragraph") ? "paragraph" : "other";
			const color = e.getAttributes("inkColor").color as string | undefined;
			return {
				style,
				bold: e.isActive("bold"),
				italic: e.isActive("italic"),
				underline: e.isActive("underline"),
				strike: e.isActive("strike"),
				code: e.isActive("code"),
				color: (e.isActive("inkColor") && color ? color : "default") as InkColor | "default",
			};
		},
	});

	// Any other selection, even for a moment, ends the dismissal.
	useEffect(() => {
		const changed = () => {
			const gone = dismissed.current;
			const { from, to } = editor.state.selection;
			if (gone && (gone.from !== from || gone.to !== to)) dismissed.current = null;
		};
		editor.on("selectionUpdate", changed);
		return () => { editor.off("selectionUpdate", changed); };
	}, [editor]);

	const hide = useCallback(() => {
		const { from, to } = editor.state.selection;
		dismissed.current = { from, to };
		editor.view.dispatch(editor.state.tr.setMeta("nbSelectionMenu", "hide").setMeta("addToHistory", false));
	}, [editor]);

	const run = useCallback((action: SelectionAction) => {
		const handler = bridge.selectionAction;
		const { from, to } = editor.state.selection;
		if (!handler || from === to) return;
		hide();
		// The passage is handed over; the caret rests after it (Ask moves the focus to its field).
		if (action !== "ask") editor.chain().focus().setTextSelection(to).run();
		handler(action, { from, to });
	}, [bridge, editor, hide]);
	const runRef = useRef(run);
	runRef.current = run;

	// Keys in the text: Escape hides it, Shift+F10 / Alt+F10 goes into it, Mod+Enter thinks.
	useEffect(() => {
		const dom = editor.view.dom;
		const onKey = (event: KeyboardEvent) => {
			if (event.isComposing || event.defaultPrevented) return;
			const open = Boolean(card.current?.isConnected);
			if (event.key === "Escape" && open) {
				event.preventDefault();
				hide();
				return;
			}
			if (event.key === "F10" && (event.shiftKey || event.altKey) && open) {
				event.preventDefault();
				card.current?.querySelector<HTMLElement>("button")?.focus();
				return;
			}
			// He moves the selection again: a dismissed menu may come back, even when the
			// selection ends where it was (the editor may never see it change).
			if (dismissed.current && event.key !== "Escape" && !["Shift", "Control", "Meta", "Alt"].includes(event.key)) {
				dismissed.current = null;
				window.clearTimeout(recheck.current);
				recheck.current = window.setTimeout(() => {
					if (!card.current?.isConnected && selectable(editor) && editor.isFocused) editor.view.dispatch(editor.state.tr.setMeta("nbSelectionMenu", "show").setMeta("addToHistory", false));
				}, 200);
			}
			const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
			if (event.key === "Enter" && mod && !event.shiftKey && !event.altKey && selectable(editor) && bridge.selectionAction) {
				event.preventDefault();
				runRef.current("think");
			}
		};
		// Capture: before the editor's own keys.
		dom.addEventListener("keydown", onKey, true);
		return () => dom.removeEventListener("keydown", onKey, true);
	}, [editor, bridge, mac, hide]);

	const chain = () => editor.chain().focus();
	const actions = bridge.selectionAction !== null;
	const enterGlyph = mac ? "⌘↵" : "Ctrl+↵";

	return (
		<BubbleMenu
			editor={editor}
			pluginKey="nbSelectionMenu"
			updateDelay={120}
			appendTo={() => nb.root ?? document.body}
			shouldShow={({ editor: e, from, to }) => {
				if (!e.isEditable || from === to || !selectable(e as Editor)) return false;
				const gone = dismissed.current;
				return !(gone && gone.from === from && gone.to === to);
			}}
			getReferencedVirtualElement={() => {
				// The column's right edge, level with the selection's first line.
				const text = selectedTextReference(editor).getBoundingClientRect();
				const column = editor.view.dom.closest(".nb-column")?.getBoundingClientRect();
				const first = (() => {
					try { return editor.view.coordsAtPos(Math.min(editor.state.selection.from + 1, editor.state.doc.content.size)); } catch { return null; }
				})();
				const top = first ? Math.min(first.top, text.top) : text.top;
				const rect = new DOMRect(column?.left ?? text.left, top, column ? column.width : text.width, Math.max(1, text.bottom - top));
				return { getBoundingClientRect: () => rect, getClientRects: () => [rect] };
			}}
			options={MENU_OPTIONS}
			className="nb-sel-host"
			data-nb-hold-reads=""
		>
			<div
				ref={card}
				role="group"
				aria-label="Selection"
				className="nb-sel-menu"
				data-testid="nb-selection-menu"
				onKeyDown={(event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					hide();
					editor.commands.focus();
				}}
			>
				<div role="toolbar" aria-label="Text style" className="nb-sel-row nb-sel-styles">
					<FormatButton label="Text" pressed={state.style === "paragraph"} className="nb-sel-style" onPress={() => chain().setParagraph().run()}><TypeIcon aria-hidden="true" /></FormatButton>
					<FormatButton label="Heading 1" pressed={state.style === "h1"} className="nb-sel-style" onPress={() => chain().setHeading({ level: 1 }).run()}><Heading1Icon aria-hidden="true" /></FormatButton>
					<FormatButton label="Heading 2" pressed={state.style === "h2"} className="nb-sel-style" onPress={() => chain().setHeading({ level: 2 }).run()}><Heading2Icon aria-hidden="true" /></FormatButton>
				</div>
				<div role="toolbar" aria-label="Format" className="nb-sel-row nb-sel-marks">
					<FormatButton label="Bold" pressed={state.bold} onPress={() => chain().toggleBold().run()}><BoldIcon aria-hidden="true" /></FormatButton>
					<FormatButton label="Italic" pressed={state.italic} onPress={() => chain().toggleItalic().run()}><ItalicIcon aria-hidden="true" /></FormatButton>
					<FormatButton label="Underline" pressed={state.underline} onPress={() => chain().toggleUnderline().run()}><UnderlineIcon aria-hidden="true" /></FormatButton>
					<FormatButton label="Strikethrough" pressed={state.strike} onPress={() => chain().toggleStrike().run()}><StrikethroughIcon aria-hidden="true" /></FormatButton>
					<FormatButton label="Code" pressed={state.code} onPress={() => chain().toggleCode().run()}><CodeXmlIcon aria-hidden="true" /></FormatButton>
				</div>
				<div role="toolbar" aria-label="Ink" className="nb-sel-row nb-sel-inks">
					{(["default", ...INK_COLORS] as const).map((color) => (
						<FormatButton
							key={color}
							label={`${INK_NAMES[color]} ink`}
							pressed={state.color === color}
							className="nb-sel-ink"
							onPress={() => (color === "default" ? chain().unsetMark("inkColor").run() : chain().setMark("inkColor", { color }).run())}
						><span aria-hidden="true" data-ink={color}>A</span></FormatButton>
					))}
				</div>
				{actions && (
					<div className="nb-sel-actions">
						{ACTIONS.map(({ action, label, hint }) => (
							<button
								key={action}
								type="button"
								className="nb-sel-action"
								data-testid={`nb-sel-${action}`}
								onMouseDown={(event) => event.preventDefault()}
								aria-keyshortcuts={hint === "mod-enter" ? (mac ? "Meta+Enter" : "Control+Enter") : undefined}
								onClick={() => run(action)}
							>
								<span className="nb-sel-label nb-voice">{label}</span>
								{hint && <span className="nb-sel-hint" aria-hidden="true">{hint === "mod-enter" ? enterGlyph : hint}</span>}
							</button>
						))}
					</div>
				)}
			</div>
		</BubbleMenu>
	);
}
