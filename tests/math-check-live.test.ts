/**
 * The real Wolfram check (feature 007), opt-in: LH_LIVE_WOLFRAM=1. Calls
 * Wolfram Cloud MCP over the network, so it is skipped by default (tests
 * run without network or model requests).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mathCheckTool } from "../src/agent/tools/math-check.ts";

const live = process.env.LH_LIVE_WOLFRAM === "1";

describe("math_check against Wolfram Cloud (live)", { skip: live ? false : "set LH_LIVE_WOLFRAM=1 to call Wolfram" }, () => {
	const tool = mathCheckTool();
	const check = async (lhs: string, rhs: string, assumptions?: string) => {
		const started = Date.now();
		const r = await tool.execute(`live-${lhs}`, { purpose: "lesson", lhs, rhs, ...(assumptions ? { assumptions } : {}) }, undefined);
		const d = r.details as { outcome: string; counterexample?: string };
		console.log(`${lhs} vs ${rhs}${assumptions ? ` (${assumptions})` : ""}: ${d.outcome}${d.counterexample ? ` ${d.counterexample}` : ""} in ${Date.now() - started} ms`);
		return d;
	};

	it("agrees on a true derivative", async () => {
		assert.equal((await check("D[Sin[2 x], x]", "2 Cos[2 x]")).outcome, "agreed");
	});

	it("finds a counterexample to a false identity", async () => {
		const d = await check("(a + b)^2", "a^2 + b^2");
		assert.equal(d.outcome, "disagreed");
		assert.ok(d.counterexample);
	});

	it("needs the assumption for a conditional identity", async () => {
		assert.equal((await check("Sqrt[x^2]", "x")).outcome, "undecided");
		assert.equal((await check("Sqrt[x^2]", "x", "x > 0")).outcome, "agreed");
	});
});
