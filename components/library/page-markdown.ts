/** Pages are stored as Markdown; TipTap edits a document parsed from it. This
 *  is the one place the two meet, and it has no React and no DOM at import, so
 *  tests/page-editor-roundtrip.test.ts runs it in Node (T056a, owner gate).
 *
 *  Math keeps its exact delimiters and TeX as attributes. Anything the editor
 *  has no model for (raw HTML, footnotes) is kept verbatim. A block the learner
 *  did not touch writes back the bytes it came from, and a page with no edit at
 *  all writes back what was stored. */
import { Extension, getSchema, InputRule, nodePasteRule, Node as TiptapNode, type AnyExtension, type JSONContent } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { mathNodeView } from "./page-math-view.ts";
import { calloutNodeView, collapsibleNodeView, wikiLinkNodeView, type WikiBridge } from "./page-note-views.ts";
import { WIKI_TARGET, wikiLinkAt } from "@/src/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { MarkdownManager } from "@tiptap/markdown";
import { Node as PmNode, type Schema } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { InkColorMark, underlineTokenizer } from "./page-ink.ts";

type Token = { raw?: string; type?: string; block?: boolean; text?: string; latex?: string; open?: string; close?: string; source?: string; tokens?: Token[]; [k: string]: unknown };

/** First line-start position of a display opener, for marked's paragraph cut. */
function blockMathStart(src: string): number | undefined {
	const m = /(?:^|\n) {0,3}(?:\$\$|\\\[)/.exec(src);
	return m ? m.index + (m[0].startsWith("\n") ? 1 : 0) : undefined;
}

/** `$$` or `\[` that owns its lines. `$$x$$` followed by prose on the same line
 *  stays inline, as the app's reader treats it. */
function tokenizeBlockMath(src: string): Token | undefined {
	const m = /^( {0,3})(\$\$|\\\[)/.exec(src);
	if (!m) return undefined;
	const indent = m[1]!, opener = m[2]!;
	const closer = opener === "$$" ? "$$" : "\\]";
	const from = m[0].length;
	if (opener === "$$" && src[from] === "$") return undefined;
	const end = src.indexOf(closer, from);
	if (end < 0) return undefined;
	const after = /^[ \t]*(?:\n|$)/.exec(src.slice(end + closer.length));
	if (!after) return undefined;
	const inner = src.slice(from, end);
	if (!inner.trim()) return undefined;
	const lead = /^[ \t]*\n?/.exec(inner)![0];
	const trail = /\n?[ \t]*$/.exec(inner)![0];
	return {
		type: "blockMath",
		raw: src.slice(0, end + closer.length + after[0].length),
		latex: inner.slice(lead.length, inner.length - trail.length),
		open: indent + opener + lead,
		close: trail + closer,
	};
}

/** micromark's text math: a dollar run closed by a run of the same length, with
 *  no backslash escape inside. `\(...\)` and a mid-line `\[...\]` are the legacy
 *  spellings src/core/math-delims.ts still reads. */
function tokenizeInlineMath(src: string): Token | undefined {
	if (src.startsWith("\\(") || src.startsWith("\\[")) {
		const open = src.slice(0, 2), close = open === "\\(" ? "\\)" : "\\]";
		const end = src.indexOf(close, 2);
		if (end < 3 || src.slice(2, end).includes("\n\n")) return undefined;
		return { type: "inlineMath", raw: src.slice(0, end + 2), latex: src.slice(2, end), open, close };
	}
	const run = /^\$+/.exec(src)?.[0];
	if (!run || run.length > 2) return undefined;
	let i = run.length;
	while (i < src.length) {
		if (src[i] !== "$") { i++; continue; }
		const close = /^\$+/.exec(src.slice(i))![0];
		if (close.length === run.length) {
			const latex = src.slice(run.length, i);
			if (!latex.trim() || latex.includes("\n\n")) return undefined;
			return { type: "inlineMath", raw: src.slice(0, i + close.length), latex, open: run, close: run };
		}
		i += close.length;
	}
	return undefined;
}

interface PageMathOptions { onSave?: () => void; onClick?: undefined; katexOptions?: undefined }

const mathAttrs = (open: string, close: string) => ({
	open: { default: open, rendered: false },
	close: { default: close, rendered: false },
});

const PageInlineMath = InlineMath.extend<PageMathOptions>({
	addNodeView() {
		return ({ node, view, getPos }) => mathNodeView({ node, view, getPos, kind: "inline", katexOptions: { throwOnError: false }, onSave: () => this.options.onSave?.() });
	},
	addAttributes() {
		return { ...this.parent?.(), ...mathAttrs("$", "$") };
	},
	parseMarkdown: (token: Token) => ({ type: "inlineMath", attrs: { latex: token.latex, open: token.open, close: token.close } }),
	renderMarkdown: (node: JSONContent) => `${node.attrs?.open ?? "$"}${node.attrs?.latex ?? ""}${node.attrs?.close ?? "$"}`,
	markdownTokenizer: {
		name: "inlineMath",
		level: "inline" as const,
		start: (src: string) => {
			const m = /\$|\\[([]/.exec(src);
			return m ? m.index : -1;
		},
		tokenize: (src: string) => tokenizeInlineMath(src) as never,
	},
});

const PageBlockMath = BlockMath.extend<PageMathOptions>({
	addNodeView() {
		return ({ node, view, getPos }) => mathNodeView({ node, view, getPos, kind: "block", katexOptions: { throwOnError: false, displayMode: true }, onSave: () => this.options.onSave?.() });
	},
	addAttributes() {
		return { ...this.parent?.(), ...mathAttrs("$$\n", "\n$$") };
	},
	parseMarkdown: (token: Token) => ({ type: "blockMath", attrs: { latex: token.latex, open: token.open, close: token.close } }),
	renderMarkdown: (node: JSONContent) => `${node.attrs?.open ?? "$$\n"}${node.attrs?.latex ?? ""}${node.attrs?.close ?? "\n$$"}`,
	markdownTokenizer: {
		name: "blockMath",
		level: "block" as const,
		start: (src: string) => blockMathStart(src) ?? -1,
		tokenize: (src: string) => tokenizeBlockMath(src) as never,
	},
});

/** Markdown the editor can't model as rich text, shown and edited as its source
 *  so nothing in it is lost: block HTML, HTML comments, footnote definitions. */
const RawBlock = TiptapNode.create({
	name: "rawBlock",
	group: "block",
	content: "text*",
	marks: "",
	code: true,
	defining: true,
	parseHTML: () => [{ tag: "pre[data-raw-block]", preserveWhitespace: "full" as const }],
	renderHTML: () => ["pre", { "data-raw-block": "", class: "lh-page-raw" }, 0],
	markdownTokenName: "rawBlock",
	parseMarkdown: (token: Token) => ({ type: "rawBlock", content: token.source ? [{ type: "text", text: token.source }] : [] }),
	renderMarkdown: (node: JSONContent, h) => (node.content ? h.renderChildren(node.content) : ""),
	markdownTokenizer: {
		name: "rawBlock",
		level: "block" as const,
		start: (src: string) => {
			const m = /(?:^|\n)\[\^[^\]\s]+\]:/.exec(src);
			return m ? m.index + (m[0].startsWith("\n") ? 1 : 0) : -1;
		},
		tokenize: (src: string) => {
			const m = /^\[\^[^\]\s]+\]:[^\n]*(?:\n(?:[ \t]+[^\n]*|[ \t]*(?=\n[ \t]+\S)))*/.exec(src);
			return m ? ({ type: "rawBlock", raw: m[0], source: m[0] } as never) : undefined;
		},
	},
});

/** Inline raw source: `<kbd>`, `<br>`, footnote calls. Same idea, one atom. */
const RawInline = TiptapNode.create({
	name: "rawInline",
	group: "inline",
	inline: true,
	atom: true,
	addAttributes: () => ({ source: { default: "" } }),
	parseHTML: () => [{ tag: "code[data-raw-inline]", getAttrs: (el) => ({ source: el.textContent ?? "" }) }],
	renderHTML: ({ node }) => ["code", { "data-raw-inline": "", class: "lh-page-raw-inline" }, String(node.attrs.source)],
	markdownTokenName: "rawInline",
	parseMarkdown: (token: Token) => ({ type: "rawInline", attrs: { source: token.source } }),
	renderMarkdown: (node: JSONContent) => String(node.attrs?.source ?? ""),
	markdownTokenizer: {
		name: "rawInline",
		level: "inline" as const,
		start: (src: string) => src.indexOf("[^"),
		tokenize: (src: string) => {
			const m = /^\[\^[^\]\s]+\]/.exec(src);
			return m ? ({ type: "rawInline", raw: m[0], source: m[0] } as never) : undefined;
		},
	},
});

/** An image, drawn, keeping alt, title and address. */
const PageImage = TiptapNode.create({
	name: "pageImage",
	group: "inline",
	inline: true,
	atom: true,
	addAttributes: () => ({ src: { default: "" }, alt: { default: "" }, title: { default: null } }),
	parseHTML: () => [{ tag: "img[src]" }],
	renderHTML: ({ HTMLAttributes }) => ["img", { ...HTMLAttributes, class: "lh-page-image", referrerpolicy: "no-referrer", loading: "lazy" }],
	// In the browser: an image that can't load (its Library item deleted) shows its alt text instead.
	addNodeView: () => ({ node }) => {
		const img = document.createElement("img");
		img.className = "lh-page-image";
		img.referrerPolicy = "no-referrer";
		img.loading = "lazy";
		img.alt = String(node.attrs.alt ?? "");
		if (node.attrs.title) img.title = String(node.attrs.title);
		const dom = document.createElement("span");
		dom.className = "lh-page-image-host";
		dom.append(img);
		img.addEventListener("error", () => {
			const missing = document.createElement("span");
			missing.className = "lh-page-image-missing";
			missing.dataset.testid = "page-image-missing";
			missing.textContent = img.alt || "Image";
			dom.replaceChildren(missing);
		}, { once: true });
		img.src = String(node.attrs.src ?? "");
		return { dom };
	},
	markdownTokenName: "image",
	parseMarkdown: (token: Token) => ({ type: "pageImage", attrs: { src: token.href, alt: token.text ?? "", title: token.title ?? null } }),
	renderMarkdown: (node: JSONContent) => {
		const { src, alt, title } = node.attrs ?? {};
		return `![${String(alt ?? "").replace(/[[\]\\]/g, "\\$&")}](${destination(String(src ?? ""))}${title ? ` "${String(title).replace(/"/g, '\\"')}"` : ""})`;
	},
});

