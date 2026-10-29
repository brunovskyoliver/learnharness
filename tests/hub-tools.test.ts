import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createInMemoryTransportPair, type InMemoryTransport } from "@earendil-works/pi-mcp/testing";
import { createHubTools } from "../src/agent/tools/hub.ts";
import { setMcpTransportFactory } from "../src/agent/mcp/client.ts";
import { runAsTenant } from "../config.ts";
import type { HubLookup } from "../src/core/lookups.ts";

const originalFetch = globalThis.fetch;
const config = { n_layer: 12, n_embd: 768, n_head: 12, vocab_size: 50257, n_positions: 1024, secret: "never include" };
const text = (result: { content: { type: string; text?: string }[] }) => result.content.map((c) => c.text ?? "").join("");
const modelReply = "Found 1 repositories across models matching query \"gpt2\".\n\n## Models (1)\n\n### openai-community/gpt2\n\n**Task:** text-generation | **Downloads:** 232 | **Likes:** 5\n\n**Link:** [https://hf.co/openai-community/gpt2](https://hf.co/openai-community/gpt2)\n";
function server(replies: { text: string; isError?: boolean; structuredContent?: Record<string, unknown> }[], seen: unknown[] = []) {
	setMcpTransportFactory(() => {
		const { client, server } = createInMemoryTransportPair();
		const send = (m: unknown) => void (server as InMemoryTransport).send(m as never);
		server.onMessage((raw) => {
			const m = raw as { id: number; method: string; params: unknown };
			if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "hf-fixture", version: "1" } } });
			if (m.method === "tools/call") {
				seen.push(m.params);
				const reply = replies.shift() ?? { text: "fixture card" };
				send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: reply.text }], isError: reply.isError ?? false, ...(reply.structuredContent ? { structuredContent: reply.structuredContent } : {}) } });
			}
		});
		void server.start();
		return client;
	});
}
afterEach(() => {
	globalThis.fetch = originalFetch;
	setMcpTransportFactory(null);
	delete (globalThis as Record<string, unknown>).__lhMcpClients;
	delete process.env.LH_HOSTED;
});

