import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { LIGHT_PLOTLY_TRACES, lightPlotlyCovers } from "../src/demo-kit/plotly-gate.ts";

it("the light build covers the 3D traces, contour, heatmap and scatter", () => {
	for (const type of ["scatter", "scatter3d", "surface", "mesh3d", "cone", "streamtube", "isosurface", "volume", "contour", "heatmap"]) assert.ok(lightPlotlyCovers([{ type }]), type);
	assert.ok(lightPlotlyCovers([{ type: "surface" }, { type: "contour" }]), "the built-in quick plot");
});

it("a trace without a type is plotly's default scatter", () => {
	assert.ok(lightPlotlyCovers([{ x: [1], y: [2] }]));
	assert.ok(lightPlotlyCovers([]));
});

it("any other trace type needs the full build for that plot", () => {
	for (const type of ["bar", "pie", "histogram", "scattergl", "box", "violin", "scatterpolar", "SURFACE", ""]) assert.equal(lightPlotlyCovers([{ type: "surface" }, { type }]), false, type);
	assert.equal(lightPlotlyCovers([{ type: 3 }]), false);
});

it("unusable traces leave the choice to plotly's own errors", () => {
	assert.ok(lightPlotlyCovers(undefined));
	assert.ok(lightPlotlyCovers("not traces"));
	assert.ok(lightPlotlyCovers([null, 1]));
});

it("the light entry registers exactly the gate's trace types", () => {
	const entry = readFileSync(new URL("../src/demo-kit/plotly-light-entry.ts", import.meta.url), "utf8");
	const registered = [...entry.matchAll(/from "plotly\.js\/lib\/(\w+)"/g)].map((m) => m[1]).filter((name) => name !== "core");
	assert.deepEqual(["scatter", ...registered].sort(), [...LIGHT_PLOTLY_TRACES].sort());
});
