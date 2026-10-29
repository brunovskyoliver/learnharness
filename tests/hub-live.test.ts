/** Opt-in anonymous HF check; never runs in the default offline suite. */
import assert from "node:assert/strict";
import { it } from "node:test";
import { createHubTools } from "../src/agent/tools/hub.ts";
import type { HubLookup } from "../src/core/lookups.ts";

it("finds GPT-2 and reads its exact architecture from Hugging Face", { skip: process.env.LH_LIVE_HF !== "1", timeout: 60_000 }, async () => {
	const tools = createHubTools();
	const search = await tools.hub_search.execute("live-search", { kind: "models", query: "gpt2" }, undefined);
	assert.ok((search.details as Extract<HubLookup, { kind: "search" }>).results.some((r) => r.id.endsWith("gpt2")));
	const result = await tools.hub_model.execute("live-config", { repo: "openai-community/gpt2" }, undefined);
	const fields = Object.fromEntries((result.details as Extract<HubLookup, { kind: "model" }>).fields.map((f) => [f.key, f.value]));
	assert.deepEqual([fields.n_layer, fields.n_embd, fields.n_head, fields.vocab_size], [12, 768, 12, 50257]);
});
