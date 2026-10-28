/**
 * What waits for the learner in one session (feature 002): the unanswered
 * question or the open practice problem, projected for Home's "Waiting for
 * you" list. Pure and browser-safe.
 *
 * AN ALLOWLIST (Principle II): the projection copies the tool call id, the
 * kind label, the question text (`input.question`) or the problem statement
 * (`input.statement`) and the posted time. Nothing else in the tool input is
 * read, so options, correctness, explanations and solutions never reach the
 * list, including fields a tool gains later.
 */
import type { LhMessage } from "./native-messages.ts";
import { activeProblemOf, danglingQuestionOf } from "./native-messages.ts";
import { normalizeQuizType } from "./question-core.ts";
import { repairMathForDisplay } from "./math-delims.ts";

/** The turn kinds the prompt bar's strip and the waiting list both show. */
export type WaitingKind = "Lesson check" | "Prediction" | "Question" | "Explain" | "Recall" | "Problem";

export interface WaitingItem {
	toolCallId: string;
	kind: WaitingKind;
	/** "Solve" for practice problems, "Answer" for every question. */
	action: "Answer" | "Solve";
	/** The question or problem text (markdown kept) with the display-only
	 *  math repair applied here, server-side, so the client's teaser needs
	 *  no TeX parser; the client strips it to one plain line. */
	teaser: string;
	/** ISO time of the assistant message that posed it. */
	postedAt: string;
}

/** The kind label for a question tool. Probe-phase tools keep their own
 *  names (owner 2026-10-09); any predict-type question reads "Prediction"
 *  (owner 2026-10-28). */
export function questionKindLabel(tool: string, rawType?: unknown): WaitingKind {
	if (tool === "probe") return "Question";
	if (tool === "recall") return "Recall";
	if ((tool === "quiz" || tool === "explain") && normalizeQuizType(rawType) === "predict") return "Prediction";
	if (tool === "quiz") return "Lesson check";
	if (tool === "explain") return "Explain";
	return "Question";
}

const field = (input: unknown, key: string): unknown =>
	input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;

/** The ISO time of the assistant message holding a tool call. */
function postedAtOf(messages: readonly LhMessage[], toolCallId: string, fallback: string): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i]!;
		if (message.role !== "assistant") continue;
		if (!message.content.some((block) => block.type === "toolCall" && block.id === toolCallId)) continue;
		const at = (message as { timestamp?: unknown }).timestamp;
		return typeof at === "number" && Number.isFinite(at) ? new Date(at).toISOString() : fallback;
	}
	return fallback;
}

/** The session's waiting item, or null when nothing waits. A practice
 *  session with both an open problem and a question lists the problem.
 *  `updatedAt` stands in when the posing message carries no timestamp. */
export function waitingItemOf(messages: readonly LhMessage[], updatedAt: string): WaitingItem | null {
	const problem = activeProblemOf(messages);
	if (problem) {
		const statement = field(problem.input, "statement");
		return {
			toolCallId: problem.toolCallId,
			kind: "Problem",
			action: "Solve",
			teaser: typeof statement === "string" ? repairMathForDisplay(statement) : "",
			postedAt: postedAtOf(messages, problem.toolCallId, updatedAt),
		};
	}
	const question = danglingQuestionOf(messages);
	if (!question) return null;
	const text = field(question.input, "question");
	return {
		toolCallId: question.toolCallId,
		kind: questionKindLabel(question.tool, field(question.input, "type")),
		action: "Answer",
		teaser: typeof text === "string" ? repairMathForDisplay(text) : "",
		postedAt: postedAtOf(messages, question.toolCallId, updatedAt),
	};
}
