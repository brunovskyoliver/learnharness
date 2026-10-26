import type { GraphNode } from "./contracts/graph.ts";
import type { LhViewMessage } from "./view.ts";
import type { LhMessage } from "./native-messages.ts";
import type { TurnUsage } from "./contracts/chat.ts";
import { QUESTION_TOOLS } from "./pending.ts";
import { fromMarkdown } from "mdast-util-from-markdown";

export interface SessionTurnEntry {
	id: string;
	partId: string;
	prompt: string;
	answer: string;
}

function previewText(source: string): string {
	const visit = (node: { type: string; value?: string; alt?: string | null; children?: readonly unknown[] }): string => {
		if (node.type === "html" || node.type === "definition") return "";
		if (node.value !== undefined) return node.value;
		if (node.type === "image") return node.alt ?? "";
		return (node.children as Parameters<typeof visit>[0][] | undefined)?.map(visit).join(node.type === "paragraph" || node.type === "strong" || node.type === "emphasis" || node.type === "link" ? "" : " ") ?? "";
	};
	return visit(fromMarkdown(source)).replace(/\s+/g, " ").trim();
}

/** Persisted invocation starts split continuations that projectView groups
 * together. Input boundaries also cover live turns before usage is saved. */
export function sessionTurnEntries(messages: readonly LhViewMessage[], native: readonly LhMessage[], turns: readonly Pick<TurnUsage, "id" | "messageId">[]): SessionTurnEntry[] {
	const starts = new Set(turns.map((turn) => turn.messageId));
	const prose = new Map<string, Array<{ id: string; text: string }>>();
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		for (const part of message.parts) {
			const source = textPartMessageId(part.id);
			if (part.type !== "text" || !part.text?.trim() || !part.id || !source) continue;
			const parts = prose.get(source) ?? [];
			parts.push({ id: part.id, text: part.text });
			prose.set(source, parts);
		}
	}
	const entries: SessionTurnEntry[] = [];
	let prompt = "";
	let active: SessionTurnEntry | undefined;
	for (const message of native) {
		if (message.role === "user") {
			prompt = typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
			active = undefined;
		} else if ((message.role === "custom" && message.customType !== "plan-block") || (message.role === "toolResult" && (QUESTION_TOOLS as readonly string[]).includes(message.toolName))) {
			active = undefined;
		} else if (message.role === "assistant") {
			if (!active || starts.has(message.id)) {
				active = { id: message.id, partId: "", prompt: previewText(prompt.slice(0, 600)), answer: "" };
				entries.push(active);
			}
			for (const part of prose.get(message.id) ?? []) {
				if (!active.partId) active.partId = part.id;
				if (active.answer.length < 1800) active.answer += `\n${part.text.slice(0, 1800 - active.answer.length)}`;
			}
		}
	}
	return entries.filter((entry) => entry.partId).map((entry) => ({ ...entry, answer: previewText(entry.answer) }));
}

/** Message-granular graph links (owner, 2026-10-13). Persisted provenance and
 * native IDs already carry everything needed; only the render seam is new. */
export function messageAnchorId(messageId: string): string {
	return `message-${messageId}`;
}

export function messageIdFromHash(hash: string): string | null {
	try {
		const anchor = decodeURIComponent(hash.replace(/^#/, ""));
		return anchor.startsWith("message-") && anchor.length > "message-".length
			? anchor.slice("message-".length)
			: null;
	} catch {
		return null;
	}
}

/** Old empty anchors do not mask a later real one. Ledger order, not date or
 * lexical order, selects the FIRST recorded message in this source. */
export function propositionSessionHref(node: Pick<GraphNode, "provenance">, chatId: string): string {
	const messageId = node.provenance.find((p) => p.chatId === chatId && p.messageId !== "")?.messageId;
	return `/chat/${encodeURIComponent(chatId)}${messageId ? `#${encodeURIComponent(messageAnchorId(messageId))}` : ""}`;
}

/** projectView's text-part identity is <native message ID>-t<text index>.
 * Assistant GROUP IDs cannot identify an individual extraction source. */
export function textPartMessageId(partId: string | undefined): string | null {
	return partId?.match(/^(.*)-t\d+$/)?.[1] || null;
}

/** One DOM anchor per native teacher message, at its first non-empty prose
 * block. Empty text blocks and intervening tools/thinking do not steal it. */
export function firstSourceTextParts(messages: readonly LhViewMessage[]): Map<string, string> {
	const first = new Map<string, string>();
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		for (const part of message.parts) {
			if (part.type !== "text" || typeof part.text !== "string" || !part.text.trim() || !part.id) continue;
			const messageId = textPartMessageId(part.id);
			if (messageId && !first.has(messageId)) first.set(messageId, part.id);
		}
	}
	return first;
}
