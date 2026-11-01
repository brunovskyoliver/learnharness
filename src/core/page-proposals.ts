/**
 * Held page edits (feature 023). When the learner asks for a change from selected
 * text (Simpler, Rewrite, Expand), the tutor's edit waits apart from the page until
 * he accepts it. Pure: what a proposal is, which turns hold, and how a held edit
 * lands on text he kept typing. Nothing here touches a file.
 */

export type PageProposalStatus = "pending" | "accepted" | "rejected";

export interface PageProposal {
	id: string;
	pageId: string;
	/** The page's name when proposed, for rows that outlive a rename. */
	name: string;
	/** The head this was made from. Accept refuses once the head is another. */
	baseVersion: number;
	baseText: string;
	/** The whole wanted text. */
	text: string;
	status: PageProposalStatus;
	/** The learner changed it through Edit first. */
	edited?: boolean;
	chatId?: string;
	toolCallId?: string;
	createdAt: string;
	resolvedAt?: string;
	/** The version an acceptance made. */
	version?: number;
}

/** A list row: the texts stay on the server until a proposal is opened. */
export type PageProposalRow = Omit<PageProposal, "baseText" | "text">;

/** The head line of a Simpler, Rewrite or Expand message (components/library/page-tutor-actions.ts).
 *  tests/page-proposals.test.ts pins this against those messages, so a wording change
 *  can't quietly send them back to landing directly. */
const HELD_REQUEST = /^(?:Rewrite|Expand) this part of @.+ (?:more simply|more clearly|with what it leaves out), in the page:\n\n>/;

export const isHeldEditRequest = (text: string) => HELD_REQUEST.test(text);

interface LooseMessage { role?: unknown; content?: unknown; stopReason?: unknown }

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((block: { type?: unknown; text?: unknown }) => (block?.type === "text" && typeof block.text === "string" ? block.text : "")).join("");
}

/** Whether the turn now running began with (or was steered by) such a request. A
 *  finished assistant reply ends the look back, so the next ordinary message is
 *  a turn of its own. */
export function isHeldEditTurn(messages: readonly unknown[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i] as LooseMessage;
		if (message?.role === "assistant" && message.stopReason !== "toolUse") return false;
		if (message?.role === "user" && isHeldEditRequest(messageText(message.content))) return true;
	}
	return false;
}

interface Region { start: number; endBase: number; endOther: number }

/** The one stretch of lines that differs: everything between the common start and end. */
function changedRegion(base: readonly string[], other: readonly string[]): Region {
	let start = 0;
	while (start < base.length && start < other.length && base[start] === other[start]) start++;
	let endBase = base.length, endOther = other.length;
	while (endBase > start && endOther > start && base[endBase - 1] === other[endOther - 1]) { endBase--; endOther--; }
	return { start, endBase, endOther };
}

/**
 * The tutor's change applied to what the learner has now. Null when his typing since
 * touches or sits right beside the same lines, so a word of his is never overwritten
 * by a change he hasn't compared against it. Deliberately one region each: two far
 * apart edits of his around the tutor's change also come back null, which refuses
 * rather than guesses.
 */
export function mergeProposal(base: string, proposed: string, current: string): string | null {
	if (current === base) return proposed;
	if (current === proposed) return current;
	const baseLines = base.split("\n");
	const proposedLines = proposed.split("\n");
	const currentLines = current.split("\n");
	const tutor = changedRegion(baseLines, proposedLines);
	const learner = changedRegion(baseLines, currentLines);
	const replacement = proposedLines.slice(tutor.start, tutor.endOther);
	if (tutor.endBase < learner.start) {
		// The tutor's lines come first, and his sit later, so their index in `current` holds.
		return [...currentLines.slice(0, tutor.start), ...replacement, ...currentLines.slice(tutor.endBase)].join("\n");
	}
	if (learner.endBase < tutor.start) {
		const shift = learner.endOther - learner.endBase;
		return [...currentLines.slice(0, tutor.start + shift), ...replacement, ...currentLines.slice(tutor.endBase + shift)].join("\n");
	}
	return null;
}
