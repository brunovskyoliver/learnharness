import assert from "node:assert/strict";
import { it } from "node:test";
import { mlVisualTool } from "../src/agent/tools/ml-visual.ts";
import type { HeadlessApi } from "../src/agent/subagents/headless.ts";
import { kitSpecOf } from "../src/core/demo-kit.ts";
const input = { kind: "tokens", title: "Tokens", data: { text: "hello" } };
function browser(errors: string[] = [], seen: string[] = []): HeadlessApi {
	return { available: () => true, runDemo: async (html, options) => {
		assert.equal(options?.settleMs, 1500); seen.push(html);
		return { ok: !errors.length, pageErrors: errors, consoleErrors: [], failedRequests: [] };
	} } as unknown as HeadlessApi;
}
it("checks and returns exactly the finalized token document", async () => {
	const seen: string[] = [];
	const result = await mlVisualTool(() => browser([], seen)).execute("one", input, undefined);
	assert.deepEqual(result.content, [{ type: "text", text: "Panel shown: Tokens." }]);
	assert.deepEqual(result.details, { kind: "demo", result: { title: "Tokens", html: seen[0], tested: true } });
	assert.deepEqual((kitSpecOf(seen[0]!)!.panels[0] as any).tokenized.cl100k, [{ id: 15339, text: "hello" }]);
});
it("throws the approved failed-check text", async () => {
	await assert.rejects(mlVisualTool(() => browser(["bad panel"])).execute("one", input, undefined), { message: "The panel failed its check and was not shown:\n- bad panel" });
});
it("returns invalidInputResult before checking bad input or agent supplied tokens", async () => {
	const seen: string[] = [];
	for (const data of [{ text: "" }, { text: "hello", tokenized: {} }]) {
		const result = await mlVisualTool(() => browser([], seen)).execute("one", { ...input, data }, undefined);
		assert.equal(result.isError, true); assert.equal((result.details as any).tool, "ml_visual");
	}
	assert.deepEqual(seen, []);
});
