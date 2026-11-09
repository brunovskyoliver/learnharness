/**
 * Notebook export (feature 024, US7, research R7): one document model built
 * from the page's Markdown and its companion, and the writers that only
 * need text (Markdown, the PDF's HTML). Word lives in docx.ts, packing in
 * zip.ts; the server (src/server/notebook-export.ts) adds the pictures and
 * the headless PDF. Pure: no fs, no network.
 *
 * The model: the page as blocks in reading order (headings, paragraphs,
 * list items flattened with their level, code, maths, rules), each with
 * the AI's notes that belong to it right after. A note belongs to the
 * block its passage resolves to (the same anchoring the page uses, against
 * the same plain text: textblocks joined by a blank line, list items led by
 * "- " / "1. ", headings by "#"). Open and resolved threads count;
 * dismissed ones don't. Threads whose words are gone go at the end under
 * "Other notes". An AI message is led by its reviewer's name unless the
 * reviewer is Plain reader (or no longer exists).
 */
import { fromMarkdown } from "mdast-util-from-markdown";
import { mathFromMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";
import { firstWords, resolveAnchor, type NoteCompanion, type NotebookThread } from "./notebook.ts";
import { renderSketchSvg, type Sketch } from "./notebook-sketch.ts";
import { DEFAULT_REVIEWER_ID, type NotebookReviewer } from "./settings.ts";

// ─── shapes ──────────────────────────────────────────────────────────────────

export type ExportFormat = "pdf" | "docx" | "md";
export const EXPORT_FORMATS = ["pdf", "docx", "md"] as const satisfies readonly ExportFormat[];
export const EXPORT_EXTENSION: Readonly<Record<ExportFormat, string>> = { pdf: "pdf", docx: "docx", md: "md" };
export const EXPORT_MIME: Readonly<Record<ExportFormat, string>> = {
	pdf: "application/pdf",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	md: "text/markdown; charset=utf-8",
};
/** The dialog's names for the formats (ui-contract "Export dialog"). */
export const EXPORT_FORMAT_NAME: Readonly<Record<ExportFormat, string>> = { pdf: "PDF", docx: "Word", md: "Markdown" };
/** The heading over threads whose words are gone. */
export const OTHER_NOTES_HEADING = "Other notes";

/** A stretch of text with its marks. `\n` inside is a line break. */
export interface ExportRun {
	text: string;
	bold?: true;
	italic?: true;
	underline?: true;
	strike?: true;
	code?: true;
	/** TeX source of inline maths. */
	math?: true;
	href?: string;
	/** An ink colour name (page-ink.ts: gray, brown, red, …). */
	color?: string;
}

export type ExportBlock =
	| { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; runs: ExportRun[] }
	| { kind: "paragraph"; runs: ExportRun[]; quote: number }
	| { kind: "item"; runs: ExportRun[]; quote: number; level: number; ordered: boolean; number: number; list: number }
	| { kind: "code"; text: string; lang?: string; quote: number }
	| { kind: "math"; text: string; quote: number }
	| { kind: "image"; alt: string; quote: number }
	| { kind: "rule" };

export interface ExportNoteMessage {
	author: "ai" | "user";
	/** "You", the reviewer's name, or null (an AI message read by Plain reader). */
	speaker: string | null;
	text: string;
	runs: ExportRun[][];
	sketch?: Sketch;
}

export interface ExportNote {
	id: string;
	status: "open" | "resolved";
	/** The passage it is about (for "Other notes"). */
	quote: string;
	messages: ExportNoteMessage[];
}

export interface ExportUnit {
	block: ExportBlock;
	notes: ExportNote[];
	/** Where its notes go in the source Markdown, and the line prefix they take there. */
	md: { at: number; prefix: string };
}

export interface ExportDocument {
	title: string;
	/** The page's Markdown as stored. */
	markdown: string;
	units: ExportUnit[];
	otherNotes: ExportNote[];
	includeAi: boolean;
}

// ─── Markdown parsing ────────────────────────────────────────────────────────

/* Minimal mdast shapes (the package's types come from @types/mdast, which this repo does not list). */
interface MdPoint { offset?: number; line: number; column: number }
interface MdNode {
	type: string;
	value?: string;
	depth?: number;
	ordered?: boolean | null;
	start?: number | null;
	url?: string;
	alt?: string | null;
	lang?: string | null;
	children?: MdNode[];
	position?: { start: MdPoint; end: MdPoint };
}

const parseMarkdown = (text: string): MdNode => fromMarkdown(text, { extensions: [math()], mdastExtensions: [mathFromMarkdown()] }) as unknown as MdNode;

interface Marks { bold?: true; italic?: true; underline?: true; strike?: true; href?: string; color?: string }

/** Inline Markdown to runs, and the plain text the page's anchoring sees. */
function inlineRuns(nodes: readonly MdNode[]): { runs: ExportRun[]; plain: string } {
	const runs: ExportRun[] = [];
	let plain = "";
	// Raw <u> and colour spans (page-ink.ts) and ~~strike~~ (no GFM here) open and close across siblings.
	const stack: Marks[] = [{}];
	const top = () => stack[stack.length - 1]!;
	const push = (text: string, extra: Partial<ExportRun> = {}) => {
		if (!text) return;
		const marks = top();
		const run: ExportRun = { text, ...marks, ...extra };
		for (const key of Object.keys(run) as (keyof ExportRun)[]) if (run[key] === undefined) delete run[key];
		const last = runs[runs.length - 1];
		if (last && sameMarks(last, run)) last.text += text;
		else runs.push(run);
	};
	const walk = (list: readonly MdNode[]) => {
		for (const node of list) {
			switch (node.type) {
				case "text": {
					(node.value ?? "").split("~~").forEach((part, i) => {
						if (i > 0) {
							const now = top();
							stack[stack.length - 1] = now.strike ? withoutKey(now, "strike") : { ...now, strike: true };
						}
						push(part);
						plain += part;
					});
					break;
				}
				case "emphasis":
				case "strong":
				case "link": {
					const extra: Marks = node.type === "emphasis" ? { italic: true } : node.type === "strong" ? { bold: true } : { href: node.url ?? "" };
					stack.push({ ...top(), ...extra });
					walk(node.children ?? []);
					stack.pop();
					break;
				}
				case "inlineCode":
					push(node.value ?? "", { code: true });
					plain += node.value ?? "";
					break;
				case "inlineMath":
					push(node.value ?? "", { math: true });
					plain += node.value ?? "";
					break;
				case "break":
					push("\n");
					plain += "\n";
					break;
				case "image":
					push(node.alt ? `[${node.alt}]` : "[image]", { italic: true });
					break;
				case "html": {
					const tag = (node.value ?? "").trim();
					const color = /^<span\s+data-color="([a-z]+)"\s*>$/.exec(tag);
					if (tag === "<u>") stack.push({ ...top(), underline: true });
					else if (color) stack.push({ ...top(), color: color[1]! });
					else if ((tag === "</u>" || tag === "</span>") && stack.length > 1) stack.pop();
					else { push(node.value ?? ""); plain += node.value ?? ""; }
					break;
				}
				default:
					if (node.children) walk(node.children);
					else if (typeof node.value === "string") { push(node.value); plain += node.value; }
			}
		}
	};
	walk(nodes);
	return { runs, plain };
}

function withoutKey<T extends object, K extends keyof T>(value: T, key: K): T {
	const copy = { ...value };
	delete copy[key];
	return copy;
}

const RUN_KEYS = ["bold", "italic", "underline", "strike", "code", "math", "href", "color"] as const;
const sameMarks = (a: ExportRun, b: ExportRun) => RUN_KEYS.every((k) => a[k] === b[k]);

/** Text of an AI or user message as paragraphs of runs (the Markdown subset messages use). */
export function messageParagraphs(text: string): ExportRun[][] {
	const out: ExportRun[][] = [];
	const visit = (node: MdNode, prefix = "") => {
		if (node.type === "paragraph" || node.type === "heading") {
			const { runs } = inlineRuns(node.children ?? []);
			if (prefix) runs.unshift({ text: prefix });
			if (runs.length) out.push(runs);
		} else if (node.type === "code" || node.type === "math") {
			out.push([{ text: node.value ?? "", ...(node.type === "code" ? { code: true as const } : { math: true as const }) }]);
		} else if (node.type === "list") {
			let n = node.start ?? 1;
			for (const item of node.children ?? []) {
				const lead = node.ordered ? `${n++}. ` : "• ";
				(item.children ?? []).forEach((child, i) => visit(child, i === 0 ? lead : ""));
			}
		} else for (const child of node.children ?? []) visit(child);
	};
	visit(parseMarkdown(text));
	return out;
}

// ─── the page's blocks ───────────────────────────────────────────────────────

interface Segment { start: number; end: number; unit: number }

interface Walked { units: ExportUnit[]; plain: string; segments: Segment[] }

function walkBlocks(markdown: string): Walked {
	const root = parseMarkdown(markdown);
	const units: ExportUnit[] = [];
	const segments: Segment[] = [];
	let plain = "";
	let lists = 0;
	const lineStart = (offset: number) => markdown.lastIndexOf("\n", offset - 1) + 1;
	const lineEnd = (offset: number) => {
		const at = markdown.indexOf("\n", offset);
		return at < 0 ? markdown.length : at;
	};
	// A note under a block takes the block's line prefix: "> " for quotes, spaces for list markers.
	const prefixOf = (node: MdNode) => {
		const start = node.position?.start.offset ?? 0;
		return markdown.slice(lineStart(start), start).replace(/[^>\s]/g, " ");
	};
	const endOf = (node: MdNode) => lineEnd(Math.max(0, (node.position?.end.offset ?? markdown.length) - 1));
	const textblock = (text: string, unit: number) => {
		if (plain) plain += "\n\n";
		segments.push({ start: plain.length, end: plain.length + text.length, unit });
		plain += text;
	};
	const add = (block: ExportBlock, md: ExportUnit["md"]) => {
		units.push({ block, notes: [], md });
		return units.length - 1;
	};

	const visit = (node: MdNode, quote: number, list: { level: number } | null) => {
		switch (node.type) {
			case "heading": {
				const { runs, plain: text } = inlineRuns(node.children ?? []);
				const level = Math.min(6, Math.max(1, node.depth ?? 1)) as 1 | 2 | 3 | 4 | 5 | 6;
				textblock(`${"#".repeat(level)} ${text}`, add({ kind: "heading", level, runs }, { at: endOf(node), prefix: prefixOf(node) }));
				break;
			}
			case "paragraph": {
				const { runs, plain: text } = inlineRuns(node.children ?? []);
				textblock(text, add({ kind: "paragraph", runs, quote }, { at: endOf(node), prefix: prefixOf(node) }));
				break;
			}
			case "code":
				textblock(node.value ?? "", add({ kind: "code", text: node.value ?? "", ...(node.lang ? { lang: node.lang } : {}), quote }, { at: endOf(node), prefix: prefixOf(node) }));
				break;
			case "math":
				textblock(node.value ?? "", add({ kind: "math", text: node.value ?? "", quote }, { at: endOf(node), prefix: prefixOf(node) }));
				break;
			case "html":
				textblock(node.value ?? "", add({ kind: "paragraph", runs: [{ text: node.value ?? "" }], quote }, { at: endOf(node), prefix: prefixOf(node) }));
				break;
			case "thematicBreak":
				add({ kind: "rule" }, { at: endOf(node), prefix: prefixOf(node) });
				break;
			case "blockquote":
				for (const child of node.children ?? []) visit(child, quote + 1, list);
				break;
			case "list": {
				const id = lists++;
				const level = list ? list.level + 1 : 0;
				let number = node.start ?? 1;
				for (const item of node.children ?? []) {
					const children = item.children ?? [];
					const own = children.filter((c) => c.type !== "list");
					const lead = node.ordered ? `${number}. ` : "- ";
					const runs: ExportRun[] = [];
					let text = "";
					own.forEach((child, i) => {
						const inline = child.type === "paragraph" || child.type === "heading"
							? inlineRuns(child.children ?? [])
							: { runs: [{ text: child.value ?? "", ...(child.type === "code" ? { code: true as const } : {}) }], plain: child.value ?? "" };
						if (i > 0) { runs.push({ text: "\n" }); text += "\n\n"; }
						runs.push(...inline.runs);
						text += inline.plain;
					});
					const last = own[own.length - 1];
					const unit = add(
						{ kind: "item", runs, quote, level, ordered: Boolean(node.ordered), number, list: id },
						{ at: last ? endOf(last) : lineEnd(item.position?.start.offset ?? 0), prefix: last ? prefixOf(last) : prefixOf(item).replace(/\S/g, " ") + "  " },
					);
					// The plain text's blank-line split follows the editor: each paragraph of an item is a textblock.
					const pieces = text.split("\n\n");
					pieces.forEach((piece, i) => textblock(i === 0 ? `${lead}${piece}` : piece, unit));
					for (const child of children) if (child.type === "list") visit(child, quote, { level });
					number++;
				}
				break;
			}
			case "image":
				add({ kind: "image", alt: node.alt ?? "", quote }, { at: endOf(node), prefix: prefixOf(node) });
				break;
			case "definition":
				break;
			default:
				if (node.children) for (const child of node.children) visit(child, quote, list);
		}
	};
	for (const child of root.children ?? []) visit(child, 0, null);
	return { units, plain, segments };
}

// ─── notes ───────────────────────────────────────────────────────────────────

/** "Examiner", or null for Plain reader and for a reviewer that is gone. */
export function speakerName(reviewers: readonly Pick<NotebookReviewer, "id" | "name">[], reviewerId: string | undefined): string | null {
	if (!reviewerId || reviewerId === DEFAULT_REVIEWER_ID) return null;
	return reviewers.find((r) => r.id === reviewerId)?.name ?? null;
}

function exportNote(thread: NotebookThread, reviewers: readonly Pick<NotebookReviewer, "id" | "name">[]): ExportNote | null {
	const messages: ExportNoteMessage[] = [];
	for (const message of thread.messages) {
		// A failed answer has nothing to keep; a stopped or still-writing one keeps the words it has.
		if (message.state === "failed") continue;
		if (!message.text.trim() && !message.sketch) continue;
		messages.push({
			author: message.author,
			speaker: message.author === "user" ? "You" : speakerName(reviewers, message.reviewerId),
			text: message.text.trim(),
			runs: messageParagraphs(message.text),
			...(message.sketch ? { sketch: message.sketch } : {}),
		});
	}
	if (!messages.length) return null;
	return { id: thread.id, status: thread.status === "resolved" ? "resolved" : "open", quote: thread.anchor.quote, messages };
}

export interface ExportInput {
	title: string;
	markdown: string;
	companion: Pick<NoteCompanion, "threads"> | null;
	reviewers: readonly Pick<NotebookReviewer, "id" | "name">[];
	includeAi: boolean;
}

/** The page and (with `includeAi`) its notes, in reading order. */
export function buildExportDocument(input: ExportInput): ExportDocument {
	const { units, plain, segments } = walkBlocks(input.markdown);
	const otherNotes: ExportNote[] = [];
	if (input.includeAi && input.companion) {
		const placed: { unit: number; start: number; at: string; note: ExportNote }[] = [];
		for (const thread of input.companion.threads) {
			if (thread.status === "dismissed") continue;
			const note = exportNote(thread, input.reviewers);
			if (!note) continue;
			const found = resolveAnchor(plain, thread.anchor);
			const segment = "detached" in found ? undefined : segments.find((s) => found.start >= s.start && found.start <= s.end) ?? segments.find((s) => found.start <= s.end);
			if ("detached" in found || !segment) otherNotes.push(note);
			else placed.push({ unit: segment.unit, start: found.start, at: thread.createdAt, note });
		}
		placed.sort((a, b) => a.unit - b.unit || a.start - b.start || a.at.localeCompare(b.at));
		for (const p of placed) units[p.unit]!.notes.push(p.note);
	}
	return { title: input.title, markdown: input.markdown, units, otherNotes, includeAi: input.includeAi };
}

// ─── Markdown ────────────────────────────────────────────────────────────────

/** The sketch as one line per step, for formats with no pictures. */
export function sketchCaptionLines(sketch: Sketch): string[] {
	return [`Drawing: ${sketch.title}`, ...sketch.steps.map((step, i) => `${i + 1}. ${step.caption}${step.note ? ` ${step.note}` : ""}`)];
}

/** One note as Markdown blockquote lines (no prefix yet). */
export function noteMarkdownLines(note: ExportNote): string[] {
	const lines: string[] = [];
	note.messages.forEach((message, i) => {
		if (i > 0) lines.push(">");
		const body = message.text ? message.text.split("\n") : [];
		if (message.speaker) {
			if (body.length) body[0] = `**${message.speaker}:** ${body[0]}`;
			else body.push(`**${message.speaker}:**`);
		}
		for (const line of body) lines.push(line ? `> ${line}` : ">");
		if (message.sketch) {
			if (body.some((l) => l.trim())) lines.push(">");
			for (const line of sketchCaptionLines(message.sketch)) lines.push(`> ${line.startsWith("Drawing:") ? `*${line}*` : line}`);
		}
	});
	return lines;
}

/** The page's Markdown with each note as a blockquote under its block; "Other notes" at the end.
 *  `title` adds the page name as a first heading (the exported file). */
export function exportMarkdown(doc: ExportDocument, options: { title?: boolean } = {}): string {
	let body = doc.markdown.replace(/\s+$/, "");
	if (doc.includeAi) {
		// From the end, so earlier offsets stay right.
		const inserts = doc.units.filter((u) => u.notes.length).map((u) => ({ at: Math.min(u.md.at, body.length), prefix: u.md.prefix, notes: u.notes }));
		inserts.sort((a, b) => b.at - a.at);
		for (const insert of inserts) {
			const lines = insert.notes.flatMap((note, i) => [...(i > 0 ? [""] : []), ...noteMarkdownLines(note)]);
			const blank = insert.prefix.trimEnd();
			const after = body.slice(insert.at);
			// A blank line after the notes unless the source already has one there.
			const end = after === "" || /^\n[ \t>]*\n/.test(after) ? "" : "\n";
			const text = `\n${blank}\n${lines.map((l) => (l ? `${insert.prefix}${l}` : blank)).join("\n")}${end}`;
			body = body.slice(0, insert.at) + text + after;
		}
		if (doc.otherNotes.length) {
			const parts = doc.otherNotes.map((note) => [`*On “${firstWords(note.quote, 12)}”*`, "", ...noteMarkdownLines(note)].join("\n"));
			body = `${body}${body ? "\n\n" : ""}## ${OTHER_NOTES_HEADING}\n\n${parts.join("\n\n")}`;
		}
	}
	const head = options.title && doc.title.trim() ? `# ${doc.title.trim()}\n\n` : "";
	return `${head}${body}\n`;
}

/** "Copy this note": the page's Markdown, with the notes under their paragraphs unless Just my words is on. */
export function copyNoteMarkdown(input: Omit<ExportInput, "title">): string {
	if (!input.includeAi) return input.markdown;
	return exportMarkdown(buildExportDocument({ ...input, title: "" }));
}

// ─── file names ──────────────────────────────────────────────────────────────

/** A safe download name from the page name: no path or control characters, at most 100 characters. */
export function exportFilename(name: string, format: ExportFormat): string {
	const base = name
		.normalize("NFC")
		.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+/, "")
		.slice(0, 100)
		.trim() || "Note";
	return `${base}.${EXPORT_EXTENSION[format]}`;
}

/** Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 6266). */
export function contentDisposition(filename: string): string {
	const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "note";
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// ─── sketches outside the page ───────────────────────────────────────────────

/** Notebook's light paper colours (notebook.css 1.1), for files that leave the page. */
export const EXPORT_PALETTE: Readonly<Record<string, string>> = {
	paper: "#f8f7f4",
	shelf: "#f1f0ec",
	code: "#ebe9e3",
	ink: "#1d1c1a",
	graphite: "#5c5953",
	faint: "#716d67",
	rule: "#dedbd4",
	riddle: "#2a2824",
	"nb-font-voice": "Newsreader",
	"nb-font-sans": "'Instrument Sans'",
	"text-gray": "#716d66",
	"text-brown": "#8a5a3b",
	"text-red": "#b23b33",
	"text-orange": "#a9580e",
	"text-green": "#47763d",
	"text-blue": "#33689c",
	"text-purple": "#774f9c",
};

/** The sketch's last step with its title, CSS variables replaced by the light colours,
 *  sized `scale` px per unit (renderers without CSS: resvg, Word). */
export function exportSketchSvg(sketch: Sketch, scale = 1.12): { svg: string; width: number; height: number } {
	const raw = renderSketchSvg(sketch, { withTitle: true });
	const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(raw);
	const w = Number(view?.[1] ?? sketch.w), h = Number(view?.[2] ?? sketch.h);
	const width = Math.round(w * scale), height = Math.round(h * scale);
	const svg = raw
		.replace(/var\(--([a-z-]+)\)/g, (_m, name: string) => EXPORT_PALETTE[name] ?? "#1d1c1a")
		.replace("<svg ", `<svg width="${width}" height="${height}" `)
		// The title and subtitle would take the drawing's stroke (the page's CSS resets it).
		.replace(/<text (?![^>]*stroke:)/g, '<text stroke="none" ');
	return { svg, width, height };
}

// ─── HTML (the PDF) ──────────────────────────────────────────────────────────

const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeHref = (href: string): string | null => (/^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : null);

/** A caption or step note: the Markdown subset messages use, so its $math$ shows as math (real-model pass). */
const captionHtml = (text: string): string => runsHtml(messageParagraphs(text).flat());

function runsHtml(runs: readonly ExportRun[]): string {
	return runs.map((run) => {
		let html = escapeHtml(run.text).replace(/\n/g, "<br>");
		if (run.math) html = `<span class="math">${html}</span>`;
		if (run.code) html = `<code>${html}</code>`;
		if (run.bold) html = `<strong>${html}</strong>`;
		if (run.italic) html = `<em>${html}</em>`;
		if (run.underline) html = `<u>${html}</u>`;
		if (run.strike) html = `<s>${html}</s>`;
		if (run.color && EXPORT_PALETTE[`text-${run.color}`]) html = `<span style="color:${EXPORT_PALETTE[`text-${run.color}`]}">${html}</span>`;
		const href = run.href ? safeHref(run.href) : null;
		if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
		return html;
	}).join("");
}

function noteHtml(note: ExportNote, withQuote = false): string {
	const messages = note.messages.map((message) => {
		const speaker = message.speaker ? `<span class="speaker">${escapeHtml(message.speaker)}</span>` : "";
		const paragraphs = message.runs.map((runs) => `<p>${runsHtml(runs)}</p>`).join("");
		const sketch = message.sketch
			? `<figure class="sketch">${exportSketchSvg(message.sketch).svg}<figcaption>${message.sketch.steps.map((s, i) => `<span>${i + 1}. ${captionHtml(s.caption)}${s.note ? ` <em>${captionHtml(s.note)}</em>` : ""}</span>`).join("")}</figcaption></figure>`
			: "";
		return `<div class="msg ${message.author}">${speaker}${paragraphs}${sketch}</div>`;
	}).join("");
	const on = withQuote ? `<p class="on">On “${escapeHtml(firstWords(note.quote, 12))}”</p>` : "";
	return `<aside class="note">${on}${messages}</aside>`;
}

function blockHtml(block: ExportBlock): string {
	switch (block.kind) {
		case "heading": {
			// h1 is the title.
			const tag = `h${Math.min(6, block.level + 1)}`;
			return `<${tag}>${runsHtml(block.runs)}</${tag}>`;
		}
		case "paragraph": return `<p>${runsHtml(block.runs)}</p>`;
		case "item": {
			const marker = block.ordered ? `${block.number}.` : "•";
			return `<p class="item" style="margin-left:${1.4 * (block.level + 1)}em"><span class="marker">${marker}</span>${runsHtml(block.runs)}</p>`;
		}
		case "code": return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
		case "math": return `<pre class="math">${escapeHtml(block.text)}</pre>`;
		case "image": return `<p class="image">[${escapeHtml(block.alt || "image")}]</p>`;
		case "rule": return "<hr>";
	}
}

const quoteOf = (block: ExportBlock): number => ("quote" in block ? block.quote : 0);

const PDF_CSS = `
@page { size: A4; margin: 22mm 20mm 24mm; background: ${EXPORT_PALETTE.paper}; }
html { background: ${EXPORT_PALETTE.paper}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: ${EXPORT_PALETTE.ink}; font-family: 'Instrument Sans', Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.6; }
h1 { font-size: 26pt; font-weight: 500; letter-spacing: -0.032em; line-height: 1.12; margin: 0 0 18pt; }
h2 { font-size: 17pt; font-weight: 500; letter-spacing: -0.02em; line-height: 1.25; margin: 18pt 0 6pt; }
h3 { font-size: 14pt; font-weight: 500; margin: 14pt 0 4pt; }
h4, h5, h6 { font-size: 11.5pt; font-weight: 600; margin: 12pt 0 4pt; }
p { margin: 0 0 8pt; }
p.item { position: relative; margin-bottom: 3pt; }
p.item .marker { position: absolute; left: -1.2em; color: ${EXPORT_PALETTE.graphite}; }
blockquote { margin: 0 0 8pt; padding-left: 12pt; border-left: 2px solid ${EXPORT_PALETTE.rule}; color: ${EXPORT_PALETTE.graphite}; }
code, pre { font-family: ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace; font-size: 9.5pt; }
code { background: ${EXPORT_PALETTE.code}; border-radius: 3px; padding: 0 2px; }
pre { background: ${EXPORT_PALETTE.shelf}; border-radius: 6px; padding: 8pt 10pt; white-space: pre-wrap; margin: 0 0 8pt; }
pre code { background: none; padding: 0; }
.math { font-family: 'Newsreader', Georgia, serif; font-style: italic; }
pre.math { background: none; text-align: center; }
hr { border: 0; border-top: 1px solid ${EXPORT_PALETTE.rule}; margin: 14pt 0; }
a { color: inherit; }
.note { margin: 2pt 0 12pt 14pt; padding-left: 11pt; border-left: 1.5px solid ${EXPORT_PALETTE.rule}; break-inside: avoid-page; }
.note .msg { margin: 0 0 5pt; }
.note .msg.ai { color: ${EXPORT_PALETTE.riddle}; font-family: 'Newsreader', Georgia, serif; font-weight: 420; font-variation-settings: "opsz" 14; font-size: 11.5pt; line-height: 1.5; }
.note .msg.user { color: ${EXPORT_PALETTE.graphite}; font-size: 10pt; }
.note .msg p { margin: 0 0 3pt; }
.note .speaker { display: block; font-family: 'Instrument Sans', Arial, sans-serif; font-size: 8pt; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: ${EXPORT_PALETTE.faint}; margin-bottom: 1pt; }
.note .on { font-family: 'Instrument Sans', Arial, sans-serif; font-size: 9pt; color: ${EXPORT_PALETTE.faint}; margin-bottom: 3pt; }
.sketch { margin: 6pt 0 4pt; break-inside: avoid; }
.sketch svg { display: block; max-width: 100%; height: auto; }
.sketch figcaption { font-family: 'Instrument Sans', Arial, sans-serif; font-size: 9pt; color: ${EXPORT_PALETTE.graphite}; font-weight: 400; }
.sketch figcaption > span { display: block; }
.other { margin-top: 24pt; }
`;

/** The PDF's page: our own HTML, no scripts. `fontFaces` is @font-face CSS with embedded files (or ""). */
export function exportHtml(doc: ExportDocument, fontFaces = ""): string {
	const parts: string[] = [];
	if (doc.title.trim()) parts.push(`<h1>${escapeHtml(doc.title.trim())}</h1>`);
	let open = 0;
	const setQuote = (depth: number) => {
		while (open < depth) { parts.push("<blockquote>"); open++; }
		while (open > depth) { parts.push("</blockquote>"); open--; }
	};
	for (const unit of doc.units) {
		setQuote(quoteOf(unit.block));
		parts.push(blockHtml(unit.block));
		if (doc.includeAi) for (const note of unit.notes) parts.push(noteHtml(note));
	}
	setQuote(0);
	if (doc.includeAi && doc.otherNotes.length) {
		parts.push(`<section class="other"><h2>${OTHER_NOTES_HEADING}</h2>${doc.otherNotes.map((n) => noteHtml(n, true)).join("")}</section>`);
	}
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><title>${escapeHtml(doc.title)}</title><style>${fontFaces}${PDF_CSS}</style></head><body>${parts.join("\n")}</body></html>`;
}
