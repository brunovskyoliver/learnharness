import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { backward, forward, steps, type NetworkSpec } from "../src/core/ml-net.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/ml-net-2-3-1.json", import.meta.url), "utf8"));
const spec: NetworkSpec = fixture.spec;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) <= Math.max(Math.abs(expected) * 0.00005, 1e-12), `${actual} ≠ ${expected} to 4 significant digits`);
function matrix(actual: number[][], expected: number[][]) {
	assert.equal(actual.length, expected.length);
	actual.forEach((row, i) => { assert.equal(row.length, expected[i]!.length); row.forEach((value, j) => near(value, expected[i]![j]!)); });
}

describe("small network computation", () => {
	it("matches the independent 2–3–1 scalar worksheet for every activation, loss, delta and parameter gradient", () => {
		const result = forward(spec);
		matrix(result.preactivations, fixture.preactivations);
		matrix(result.activations, fixture.activations);
		near(result.loss, fixture.loss);
		const gradients = backward(spec);
		matrix(gradients.deltas, fixture.deltas);
		matrix(gradients.biasGradients, fixture.biasGradients);
		assert.equal(gradients.weightGradients.length, fixture.weightGradients.length);
		gradients.weightGradients.forEach((layer, i) => matrix(layer, fixture.weightGradients[i]));
	});
	it("uses the tanh derivative for a hand-solvable scalar example", () => {
		// tanh(log(3)/2) = 1/2; L = 1/8; delta = (1/2)*(1-1/4) = 3/8.
		const tiny: NetworkSpec = { layers: [1, 1], weights: [[[Math.log(3) / 2]]], biases: [[0]], input: [1], target: [0], activation: "tanh", loss: "mse" };
		near(forward(tiny).activations[1]![0]!, 0.5);
		near(forward(tiny).loss, 0.125);
		near(backward(tiny).deltas[0]![0]!, 0.375);
		near(backward(tiny).weightGradients[0]![0]![0]!, 0.375);
	});
	it("propagates relu gradients through active neurons and blocks inactive neurons", () => {
		const tiny: NetworkSpec = { layers: [1, 2, 1], weights: [[[2], [-1]], [[0.5, 4]]], biases: [[0, 0], [0]], input: [2], target: [1], activation: "relu", loss: "mse" };
		matrix(forward(tiny).activations, [[2], [4, 0], [2]]);
		near(forward(tiny).loss, 0.5);
		matrix(backward(tiny).deltas, [[0.5, 0], [1]]);
		matrix(backward(tiny).weightGradients[0]!, [[1], [0]]);
		matrix(backward(tiny).weightGradients[1]!, [[4, 0]]);
	});
	it("steps inputs, each forward layer with loss at output, then deltas in reverse and weight gradients", () => {
		assert.deepEqual(steps(spec), [
			{ kind: "inputs", layer: 0 }, { kind: "forward", layer: 1 }, { kind: "forward", layer: 2 },
			{ kind: "backward", layer: 2 }, { kind: "backward", layer: 1 }, { kind: "weights" },
		]);
		const deep: NetworkSpec = { layers: [1, 1, 1, 1, 1], weights: [[[1]], [[1]], [[1]], [[1]]], biases: [[0], [0], [0], [0]], input: [1], target: [0], activation: "relu", loss: "mse" };
		assert.deepEqual(steps(deep).map(step => "layer" in step ? step.layer : "weights"), [0, 1, 2, 3, 4, 4, 3, 2, 1, "weights"]);
	});
});