/** `&copy;` and `&#91;`. TipTap decodes only a handful and would store others as
 *  literal text. Named references use the table the chat's parser uses. */
const EntityText = Extension.create({
	name: "entityText",
	markdownTokenName: "entityText",
	parseMarkdown: (token: Token) => ({ type: "text", text: token.text }),
	markdownTokenizer: {
		name: "entityText",
		level: "inline" as const,
		start: (src: string) => src.indexOf("&"),
		tokenize: (src: string) => {
			const m = /^&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{0,31}));/.exec(src);
			if (!m) return undefined;
			const point = m[1] ? Number(m[1]) : m[2] ? parseInt(m[2], 16) : null;
			const text = point === null ? decodeNamedCharacterReference(m[3]!) : point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : false;
			return text ? ({ type: "entityText", raw: m[0], text } as never) : undefined;
		},
	},
});

/** `[[Page name]]` (feature 016): one atom whose only stored fact is the target
 *  as written, so the Markdown comes back byte for byte. What it points at is
 *  worked out at read time (src/core/note-links.ts), never stored. */
const WikiLink = TiptapNode.create<{ bridge?: WikiBridge }>({
	name: "wikiLink",
	group: "inline",
	inline: true,
	atom: true,
	addOptions: () => ({ bridge: undefined }),
	addAttributes: () => ({ target: { default: "" } }),
	parseHTML: () => [{ tag: "a[data-wiki-link]", priority: 60, getAttrs: (el) => ({ target: el.getAttribute("data-wiki-target") ?? el.textContent ?? "" }) }],
	renderHTML: ({ node }) => ["a", { "data-wiki-link": "", "data-wiki-target": String(node.attrs.target), class: "lh-wiki-link" }, String(node.attrs.target)],
	renderText: ({ node }) => `[[${String(node.attrs.target)}]]`,
	addNodeView() {
		return ({ node }) => wikiLinkNodeView(node, this.options.bridge);
	},
	addInputRules() {
		// Not nodeInputRule: with a capture group it replaces only the group, leaving the brackets as text.
		return [new InputRule({
			find: new RegExp(`\\[\\[(${WIKI_TARGET})\\]\\]$`),
			handler: ({ state, range, match }) => {
				// A section's title is plain text: the brackets stay text there.
				const $from = state.doc.resolve(range.from);
				if (!$from.parent.canReplaceWith($from.index(), $from.indexAfter(), this.type)) return null;
				state.tr.replaceWith(range.from, range.to, this.type.create({ target: match[1] }));
			},
		})];
	},
	addPasteRules() {
		return [nodePasteRule({ find: new RegExp(`\\[\\[(${WIKI_TARGET})\\]\\]`, "g"), type: this.type, getAttributes: (match) => ({ target: match[1] }) })];
	},
	markdownTokenName: "wikiLink",
	parseMarkdown: (token: Token) => ({ type: "wikiLink", attrs: { target: token.target } }),
	renderMarkdown: (node: JSONContent) => `[[${String(node.attrs?.target ?? "")}]]`,
	markdownTokenizer: {
		name: "wikiLink",
		level: "inline" as const,
		start: (src: string) => src.indexOf("[["),
		tokenize: (src: string) => {
			const link = wikiLinkAt(src);
			return link ? ({ type: "wikiLink", raw: link.raw, target: link.target } as never) : undefined;
		},
	},
});

