import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	MATH_CHECK_LIMIT,
	MATH_CHECK_TOOL,
	MathCheckInputSchema,
	mathCheckInputProblems,
	parseWolframCheck,
	wolframCheckCode,
	type MathCheckDetails,
	type MathCheckInput,
} from "../../core/index.ts";
import { callMcpTool, McpUnavailableError } from "../mcp/client.ts";
import { invalidInputResult, serverExecute } from "../tool-execute.ts";

/**
 * The math check (feature 007): one fixed equality program run in
 * Wolfram's cloud kernel through the MCP client layer. The model writes
 * only lhs, rhs and assumptions; only those leave the server (FR-005).
 * Failures are error results in words (Principle IV) and never carry a
 * verdict, so nothing failed can be labelled "Checked with Wolfram".
 */

/** Agent decision under the owner's delegation, 2026-10-28 (plan.md). */
const MATH_CHECK_DESCRIPTION =
	"Check with Wolfram whether two expressions are mathematically equal. Write `lhs` and `rhs` in Wolfram Language: Sin[x], Exp[x], " +
	"Log[x], Sqrt[x], D[f, x], Integrate[f, {x, a, b}], Sum[f, {i, 1, n}], Pi, E, I; multiply with * or a space; no strings, semicolons or " +
	"assignments. Symbols are scalars: write matrix and vector expressions componentwise or with explicit small matrices ({{a, b}, {c, d}}), " +
	"or don't check them. For sums over data, check the summand. `assumptions` (optional) narrows the domain, e.g. " +
	"`x > 0 && Element[n, Integers]`. `purpose`: `question` — the committed answer of the question or problem you are about to pose " +
	"(hidden from the learner until it is answered or concluded); `grading` — the learner's submitted expression against your committed " +
	"answer (the outcome shows at once, the expressions after the problem concludes); `lesson` — a result you state in the lesson (shown " +
	"at once). The result is `agreed` (proved equal), `disagreed` (proved different, or a counterexample was found) or `undecided` " +
	"(neither — often equal only under a condition; add assumptions or treat the result as unchecked). Only these expressions are sent to " +
	"Wolfram — never put quiz text or the learner's words in them. At most 5 checks per turn.";

/** Runs the Wolfram program; returns Wolfram's text reply. */
export type WolframEvaluate = (code: string, signal?: AbortSignal) => Promise<string>;

const evaluateOnWolfram: WolframEvaluate = (code, signal) =>
	callMcpTool("wolfram", "WolframLanguageEvaluator", { code, timeConstraint: 30 }, signal);

const RAW_MAX = 2000;

function modelText(input: MathCheckInput, d: MathCheckDetails): string {
	if (d.outcome === "agreed") return `Wolfram: agreed — ${input.lhs} and ${input.rhs} are equal${input.assumptions ? ` assuming ${input.assumptions}` : ""}.`;
	if (d.outcome === "disagreed") return `Wolfram: disagreed — ${d.counterexample ? `counterexample ${d.counterexample}` : "proved different"}.`;
	return `Wolfram: undecided — ${d.reduced ? `reduced to ${d.reduced}` : d.reason ?? "no verdict"}. Equal only under conditions, or not provable here; do not call it checked.`;
}

/** One instance per turn (registries are built per request), so the
 *  counter is the per-turn limit. */
export function mathCheckTool(evaluate: WolframEvaluate = evaluateOnWolfram, limit = MATH_CHECK_LIMIT): AgentTool<typeof MathCheckInputSchema> {
	let used = 0;
	const check = serverExecute(MATH_CHECK_TOOL, MathCheckInputSchema, async (input: MathCheckInput, { signal }) => {
		const started = Date.now();
		let reply: string;
		try {
			reply = await evaluate(wolframCheckCode(input), signal);
		} catch (error) {
			const reason = error instanceof McpUnavailableError ? error.message.replace(/^Wolfram is unavailable: /, "") : error instanceof Error ? error.message : String(error);
			if (/aborted/i.test(reason)) throw error;
			throw new Error(`The Wolfram check is unavailable: ${reason}. Continue without it and do not call the result checked.`);
		}
		const details: MathCheckDetails = { ...parseWolframCheck(reply), raw: reply.trim().slice(0, RAW_MAX), ms: Date.now() - started };
		return { text: modelText(input, details), details };
	});
	return {
		name: MATH_CHECK_TOOL,
		label: MATH_CHECK_TOOL,
		description: MATH_CHECK_DESCRIPTION,
		parameters: MathCheckInputSchema,
		execute: async (toolCallId, input, signal) => {
			const problems = mathCheckInputProblems(input);
			if (problems.length > 0) return invalidInputResult(MATH_CHECK_TOOL, problems);
			if (used >= limit) return invalidInputResult(MATH_CHECK_TOOL, [`At most ${limit} math checks per turn; continue without further checks.`]);
			used++;
			return check(toolCallId, input, signal);
		},
	};
}
