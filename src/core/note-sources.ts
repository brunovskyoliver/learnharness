/**
 * Where notes came from (feature 017): saved passages, study notes from a
 * lesson, the page and session links, and the graph propositions a note relates
 * to. Pure. Everything here reads; a note never becomes graph evidence
 * (constitution II), so nothing here produces a ledger line.
 *
 * A source reference is an ordinary Markdown link, `[…](/chat/{id}#message-{id})`,
 * so it travels with the text, survives export and reads in any viewer.
 */
import type { GraphNode } from "./contracts/graph.ts";
import { messageAnchorId } from "./message-links.ts";
import { failedOutputCallIds, userFacingTextOf, type LhMessage } from "./native-messages.ts";
import { noteTerms } from "./note-links.ts";

export const PASSAGE_MAX_CHARS = 20_000;

export interface SourceRef { chatId: string; messageId: string | null; start: number; end: number }

const SOURCE_LINK = /\]\(\/chat\/([^)\s#/]+)(?:#([^)\s]+))?\)/g;

const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

/** Every in-app session link in stored text. */
export function scanSourceRefs(text: string): SourceRef[] {
	if (!text.includes("](/chat/")) return [];
	const refs: SourceRef[] = [];
	for (const match of text.matchAll(SOURCE_LINK)) {
		const anchor = match[2] ? decode(match[2]) : null;
		refs.push({
			chatId: decode(match[1]!),
			messageId: anchor?.startsWith("message-") && anchor.length > "message-".length ? anchor.slice("message-".length) : null,
			start: match.index,
			end: match.index + match[0].length,
		});
	}
	return refs;
}

/** The chat ids a link href names, or null for any other address. */
export function sourceHrefChat(href: string): { chatId: string; messageId: string | null } | null {
	const match = /^\/chat\/([^#/?]+)(?:#(.+))?$/.exec(href);
	if (!match) return null;
	const anchor = match[2] ? decode(match[2]) : null;
	return { chatId: decode(match[1]!), messageId: anchor?.startsWith("message-") ? anchor.slice("message-".length) : null };
}

export const sourceHref = (chatId: string, messageId: string | null): string =>
	`/chat/${encodeURIComponent(chatId)}${messageId ? `#${encodeURIComponent(messageAnchorId(messageId))}` : ""}`;

/** Text with no Markdown meaning, so what was selected reads back as selected. */
export function escapePassageText(text: string): string {
	// A bracket as a character reference: `\\[` reads as display math in this app.
	return text.replace(/[\\`*_~$<]/g, "\\$&").replace(/[[\]]/g, (b) => (b === "[" ? "&#91;" : "&#93;")).replace(/^(\s*)(#{1,6}(?=\s)|[-+](?=\s)|>|\d+[.)](?=\s)|-{3,}|={3,})/gm, (_m, lead: string, mark: string) => {
		const digits = /^(\d+)([.)])$/.exec(mark);
		return digits ? `${lead}${digits[1]}\\${digits[2]}` : `${lead}\\${mark}`;
	});
}

/** One run of a selection: plain text, or a formula with its own TeX. */
export type PassageSegment = { text: string } | { tex: string; display: boolean };

/** A selection as Markdown: the text literal, the formulas still formulas. */
export function passageMarkdown(segments: readonly PassageSegment[]): string {
	return segments.map((segment) => {
		if ("text" in segment) return escapePassageText(segment.text);
		return segment.display ? `\n\n$$\n${segment.tex.trim()}\n$$\n\n` : `$${segment.tex.trim()}$`;
	}).join("").replace(/\n{3,}/g, "\n\n").trim();
}

const labelText = (title: string) => title.replace(/[\\[\]]/g, "\\$&").replace(/\s+/g, " ").trim() || "Untitled session";

export const sourceLinkLabel = (title: string) => `Lesson: ${labelText(title)}`;

function quoteLines(markdown: string): string {
	return markdown.split("\n").map((line) => (line.trim() ? `> ${line.trimEnd()}` : ">")).join("\n");
}

/** The block a saved passage becomes: a quote that ends in its source link. */
export function passageBlock(markdown: string, source: { chatId: string; messageId: string | null; title: string }): string {
	const body = markdown.replace(/\r\n?/g, "\n").trim();
	return `${quoteLines(body)}\n>\n> [${sourceLinkLabel(source.title)}](${sourceHref(source.chatId, source.messageId)})`;
}

/** A new last block. A page's trailing newline stays where the page had it. */
export function appendBlock(page: string, block: string): string {
	if (!page.trim()) return page.endsWith("\n") ? `${block}\n` : block;
	const trailing = /\s*$/.exec(page)![0];
	return `${page.slice(0, page.length - trailing.length)}\n\n${block}${trailing.includes("\n") ? "\n" : ""}`;
}

// ─── study notes ─────────────────────────────────────────────────────────────

const NOTE_NAME_MAX = 120;

/** "Study notes: {title}". Names can't hold a path separator or a control character. */
export function studyNotesName(title: string): string {
	const clean = title.replace(/[\\/\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "") || "Untitled session";
	return `Study notes: ${clean.slice(0, NOTE_NAME_MAX).trimEnd()}`;
}

/** Assistant prose with its message id, in order. Only what the learner already
 *  saw: tool calls, thinking and question payloads are never read, so an unseen
 *  answer can't reach a page by this path. */
export function lessonPassages(messages: readonly LhMessage[]): { messageId: string; text: string }[] {
	const failed = failedOutputCallIds(messages);
	const out: { messageId: string; text: string }[] = [];
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		const id = (message as { id?: unknown }).id;
		if (typeof id !== "string" || !id) continue;
		if (message.stopReason === "error" || message.stopReason === "aborted") continue;
		const text = userFacingTextOf(message.content, failed).join("\n\n").trim();
		if (text) out.push({ messageId: id, text });
	}
	return out;
}

/** The deterministic first form (owner, 2026-10-31): the lesson's own messages,
 *  in order, each followed by a link to where it was said. No model call. */
export function studyNotesMarkdown(chat: { id: string; title: string; messages: readonly LhMessage[] }): string | null {
	const passages = lessonPassages(chat.messages);
	if (passages.length === 0) return null;
	const blocks = passages.map((passage) => `${passage.text}\n\n[${sourceLinkLabel(chat.title)}](${sourceHref(chat.id, passage.messageId)})`);
	return `${blocks.join("\n\n")}\n`;
}

// ─── the knowledge graph, read only ──────────────────────────────────────────

export interface GraphLinkRow { id: string; name: string; statement: string; reason: "source" | "terms" | "linked"; href: string | null; gone?: boolean }

export const GRAPH_LINK_LIMIT = 8;
const GRAPH_MIN_TERMS = 2;

/** Propositions a note relates to: first those from the sessions it cites, then
 *  those sharing at least two words with it. Reads the ledger's nodes, and writes
 *  nothing, so no note ever counts as evidence. */
export function graphLinksOf(text: string, sessions: readonly string[], nodes: readonly GraphNode[]): GraphLinkRow[] {
	const cited = new Set(sessions);
	const terms = noteTerms(text);
	const scored = nodes.map((node) => {
		const point = node.provenance.find((p) => cited.has(p.chatId) && p.messageId) ?? node.provenance.find((p) => cited.has(p.chatId));
		const overlap = [...noteTerms(`${node.name} ${node.statement}`)].filter((term) => terms.has(term)).length;
		return { node, point, overlap };
	}).filter(({ point, overlap }) => point || overlap >= GRAPH_MIN_TERMS);
	scored.sort((a, b) => Number(Boolean(b.point)) - Number(Boolean(a.point)) || b.overlap - a.overlap || a.node.statement.localeCompare(b.node.statement) || a.node.id.localeCompare(b.node.id));
	return scored.slice(0, GRAPH_LINK_LIMIT).map(({ node, point }) => {
		const anywhere = point ?? node.provenance.find((p) => p.chatId && !p.chatId.startsWith("src_"));
		return { id: node.id, name: node.name, statement: node.statement, reason: point ? "source" : "terms", href: anywhere ? sourceHref(anywhere.chatId, anywhere.messageId || null) : null };
	});
}

/** The ideas a diagram links to by id (feature 022), read from the graph and never
 *  written to it. An idea no longer there says so, under the name it had. */
export function linkedIdeaRows(links: readonly { nodeId: string; name: string }[], nodes: readonly GraphNode[]): GraphLinkRow[] {
	return links.map(({ nodeId, name }) => {
		const node = nodes.find((other) => other.id === nodeId);
		if (!node) return { id: nodeId, name, statement: "This idea is no longer in your graph.", reason: "linked", href: null, gone: true };
		const point = node.provenance.find((p) => p.chatId && !p.chatId.startsWith("src_"));
		return { id: node.id, name: node.name, statement: node.statement, reason: "linked", href: point ? sourceHref(point.chatId, point.messageId || null) : null };
	});
}
