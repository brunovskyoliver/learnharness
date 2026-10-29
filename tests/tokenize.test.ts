import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { tokenize, withTokenizedPanels } from "../src/agent/tokenizer.ts";
import { validateDemoKitSpec } from "../src/core/demo-kit.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/tokenizer-reference.json", import.meta.url), "utf8"));
describe("server tokenizer", () => {
	it("matches all 20 reference texts in all three encodings, including exact partial bytes", async () => {
		assert.equal(fixture.cases.length, 20);
		for (const entry of fixture.cases) for (const encoding of ["o200k", "cl100k", "gpt2"] as const) {
			assert.deepEqual(await tokenize(entry.text, encoding), entry.encodings[encoding]);
		}
		assert.deepEqual(await tokenize("😀", "gpt2"), [{ id: 47249, text: null, bytes: [240, 159, 152] }, { id: 222, text: null, bytes: [128] }]);
	});
	it("refuses unknown encodings and text beyond 2,000 characters", async () => {
		await assert.rejects(tokenize("hello", "unknown" as never), /encoding/i);
		await assert.rejects(tokenize("a".repeat(2001), "o200k"), /2,000/);
	});
	it("keeps rank imports lazy", () => {
		const source = readFileSync(new URL("../src/agent/tokenizer.ts", import.meta.url), "utf8");
		assert.doesNotMatch(source, /import\s+(?!type\b)[^;\n]*from\s+["']js-tiktoken/);
		assert.match(source, /import\(["']js-tiktoken\/ranks\//);
	});
	it("finalizes all encodings without mutating input, and refuses agent token data or executable expressions", async () => {
		const spec = { panels: [{ type: "tokens" as const, text: "hello" }, { type: "note" as const, text: "Try it" }] };
		const final = await withTokenizedPanels(spec);
		assert.equal("tokenized" in spec.panels[0]!, false);
		assert.deepEqual((final.panels[0] as any).tokenized.cl100k, [{ id: 15339, text: "hello" }]);
		assert.deepEqual(final.panels[1], spec.panels[1]);
		assert.ok(validateDemoKitSpec(final).some(p => p.includes("only the server")));
		await assert.rejects(withTokenizedPanels(final as never), /only the server/);
		await assert.rejects(withTokenizedPanels({ panels: [{ type: "tokens", text: { expression: "throw new Error()" } }] } as never));
	});
});

it("tokenizes special-token text as ordinary text instead of failing", async () => {
	for (const encoding of ["o200k", "cl100k", "gpt2"] as const) {
		const tokens = await tokenize("<|endoftext|>", encoding);
		assert.ok(tokens.length > 1, `${encoding} splits the marker into ordinary pieces`);
		assert.equal(tokens.map(t => t.text).join(""), "<|endoftext|>");
	}
});
