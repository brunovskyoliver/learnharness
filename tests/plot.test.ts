/**
 * QUICK PLOT (feature 005): the plot tool's input rules and the demo-kit
 * spec built from them in code — a line chart for y = f(x), a surface and
 * a contour panel for z = f(x, y), one slider per parameter, and a derived
 * check that reports "no finite values in range".
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plotInputProblems, plotKitSpec, validateDemoKitSpec, type PlotInput } from "../src/core/index.ts";

const one: PlotInput = { title: "Damped wave", variables: ["x"], expression: "exp(-a*x) * sin(x)", x: { min: 0, max: 20 }, params: { a: { min: 0, max: 1, step: 0.05, value: 0.2 } } };
const two: PlotInput = { title: "Saddle-ish", variables: ["x", "y"], expression: "x**2 + 3*x*y**2", x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

describe("plotInputProblems", () => {
	it("accepts valid input", () => {
		assert.deepEqual(plotInputProblems(one), []);
		assert.deepEqual(plotInputProblems(two), []);
	});

	it("names each problem", () => {
		const cases: [Partial<PlotInput>, RegExp][] = [
			[{ x: { min: 1, max: 1 } }, /x: min must be below max/],
			[{ params: { a: { min: 0, max: 1, step: 0.1, value: 2 } } }, /params\.a: value must lie within/],
			[{ params: { a: { min: 0, max: 1, step: 0, value: 0.5 } } }, /params\.a: step must be above 0/],
			[{ params: { x: { min: 0, max: 1, step: 0.1, value: 0.5 } } }, /params\.x: .*name/],
			[{ params: { sin: { min: 0, max: 1, step: 0.1, value: 0.5 } } }, /params\.sin: .*name/],
			[{ params: { "a-b": { min: 0, max: 1, step: 0.1, value: 0.5 } } }, /params\.a-b: .*name/],
			[{ params: Object.fromEntries("abcdefg".split("").map((k) => [k, { min: 0, max: 1, step: 0.1, value: 0.5 }])) }, /at most 6 parameters/],
			[{ y: { min: 0, max: 1 } }, /y: only for two variables/],
			[{ zClip: { min: 3, max: 3 } }, /zClip: min must be below max/],
		];
		for (const [patch, pattern] of cases) assert.match(plotInputProblems({ ...one, ...patch } as PlotInput).join("\n"), pattern);
		assert.match(plotInputProblems({ ...two, y: undefined }).join("\n"), /y: required for two variables/);
	});
});

describe("plotKitSpec", () => {
	it("one variable: a slider per parameter and one line chart; the spec validates", () => {
		const spec = plotKitSpec(one);
		assert.deepEqual(Object.keys(spec.params ?? {}), ["a"]);
		assert.equal(spec.params!.a!.type, "slider");
		assert.equal(spec.panels.length, 1);
		assert.equal(spec.panels[0]!.type, "chart");
		assert.equal(spec.step, undefined, "no Step/Run controls");
		assert.deepEqual(validateDemoKitSpec(spec), []);
	});

	it("two variables: a surface and a contour panel; the spec validates", () => {
		const spec = plotKitSpec(two);
		assert.deepEqual(spec.panels.map((p) => p.type), ["plot3d", "plot3d"]);
		const traces = spec.panels.map((p) => (p as { traces: string }).traces).join(" ");
		assert.match(traces, /surface/);
		assert.match(traces, /contour/);
		assert.deepEqual(validateDemoKitSpec(spec), []);
	});

	it("wraps the expression so parameters read by bare name", () => {
		const f = (plotKitSpec(one).derived ?? {}).f!;
		assert.match(f, /const \{ a \} = p/);
		assert.match(f, /exp\(-a\*x\) \* sin\(x\)/);
	});

	it("reports an error when no sample is finite", () => {
		const derived = plotKitSpec(one).derived ?? {};
		assert.ok(Object.values(derived).some((e) => e.includes("no finite values in range")));
	});

	it("a syntax error in the expression fails validation", () => {
		assert.notDeepEqual(validateDemoKitSpec(plotKitSpec({ ...one, expression: "x +* 2" })), []);
	});
});
