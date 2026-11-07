"use client";

/**
 * The selection menu (feature 024, US4; ui-contract "Selection menu";
 * visual-reference §15): a lifted paper card in the right margin, level
 * with the selection's first line. Rows: the block style (Text, Heading 1-4,
 * Quote, Bulleted list, Numbered list: Riddled's row, frame sheet-06 tile 9), the marks (Bold, Italic, Underline, Strikethrough, Code), the
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
import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus";
import { useCallback, useEffect, useRef } from "react";
import { selectedTextReference } from "@/components/library/page-toolbar";
import { INK_NAMES, SelectionAction, SelectionFormatRows, selectableText, useSelectionFormat } from "@/components/paper/selection-card";
import type { NoteBridge, SelectionAction as SelectionActionName } from "./nb-plugins";
import { useNotebook } from "./nb-shared";

export { INK_NAMES };

/** Gap from the column's right edge to the menu (frame inline-sketch-and-selection: the card at x 1228.5 in the
 *  viewport; the 660px column, 5.5px left of centre as in the frames, ends at 1157). */
export const MENU_GAP = 71.5;
/** The menu's top sits this far above the selection's text box (frame inline-sketch-and-selection: the
 *  selected line's glyphs at y 218, the Text button's top at 212, rows at 266, 300, 341, 377, 412). */
const MENU_RISE = 8;

export const ACTIONS: readonly { action: SelectionActionName; label: string; hint?: "mod-enter" | string }[] = [
	{ action: "think", label: "Think about this", hint: "mod-enter" },
	{ action: "ask", label: "Ask about this", hint: "Your own question" },
	{ action: "visualize", label: "Visualize", hint: "See it drawn out" },
	{ action: "flashcards", label: "Make flashcards" },
];

/** Right of the column, level with the selection; with no room there, left of it, then under or over. */
const MENU_OPTIONS: NonNullable<BubbleMenuProps["options"]> = {
	strategy: "fixed",
	placement: "right-start",
	offset: { mainAxis: MENU_GAP, crossAxis: -MENU_RISE },
	flip: { fallbackPlacements: ["left-start", "bottom-start", "top-start"], padding: 8 },
	shift: { padding: 8 },
};

export function SelectionMenu({ editor, bridge }: { editor: Editor; bridge: NoteBridge }) {
	const nb = useNotebook();
	const mac = nb.mac;
	const card = useRef<HTMLDivElement>(null);
	// Escape hides the menu for this selection; a new selection brings it back.
	const dismissed = useRef<{ from: number; to: number } | null>(null);
	const recheck = useRef(0);
	useEffect(() => () => window.clearTimeout(recheck.current), []);

	const state = useSelectionFormat(editor);

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

	const run = useCallback((action: SelectionActionName) => {
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
					if (!card.current?.isConnected && selectableText(editor) && editor.isFocused) editor.view.dispatch(editor.state.tr.setMeta("nbSelectionMenu", "show").setMeta("addToHistory", false));
				}, 200);
			}
			const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
			if (event.key === "Enter" && mod && !event.shiftKey && !event.altKey && selectableText(editor) && bridge.selectionAction) {
				event.preventDefault();
				runRef.current("think");
			}
		};
		// Capture: before the editor's own keys.
		dom.addEventListener("keydown", onKey, true);
		return () => dom.removeEventListener("keydown", onKey, true);
	}, [editor, bridge, mac, hide]);

	const actions = bridge.selectionAction !== null;
	const enterGlyph = mac ? "⌘↵" : "Ctrl+↵";

	return (
		<BubbleMenu
			editor={editor}
			pluginKey="nbSelectionMenu"
			updateDelay={120}
			appendTo={() => nb.root ?? document.body}
			shouldShow={({ editor: e, from, to }) => {
				if (!e.isEditable || from === to || !selectableText(e as Editor)) return false;
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
				<SelectionFormatRows editor={editor} state={state} />
				{actions && (
					<div className="nb-sel-actions">
						{ACTIONS.map(({ action, label, hint }) => (
							<SelectionAction
								key={action}
								testId={`nb-sel-${action}`}
								label={label}
								hint={hint === "mod-enter" ? enterGlyph : hint}
								keyShortcuts={hint === "mod-enter" ? (mac ? "Meta+Enter" : "Control+Enter") : undefined}
								onRun={() => run(action)}
							/>
						))}
					</div>
				)}
			</div>
		</BubbleMenu>
	);
}
