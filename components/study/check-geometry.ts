/**
 * Where a lesson check's thread goes (feature 025, research R8), pure so it
 * can be unit tested. A pending check or practice problem opens as a thread
 * in the right margin beside the tutor paragraph it follows, 71px from the
 * reading column and 410px wide when open (Notebook's open thread). When
 * the lesson is too narrow for that, the thread sits inline under its
 * paragraph (Notebook's inline variant). Between the two, the column moves
 * left just enough to make room, as long as its left edge stays clear of
 * the turn rail.
 */
import { EDGE_GAP, EXPANDED_WIDTH, NOTE_WIDTH, RIGHT_TEXT_GAP } from "@/components/paper/thread-geometry";

/** The reading column (Phase 4: `--lh-measure`) and its side padding. */
export const CHECK_MEASURE = 660;
export const CHECK_PAD = 24;
/** Room a margin thread needs right of the column: gap + open width (R8: under this, inline). */
export const CHECK_ROOM = RIGHT_TEXT_GAP + EXPANDED_WIDTH;
/** The text column's left edge never moves closer than this to the lesson's left (the turn rail ends at 56px). */
export const CHECK_MIN_LEFT = 80;
export const CHECK_OPEN_WIDTH = EXPANDED_WIDTH;
export const CHECK_COLLAPSED_WIDTH = NOTE_WIDTH;

export type CheckLayout = { variant: "margin"; shift: number } | { variant: "inline"; shift: 0 };

/** The thread's variant for a lesson `width` px wide, and how far the column moves left for it. */
export function checkLayout(width: number): CheckLayout {
	const side = (width - CHECK_MEASURE) / 2;
	const need = CHECK_ROOM + EDGE_GAP;
	if (side >= need) return { variant: "margin", shift: 0 };
	const shift = Math.ceil(need - side);
	if (side - shift >= CHECK_MIN_LEFT) return { variant: "margin", shift };
	return { variant: "inline", shift: 0 };
}

/** The text column's edges in the lesson's coordinates, once it has moved `shift` px left. */
export function checkColumn(width: number, shift: number): { left: number; right: number } {
	const measure = Math.min(CHECK_MEASURE, Math.max(0, width - 2 * CHECK_PAD));
	const left = Math.max(CHECK_PAD, (width - measure) / 2 - shift);
	return { left, right: left + measure };
}

interface ViewPart { type: string; id?: string; toolCallId?: string; text?: string; state?: string }

const QUESTION_PARTS = new Set(["tool-quiz", "tool-probe", "tool-ask_user_question", "tool-explain", "tool-recall"]);
interface ViewMessage { role: string; parts: readonly ViewPart[] }

/** The anchor of a check: the nearest assistant text part with words before its tool part (`data-answer-part-id`), or null.
 *  An answered question met first anchors it instead (its toolCallId, `data-check-anchor-id`): a question
 *  asked right after answered ones sits below them (owner, 2026-11-11). */
export function checkAnchorPartId(messages: readonly ViewMessage[], toolCallId: string, followLatest = false): string | null {
	// A practice problem follows the conversation (owner, 2026-11-11): the
	// tutor's latest words after the pose anchor it, so a reply's reopened
	// card sits beside that reply, not back at the pose.
	if (followLatest) {
		const at = messages.findIndex((message) => message.parts.some((part) => part.toolCallId === toolCallId));
		if (at >= 0) {
			for (let m = messages.length - 1; m > at; m--) {
				if (messages[m]!.role !== "assistant") continue;
				const parts = messages[m]!.parts;
				for (let p = parts.length - 1; p >= 0; p--) {
					const part = parts[p]!;
					if (part.type === "text" && part.id && part.text?.trim()) return part.id;
				}
			}
		}
	}
	for (let mi = messages.length - 1; mi >= 0; mi--) {
		const parts = messages[mi]!.parts;
		const at = parts.findIndex((part) => part.toolCallId === toolCallId);
		if (at < 0) continue;
		for (let m = mi, p = at - 1; m >= 0; m--, p = m >= 0 ? messages[m]!.parts.length - 1 : -1) {
			if (messages[m]!.role !== "assistant") continue;
			for (; p >= 0; p--) {
				const part = messages[m]!.parts[p]!;
				if (part.type === "text" && part.id && part.text?.trim()) return part.id;
				if (QUESTION_PARTS.has(part.type) && part.state === "output-available" && part.toolCallId) return part.toolCallId;
			}
		}
		return null;
	}
	return null;
}

/** The index of the message holding a check's tool part, or -1. */
export function checkMessageIndex(messages: readonly ViewMessage[], toolCallId: string): number {
	for (let mi = messages.length - 1; mi >= 0; mi--) {
		if (messages[mi]!.parts.some((part) => part.toolCallId === toolCallId)) return mi;
	}
	return -1;
}
