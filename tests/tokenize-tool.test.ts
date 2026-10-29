import assert from "node:assert/strict";
import { it } from "node:test";
import { tokenizeTool } from "../src/agent/tools/tokenize.ts";
it("returns exact model pieces and complete token details", async () => {
	const result = await tokenizeTool().execute("one", { text: "😀", encoding: "gpt2" }, undefined);
	assert.deepEqual(result.content, [{ type: "text", text: '2 tokens with gpt2: [{"id":47249,"text":"<0xF0><0x9F><0x98>"},{"id":222,"text":"<0x80>"}]' }]);
	assert.deepEqual(result.details, { encoding: "gpt2", count: 2, tokens: [{ id: 47249, text: null, bytes: [240,159,152] }, { id: 222, text: null, bytes: [128] }] });
});
it("returns invalidInputResult for empty, oversized and unknown encoding inputs", async () => {
	for (const input of [{ text: "", encoding: "gpt2" }, { text: "a".repeat(2001), encoding: "gpt2" }, { text: "hi", encoding: "bad" }]) {
		const result = await tokenizeTool().execute("one", input as never, undefined);
		assert.equal(result.isError, true);
		assert.equal((result.details as any).tool, "tokenize");
	}
});
