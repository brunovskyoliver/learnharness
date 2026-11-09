/**
 * Feature 028 (phase 8): reading-order slots. The leading items stagger,
 * later items in the first viewport ink in with the last step (never solid
 * before an earlier row), items below the fold arrive finished.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inkOrder, rowOrder } from "../components/paper/motion-arrival.ts";

const slot = (p: { style?: object }, name: string) => (p.style as Record<string, unknown> | undefined)?.[name];

describe("reading-order slots (FR-011, rows 2, 13, 29)", () => {
	it("the leading items take their own step", () => {
		assert.deepEqual(inkOrder(0), { "data-ink-order": "", style: { "--i": 0 } });
		assert.equal(slot(inkOrder(6), "--i"), 6);
		assert.equal(slot(rowOrder(3, 4), "--j"), 3);
	});
	it("items past the cap but in the first viewport take the last step", () => {
		assert.equal(slot(inkOrder(7), "--i"), 6);
		assert.equal(slot(inkOrder(23), "--i"), 6);
		assert.equal(slot(rowOrder(9, 4), "--j"), 3);
		assert.equal(rowOrder(9, 4)["data-row-order"], "");
	});
	it("items below the fold get no order and arrive finished", () => {
		assert.deepEqual(inkOrder(24), {});
		assert.deepEqual(rowOrder(40), {});
		assert.deepEqual(inkOrder(-1), {});
	});
});
