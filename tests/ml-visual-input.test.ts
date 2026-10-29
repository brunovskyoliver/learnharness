import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mlVisualInputProblems, mlVisualKitSpec } from "../src/core/ml-visual.ts";
import { validateDemoKitSpec } from "../src/core/demo-kit.ts";

describe("ML visual input", () => {
	const examples = [
		{ kind: "heatmap", data: { rows: ["q"], cols: ["k"], values: [[0.5]], scale: "sequential" } },
		{ kind: "tokens", data: { text: "Hello", encoding: "o200k" } },
		{ kind: "next_token", data: { context: "Hello", tokens: [{ text: " world", logit: 1 }] } },
		{ kind: "scatter", data: { points: [{ label: "a", x: 1, y: 2 }], metric: "euclidean" } },
		{ kind: "network", data: { layers: [2, 1], weights: [[[0.5, 0.2]]], biases: [[0]], input: [1, 0], target: [1], activation: "sigmoid", loss: "mse" } },
		{ kind: "shapes", data: { steps: [{ op: "Input", shape: [{ name: "B", size: 1 }] }] } },
	];
	for (const example of examples) it(`builds one checked ${example.kind} panel`, () => {
		const input = { ...example, title: "Example", caption: "Caption" };
		assert.deepEqual(mlVisualInputProblems(input), []);
		const spec = mlVisualKitSpec(input);
		assert.equal(spec.panels.length, 1);
		assert.equal(spec.panels[0]?.type, example.kind);
		assert.equal(spec.panels[0] && "title" in spec.panels[0] && spec.panels[0].title, "Example");
		assert.deepEqual(validateDemoKitSpec(spec), []);
	});
	it("enforces title and caption limits", () => {
		for (const patch of [{ title: "" }, { title: "x".repeat(81) }, { caption: "x".repeat(201) }]) assert.ok(mlVisualInputProblems({ ...examples[1], title: "Tokens", ...patch }).length);
		assert.deepEqual(mlVisualInputProblems({ ...examples[1], title: "x".repeat(80), caption: "x".repeat(200) }), []);
	});
	it("rejects invalid kind, malformed data, non-finite values and supplied tokens", () => {
		for (const input of [null, {}, { kind: "unknown", title: "X", data: {} }, { ...examples[0], title: "X", data: { ...examples[0]!.data, values: [[Infinity]] } }, { kind: "tokens", title: "X", data: { text: "x", tokenized: {} } }, { kind: "heatmap", title: "X", data: { ...examples[0]!.data, values: [[1, 2]] } }]) assert.ok(mlVisualInputProblems(input).length);
	});
	it("JSON-encodes data expressions and keeps token text literal", () => {
		const heatmap = mlVisualKitSpec({ ...examples[0], title: "X" }).panels[0]!;
		assert.equal(heatmap.type === "heatmap" && heatmap.values, "[[0.5]]");
		const tokens = mlVisualKitSpec({ ...examples[1], title: "X" }).panels[0]!;
		assert.equal(tokens.type === "tokens" && tokens.text, "Hello");
		const next = mlVisualKitSpec({ ...examples[2], title: "X" }).panels[0]!;
		assert.equal(next.type === "next_token" && next.context, '"Hello"');
	});
});
