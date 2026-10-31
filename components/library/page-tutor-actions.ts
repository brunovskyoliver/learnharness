/** Tutor actions on page text (feature 010, US2): the message each sends and
 *  why one is unavailable. Pure; the pane does the sending. Wording is
 *  contracts/ui-contract.md, approved 2026-10-31. */
import type { ChatSendBlock } from "@/components/chat-actions-context.ts";

export type TutorAction = "explain" | "simpler" | "summarize" | "rewrite" | "expand" | "challenge" | "quiz" | "questions" | "ask";

export const TUTOR_ACTION_LABEL: Record<TutorAction, string> = {
	explain: "Explain",
	simpler: "Simpler",
	summarize: "Summarize",
	rewrite: "Rewrite",
	expand: "Expand",
	challenge: "Challenge",
	quiz: "Quiz me on this",
	questions: "Generate questions",
	ask: "Ask…",
};

/** The bubble's order (feature 018): answers first, then edits, then checks. */
export const TUTOR_ACTIONS: readonly TutorAction[] = ["explain", "simpler", "summarize", "rewrite", "expand", "challenge", "quiz", "questions", "ask"];

/** These ask for a change in the page: a tutor version, with its review bar and
 *  Undo, the learner's draft saved first (feature 010). The rest answer in chat. */
export const TUTOR_EDIT_ACTIONS: ReadonlySet<TutorAction> = new Set(["simpler", "rewrite", "expand"]);

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

/** What follows the page's name, where it isn't just a colon. Questions and
 *  challenges stay in chat, so an answer is only ever given through a check. */
const TAIL: Partial<Record<TutorAction, string>> = {
	simpler: " more simply, in the page:",
	rewrite: " more clearly, in the page:",
	expand: " with what it leaves out, in the page:",
	challenge: ", with a graded check on whether it holds:",
	questions: ", one at a time, keeping the questions and answers out of the page:",
};

const LEAD: Record<TutorAction, string> = {
	explain: "Explain this part of",
	simpler: "Rewrite this part of",
	summarize: "Summarize this part of",
	rewrite: "Rewrite this part of",
	expand: "Expand this part of",
	challenge: "Challenge me on this part of",
	quiz: "Quiz me on this part of",
	questions: "Ask me graded questions on this part of",
	ask: "About this part of",
};

/** The message for an action. Ask… ends with a blank line for the learner's question. */
export function tutorMessage(action: TutorAction, pageName: string, selection: string): string {
	const head = `${LEAD[action]} @${pageName}${TAIL[action] ?? ":"}`;
	const body = `${head}\n\n${quoteSelection(selection)}`;
	return action === "ask" ? `${body}\n\n` : body;
}
