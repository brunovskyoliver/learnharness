/** ML panels use the same complete document check as inline plots. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { getHeadless, stopBrowserService } from "../src/agent/subagents/headless.ts";
import { kitDemoHtml, type DemoKitSpec } from "../src/core/demo-kit.ts";

const headless = getHeadless();
const skip = !headless.available() ? `no headless browser: ${headless.unavailableReason()}` : !existsSync("public/demo-kit/runtime.js") ? "demo kit not built (npm run demo-kit)" : false;
after(() => stopBrowserService());
const cases: [string, DemoKitSpec][] = [
	["next_token", { params: { temperature: { type: "slider", label: "Temperature", min: .1, max: 2, step: .1, value: 1 } }, panels: [{ type: "next_token", context: '"The cat sat on the"', tokens: '[{"text":" mat","logit":3.2},{"text":" floor","logit":2.6},{"text":" sofa","logit":2.2}]', temperature: "p.temperature" }] }],
	["heatmap", { panels: [{ type: "heatmap", title: "Attention", rows: '["cat","mat"]', cols: '["cat","mat"]', values: '[[0.62,0.38],[0.48,0.52]]', scale: "sequential", rowAxis: '"Query"', colAxis: '"Key"' }] }],
	["network", { panels: [{ type: "network", title: "Training step", ...Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL("./fixtures/ml-net-2-3-1.json", import.meta.url), "utf8")).spec).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])) } as DemoKitSpec["panels"][number]] }],
	["scatter 2D", { panels: [{ type: "scatter", title: "Word vectors", points: '[{"label":"king","x":2,"y":3},{"label":"man","x":1,"y":1},{"label":"woman","x":1,"y":2},{"label":"queen","x":2,"y":4.1}]', arithmetic: '{"plus":["king","woman"],"minus":["man"]}', metric: "euclidean" }] }],
	["scatter 3D", { panels: [{ type: "scatter", title: "Word vectors", points: '[{"label":"king","x":2,"y":3,"z":1},{"label":"man","x":1,"y":1,"z":1},{"label":"woman","x":1,"y":2,"z":2},{"label":"queen","x":2,"y":4.1,"z":2}]', arithmetic: '{"plus":["king","woman"],"minus":["man"]}', metric: "cosine" }] }],
	["shapes", { panels: [{ type: "shapes", title: "Split into heads", steps: '[{"op":"Input","shape":[{"name":"B"},{"name":"T"},{"name":"C","size":768}]},{"op":"Split","shape":[{"name":"B"},{"name":"H","size":12},{"name":"T"},{"name":"D","size":64}]}]' }] }],
];
describe("ML panel complete document self-tests", { skip, concurrency: false }, () => {
	for (const [name, spec] of cases) it(`${name} renders and passes the kit self-test`, { timeout: 60000 }, async () => {
		const result = await headless.runDemo(kitDemoHtml(spec), { settleMs: 1500 });
		assert.deepEqual([...result.pageErrors, ...result.consoleErrors, ...result.failedRequests], []);
		assert.equal(result.ok, true);
		assert.deepEqual(result.kitTest, { panels: 1, steps: 0 });
	});
	it("runtime evaluation refuses a matrix above 64 rows", { timeout: 60000 }, async () => {
		const result = await headless.runDemo(kitDemoHtml({ panels: [{ type: "heatmap", rows: 'range(1,65).map(String)', cols: '["a"]', values: 'range(1,65).map(()=>[1])', scale: "sequential" }] }), { settleMs: 1500 });
		assert.equal(result.ok, false);
		assert.match(result.consoleErrors.join("\n"), /1–64 labels/);
	});
	it("runtime evaluation refuses more than 30 sampling tokens", { timeout: 60000 }, async () => {
		const result = await headless.runDemo(kitDemoHtml({ panels: [{ type: "next_token", context: '"test"', tokens: 'range(1,31).map(i=>({text:String(i),logit:1}))' }] }), { settleMs: 1500 });
		assert.equal(result.ok, false);
		assert.match(result.consoleErrors.join("\n"), /1–30 tokens/);
	});
});