export const CALLOUT_KINDS = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;
const CALLOUT_OPEN = new RegExp(`^ {0,3}> ?\\[!(${CALLOUT_KINDS.join("|")})\\][ \\t]*([^\\n]*)(?:\\n|$)`, "i");

const quoted = (block: string) => block.split("\n").map((line) => (line.trim() ? `> ${line}` : ">")).join("\n");

/** `> [!NOTE] Title` over quoted lines (feature 016): GitHub's alert form, which
 *  any Markdown viewer still reads as a quote. The kind keeps its spelling. */
const Callout = TiptapNode.create({
	name: "callout",
	group: "block",
	content: "block+",
	defining: true,
	addAttributes: () => ({ kind: { default: "NOTE" }, title: { default: "" } }),
	parseHTML: () => [{ tag: "aside[data-callout]", getAttrs: (el) => ({ kind: el.getAttribute("data-callout") || "NOTE", title: el.getAttribute("data-callout-title") ?? "" }) }],
	renderHTML: ({ node }) => ["aside", { "data-callout": String(node.attrs.kind), "data-callout-title": String(node.attrs.title), class: "lh-callout" }, 0],
	addNodeView() {
		return ({ node, view, getPos }) => calloutNodeView(node, view, getPos);
	},
	markdownTokenName: "callout",
	parseMarkdown: (token: Token, h) => ({
		type: "callout",
		attrs: { kind: token.kind, title: token.title },
		content: (() => {
			const children = h.parseChildren((token.tokens ?? []) as never);
			return children.length ? children : [{ type: "paragraph" }];
		})(),
	}),
	renderMarkdown: (node: JSONContent, h) => {
		const head = `> [!${String(node.attrs?.kind ?? "NOTE")}]${node.attrs?.title ? ` ${String(node.attrs.title)}` : ""}`;
		const body = (node.content ?? []).map((child) => h.renderChildren([child])).filter((block) => block.trim());
		return body.length ? `${head}\n${quoted(body.join("\n\n"))}` : head;
	},
	markdownTokenizer: {
		name: "callout",
		level: "block" as const,
		start: (src: string) => {
			const m = /(?:^|\n) {0,3}> ?\[!/.exec(src);
			return m ? m.index + (m[0].startsWith("\n") ? 1 : 0) : -1;
		},
		tokenize: (src, _tokens, lexer) => {
			const open = CALLOUT_OPEN.exec(src);
			if (!open) return undefined;
			let end = open[0].length;
			const lines: string[] = [];
			while (end < src.length) {
				const stop = src.indexOf("\n", end);
				const line = src.slice(end, stop < 0 ? src.length : stop);
				const inner = /^ {0,3}> ?(.*)$/.exec(line);
				if (!inner) break;
				lines.push(inner[1]!);
				end = stop < 0 ? src.length : stop + 1;
			}
			return { type: "callout", raw: src.slice(0, end), kind: open[1]!, title: open[2]!.trimEnd(), tokens: lexer.blockTokens(lines.join("\n")) } as never;
		},
	},
});

const htmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plainText = (html: string) => html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The title line of a collapsible section: one line of plain text. */
const CollapsibleSummary = TiptapNode.create({
	name: "collapsibleSummary",
	content: "text*",
	marks: "",
	defining: true,
	selectable: false,
	parseHTML: () => [{ tag: "div[data-collapsible-summary]", preserveWhitespace: "full" as const }],
	renderHTML: () => ["div", { "data-collapsible-summary": "", class: "lh-collapsible-summary" }, 0],
	markdownTokenName: "collapsibleSummary",
	renderMarkdown: (node: JSONContent) => htmlText((node.content ?? []).map((child) => child.text ?? "").join("")),
});

const DETAILS_OPEN = /^ {0,3}<details( open)?>[ \t]*\n<summary>([^<\n]*)<\/summary>[ \t]*\n(?:[ \t]*\n)?/;

/** Where the `</details>` closing the section starting in `src` ends. Nesting
 *  counts; a fence's text doesn't. Null: not the form this editor writes, so it
 *  stays raw source as it always did. */
function closeOfDetails(src: string, from: number): { bodyEnd: number; end: number } | null {
	let depth = 1, offset = from, fence: string | null = null;
	while (offset <= src.length) {
		const stop = src.indexOf("\n", offset);
		const line = src.slice(offset, stop < 0 ? src.length : stop);
		const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence) {
			if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
		} else if (marker) fence = marker;
		else if (/^ {0,3}<details( open)?>[ \t]*$/.test(line)) depth++;
		else if (/^ {0,3}<\/details>[ \t]*$/.test(line) && --depth === 0) return { bodyEnd: offset, end: stop < 0 ? src.length : stop + 1 };
		if (stop < 0) return null;
		offset = stop + 1;
	}
	return null;
}