describe("Hub tools", () => {
	it("returns search text and typed details and sends only the query and fixed search options", async () => {
		const seen: unknown[] = [];
		server([{ text: modelReply }], seen);
		const result = await createHubTools().hub_search.execute("search", { kind: "models", query: "gpt2" }, undefined);
		assert.match(text(result), /1\. openai-community\/gpt2 · text-generation · 232/);
		const details = result.details as Extract<HubLookup, { kind: "search" }>;
		assert.equal(details.kind, "search");
		assert.equal(details.what, "models");
		assert.equal(details.query, "gpt2");
		assert.deepEqual(details.results, [{ id: "openai-community/gpt2", task: "text-generation", downloads: 232, likes: 5, url: "https://huggingface.co/openai-community/gpt2" }]);
		assert.deepEqual(seen, [{ name: "hub_repo_search", arguments: { query: "gpt2", repo_types: ["model"], limit: 5 } }]);
	});
	it("preserves rounded download text without inventing an exact count", async () => {
		server([{ text: modelReply.replace("232", "24.1M") }]);
		const result = await createHubTools().hub_search.execute("rounded", { kind: "models", query: "gpt2" }, undefined);
		assert.match(text(result), /24\.1M/);
		assert.equal((result.details as Extract<HubLookup, { kind: "search" }>).results[0]?.downloads, "24.1M");
	});
	it("uses the approved additional config labels and exact safetensors parameter total", async () => {
		globalThis.fetch = async (url) => Response.json(String(url).includes("/api/") ? { safetensors: { total: 124439808 } } : {
			num_hidden_layers: 12, hidden_size: 768, num_attention_heads: 12, max_position_embeddings: 1024,
			intermediate_size: 3072, num_key_value_heads: 4, model_type: "gpt2", torch_dtype: "float32",
		});
		server([{ text: "README" }]);
		const result = await createHubTools().hub_model.execute("fields", { repo: "gpt2" }, undefined);
		const d = result.details as Extract<HubLookup, { kind: "model" }>;
		assert.deepEqual(d.fields.slice(-4), [
			{ label: "Intermediate width", key: "intermediate_size", value: 3072 },
			{ label: "Key/value heads", key: "num_key_value_heads", value: 4 },
			{ label: "Model type", key: "model_type", value: "gpt2" },
			{ label: "Dtype", key: "torch_dtype", value: "float32" },
		]);
		assert.equal(d.params, 124439808);
		assert.match(text(result), /Parameters: 124439808/);
		assert.equal(d.cardSummary, undefined);
	});

	it("uses structured paper entries and handles a successful empty search", async () => {
		const seen: unknown[] = [];
		const entry = { type: "paper", name: "1706.03762", title: "Attention, summary=literal title", url: "https://huggingface.co/papers/1706.03762" };
		server([{ text: "Markdown display", structuredContent: { results: [{ status: "success", result: { entries: [entry] } }] } },
			{ text: "No results", structuredContent: { results: [{ status: "success", result: { entries: [] } }] } }], seen);
		const tools = createHubTools();
		const result = await tools.hub_search.execute("paper", { kind: "papers", query: "attention", limit: 3 }, undefined);
		assert.match(text(result), /Attention, summary=literal title · 1706.03762/);
		assert.equal((result.details as Extract<HubLookup, { kind: "search" }>).results[0]?.title, entry.title);
		assert.deepEqual(seen[0], { name: "hf_fs", arguments: { operations: [{ cmd: "search", args: ["hf://papers", "attention", "--limit", "3"] }] } });
		const empty = await tools.hub_search.execute("empty", { kind: "papers", query: "none" }, undefined);
		assert.deepEqual((empty.details as Extract<HubLookup, { kind: "search" }>).results, []);
	});
	it("maps dataset searches to the probed dataset tool and retains source metadata", async () => {
		const seen: unknown[] = [];
		server([{ text: modelReply.replace(/models/g, "datasets").replace("openai-community/gpt2", "Salesforce/wikitext") }], seen);
		const result = await createHubTools().hub_search.execute("data", { kind: "datasets", query: "wikitext", limit: 1 }, undefined);
		assert.match(text(result), /1\. Salesforce\/wikitext · 232/);
		assert.deepEqual(seen[0], { name: "hub_repo_search", arguments: { query: "wikitext", repo_types: ["dataset"], limit: 1 } });
	});

	it("reads the exact GPT-2 architecture, labels raw keys, and excludes nonwhitelisted data", async () => {
		const urls: string[] = [];
		globalThis.fetch = async (url) => { urls.push(String(url)); return Response.json(config); };
		const seen: unknown[] = [];
		server([{ text: "GPT-2 model card" }], seen);
		const result = await createHubTools().hub_model.execute("model", { repo: "openai-community/gpt2" }, undefined);
		const details = result.details as Extract<HubLookup, { kind: "model" }>;
		assert.deepEqual(details.fields, [
			{ label: "Layers", key: "n_layer", value: 12 },
			{ label: "Hidden width", key: "n_embd", value: 768 },
			{ label: "Heads", key: "n_head", value: 12 },
			{ label: "Vocabulary", key: "vocab_size", value: 50257 },
			{ label: "Context", key: "n_positions", value: 1024 },
		]);
		assert.match(text(result), /Layers \(n_layer\): 12/);
		assert.match(text(result), /https:\/\/huggingface.co\/openai-community\/gpt2/);
		assert.doesNotMatch(JSON.stringify(result), /never include|secret/);
		assert.ok(urls.every((url) => url === "https://huggingface.co/openai-community/gpt2/resolve/main/config.json" || url === "https://huggingface.co/api/models/openai-community/gpt2"));
		assert.deepEqual(seen, [], "no MCP call: the card was fetched and discarded before, costing up to 25 s");
	});
	it("keeps exact config fields when optional card and metadata sources are unavailable", async () => {
		globalThis.fetch = async (url) => String(url).includes("/api/") ? new Response("", { status: 503 }) : Response.json(config);
		server([{ text: "README not found", isError: true }]);
		const result = await createHubTools().hub_model.execute("optional", { repo: "gpt2" }, undefined);
		const details = result.details as Extract<HubLookup, { kind: "model" }>;
		assert.equal(details.fields[0]?.value, 12);
		assert.equal(details.params, undefined);
		assert.equal(details.cardSummary, undefined);
	});
	it("propagates abort during optional metadata enrichment", async () => {
		const controller = new AbortController();
		globalThis.fetch = async (url) => {
			if (String(url).includes("/api/")) { controller.abort(); throw new Error("aborted"); }
			return Response.json(config);
		};
		server([{ text: "README" }]);
		await assert.rejects(createHubTools().hub_model.execute("abort-meta", { repo: "gpt2" }, controller.signal), /aborted/i);
	});

	it("refuses invalid repo ids and extra learner context before any outbound request", async () => {
		globalThis.fetch = async () => { assert.fail("must not fetch"); };
		setMcpTransportFactory(() => { assert.fail("must not connect"); });
		const tools = createHubTools();
		for (const input of [{ repo: "../secrets" }, { repo: "gpt2", learnerText: "private" }]) {
			assert.equal((await tools.hub_model.execute("bad", input, undefined)).isError, true);
		}
		assert.equal((await tools.hub_search.execute("bad", { kind: "models", query: "gpt2", learnerText: "private" } as never, undefined)).isError, true);
	});
	it("shares the five-call cap across search and model, with a fresh counter for each instance", async () => {
		const seen: unknown[] = [];
		server(Array.from({ length: 7 }, () => ({ text: modelReply })), seen);
		globalThis.fetch = async () => Response.json(config);
		const tools = createHubTools();
		for (let i = 0; i < 5; i++) {
			if (i === 2) await tools.hub_model.execute(String(i), { repo: "gpt2" }, undefined);
			else await tools.hub_search.execute(String(i), { kind: "models", query: "gpt2" }, undefined);
		}
		await assert.rejects(tools.hub_search.execute("six", { kind: "models", query: "gpt2" }, undefined), /5 Hub lookups per turn/);
		assert.equal(seen.length, 4, "four searches over MCP; hub_model reads HTTPS only");
		await createHubTools().hub_search.execute("new", { kind: "models", query: "gpt2" }, undefined);
		assert.equal(seen.length, 5);
	});
	it("reports unavailable and rate-limited lookups as plain errors", async () => {
		server([{ text: "Hugging Face is limiting anonymous requests right now.", isError: true }]);
		await assert.rejects(createHubTools().hub_search.execute("rate", { kind: "models", query: "gpt2" }, undefined), /^Error: The Hugging Face lookup is unavailable: .*limiting/);
		globalThis.fetch = async () => new Response("", { status: 503 });
		await assert.rejects(createHubTools().hub_model.execute("down", { repo: "gpt2" }, undefined), /The Hugging Face lookup is unavailable: .*503/);
	});
	it("says a missing model was not found instead of calling the Hub unavailable", async () => {
		globalThis.fetch = async () => new Response("", { status: 404 });
		await assert.rejects(createHubTools().hub_model.execute("missing", { repo: "no-such/model" }, undefined), /^Error: The Hugging Face lookup found nothing: /);
	});
	it("honors an already-aborted turn before a network request", async () => {
		globalThis.fetch = async () => { assert.fail("must not fetch"); };
		await assert.rejects(createHubTools().hub_model.execute("abort", { repo: "gpt2" }, AbortSignal.abort()), /aborted/i);
	});
	it("refuses hosted calls without a tenant before fetch and accepts separate tenants", async () => {
		process.env.LH_HOSTED = "1";
		let fetches = 0;
		globalThis.fetch = async () => { fetches++; return Response.json(config); };
		await assert.rejects(createHubTools().hub_model.execute("tenant", { repo: "gpt2" }, undefined), /outside a tenant/);
		assert.equal(fetches, 0);
		server([{ text: modelReply }, { text: modelReply }]);
		for (const tenant of ["hub_a", "hub_b"]) await runAsTenant(tenant, () => createHubTools().hub_search.execute("tenant", { kind: "models", query: "gpt2" }, undefined));
	});
});
