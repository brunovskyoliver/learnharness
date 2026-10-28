/**
 * Quick plots in a real headless browser (feature 005): the generated
 * specs render with no page or console errors, the kit's self-test sweeps
 * every slider to its ends, and a function with no finite values fails.
 * Skips with its reason where no Chrome or built demo kit is available.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { getHeadless, stopBrowserService } from "../src/agent/subagents/headless.ts";
import { kitDemoHtml, plotKitSpec, type PlotInput } from "../src/core/index.ts";

const headless = getHeadless();
const kitBuilt = fs.existsSync(path.join(import.meta.dirname, "..", "public", "demo-kit", "runtime.js"));
const skip = !headless.available() ? `no headless browser: ${headless.unavailableReason()}` : !kitBuilt ? "demo kit not built (npm run demo-kit)" : false;

after(() => stopBrowserService());

const cases: [string, PlotInput][] = [
	["the hosted request, two variables", { title: "f(x, y) = x² + 3xy²", variables: ["x", "y"], expression: "x**2 + 3*x*y**2", x: { min: -2, max: 2 }, y: { min: -2, max: 2 } }],
	["one variable with a parameter", { title: "Damped wave", variables: ["x"], expression: "exp(-a*x) * sin(x)", x: { min: 0, max: 20 }, params: { a: { min: 0, max: 1, step: 0.05, value: 0.2 } } }],
	["a pole, clipped", { title: "1/x", variables: ["x"], expression: "1 / x", x: { min: -2, max: 2 }, zClip: { min: -10, max: 10 } }],
];

describe("plots in a real headless browser", { skip, concurrency: false }, () => {
	for (const [name, input] of cases) {
		it(`${name}: renders with no errors`, { timeout: 60_000 }, async () => {
			const run = await headless.runDemo(kitDemoHtml(plotKitSpec(input)), { settleMs: 1500 });
			assert.deepEqual([...run.pageErrors, ...run.consoleErrors, ...run.failedRequests], []);
			assert.equal(run.ok, true);
			assert.equal(run.kitTest?.panels, input.variables.length === 2 ? 2 : 1);
		});
	}

	it("a function with no finite values fails its check", { timeout: 60_000 }, async () => {
		const run = await headless.runDemo(kitDemoHtml(plotKitSpec({ title: "Nothing", variables: ["x"], expression: "sqrt(-1 - x*x)", x: { min: -1, max: 1 } })), { settleMs: 1500 });
		assert.equal(run.ok, false);
		assert.match([...run.pageErrors, ...run.consoleErrors].join("\n"), /no finite values in range/);
	});
});
