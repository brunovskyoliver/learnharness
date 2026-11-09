"use client";

/**
 * The selection card's rows (feature 024 §15, lifted in feature 025 T047):
 * the block style row (Text, Heading 1-4, Quote, Bulleted list, Numbered list),
 * the marks (Bold, Italic, Underline, Strikethrough, Code, and Link where the
 * surface has one), the ink colours, then an action list in the voice.
 * Notebook's selection menu and Study's page bubble both draw these; each
 * keeps its own placement, keys and handlers.
 */
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BoldIcon, CodeXmlIcon, Heading1Icon, Heading2Icon, Heading3Icon, Heading4Icon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, StrikethroughIcon, TextQuoteIcon, TypeIcon, UnderlineIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { INK_COLORS, type InkColor } from "@/components/library/page-ink";

export const INK_NAMES: Record<InkColor | "default", string> = {
	default: "Default", gray: "Gray", brown: "Brown", red: "Red", orange: "Orange", green: "Green", blue: "Blue", purple: "Purple",
};

export type BlockStyle = "paragraph" | "h1" | "h2" | "h3" | "h4" | "quote" | "bullet" | "ordered" | "other";

type Chain = ReturnType<Editor["chain"]>;
/** Row 1, in Riddled's order. Text lifts the block out of any list or quote. */
export const BLOCK_STYLES: readonly { style: Exclude<BlockStyle, "other">; label: string; Icon: LucideIcon; apply: (chain: Chain) => Chain }[] = [
	{ style: "paragraph", label: "Text", Icon: TypeIcon, apply: (c) => c.clearNodes() },
	{ style: "h1", label: "Heading 1", Icon: Heading1Icon, apply: (c) => c.setHeading({ level: 1 }) },
	{ style: "h2", label: "Heading 2", Icon: Heading2Icon, apply: (c) => c.setHeading({ level: 2 }) },
	{ style: "h3", label: "Heading 3", Icon: Heading3Icon, apply: (c) => c.setHeading({ level: 3 }) },
	{ style: "h4", label: "Heading 4", Icon: Heading4Icon, apply: (c) => c.setHeading({ level: 4 }) },
	{ style: "quote", label: "Quote", Icon: TextQuoteIcon, apply: (c) => c.toggleBlockquote() },
	{ style: "bullet", label: "Bulleted list", Icon: ListIcon, apply: (c) => c.toggleBulletList() },
	{ style: "ordered", label: "Numbered list", Icon: ListOrderedIcon, apply: (c) => c.toggleOrderedList() },
];

export function blockStyle(e: Editor): BlockStyle {
	for (const level of [1, 2, 3, 4] as const) if (e.isActive("heading", { level })) return `h${level}`;
	if (e.isActive("heading")) return "other";
	if (e.isActive("bulletList")) return "bullet";
	if (e.isActive("orderedList")) return "ordered";
	if (e.isActive("blockquote")) return "quote";
	return e.isActive("paragraph") ? "paragraph" : "other";
}

/** A selection the card is for: real text, not a node, not inside code. */
export const selectableText = (editor: Editor): boolean => {
	const { selection } = editor.state;
	if (selection.empty || selection instanceof NodeSelection) return false;
	if (editor.isActive("codeBlock") || editor.isActive("rawBlock")) return false;
	return editor.state.doc.textBetween(selection.from, selection.to, " ", " ").trim().length > 0;
};

export type SelectionFormatState = { style: BlockStyle; bold: boolean; italic: boolean; underline: boolean; strike: boolean; code: boolean; link: boolean; color: InkColor | "default" };

export function useSelectionFormat(editor: Editor): SelectionFormatState {
	return useEditorState({
		editor,
		selector: ({ editor: e }) => {
			const color = e.getAttributes("inkColor").color as string | undefined;
			return {
				style: blockStyle(e as Editor),
				bold: e.isActive("bold"),
				italic: e.isActive("italic"),
				underline: e.isActive("underline"),
				strike: e.isActive("strike"),
				code: e.isActive("code"),
				link: e.isActive("link"),
				color: (e.isActive("inkColor") && color ? color : "default") as InkColor | "default",
			};
		},
	});
}

export function FormatButton({ label, pressed, onPress, children, className = "" }: { label: string; pressed: boolean; onPress: () => void; children: ReactNode; className?: string }) {
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

/** The block style row, the marks row (with Link when `onLink` is given) and the inks. */
export function SelectionFormatRows({ editor, state, onLink }: { editor: Editor; state: SelectionFormatState; onLink?: () => void }) {
	const chain = () => editor.chain().focus();
	return (
		<>
			<div role="toolbar" aria-label="Text style" className="nb-sel-row nb-sel-styles">
				{BLOCK_STYLES.map(({ style, label, Icon, apply }) => (
					<FormatButton key={style} label={label} pressed={state.style === style} className="nb-sel-style" onPress={() => apply(chain()).run()}><Icon aria-hidden="true" /></FormatButton>
				))}
			</div>
			<div role="toolbar" aria-label="Format" className="nb-sel-row nb-sel-marks">
				<FormatButton label="Bold" pressed={state.bold} onPress={() => chain().toggleBold().run()}><BoldIcon aria-hidden="true" /></FormatButton>
				<FormatButton label="Italic" pressed={state.italic} onPress={() => chain().toggleItalic().run()}><ItalicIcon aria-hidden="true" /></FormatButton>
				<FormatButton label="Underline" pressed={state.underline} onPress={() => chain().toggleUnderline().run()}><UnderlineIcon aria-hidden="true" /></FormatButton>
				<FormatButton label="Strikethrough" pressed={state.strike} onPress={() => chain().toggleStrike().run()}><StrikethroughIcon aria-hidden="true" /></FormatButton>
				<FormatButton label="Code" pressed={state.code} onPress={() => chain().toggleCode().run()}><CodeXmlIcon aria-hidden="true" /></FormatButton>
				{onLink && <FormatButton label="Link" pressed={state.link} onPress={onLink}><LinkIcon aria-hidden="true" /></FormatButton>}
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
		</>
	);
}

export { SelectionAction } from "./selection-action";
