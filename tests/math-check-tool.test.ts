/**
 * The `math_check` tool (feature 007) with a stubbed Wolfram: the program
 * sent is the fixed template; each verdict reaches the model in words and
 * the record as details; failures are error results with no verdict; the
 * per-turn limit holds. No network.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mathCheckTool, type WolframEvaluate } from "../src/agent/tools/math-check.ts";
import { McpUnavailableError } from "../src/agent/mcp/client.ts";
import { wolframCheckCode, type MathCheckInput } from "../src/core/index.ts";

const input: MathCheckInput = { purpose: "grading", lhs: "D[Sin[2 x], x]", rhs: "2 Cos[2 x]" };
const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");
const replying = (reply: string, seen: string[] = []): WolframEvaluate => async (code) => { seen.push(code); return reply; };
const run = (evaluate: WolframEvaluate, args: unknown = input, tool = mathCheckTool(evaluate)) => tool.execute("call-1", args as never, undefined);

describe("math_check tool", () => {
	it("sends the fixed program and reports agreement", async () => {
		const seen: string[] = [];
		const result = await run(replying('Out[1]= "OUTCOME: agreed"', seen));
		assert.deepEqual(seen, [wolframCheckCode(input)]);
		assert.equal(result.isError ?? false, false);
		assert.equal(text(result), "Wolfram: agreed — D[Sin[2 x], x] and 2 Cos[2 x] are equal.");
		const details = result.details as { outcome: string; raw: string; ms: number };
		assert.equal(details.outcome, "agreed");
		assert.equal(details.raw, 'Out[1]= "OUTCOME: agreed"');
		assert.equal(typeof details.ms, "number");
	});

	it("reports a disagreement with its counterexample", async () => {
		const result = await run(replying('Out[1]= "OUTCOME: disagreed\\nCOUNTEREXAMPLE: {x -> 5}"'));
		assert.equal(text(result), "Wolfram: disagreed — counterexample {x -> 5}.");
		assert.equal((result.details as { counterexample: string }).counterexample, "{x -> 5}");
	});

	it("reports undecided and tells the model not to call it checked", async () => {
		const result = await run(replying('Out[1]= "OUTCOME: undecided\\nREDUCED: Sqrt[x^2] == x"'));
		assert.match(text(result), /^Wolfram: undecided — reduced to Sqrt\[x\^2\] == x\. .*do not call it checked\.$/);
	});

	it("returns input problems to the model without calling Wolfram", async () => {
		const seen: string[] = [];
		const result = await run(replying("unused", seen), { ...input, lhs: 'Import["/etc/passwd"]' });
		assert.equal(result.isError, true);
		assert.match(text(result), /Invalid tool input for tool "math_check"/);
		assert.deepEqual(seen, []);
	});

	it("is an error result in words when Wolfram is unavailable", async () => {
		const result = await run(async () => { throw new McpUnavailableError("Wolfram is unavailable: fetch failed"); }).catch((e: Error) => e);
		assert.ok(result instanceof Error);
		assert.equal(result.message, "The Wolfram check is unavailable: fetch failed. Continue without it and do not call the result checked.");
	});

	it("is an error result when Wolfram cannot read the expressions", async () => {
		const result = await run(replying('ToExpression::sntx: Invalid syntax in or before "lh = (x".\nOut[1]= $Failed')).catch((e: Error) => e);
		assert.ok(result instanceof Error);
		assert.match(result.message, /^Wolfram could not read the expressions: ToExpression::sntx/);
	});

	it("refuses the sixth check in a turn", async () => {
		const seen: string[] = [];
		const tool = mathCheckTool(replying('Out[1]= "OUTCOME: agreed"', seen));
		for (let i = 0; i < 5; i++) assert.equal((await run(replying(""), input, tool)).isError ?? false, false);
		const sixth = await run(replying(""), input, tool);
		assert.equal(sixth.isError, true);
		assert.match(text(sixth), /At most 5 math checks per turn/);
		assert.equal(seen.length, 5);
	});
});