/** `<details><summary>` on their own lines (feature 016). Open or closed is the
 *  `open` attribute, as in HTML, so a plain viewer folds it the same way and
 *  still shows the text. */
const Collapsible = TiptapNode.create({
	name: "collapsible",
	group: "block",
	content: "collapsibleSummary block+",
	defining: true,
	isolating: true,
	addAttributes: () => ({ open: { default: true } }),
	parseHTML: () => [{ tag: "div[data-collapsible]", getAttrs: (el) => ({ open: el.getAttribute("data-open") !== "false" }) }],
	renderHTML: ({ node }) => ["div", { "data-collapsible": "", "data-open": String(Boolean(node.attrs.open)), class: "lh-collapsible" }, 0],
	addNodeView() {
		return ({ node, view, getPos }) => collapsibleNodeView(node, view, getPos);
	},
	addKeyboardShortcuts() {
		const inside = () => {
			const { $from } = this.editor.state.selection;
			for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type === this.type) return { depth, pos: $from.before(depth), node: $from.node(depth) };
			return null;
		};
		const setOpen = (pos: number, open: boolean, caret?: "summary" | "body") => this.editor.commands.command(({ tr }) => {
			tr.setNodeAttribute(pos, "open", open);
			const node = tr.doc.nodeAt(pos);
			if (caret && node) tr.setSelection(TextSelection.near(tr.doc.resolve(caret === "summary" ? pos + 1 + node.child(0).nodeSize - 1 : pos + 1 + node.child(0).nodeSize + 1)));
			return true;
		});
		return {
			// Enter on the title opens the section and goes into it.
			Enter: () => {
				const found = inside();
				const { $from, empty } = this.editor.state.selection;
				if (!found || !empty || $from.parent.type.name !== "collapsibleSummary") return false;
				return setOpen(found.pos, true, "body");
			},
			// Open or close from anywhere inside it.
			"Mod-Enter": () => {
				const found = inside();
				if (!found) return false;
				return setOpen(found.pos, !found.node.attrs.open, found.node.attrs.open ? "summary" : undefined);
			},
			// An empty title and Backspace: the section goes, its text stays.
			Backspace: () => {
				const found = inside();
				const { $from, empty } = this.editor.state.selection;
				if (!found || !empty || $from.parent.type.name !== "collapsibleSummary" || $from.parent.content.size > 0) return false;
				return this.editor.commands.command(({ tr }) => {
					const blocks: PmNode[] = [];
					found.node.forEach((child, _offset, index) => { if (index > 0) blocks.push(child); });
					tr.replaceWith(found.pos, found.pos + found.node.nodeSize, blocks);
					return true;
				});
			},
		};
	},
	markdownTokenName: "collapsible",
	parseMarkdown: (token: Token, h) => {
		const summary = String(token.summary ?? "");
		const children = h.parseChildren((token.tokens ?? []) as never);
		return {
			type: "collapsible",
			attrs: { open: Boolean(token.open) },
			content: [
				{ type: "collapsibleSummary", content: summary ? [{ type: "text", text: plainText(summary) }] : [] },
				...(children.length ? children : [{ type: "paragraph" }]),
			],
		};
	},
	renderMarkdown: (node: JSONContent, h) => {
		const [summary, ...rest] = node.content ?? [];
		const title = htmlText((summary?.content ?? []).map((child) => child.text ?? "").join(""));
		const body = rest.map((child) => h.renderChildren([child])).filter((block) => block.trim());
		return `<details${node.attrs?.open ? " open" : ""}>\n<summary>${title}</summary>\n\n${body.length ? `${body.join("\n\n")}\n\n` : ""}</details>`;
	},
	markdownTokenizer: {
		name: "collapsible",
		level: "block" as const,
		start: (src: string) => {
			const m = /(?:^|\n) {0,3}<details( open)?>/.exec(src);
			return m ? m.index + (m[0].startsWith("\n") ? 1 : 0) : -1;
		},
		tokenize: (src, _tokens, lexer) => {
			const open = DETAILS_OPEN.exec(src);
			if (!open) return undefined;
			const close = closeOfDetails(src, open[0].length);
			if (!close) return undefined;
			const body = src.slice(open[0].length, close.bodyEnd).replace(/\s+$/, "");
			return { type: "collapsible", raw: src.slice(0, close.end), open: Boolean(open[1]), summary: open[2]!, tokens: lexer.blockTokens(body) } as never;
		},
	},
});

