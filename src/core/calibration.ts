/**
 * Calibration (feature 004): how well the learner's stated confidence
 * matched graded results, projected per session for Home's "Calibration"
 * section and summed there across sessions. Pure and browser-safe.
 *
 * Derived at read time from answered checks (Principle II); nothing is
 * stored and nothing lands on graph nodes. Counted: answers with a graded
 * verdict and a confidence, never "I don't know" (it carries none) or a
 * dismissed check.
 *
 * AN ALLOWLIST (FR-006): per miss only the call id, the question text,
 * the answer time and the link target leave here — never options,
 * correct indices, explanations or the learner's thinking.
 */
import { repairMathForDisplay } from "./math-delims.ts";
import type { LhMessage } from "./native-messages.ts";

export type ConfidenceLevel = "Guessing" | "Unsure" | "Fairly sure" | "Certain";

export const CONFIDENCE_LEVEL_ORDER: readonly ConfidenceLevel[] = ["Guessing", "Unsure", "Fairly sure", "Certain"];

/** The named level for a raw 0–100 confidence: midpoints between the four
 *  stops (25/50/75/95), so older exact percentages land on the nearest. */
export function confidenceLevel(raw: number): ConfidenceLevel {
	if (raw < 37.5) return "Guessing";
	if (raw < 62.5) return "Unsure";
	if (raw < 85) return "Fairly sure";
	return "Certain";
}

export interface LevelCount {
	answers: number;
	right: number;
}

export interface CalibrationMiss {
	toolCallId: string;
	/** The check's question, display math repaired, markdown kept. */
	question: string;
	answeredAt: string;
	/** Deep-link target (`#message-<id>`): the check's message when it has
	 *  prose, else the nearest earlier teacher message with prose. */
	messageId: string | null;
}

export interface ChatCalibration {
	levels: Partial<Record<ConfidenceLevel, LevelCount>>;
	/** Wrong answers given at Certain, in transcript order. */
	misses: CalibrationMiss[];
}

interface AnswerDetails {
	dontKnow?: unknown;
	dismissed?: unknown;
	correct?: unknown;
	confidence?: unknown;
	questionText?: unknown;
	answeredAt?: unknown;
}

const hasProse = (message: LhMessage): boolean =>
	message.role === "assistant" && message.content.some((block) => block.type === "text" && block.text.trim() !== "");

const idOf = (message: LhMessage): string | null => {
	const id = (message as { id?: unknown }).id;
	return typeof id === "string" && id ? id : null;
};

export function calibrationOf(messages: readonly LhMessage[]): ChatCalibration | null {
	const levels: Partial<Record<ConfidenceLevel, LevelCount>> = {};
	const misses: CalibrationMiss[] = [];
	/** Call id → the message to link to, filled while walking forward. */
	const anchors = new Map<string, string | null>();
	let lastProse: string | null = null;
	let counted = 0;
	for (const message of messages) {
		if (message.role === "assistant") {
			if (hasProse(message)) lastProse = idOf(message) ?? lastProse;
			for (const block of message.content) if (block.type === "toolCall") anchors.set(block.id, lastProse);
			continue;
		}
		if (message.role !== "toolResult") continue;
		const details = (message as { details?: unknown }).details as AnswerDetails | undefined;
		if (!details || typeof details !== "object") continue;
		if (details.dontKnow === true || details.dismissed === true) continue;
		if (typeof details.correct !== "boolean" || typeof details.confidence !== "number" || !Number.isFinite(details.confidence)) continue;
		const level = confidenceLevel(details.confidence);
		const count = (levels[level] ??= { answers: 0, right: 0 });
		count.answers++;
		if (details.correct) count.right++;
		counted++;
		if (level === "Certain" && !details.correct) {
			misses.push({
				toolCallId: message.toolCallId,
				question: typeof details.questionText === "string" ? repairMathForDisplay(details.questionText) : "",
				answeredAt: typeof details.answeredAt === "string" ? details.answeredAt : new Date(message.timestamp).toISOString(),
				messageId: anchors.get(message.toolCallId) ?? null,
			});
		}
	}
	return counted === 0 ? null : { levels, misses };
}

export interface MergedLevel extends LevelCount {
	level: ConfidenceLevel;
}

export interface MergedMiss extends CalibrationMiss {
	chatId: string;
	title: string;
}

/** Home's totals across sessions: levels in the fixed order (used ones
 *  only), misses newest answered first. */
export function mergeCalibration(chats: readonly { id: string; title: string; calibration?: ChatCalibration }[]): { levels: MergedLevel[]; misses: MergedMiss[] } {
	const sums = new Map<ConfidenceLevel, LevelCount>();
	const misses: MergedMiss[] = [];
	for (const chat of chats) {
		if (!chat.calibration) continue;
		for (const level of CONFIDENCE_LEVEL_ORDER) {
			const count = chat.calibration.levels[level];
			if (!count) continue;
			const sum = sums.get(level) ?? { answers: 0, right: 0 };
			sums.set(level, { answers: sum.answers + count.answers, right: sum.right + count.right });
		}
		for (const miss of chat.calibration.misses) misses.push({ ...miss, chatId: chat.id, title: chat.title });
	}
	return {
		levels: CONFIDENCE_LEVEL_ORDER.flatMap((level) => (sums.has(level) ? [{ level, ...sums.get(level)! }] : [])),
		misses: misses.sort((a, b) => b.answeredAt.localeCompare(a.answeredAt)),
	};
}

/** "Certain · 61 answers · 51 right (84%)" — the percent only from 5 answers. */
export function levelLine({ level, answers, right }: MergedLevel): string {
	const percent = answers >= 5 ? ` (${Math.round((100 * right) / answers)}%)` : "";
	return `${level} · ${answers} ${answers === 1 ? "answer" : "answers"} · ${right} right${percent}`;
}
