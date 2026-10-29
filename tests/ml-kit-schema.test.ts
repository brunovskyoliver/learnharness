import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateDemoKitSpec } from "../src/core/demo-kit.ts";

const examples = {
	heatmap: { type: "heatmap", rows: '["q"]', cols: '["k"]', values: '[[0.5]]', scale: "sequential" },
	tokens: { type: "tokens", text: "Hello", encoding: "o200k" },
	next_token: { type: "next_token", context: '"Hello"', tokens: '[{"text":" world","logit":1}]' },
	scatter: { type: "scatter", points: '[{"label":"a","x":1,"y":2}]', metric: "euclidean" },
	network: { type: "network", layers: '[2,1]', weights: '[[[0.5,0.2]]]', biases: '[[0]]', input: '[1,0]', target: '[1]', activation: "sigmoid", loss: "mse" },
	shapes: { type: "shapes", steps: '[{"op":"Input","shape":[{"name":"B","size":1}]}]' },
};
const problems = (panel: unknown) => validateDemoKitSpec({ panels: [panel] });

describe("ML kit schemas", () => {
	for (const [kind, panel] of Object.entries(examples)) it(`accepts a ${kind} panel`, () => assert.deepEqual(problems({ ...panel, title: "Example", width: "half", caption: "A caption", link: "tokens" }), []));
	it("rejects heatmap size and matrix mismatches", () => {
		for (const patch of [{ rows: JSON.stringify(Array(65).fill("q")) }, { cols: JSON.stringify(Array(65).fill("k")) }, { values: '[[1,2]]' }, { rows: '[]' }, { values: '[[null]]' }]) assert.ok(problems({ ...examples.heatmap, ...patch }).length);
	});
	it("rejects empty, oversized and agent-tokenized text", () => {
		for (const patch of [{ text: "" }, { text: "x".repeat(2001) }, { tokenized: {} }]) assert.ok(problems({ ...examples.tokens, ...patch }).length);
	});
	it("rejects oversized and mixed next-token forms", () => {
		for (const tokens of [Array(31).fill({ text: "a", logit: 1 }), [{ text: "a", logit: 1, p: 1 }], [{ text: "a", logit: 1 }, { text: "b", p: 0.5 }], [], [{ text: "a", p: 0.2 }]]) assert.ok(problems({ ...examples.next_token, tokens: JSON.stringify(tokens) }).length);
	});
	it("rejects oversized, duplicate and mixed-dimensional scatter points", () => {
		for (const points of [Array.from({ length: 201 }, (_, i) => ({ label: String(i), x: 1, y: 2 })), [{ label: "a", x: 1, y: 2 }, { label: "a", x: 2, y: 3 }], [{ label: "a", x: 1, y: 2 }, { label: "b", x: 2, y: 3, z: 1 }], []]) assert.ok(problems({ ...examples.scatter, points: JSON.stringify(points) }).length);
	});
	it("rejects invalid network sizes and mismatched weights", () => {
		for (const patch of [{ layers: '[1]' }, { layers: '[1,1,1,1,1,1]' }, { layers: '[9,1]' }, { weights: '[[[1]]]' }, { biases: '[[1,2]]' }, { input: '[1]' }, { target: '[1,2]' }]) assert.ok(problems({ ...examples.network, ...patch }).length);
	});
	it("rejects empty, oversized and too-wide shape traces", () => {
		for (const steps of [[], Array(25).fill({ op: "Input", shape: [{ name: "B" }] }), [{ op: "Input", shape: Array(7).fill({ name: "B" }) }]]) assert.ok(problems({ ...examples.shapes, steps: JSON.stringify(steps) }).length);
	});
	it("rejects unknown enum values", () => {
		for (const [kind, key] of [["heatmap", "scale"], ["tokens", "encoding"], ["scatter", "metric"], ["network", "activation"], ["network", "loss"]] as const) assert.ok(problems({ ...examples[kind], [key]: "unknown" }).length);
	});
	it("compiles expressions without running them on the server", () => {
		assert.deepEqual(problems({ ...examples.heatmap, values: '(() => { throw new Error("must not execute"); })()' }), []);
		assert.ok(problems({ ...examples.heatmap, values: '(' }).length);
	});
});
