import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { backward, forward, steps, type NetworkSpec } from "../src/core/ml-net.ts";
import { mlVisualInputProblems } from "../src/core/ml-visual.ts";

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
	it("sums half-squared errors across output neurons without averaging", () => {
		const tiny: NetworkSpec = { layers: [1, 2], weights: [[[2], [3]]], biases: [[0, 0]], input: [1], target: [1, 1], activation: "relu", loss: "mse" };
		near(forward(tiny).loss, 2.5);
		matrix(backward(tiny).deltas, [[1, 2]]);
	});
	it("sums binary cross entropy and differentiates sigmoid logits directly", () => {
		const tiny: NetworkSpec = { layers: [1, 2], weights: [[[0], [Math.log(3)]]], biases: [[0, 0]], input: [1], target: [1, 0.25], activation: "sigmoid", loss: "bce" };
		// p = [1/2, 3/4]; dL/dz = p-t = [-1/2, 1/2].
		near(forward(tiny).loss, Math.log(2) - 0.25 * Math.log(0.75) - 0.75 * Math.log(0.25));
		matrix(backward(tiny).deltas, [[-0.5, 0.5]]);
		matrix(backward(tiny).weightGradients[0]!, [[-0.5], [0.5]]);
		const saturated: NetworkSpec = { ...tiny, weights: [[[1000], [-1000]]], target: [0, 1] };
		near(forward(saturated).loss, 2000);
		matrix(backward(saturated).deltas, [[1, -1]]);
	});
	it("keeps backpropagation consistent with finite differences for both losses and every activation", () => {
		for (const activation of ["sigmoid", "tanh", "relu"] as const) for (const loss of ["mse", "bce"] as const) {
			if (loss === "bce" && activation !== "sigmoid") continue;
			const input = { ...structuredClone(spec), activation, loss };
			const gradients = backward(input);
			const epsilon = 1e-5;
			input.weights.forEach((layer, l) => layer.forEach((row, j) => row.forEach((weight, i) => {
				row[i] = weight + epsilon; const above = forward(input).loss;
				row[i] = weight - epsilon; const below = forward(input).loss;
				row[i] = weight;
				near(gradients.weightGradients[l]![j]![i]!, (above - below) / (2 * epsilon));
			})));
		}
	});
	it("refuses invalid shapes, nonfinite data, limits and incompatible BCE inputs in core and tool validation", () => {
		for (const patch of [
			{ layers: [2] }, { layers: [2, 9, 1] }, { input: [1] }, { target: [1, 1] }, { weights: [[[1]]] },
			{ biases: [[0], [0]] }, { input: [Infinity, 1] }, { weights: [[[NaN, 1], [1, 1], [1, 1]], [[1, 1, 1]]] },
			{ loss: "bce", activation: "tanh" }, { loss: "bce", activation: "relu" }, { loss: "bce", target: [-1] }, { loss: "bce", target: [1.01] },
		]) {
			const invalid = { ...spec, ...patch } as NetworkSpec;
			assert.throws(() => forward(invalid));
			assert.throws(() => backward(invalid));
			assert.ok(mlVisualInputProblems({ kind: "network", title: "Invalid network", data: invalid }).length > 0);
		}
		assert.throws(() => forward({ ...spec, input: [Number.MAX_VALUE, Number.MAX_VALUE], weights: [[[8, 8], [8, 8], [8, 8]], [[1, 1, 1]]] }), /finite|overflow/i);
	});
});