/** A link or image address, bracketed when the bare form would not parse. */
function destination(href: string): string {
	return /[\s<>]/.test(href) ? `<${href.replace(/[<>]/g, "\\$&")}>` : href;
}

/** A fence one longer than any backtick run inside, so code can hold fences. */
function fenceFor(text: string): string {
	let longest = 2;
	for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
	return "`".repeat(longest + 1);
}

/** Shared by Node (tests) and the browser editor, so they can't disagree. */
export function pageExtensions(mathOptions?: { onSave?: () => void; wiki?: WikiBridge }): AnyExtension[] {
	return [
		StarterKit.configure({
			link: { openOnClick: false, autolink: false, linkOnPaste: true, HTMLAttributes: { rel: "noreferrer", target: "_blank" } },
			codeBlock: { HTMLAttributes: { spellcheck: "false" } },
		}).extend({
			addExtensions() {
				return (this.parent?.() ?? []).map((ext) => {
					if (ext.name === "codeBlock") return ext.extend({
						renderMarkdown: (node: JSONContent, h) => {
							const text = node.content ? h.renderChildren(node.content) : "";
							const fence = fenceFor(text);
							return `${fence}${node.attrs?.language ?? ""}\n${text}\n${fence}`;
						},
					});
					// A soft line break stays a newline in its text: the browser's text
					// reader would otherwise turn it into a hard break on the first
					// keystroke nearby, rewriting bytes nobody edited.
					if (ext.name === "paragraph") return ext.extend({ whitespace: "pre" });
					// `<u>…</u>` only, lowercase (page-ink.ts), so other HTML stays verbatim.
					if (ext.name === "underline") return ext.extend({ markdownTokenizer: underlineTokenizer as never });
					if (ext.name === "link") return ext.extend({
						renderMarkdown: (node: JSONContent, h) => {
							const title = node.attrs?.title;
							return `[${h.renderChildren(node)}](${destination(String(node.attrs?.href ?? ""))}${title ? ` "${String(title).replace(/"/g, '\\"')}"` : ""})`;
						},
					});
					return ext;
				});
			},
		}),
		TableKit,
		TaskList,
		TaskItem.configure({ nested: true }),
		PageInlineMath.configure({ onSave: mathOptions?.onSave }),
		PageBlockMath.configure({ onSave: mathOptions?.onSave }),
		RawBlock,
		RawInline,
		PageImage,
		EntityText,
		WikiLink.configure({ bridge: mathOptions?.wiki }),
		Callout,
		Collapsible,
		CollapsibleSummary,
		InkColorMark,
	];
}

