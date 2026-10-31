/** Tutor actions on page text (feature 010, US2): the message each sends and
 *  why one is unavailable. Pure; the pane does the sending. Wording is
 *  contracts/ui-contract.md, approved 2026-10-31. */
import type { ChatSendBlock } from "@/components/chat-actions-context.ts";

export type TutorAction = "explain" | "simpler" | "quiz" | "ask";

export const TUTOR_ACTION_LABEL: Record<TutorAction, string> = {
	explain: "Explain",
	simpler: "Simpler",
	quiz: "Quiz me on this",
	ask: "Ask…",
};

export const TUTOR_BLOCKED_TEXT: Record<Exclude<ChatSendBlock, null>, string> = {
	question: "Answer the question in the chat first.",
	problem: "Finish or skip the problem first.",
	busy: "The tutor is still answering.",
};

/** Markdown block quote lines. Never a code span: references inside code don't resolve. */
export function quoteSelection(selection: string): string {
	return selection
		.replace(/\r\n?/g, "\n")
		.trim()
		.split("\n")
		.map((line) => (line.trim() ? `> ${line.trimEnd()}` : ">"))
		.join("\n");
}

const LEAD: Record<TutorAction, string> = {
	explain: "Explain this part of",
	simpler: "Rewrite this part of",
	quiz: "Quiz me on this part of",
	ask: "About this part of",
};

/** The message for an action. Ask… ends with a blank line for the learner's question. */
export function tutorMessage(action: TutorAction, pageName: string, selection: string): string {
	const head = action === "simpler" ? `${LEAD.simpler} @${pageName} more simply, in the page:` : `${LEAD[action]} @${pageName}:`;
	const body = `${head}\n\n${quoteSelection(selection)}`;
	return action === "ask" ? `${body}\n\n` : body;
}
