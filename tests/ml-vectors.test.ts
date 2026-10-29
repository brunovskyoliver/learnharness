import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arithmetic, nearest, validatePoints, type Point } from "../src/core/ml-vectors.ts";

const points: Point[] = [
	{ label: "king", x: 2, y: 3 }, { label: "man", x: 1, y: 1 }, { label: "woman", x: 1, y: 2 },
	{ label: "queen", x: 2, y: 4.1 }, { label: "far queen", x: 20, y: 40 },
];
const expr = { plus: ["king", "woman"], minus: ["man"] };
describe("embedding vector arithmetic", () => {
	it("adds and subtracts labelled points in 2D without mutating them", () => {
		const before = structuredClone(points);
		assert.deepEqual(arithmetic(points, expr), [2, 4]);
		assert.deepEqual(points, before);
	});
	it("uses Euclidean or cosine distance and excludes all operands", () => {
		const result = arithmetic(points, expr);
		const euclidean = nearest(points, result, "euclidean", [...expr.plus, ...expr.minus]);
		assert.equal(euclidean.point.label, "queen");
		assert.ok(Math.abs(euclidean.distance - 0.1) < 1e-12);
		const cosine = nearest(points, result, "cosine", [...expr.plus, ...expr.minus]);
		assert.equal(cosine.point.label, "far queen");
		assert.ok(Math.abs(cosine.distance) < 1e-12);
		assert.equal(nearest([...points, { label: "same", x: 2, y: 4 }], result, "euclidean", [...expr.plus, ...expr.minus]).point.label, "same");
	});
	it("computes all three coordinates in 3D and permits repeated operands", () => {
		const p = [{ label: "a", x: 1, y: 2, z: 3 }, { label: "b", x: 2, y: 4, z: 8 }, { label: "c", x: 0, y: 0, z: -1 }];
		const result = arithmetic(p, { plus: ["a", "a"], minus: ["b"] });
		assert.deepEqual(result, [0, 0, -2]);
		assert.equal(nearest(p, result, "euclidean", ["a", "b"]).distance, 1);
		assert.equal(nearest(p, result, "cosine", ["a", "b"]).distance, 0);
	});
	it("preserves source order when nearest distances tie", () => {
		assert.equal(nearest([{ label: "first", x: 1, y: 0 }, { label: "second", x: -1, y: 0 }], [0, 0], "euclidean").point.label, "first");
	});
	it("refuses malformed data, undefined cosine comparisons and an empty candidate set", () => {
		for (const p of [[], [{ label: "bad", x: NaN, y: 1 }], [{ label: "a", x: 1, y: 2 }, { label: "b", x: 1, y: 2, z: 3 }], [points[0]!, points[0]!], Array.from({ length: 201 }, (_, i) => ({ label: String(i), x: i, y: i }))]) assert.throws(() => validatePoints(p));
		assert.throws(() => arithmetic(points, { plus: ["absent"], minus: [] }));
		assert.throws(() => nearest(points, [0, 0], "cosine"), /zero/i);
		assert.throws(() => nearest([{ label: "zero", x: 0, y: 0 }], [1, 1], "cosine"), /zero/i);
		assert.throws(() => nearest(points, [1, 1], "euclidean", points.map(p => p.label)), /candidate/i);
		assert.throws(() => nearest(points, [1, 2, 3], "euclidean"));
		assert.throws(() => arithmetic([{ label: "huge", x: Number.MAX_VALUE, y: 0 }], { plus: ["huge", "huge"], minus: [] }), /finite|overflow/i);
	});
});
