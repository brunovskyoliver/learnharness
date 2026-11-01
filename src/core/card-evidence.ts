/**
 * Which ideas the learner has been shaky on (feature 021). Pure, and derived at
 * read time from what sessions already recorded. Nothing is stored and nothing
 * lands on a node.
 *
 * The graph ledgers hold propositions and chains only: quiz events and
 * understanding observations left them on 2026-09-27. So the evidence here is the
 * graded record in transcripts, joined to nodes in the two ways the data allows:
 *   - a practice problem's `target` names node ids, and its `conclude` has an outcome;
 *   - a graded check follows a teacher message, and a node's provenance names that
 *     message.
 *
 * Reading only. A flashcard review is not an input to this function, and its output
 * is not an input to a schedule: scheduling and evidence stay apart.
 */
import type { GraphNode } from "./contracts/graph.ts";
import type { LhMessage } from "./native-messages.ts";

export interface ConceptEvidence { misses: number; rights: number; lastAt: number; weak: boolean }

const HAS_MISSED = new Set(["solvedWithHints", "movedOn", "surrendered"]);

/** Weak: the newest graded evidence about the node was a miss. Answering it right
 *  later clears it, and a dismissed check says nothing either way. */
export function conceptEvidence(nodes: readonly Pick<GraphNode, "id" | "provenance">[], chats: readonly { id: string; messages: readonly LhMessage[] }[]): Map<string, ConceptEvidence> {
	const known = new Set(nodes.map((node) => node.id));
	const byPoint = new Map<string, string[]>();
	for (const node of nodes) for (const point of node.provenance) {
		if (!point.messageId) continue;
		const key = `${point.chatId}\n${point.messageId}`;
		byPoint.set(key, [...(byPoint.get(key) ?? []), node.id]);
	}
	const events: { nodeId: string; right: boolean; at: number }[] = [];
	for (const chat of chats) {
		let lastProse: string | null = null;
		const anchors = new Map<string, string | null>();
		let targets: string[] = [];
		for (const message of chat.messages) {
			if (message.role === "assistant") {
				const id = (message as { id?: unknown }).id;
				if (typeof id === "string" && id && message.content.some((block) => block.type === "text" && block.text.trim() !== "")) lastProse = id;
				for (const block of message.content) {
					if (block.type !== "toolCall") continue;
					anchors.set(block.id, lastProse);
					const args = (block.arguments ?? {}) as { target?: unknown; outcome?: unknown };
					if (block.name === "problem") {
						targets = Array.isArray(args.target) ? args.target.filter((t): t is string => typeof t === "string" && known.has(t)) : [];
					} else if (block.name === "conclude") {
						const outcome = args.outcome;
						if (outcome === "solved" || (typeof outcome === "string" && HAS_MISSED.has(outcome))) {
							for (const nodeId of targets) events.push({ nodeId, right: outcome === "solved", at: Number(message.timestamp) || 0 });
						}
						targets = [];
					}
				}
				continue;
			}
			if (message.role !== "toolResult") continue;
			const details = (message as { details?: unknown }).details as { dismissed?: unknown; dontKnow?: unknown; correct?: unknown } | undefined;
			if (!details || typeof details !== "object" || details.dismissed === true) continue;
			const right = details.dontKnow === true ? false : typeof details.correct === "boolean" ? details.correct : null;
			if (right === null) continue;
			const anchor = anchors.get(message.toolCallId);
			if (!anchor) continue;
			for (const nodeId of byPoint.get(`${chat.id}\n${anchor}`) ?? []) events.push({ nodeId, right, at: Number(message.timestamp) || 0 });
		}
	}
	const out = new Map<string, ConceptEvidence>();
	for (const { nodeId, right, at } of events.sort((a, b) => a.at - b.at)) {
		const row = out.get(nodeId) ?? { misses: 0, rights: 0, lastAt: 0, weak: false };
		if (right) row.rights++; else row.misses++;
		row.lastAt = at;
		row.weak = !right;
		out.set(nodeId, row);
	}
	return out;
}