const LINE_START = /^(#{1,6}(?=[ \t]|$)|[-+](?=[ \t]|$)|>|(\d{1,9})([.)])(?=[ \t]|$)|-{3,}|={3,}|\+{3,})/;

/** TipTap's escaper misses `$`, the legacy math openers and line-start syntax,
 *  each of which would turn literal text into math or structure on reload.
 *  A bracket that could open a link or task is written as a character reference,
 *  because `\\[` reads as display math in this app. A lone bracket stays bare. */
function escapeText(text: string): string {
	const linky = /\]\s*[([:]|\[\^|(^|\n)\[[ xX]\]|\[\[|(^|\n)\[!/.test(text);
	const inline = text.replace(/([\\`*_~$])/g, "\\$1").replace(/[[\]]/g, (b) => (linky ? (b === "[" ? "&#91;" : "&#93;") : b));
	return inline.split("\n").map((line) => line.replace(LINE_START, (m, _a, digits?: string, mark?: string) => (digits ? `${digits}\\${mark}` : `\\${m}`))).join("\n");
}

type ManagerInternals = {
	escapeMarkdownSyntax: (text: string) => string;
	parseHTMLToken: (token: Token) => JSONContent | JSONContent[] | null;
	applyMarkToContent: (markType: string, content: JSONContent[], attrs?: unknown) => JSONContent[];
	createLexer: () => { lex: (src: string) => Token[] };
	renderNodeToMarkdown: (node: JSONContent, parent?: JSONContent) => string;
};

let cached: { manager: MarkdownManager; schema: Schema } | null = null;

function shared() {
	if (cached) return cached;
	const extensions = pageExtensions();
	const manager = new MarkdownManager({ extensions: extensions as never });
	// Pinned TipTap version; the corpus test fails if these internals move.
	const internals = manager as unknown as ManagerInternals;
	internals.escapeMarkdownSyntax = escapeText;
	internals.parseHTMLToken = (token) => {
		const source = String(token.raw ?? token.text ?? "").replace(/\s+$/, "");
		if (!source) return null;
		return token.block
			? { type: "rawBlock", content: [{ type: "text", text: source }] }
			: { type: "rawInline", attrs: { source } };
	};
	// Stock code drops a mark on a non-text inline, so **$x$** would lose its bold.
	internals.applyMarkToContent = function apply(markType, content, attrs): JSONContent[] {
		const mark = attrs ? { type: markType, attrs } : { type: markType };
		return content.map((node) => node.content
			? { ...node, content: apply(markType, node.content, attrs) }
			// Code takes no other mark; underline and ink (feature 024) around code text leave it plain code
			// rather than fail the page (an edit there writes `x` without the <u> or <span>).
			: (markType === "underline" || markType === "inkColor") && node.marks?.some((m) => m.type === "code") ? node
			: { ...node, marks: node.marks?.some((m) => m.type === markType) ? node.marks : [...(node.marks ?? []), mark] }) as JSONContent[];
	};
	cached = { manager, schema: getSchema(extensions) };
	return cached;
}

/** TipTap can lift a lone image out of its paragraph; the schema wants it inside. */
function wrapStrayInlines(node: JSONContent): JSONContent {
	if (!node.content) return node;
	const content = node.content.map(wrapStrayInlines);
	const holdsBlocks = node.type === "doc" || node.type === "blockquote" || node.type === "listItem" || node.type === "taskItem" || node.type === "callout" || node.type === "collapsible";
	return { ...node, content: holdsBlocks ? content.map((c) => (c.type === "pageImage" ? { type: "paragraph", content: [c] } : c)) : content };
}

/** The page's top-level tokens' source text, in order, whitespace tokens
 *  included: joined, they give back the page with "\r\n" read as "\n". */
export function markdownTokenRaws(markdown: string): { raw: string; space: boolean }[] {
	const lexer = (shared().manager as unknown as ManagerInternals).createLexer();
	return lexer.lex(markdown).map((token) => ({ raw: String(token.raw ?? ""), space: token.type === "space" }));
}

export function parsePageMarkdown(markdown: string): JSONContent {
	const { manager, schema } = shared();
	const doc = wrapStrayInlines(manager.parse(markdown));
	if (!doc.content?.length) doc.content = [{ type: "paragraph" }];
	const node = PmNode.fromJSON(schema, doc);
	node.check();
	return node.toJSON() as JSONContent;
}

const ATOM_OPEN = "\uE000", ATOM_CLOSE = "\uE001";

/** TipTap closes every mark around a non-text inline, so `**a $x$ b**` would come
 *  out as three bold runs. A marked atom travels as placeholder text instead and
 *  is put back after. Only the table renderer's pipe escape can't see inside. */
function hideMarkedAtoms(node: JSONContent, atoms: string[], inTable: boolean): JSONContent {
	if (!node.content) return node;
	const table = inTable || node.type === "table";
	return {
		...node,
		content: node.content.map((child) => {
			if (child.type === "text" || !child.marks?.length || child.content) return hideMarkedAtoms(child, atoms, table);
			const internals = shared().manager as unknown as ManagerInternals;
			const source = internals.renderNodeToMarkdown({ ...child, marks: undefined }, node);
			atoms.push(table ? source.replace(/\\.|\|/g, (m) => (m === "|" ? "\\|" : m)) : source);
			return { type: "text", text: `${ATOM_OPEN}${atoms.length - 1}${ATOM_CLOSE}`, marks: child.marks };
		}),
	};
}

export function serializePageJson(json: JSONContent): string {
	const atoms: string[] = [];
	const hidden = hideMarkedAtoms(json, atoms, false);
	const out = shared().manager.serialize(hidden);
	return atoms.length ? out.replace(/\uE000(\d+)\uE001/g, (m, i: string) => atoms[Number(i)] ?? m) : out;
}

/** The text to store for an editor document, given what was loaded. */
export interface PageCodec {
	/** Parsed document for the editor. */
	doc: JSONContent;
	/** Tell the codec what the editor holds right after loading. */
	settle(loaded: JSONContent): void;
	toMarkdown(current: JSONContent): string;
}

/** The editor keeps an empty paragraph after a closing table, code block or
 *  formula, as a place for the caret. It is not content. */
function withoutTrailingEmpties(doc: JSONContent): JSONContent {
	const content = [...(doc.content ?? [])];
	while (content.length > 1 && content.at(-1)!.type === "paragraph" && !content.at(-1)!.content?.length) content.pop();
	return { ...doc, content };
}

export function createPageCodec(stored: string): PageCodec {
	const { manager } = shared();
	const doc = parsePageMarkdown(stored);
	const textOf = (json: JSONContent) => serializePageJson(withoutTrailingEmpties(json));
	let baseline = textOf(doc);
	const originals = new Map<string, string[]>();
	const lexer = (manager as unknown as ManagerInternals).createLexer();
	for (const token of lexer.lex(stored)) {
		if (token.type === "space" || token.type === "def" || !token.raw?.trim()) continue;
		const raw = token.raw.replace(/\s+$/, "");
		const parts = parsePageMarkdown(raw).content ?? [];
		if (parts.length !== 1) continue;
		const key = serializePageJson({ type: "doc", content: parts });
		originals.set(key, [...(originals.get(key) ?? []), raw]);
	}
	const endsWithNewline = stored.endsWith("\n");
	return {
		doc,
		settle(loaded) { baseline = textOf(loaded); },
		toMarkdown(current) {
			if (textOf(current) === baseline) return stored;
			const left = new Map([...originals].map(([k, v]) => [k, [...v]]));
			const blocks = (withoutTrailingEmpties(current).content ?? []).map((block) => {
				const key = serializePageJson({ type: "doc", content: [block] });
				// An edited table serializes wrapped in newlines; blocks join with one blank line.
				return left.get(key)?.shift() ?? key.replace(/^\n+|\n+$/g, "");
			});
			const body = blocks.join("\n\n");
			return endsWithNewline && body ? `${body}\n` : body;
		},
	};
}
