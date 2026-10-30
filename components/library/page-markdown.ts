/** Pages are stored as Markdown; TipTap edits a document parsed from it. This
 *  is the one place the two meet, and it has no React and no DOM at import, so
 *  tests/page-editor-roundtrip.test.ts runs it in Node (T056a, owner gate).
 *
 *  Math keeps its exact delimiters and TeX as attributes. Anything the editor
 *  has no model for (raw HTML, footnotes) is kept verbatim. A block the learner
 *  did not touch writes back the bytes it came from, and a page with no edit at
 *  all writes back what was stored. */
import { Extension, getSchema, Node as TiptapNode, type AnyExtension, type JSONContent } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { MarkdownManager } from "@tiptap/markdown";
import { Node as PmNode, type Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { decodeNamedCharacterReference } from "decode-named-character-reference";

type Token = { raw?: string; type?: string; block?: boolean; text?: string; latex?: string; open?: string; close?: string; source?: string; [k: string]: unknown };

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

const mathAttrs = (open: string, close: string) => ({
	open: { default: open, rendered: false },
	close: { default: close, rendered: false },
});

const PageInlineMath = InlineMath.extend({
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

const PageBlockMath = BlockMath.extend({
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
export function pageExtensions(mathOptions?: { onInline?: (pos: number) => void; onBlock?: (pos: number) => void }): AnyExtension[] {
	return [
		StarterKit.configure({
			underline: false,
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
		PageInlineMath.configure({ onClick: mathOptions?.onInline ? (_n, pos) => mathOptions.onInline!(pos) : undefined, katexOptions: { throwOnError: false } }),
		PageBlockMath.configure({ onClick: mathOptions?.onBlock ? (_n, pos) => mathOptions.onBlock!(pos) : undefined, katexOptions: { throwOnError: false, displayMode: true } }),
		RawBlock,
		RawInline,
		PageImage,
		EntityText,
	];
}

const LINE_START = /^(#{1,6}(?=[ \t]|$)|[-+](?=[ \t]|$)|>|(\d{1,9})([.)])(?=[ \t]|$)|-{3,}|={3,}|\+{3,})/;

/** TipTap's escaper misses `$`, the legacy math openers and line-start syntax,
 *  each of which would turn literal text into math or structure on reload.
 *  A bracket that could open a link or task is written as a character reference,
 *  because `\\[` reads as display math in this app. A lone bracket stays bare. */
function escapeText(text: string): string {
	const linky = /\]\s*[([:]|\[\^|(^|\n)\[[ xX]\]/.test(text);
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
			: { ...node, marks: node.marks?.some((m) => m.type === markType) ? node.marks : [...(node.marks ?? []), mark] }) as JSONContent[];
	};
	cached = { manager, schema: getSchema(extensions) };
	return cached;
}

/** TipTap can lift a lone image out of its paragraph; the schema wants it inside. */
function wrapStrayInlines(node: JSONContent): JSONContent {
	if (!node.content) return node;
	const content = node.content.map(wrapStrayInlines);
	const holdsBlocks = node.type === "doc" || node.type === "blockquote" || node.type === "listItem" || node.type === "taskItem";
	return { ...node, content: holdsBlocks ? content.map((c) => (c.type === "pageImage" ? { type: "paragraph", content: [c] } : c)) : content };
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
				return left.get(key)?.shift() ?? key;
			});
			const body = blocks.join("\n\n");
			return endsWithNewline && body ? `${body}\n` : body;
		},
	};
}
