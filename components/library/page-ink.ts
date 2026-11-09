/** Text ink colours and underline for pages (feature 024, Notebook's
 *  selection menu). Both travel through Markdown as the inline HTML a
 *  reader can still show: `<u>…</u>` and `<span data-color="blue">…</span>`.
 *  The tokenizers take only that exact lowercase form, so any other HTML a
 *  page holds (`<U>`, a span with other attributes) stays verbatim as a raw
 *  inline, byte for byte. No React and no DOM at import (Node tests). */
import { Mark, type JSONContent } from "@tiptap/core";

export const INK_COLORS = ["gray", "brown", "red", "orange", "green", "blue", "purple"] as const;
export type InkColor = (typeof INK_COLORS)[number];
export const isInkColor = (value: unknown): value is InkColor => typeof value === "string" && (INK_COLORS as readonly string[]).includes(value);

type Lexer = { inlineTokens: (src: string) => unknown[] };

/** The end of an inline HTML element whose opener is `open` chars long: the
 *  matching close tag, skipping code spans, escapes and nested openers. */
function closeAt(src: string, open: number, opener: RegExp, closer: string): number {
	const delimiters = new RegExp(`\\\\[\\s\\S]|\`+|${opener.source}|${closer}`, "g");
	delimiters.lastIndex = open;
	let depth = 0;
	let match = delimiters.exec(src);
	while (match) {
		const text = match[0];
		if (text.startsWith("`")) {
			const code = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(src.slice(match.index));
			if (code) delimiters.lastIndex = match.index + code[0].length;
		} else if (!text.startsWith("\\")) {
			if (text === closer) {
				if (depth === 0) return match.index;
				depth--;
			} else depth++;
		}
		match = delimiters.exec(src);
	}
	return -1;
}

const COLOR_OPEN = /^<span data-color="([a-z]+)">/;

/** A text ink colour; no mark at all is the default ink. */
export const InkColorMark = Mark.create({
	name: "inkColor",
	excludes: "inkColor",
	addAttributes: () => ({ color: { default: "gray" } }),
	parseHTML: () => [{ tag: "span[data-color]", getAttrs: (el) => (isInkColor((el as HTMLElement).dataset.color) ? { color: (el as HTMLElement).dataset.color } : false) }],
	renderHTML: ({ mark }) => ["span", { "data-color": String(mark.attrs.color), class: "lh-ink" }, 0],
	parseMarkdown: (token, helpers) => helpers.applyMark("inkColor", helpers.parseInline(token.tokens ?? []), { color: (token as { color?: string }).color }),
	renderMarkdown: (node: JSONContent, helpers: { renderChildren: (node: JSONContent) => string }) => `<span data-color="${String(node.attrs?.color)}">${helpers.renderChildren(node)}</span>`,
	markdownTokenizer: {
		name: "inkColor",
		level: "inline" as const,
		start: (src: string) => src.indexOf('<span data-color="'),
		tokenize: (src: string, _tokens: unknown[], lexer: Lexer) => {
			const open = COLOR_OPEN.exec(src);
			if (!open || !isInkColor(open[1])) return undefined;
			const end = closeAt(src, open[0].length, /<span[\s>]/, "</span>");
			if (end < 0) return undefined;
			const text = src.slice(open[0].length, end);
			if (!text) return undefined;
			return { type: "inkColor", raw: src.slice(0, end + "</span>".length), color: open[1], text, tokens: lexer.inlineTokens(text) } as never;
		},
	},
});

/** Underline's own tokenizer reads `<U>` too and would write it back as `<u>`;
 *  this one takes only `<u>`, so a page's bytes never change by reading. */
export const underlineTokenizer = {
	name: "underline",
	level: "inline" as const,
	start: (src: string) => src.indexOf("<u>"),
	tokenize: (src: string, _tokens: unknown[], lexer: Lexer) => {
		if (!src.startsWith("<u>")) return undefined;
		const end = closeAt(src, 3, /<u>/, "</u>");
		if (end < 0) return undefined;
		const text = src.slice(3, end);
		if (!text) return undefined;
		return { type: "underline", raw: src.slice(0, end + 4), text, tokens: lexer.inlineTokens(text) } as never;
	},
};
