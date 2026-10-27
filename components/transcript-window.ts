/**
 * THE TRANSCRIPT WINDOW (load-speed round, 2026-10-27): a long session
 * renders its TAIL first — server HTML and the hydration pass both — and
 * the older parts mount in idle-time chunks right after. An 860 KB lesson
 * used to ship 1.8 MB of markup and hydrate 32k nodes before the page
 * could respond.
 *
 * Positions are flat part indexes across the view messages: message mi's
 * part pi is unit offsets[mi] + pi, and a message without parts is one
 * unit. A window is the first visible unit; everything before it is
 * deferred. Appends at the end never move it, so streaming is unaffected.
 */
import { messageAnchorId, textPartMessageId, type LhViewMessage } from "@/src/core";

type ViewPart = LhViewMessage["parts"][number];

/** Fired by surfaces that need every message in the DOM (find, turn rail,
 * hash and reading-position arrival); the transcript renders the whole
 * session synchronously before the event returns. */
export const FULL_TRANSCRIPT_EVENT = "lh:full-transcript";

export function requestFullTranscript(): void {
	if (typeof window !== "undefined") window.dispatchEvent(new Event(FULL_TRANSCRIPT_EVENT));
}

/** Rough rendered weight of one part, in prose characters. Cards and tool
 * renderers are tall for their text, collapsed reasoning is one row. */
function partWeight(part: ViewPart): number {
	if (part.type === "text") return 120 + (typeof part.text === "string" ? part.text.length : 0);
	if (part.type === "reasoning") return 200;
	if (part.type === "step-start") return 0;
	if (part.type.startsWith("tool-") || part.type.startsWith("data-")) return 1200;
	return 200;
}

function messageWeight(message: LhViewMessage): number {
	if (message.role !== "assistant") {
		return message.parts.reduce((sum, part) => sum + partWeight(part), 200);
	}
	return 0;
}

/** Each message's first flat unit, plus the total as the last entry. */
export function unitOffsets(messages: readonly LhViewMessage[]): number[] {
	const offsets = new Array<number>(messages.length + 1);
	let at = 0;
	for (let i = 0; i < messages.length; i++) {
		offsets[i] = at;
		at += Math.max(1, messages[i]!.parts.length);
	}
	offsets[messages.length] = at;
	return offsets;
}

/** Initial-paint budget: several screens of 24px prose — enough to fill
 * the viewport and a scroll's worth above it, far below a long lesson. */
export const WINDOW_BUDGET = 12_000;

/** The first visible unit when `budget` of weight is spent walking back
 * from `before` (the current window start; the total for a fresh window).
 * Non-assistant messages (user rows, marker cards) move as one block. */
export function windowStart(messages: readonly LhViewMessage[], before: number, budget = WINDOW_BUDGET): number {
	if (before <= 0) return 0;
	const offsets = unitOffsets(messages);
	let spent = 0;
	for (let mi = messages.length - 1; mi >= 0; mi--) {
		const message = messages[mi]!;
		const first = offsets[mi]!;
		if (first >= before) continue;
		if (message.role !== "assistant") {
			spent += messageWeight(message);
			if (spent >= budget) return first;
			continue;
		}
		const last = Math.min(before, offsets[mi + 1]!) - 1;
		for (let unit = last; unit >= first; unit--) {
			const part = message.parts[unit - first];
			spent += part ? partWeight(part) : 0;
			// Never stop on a bare step separator: its hairline would head the window.
			if (spent >= budget && part?.type !== "step-start") return unit;
		}
	}
	return 0;
}

/** The unit holding a reading/hash anchor: a text part's own id
 * (data-answer-part-id) or its source message's anchor id. -1 when the
 * anchor is not in the view (deleted message). */
export function unitOfAnchor(messages: readonly LhViewMessage[], anchorId: string): number {
	const offsets = unitOffsets(messages);
	for (let mi = 0; mi < messages.length; mi++) {
		const message = messages[mi]!;
		for (let pi = 0; pi < message.parts.length; pi++) {
			const id = (message.parts[pi] as { id?: unknown }).id;
			if (typeof id !== "string" || !id) continue;
			if (id === anchorId) return offsets[mi]! + pi;
			const source = textPartMessageId(id);
			if (source && messageAnchorId(source) === anchorId) return offsets[mi]! + pi;
		}
	}
	return -1;
}
