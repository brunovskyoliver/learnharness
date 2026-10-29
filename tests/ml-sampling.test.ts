import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distribution, sample } from "../src/core/ml-sampling.ts";

const logits = [3.2, 2.6, 2.2, 2, 1.4, 1.2, 1, 0.6].map((logit, i) => ({ text: String(i), logit }));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);
describe("sampling distributions", () => {
	it("uses stable softmax(logit / temperature), preserving source identity and sorting by probability", () => {
		const rows = distribution([{ text: "low", logit: 1000 }, { text: "high", logit: 1002 }], { temperature: 2 });
		assert.deepEqual(rows.map(r => r.text), ["high", "low"]);
		near(rows[0]!.p, Math.E / (1 + Math.E));
		near(rows[1]!.p, 1 / (1 + Math.E));
	});
	it("normalises the p form and applies temperature without giving zero probability mass", () => {
		const rows = distribution([{ text: "a", p: 0.6 }, { text: "b", p: 0.399 }, { text: "zero", p: 0 }]);
		near(rows[0]!.p, 0.6 / 0.999);
		near(rows[2]!.p, 0);
		const cool = distribution([{ text: "a", p: 0.8 }, { text: "b", p: 0.2 }], { temperature: 0.5 });
		near(cool[0]!.p, 16 / 17);
	});
	it("cuts top-k first, applies the nucleus threshold to original mass, then renormalises", () => {
		const rows = distribution([{ text: "a", p: 0.4 }, { text: "b", p: 0.3 }, { text: "c", p: 0.2 }, { text: "d", p: 0.1 }], { topK: 3, topP: 0.5 });
		assert.deepEqual(rows.map(r => r.cut), [null, null, "cut by top-p", "cut by top-k"]);
		near(rows[0]!.p, 4 / 7); near(rows[1]!.p, 3 / 7);
		near(rows[2]!.p, 0); near(rows[3]!.p, 0);
		assert.equal(distribution([{ text: "a", p: 0.4 }, { text: "b", p: 0.3 }, { text: "c", p: 0.2 }, { text: "d", p: 0.1 }], { topK: 2, topP: 0.5 }).filter(r => !r.cut).length, 2);
	});
	it("sums to 100% within 0.1 across the required parameter sweep", () => {
		for (const temperature of [0.1, 0.5, 1, 2]) for (const topK of [0, 1, 3, 8]) for (const topP of [0.05, 0.5, 0.9, 1]) {
			const rows = distribution(logits, { temperature, topK, topP });
			assert.ok(Math.abs(rows.reduce((sum, r) => sum + r.p, 0) * 100 - 100) <= 0.1);
			assert.ok(rows.every(r => Number.isFinite(r.p) && r.p >= 0));
			if (topP === 1 && topK) assert.equal(rows.filter(r => !r.cut).length, topK);
		}
	});
	it("retains tied tokens in original order and always keeps at least one", () => {
		assert.deepEqual(distribution([{ text: "b", logit: 1 }, { text: "a", logit: 1 }], { topK: 1 }).map(r => r.cut), [null, "cut by top-k"]);
		assert.equal(distribution(logits, { topP: 0.00001 }).filter(r => !r.cut).length, 1);
	});
	it("seeded sampling draws only kept, positive-mass tokens, including at endpoints", () => {
		const rows = distribution(logits, { topK: 3, topP: 0.5 });
		let seed = 42;
		const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
		for (let i = 0; i < 1000; i++) { const picked = sample(rows, rng); assert.equal(picked.cut, null); assert.ok(picked.p > 0); }
		assert.equal(sample(rows, () => 0), rows[0]);
		assert.equal(sample(rows, () => 1 - Number.EPSILON), rows.filter(r => r.p > 0).at(-1));
	});
	it("rejects invalid values and limits rather than producing misleading probabilities", () => {
		for (const input of [[], [{ text: "x", logit: NaN }], [{ text: "x", p: 0 }], [{ text: "x", p: 0.1 }], Array.from({ length: 31 }, () => ({ text: "x", logit: 1 }))]) assert.throws(() => distribution(input));
		for (const options of [{ temperature: 0 }, { temperature: Infinity }, { topK: -1 }, { topK: 1.2 }, { topP: 0 }, { topP: 1.1 }]) assert.throws(() => distribution(logits, options));
		assert.throws(() => sample(distribution(logits), () => 1));
	});
});
