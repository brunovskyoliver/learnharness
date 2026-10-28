/**
 * CALIBRATION (feature 004): how the learner's stated confidence matched
 * graded results, derived at read time from answered checks (Principle II).
 * Pins the level bucketing, the exclusions ("I don't know", dismissed,
 * ungraded), the Certain misses with their link target, the cross-session
 * merge, and the line wording.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calibrationOf, confidenceLevel, levelLine, mergeCalibration } from "../src/core/index.ts";

type LhMessage = import("../src/core/index.ts").LhMessage;
type ChatListItem = import("../src/core/index.ts").ChatListItem;

let seq = 0;
const T0 = Date.UTC(2026, 9, 26, 6, 0);

function check(opts: { confidence?: number; correct?: boolean; dontKnow?: boolean; dismissed?: boolean; prose?: boolean; question?: string } = {}): LhMessage[] {
	const n = ++seq;
	const call = `call-${n}`;
	const content = [
		...(opts.prose === false ? [] : [{ type: "text", text: `Teaching paragraph ${n}.` }]),
		{ type: "toolCall", id: call, name: "quiz", arguments: { question: opts.question ?? `Question ${n}?`, nodeId: "a" } },
	];
	const details: Record<string, unknown> = {
		kind: "quiz",
		tool: "quiz",
		questionText: opts.question ?? `Question ${n}?`,
		dontKnow: opts.dontKnow ?? false,
		answers: [{ index: 1, label: "SECRET-OPTION" }],
		correctIndices: [0],
		explanation: "SECRET-EXPLANATION",
		answeredAt: new Date(T0 + n * 60_000).toISOString(),
	};
	if (opts.correct !== undefined) details.correct = opts.correct;
	if (opts.confidence !== undefined) details.confidence = opts.confidence;
	if (opts.dismissed) details.dismissed = true;
	return [
		{ id: `a-${n}`, role: "assistant", content, timestamp: T0 + n * 60_000 } as never,
		{ id: `r-${n}`, role: "toolResult", toolCallId: call, toolName: "quiz", content: [{ type: "text", text: "{}" }], details, isError: false, timestamp: T0 + n * 60_000 + 1 } as never,
	];
}

describe("confidenceLevel — midpoints between 25/50/75/95", () => {
	it("buckets raw percentages to the nearest named level", () => {
		const cases: [number, string][] = [[0, "Guessing"], [25, "Guessing"], [37, "Guessing"], [38, "Unsure"], [50, "Unsure"], [62, "Unsure"], [63, "Fairly sure"], [75, "Fairly sure"], [84, "Fairly sure"], [85, "Certain"], [95, "Certain"], [100, "Certain"]];
		for (const [raw, level] of cases) assert.equal(confidenceLevel(raw), level, String(raw));
	});
});

describe("calibrationOf", () => {
	it("is null when nothing counts", () => {
		assert.equal(calibrationOf([]), null);
		assert.equal(calibrationOf([...check({ dontKnow: true, correct: false }), ...check({ correct: true }), ...check({ confidence: 95 })]), null);
	});

	it("skips I don't know, dismissed and ungraded answers", () => {
		const cal = calibrationOf([
			...check({ confidence: 95, correct: true }),
			...check({ confidence: 95, correct: false, dontKnow: true }),
			...check({ confidence: 95, correct: false, dismissed: true }),
			...check({ confidence: 95 }),
		]);
		assert.deepEqual(cal?.levels, { Certain: { answers: 1, right: 1 } });
		assert.deepEqual(cal?.misses, []);
	});

	it("matches the hosted lesson's shape", () => {
		const messages: LhMessage[] = [];
		for (let i = 0; i < 34; i++) messages.push(...check({ confidence: 100, correct: i >= 5 }));
		for (let i = 0; i < 27; i++) messages.push(...check({ confidence: 95, correct: i >= 5 }));
		messages.push(...check({ confidence: 50, correct: false }));
		messages.push(...check({ dontKnow: true, correct: false }));
		const cal = calibrationOf(messages)!;
		assert.deepEqual(cal.levels, { Certain: { answers: 61, right: 51 }, Unsure: { answers: 1, right: 0 } });
		assert.equal(cal.misses.length, 10);
	});

	it("lists misses at Certain with the question, time and link target, nothing else", () => {
		const first = check({ confidence: 95, correct: false, question: "Why does $x^2$ grow?" });
		const second = check({ confidence: 100, correct: false, prose: false });
		const cal = calibrationOf([...check({ confidence: 75, correct: false }), ...first, ...second])!;
		assert.equal(cal.misses.length, 2, "a Fairly sure miss is not listed");
		const [a, b] = cal.misses;
		assert.deepEqual(Object.keys(a!).sort(), ["answeredAt", "messageId", "question", "toolCallId"]);
		assert.equal(a!.question, "Why does $x^2$ grow?");
		assert.equal(a!.messageId, (first[0] as { id: string }).id, "the check's own message when it has prose");
		assert.equal(b!.messageId, (first[0] as { id: string }).id, "else the nearest earlier message with prose");
		const wire = JSON.stringify(cal);
		assert.ok(!wire.includes("SECRET"), "no options or explanations cross");
	});

	it("has no link target when no earlier prose exists", () => {
		const cal = calibrationOf(check({ confidence: 95, correct: false, prose: false }))!;
		assert.equal(cal.misses[0]!.messageId, null);
	});
});

describe("mergeCalibration", () => {
	const chat = (id: string, calibration?: ChatListItem["calibration"]): ChatListItem => ({
		id, title: `Session ${id}`, kind: "teach", createdAt: "", updatedAt: "", messageCount: 0, phase: "teach",
		pendingQuestion: false, pendingProblem: false, busy: false, compacting: false, ...(calibration ? { calibration } : {}),
	}) as ChatListItem;

	it("sums levels in the fixed order and orders misses newest first", () => {
		const merged = mergeCalibration([
			chat("a", { levels: { Certain: { answers: 3, right: 2 } }, misses: [{ toolCallId: "1", question: "Old?", answeredAt: "2026-10-01T00:00:00.000Z", messageId: "m1" }] }),
			chat("none"),
			chat("b", { levels: { Certain: { answers: 1, right: 0 }, Guessing: { answers: 2, right: 1 } }, misses: [{ toolCallId: "2", question: "New?", answeredAt: "2026-10-20T00:00:00.000Z", messageId: null }] }),
		]);
		assert.deepEqual(merged.levels.map((l) => [l.level, l.answers, l.right]), [["Guessing", 2, 1], ["Certain", 4, 2]]);
		assert.deepEqual(merged.misses.map((m) => [m.chatId, m.title, m.question]), [["b", "Session b", "New?"], ["a", "Session a", "Old?"]]);
	});
});

describe("levelLine", () => {
	it("shows the percent from 5 answers, singular for one", () => {
		assert.equal(levelLine({ level: "Certain", answers: 61, right: 51 }), "Certain · 61 answers · 51 right (84%)");
		assert.equal(levelLine({ level: "Unsure", answers: 1, right: 0 }), "Unsure · 1 answer · 0 right");
		assert.equal(levelLine({ level: "Guessing", answers: 4, right: 1 }), "Guessing · 4 answers · 1 right");
		assert.equal(levelLine({ level: "Fairly sure", answers: 5, right: 4 }), "Fairly sure · 5 answers · 4 right (80%)");
	});
});
