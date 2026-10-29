import type { MlPanelData } from "./demo-kit.ts";

export type NetworkSpec = MlPanelData<"network">;
export interface ForwardPass { activations: number[][]; preactivations: number[][]; loss: number }
export interface BackwardPass { deltas: number[][]; weightGradients: number[][][]; biasGradients: number[][] }
export type NetworkStep = { kind: "inputs" | "forward" | "backward"; layer: number } | { kind: "weights" };

function validate(spec: NetworkSpec): void {
	const { layers, weights, biases, input, target, activation, loss } = spec;
	if (!Array.isArray(layers) || layers.length < 2 || layers.length > 5 || layers.some(n => !Number.isInteger(n) || n < 1 || n > 8)) throw new Error("layers: use 2–5 layers with 1–8 neurons each");
	const vector = (value: unknown, size: number): value is number[] => Array.isArray(value) && value.length === size && value.every(Number.isFinite);
	if (!vector(input, layers[0]!)) throw new Error("input: use finite values matching the input layer");
	if (!vector(target, layers.at(-1)!)) throw new Error("target: use finite values matching the output layer");
	if (!Array.isArray(weights) || weights.length !== layers.length - 1 || weights.some((matrix, i) => !Array.isArray(matrix) || matrix.length !== layers[i + 1] || matrix.some(row => !vector(row, layers[i]!)))) throw new Error("weights: use finite values matching adjacent layer sizes");
	if (!Array.isArray(biases) || biases.length !== layers.length - 1 || biases.some((row, i) => !vector(row, layers[i + 1]!))) throw new Error("biases: use finite values matching output layer sizes");
	if (!["sigmoid", "tanh", "relu"].includes(activation)) throw new Error("activation: use sigmoid, tanh or relu");
	if (!["mse", "bce"].includes(loss)) throw new Error("loss: use mse or bce");
	if (loss === "bce" && (activation !== "sigmoid" || target.some(t => t < 0 || t > 1))) throw new Error("bce: requires sigmoid activation and targets from 0 to 1");
}

function finite(value: number): number {
	if (!Number.isFinite(value)) throw new Error("network: calculation overflowed; use smaller finite values");
	return value;
}

function activate(z: number, activation: NetworkSpec["activation"]): number {
	if (activation === "relu") return Math.max(0, z);
	if (activation === "tanh") return Math.tanh(z);
	return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

function derivative(z: number, a: number, activation: NetworkSpec["activation"]): number {
	if (activation === "relu") return z > 0 ? 1 : 0;
	return activation === "tanh" ? 1 - a * a : a * (1 - a);
}

/** Weights are [layer transition][destination neuron][source neuron]. */
export function forward(spec: NetworkSpec): ForwardPass {
	validate(spec);
	const activations = [spec.input.slice()], preactivations: number[][] = [];
	for (const [l, matrix] of spec.weights.entries()) {
		const z = matrix.map((row, j) => finite(row.reduce((sum, weight, i) => sum + weight * activations[l]![i]!, spec.biases[l]![j]!)));
		preactivations.push(z);
		activations.push(z.map(value => activate(value, spec.activation)));
	}
	const output = activations.at(-1)!, logits = preactivations.at(-1)!;
	const loss = finite(output.reduce((sum, y, i) => {
		const t = spec.target[i]!, z = logits[i]!;
		// BCE in logits avoids log(0) and keeps saturated sigmoid gradients useful.
		return sum + (spec.loss === "mse" ? 0.5 * (y - t) ** 2 : Math.max(z, 0) - z * t + Math.log1p(Math.exp(-Math.abs(z))));
	}, 0));
	return { activations, preactivations, loss };
}

export function backward(spec: NetworkSpec): BackwardPass {
	const { activations, preactivations } = forward(spec);
	const deltas: number[][] = Array.from({ length: spec.weights.length }, () => []);
	for (let l = spec.weights.length - 1; l >= 0; l--) {
		deltas[l] = activations[l + 1]!.map((a, j) => {
			if (l === spec.weights.length - 1) {
				const difference = a - spec.target[j]!;
				return finite(spec.loss === "bce" ? difference : difference * derivative(preactivations[l]![j]!, a, spec.activation));
			}
			const upstream = spec.weights[l + 1]!.reduce((sum, row, k) => sum + row[j]! * deltas[l + 1]![k]!, 0);
			return finite(upstream * derivative(preactivations[l]![j]!, a, spec.activation));
		});
	}
	return {
		deltas,
		weightGradients: deltas.map((layer, l) => layer.map(delta => activations[l]!.map(a => finite(delta * a)))),
		biasGradients: deltas.map(layer => layer.slice()),
	};
}

/** Output and loss share a forward step, as on the binding Network board. */
export function steps(spec: NetworkSpec): NetworkStep[] {
	validate(spec);
	return [
		{ kind: "inputs", layer: 0 },
		...spec.layers.slice(1).map((_, i): NetworkStep => ({ kind: "forward", layer: i + 1 })),
		...spec.layers.slice(1).map((_, i): NetworkStep => ({ kind: "backward", layer: spec.layers.length - i - 1 })),
		{ kind: "weights" },
	];
}
