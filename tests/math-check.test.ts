/**
 * The math check's pure core (feature 007): the input whitelist that keeps
 * model-written text inside the server-written Wolfram template, the
 * template itself, and the parse of Wolfram's reply into a verdict.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mathCheckInputProblems, parseWolframCheck, wolframCheckCode, type MathCheckInput } from "../src/core/index.ts";

const ok: MathCheckInput = { purpose: "question", lhs: "D[Sin[2 x], x]", rhs: "2 Cos[2 x]" };

describe("mathCheckInputProblems", () => {
	it("accepts ordinary Wolfram Language expressions", () => {
		assert.deepEqual(mathCheckInputProblems(ok), []);
		assert.deepEqual(mathCheckInputProblems({ ...ok, lhs: "Integrate[x Exp[-x], {x, 0, Infinity}]", rhs: "1", assumptions: "x > 0 && Element[n, Integers]" }), []);
		assert.deepEqual(mathCheckInputProblems({ ...ok, lhs: "a != b", rhs: "x <= 2 || x >= 3" }), []);
	});

	it("rejects empty and overlong fields", () => {
		assert.match(mathCheckInputProblems({ ...ok, lhs: "  " }).join(), /lhs is empty/);
		assert.match(mathCheckInputProblems({ ...ok, rhs: "x".repeat(401) }).join(), /rhs is longer than 400/);
		assert.match(mathCheckInputProblems({ ...ok, assumptions: "x".repeat(201) }).join(), /assumptions is longer than 200/);
	});

	it("rejects characters that could leave the template", () => {
		for (const bad of ['"x"', "x; Quit[]", "x:=1", "`ctx`x", "#^2 &", "$Version", "f @ x", "10 % 3"]) {
			assert.notDeepEqual(mathCheckInputProblems({ ...ok, lhs: bad }), [], bad);
		}
	});

	it("rejects a lone = (an assignment) but allows comparisons", () => {
		assert.match(mathCheckInputProblems({ ...ok, lhs: "x = 2" }).join(), /assignment/);
		assert.match(mathCheckInputProblems({ ...ok, assumptions: "=x" }).join(), /assignment/);
		assert.deepEqual(mathCheckInputProblems({ ...ok, assumptions: "x == 2 && y >= 1 && z <= 3 && w != 0" }), []);
	});

	it("rejects unbalanced or crossed brackets", () => {
		assert.match(mathCheckInputProblems({ ...ok, lhs: "Sin[x" }).join(), /brackets/);
		assert.match(mathCheckInputProblems({ ...ok, lhs: "Sin[x)" }).join(), /brackets/);
		assert.match(mathCheckInputProblems({ ...ok, rhs: "(x]" }).join(), /brackets/);
		assert.match(mathCheckInputProblems({ ...ok, rhs: "x)" }).join(), /brackets/);
	});
});

describe("wolframCheckCode", () => {
	it("splices each field inside parentheses, defaults assumptions to True, and time-limits the program", () => {
		const code = wolframCheckCode(ok);
		assert.match(code, /lh = \(D\[Sin\[2 x\], x\]\);/);
		assert.match(code, /rh = \(2 Cos\[2 x\]\);/);
		assert.match(code, /as = \(True\);/);
		assert.match(code, /^TimeConstrained\[/);
		assert.match(code, /, 20, "OUTCOME: undecided\\nREASON: timed out"\]$/);
		assert.match(wolframCheckCode({ ...ok, assumptions: "x > 0" }), /as = \(x > 0\);/);
	});
});

describe("parseWolframCheck", () => {
	it("reads an agreed verdict", () => {
		assert.deepEqual(parseWolframCheck('Out[1]= "OUTCOME: agreed"'), { outcome: "agreed" });
	});

	it("reads a disagreement with its counterexample", () => {
		assert.deepEqual(parseWolframCheck('Out[1]= "OUTCOME: disagreed\\nCOUNTEREXAMPLE: {x -> 5}"'), { outcome: "disagreed", counterexample: "{x -> 5}" });
	});

	it("reads undecided with the reduced form or the reason", () => {
		assert.deepEqual(parseWolframCheck('Out[1]= "OUTCOME: undecided\\nREDUCED: Sqrt[x^2] == x"'), { outcome: "undecided", reduced: "Sqrt[x^2] == x" });
		assert.deepEqual(parseWolframCheck('Out[1]= "OUTCOME: undecided\\nREASON: timed out"'), { outcome: "undecided", reason: "timed out" });
	});

	it("accepts real newlines as well as escaped ones", () => {
		assert.deepEqual(parseWolframCheck("OUTCOME: disagreed\nCOUNTEREXAMPLE: {a -> 2, b -> 2}"), { outcome: "disagreed", counterexample: "{a -> 2, b -> 2}" });
	});

	it("throws on syntax errors and $Failed", () => {
		const reply = 'ToExpression::sntx: Invalid syntax in or before "lh = (Sin[x); rh = (x);".\n\nOut[1]= $Failed';
		assert.throws(() => parseWolframCheck(reply), /Wolfram could not read the expressions: ToExpression::sntx: Invalid syntax/);
		assert.throws(() => parseWolframCheck("Out[1]= $Failed"), /Wolfram could not read the expressions/);
	});

	it("throws when no verdict came back", () => {
		assert.throws(() => parseWolframCheck("Out[1]= 42"), /The Wolfram check returned no verdict/);
	});
});
