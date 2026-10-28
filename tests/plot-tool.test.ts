/**
 * The `plot` tool (feature 005): input problems and spec compile errors go
 * back to the model; every plot is rendered once in the headless browser
 * before it is shown; page errors, "no finite values" and an unavailable
 * browser are honest error results (Principle IV); a pass returns the demo
 * artifact the transcript renders. Faux headless — no browser here.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { plotTool } from "../src/agent/tools/plot.ts";
import type { HeadlessApi } from "../src/agent/subagents/headless.ts";
import { kitDemoHtml, plotKitSpec, type PlotInput } from "../src/core/index.ts";

const input: PlotInput = { title: "Saddle-ish", variables: ["x", "y"], expression: "x**2 + 3*x*y**2", x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };

function headless(over: Partial<HeadlessApi> = {}, seen: string[] = []): HeadlessApi {
	return {
		available: () => true,
		unavailableReason: () => null,
		runDemo: async (html) => {
			seen.push(html);
			return { consoleErrors: [], pageErrors: [], failedRequests: [], kitTest: { panels: 2, steps: 0 }, ok: true };
		},
		renderSvg: async () => { throw new Error("unused"); },
		renderPdfPages: async () => { throw new Error("unused"); },
		...over,
	} as HeadlessApi;
}

const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");
const run = (h: HeadlessApi, args: unknown) => plotTool(() => h).execute("call-1", args as never, undefined);

describe("plot tool", () => {
	it("checks the plot headlessly and returns the demo artifact", async () => {
		const seen: string[] = [];
		const result = await run(headless({}, seen), input);
		assert.equal(result.isError ?? false, false);
		assert.equal(text(result), "Plot shown: Saddle-ish.");
		const html = kitDemoHtml(plotKitSpec(input));
		assert.deepEqual(result.details, { kind: "demo", result: { title: "Saddle-ish", html, tested: true } });
		assert.deepEqual(seen, [html], "exactly the shown document was checked");
	});

	it("returns input problems to the model without running anything", async () => {
		const seen: string[] = [];
		const result = await run(headless({}, seen), { ...input, x: { min: 2, max: 2 } });
		assert.equal(result.isError, true);
		assert.match(text(result), /x: min must be below max/);
		assert.deepEqual(seen, []);
	});

	it("returns a syntax error in the expression", async () => {
		const result = await run(headless(), { ...input, expression: "x +* 2" });
		assert.equal(result.isError, true);
		assert.match(text(result), /derived\.f/);
	});

	it("fails honestly on page errors and on no finite values", async () => {
		await assert.rejects(
			run(headless({ runDemo: async () => ({ consoleErrors: [], pageErrors: ["kit: derived.check: no finite values in range"], failedRequests: [], ok: false }) }), input),
			/no finite values in range/,
		);
		await assert.rejects(
			run(headless({ runDemo: async () => ({ consoleErrors: ["[demo kit] panels[0]: foo is not defined"], pageErrors: [], failedRequests: [], ok: false }) }), input),
			/foo is not defined/,
		);
	});

	it("refuses with the reason when no headless browser is available", async () => {
		await assert.rejects(
			run(headless({ available: () => false, unavailableReason: () => "Chrome not found" }), input),
			/Chrome not found/,
		);
	});
});
