import type { ChatRecord } from "./contracts/chat.ts";
import { compactAnswerForModel, parseOptionsIfString, type QuestionAnswerData } from "./question-core.ts";
import { failedOutputCallIds, userFacingTextOf, type LhMessage } from "./native-messages.ts";

const QUESTION_TOOLS = new Set(["quiz", "probe", "explain", "recall", "ask_user_question"]);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" ? value as Record<string, unknown> : {};

/** An allowlist projection: stored solutions, signatures and agent thinking never cross this seam. */
function excerptMessage(message: LhMessage, history: readonly LhMessage[], failed: ReadonlySet<string>) {
	if (message.role === "user") return { id: message.id, speaker: "learner", text: userFacingTextOf(message.content) };
	if (message.role === "assistant") {
		const questions = message.content.flatMap((block) => {
			if (block.type !== "toolCall" || message.stopReason === "error" || message.stopReason === "aborted") return [];
			const args = object(block.arguments);
			if (QUESTION_TOOLS.has(block.name)) {
				const options = parseOptionsIfString(args.options as string | unknown[] | undefined);
				return [{ tool: block.name, toolCallId: block.id, question: typeof args.question === "string" ? args.question : undefined,
					optionsInAuthoredOrder: Array.isArray(options) ? options.map((option) => ({ label: typeof object(option).label === "string" ? object(option).label : undefined })) : undefined }];
			}
			if (block.name === "problem") return [{ tool: block.name, toolCallId: block.id, question: typeof args.statement === "string" ? args.statement : undefined }];
			return [];
		});
		return { id: message.id, speaker: "teacher", text: userFacingTextOf(message.content, failed), questions };
	}
	if (message.role === "custom" && message.customType === "practice-thinking") return { id: message.id, speaker: "learner", practiceThinking: object(message.details).text };
	if (message.role === "toolResult" && !message.isError) {
		const details = object(message.details);
		if (QUESTION_TOOLS.has(message.toolName) && typeof details.questionText === "string" && ["ask", "quiz", "explain"].includes(String(details.kind))) {
			const answers = Array.isArray(details.answers) ? details.answers.filter((answer) => answer !== null && typeof answer === "object") : [];
			return { id: message.id, speaker: "learner", tool: message.toolName, question: details.questionText, answer: compactAnswerForModel({ ...details, answers } as unknown as QuestionAnswerData), answeredAt: details.answeredAt };
		}
		if (message.toolName === "conclude") {
			const call = [...history].reverse().flatMap((m) => m.role === "assistant" ? m.content.filter((b) => b.type === "toolCall" && b.id === message.toolCallId && b.name === "conclude") : [])[0];
			if (call?.type === "toolCall") return { id: message.id, speaker: "teacher", outcome: call.arguments?.outcome, verdict: call.arguments?.verdict };
		}
	}
	return null;
}

export function graphSourceExcerpt(record: ChatRecord, anchorIds: readonly string[], offset?: number, limit = 10) {
	if (!Number.isInteger(limit) || limit < 1 || limit > 30 || (offset !== undefined && (!Number.isInteger(offset) || offset < 0))) throw new Error("Invalid source page.");
	const anchorIndex = record.messages.findIndex((m) => anchorIds.includes(m.id));
	const start = offset ?? Math.max(0, anchorIndex - 2);
	const failed = failedOutputCallIds(record.messages);
	const messages = record.messages.slice(start, start + limit).flatMap((message, index) => {
		const projected = excerptMessage(message, record.messages.slice(0, start + index), failed);
		return projected ? [{ index: start + index, ...projected }] : [];
	});
	return { sourceId: record.id, title: record.title, anchorFound: anchorIndex >= 0, offset: start, totalMessages: record.messages.length, nextOffset: start + limit < record.messages.length ? start + limit : null, messages };
}
