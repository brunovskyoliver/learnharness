import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import { tenantScoped } from "../../../config.ts";
import type { HubLookup } from "../../core/lookups.ts";
import { callMcpTool, callMcpToolResult } from "../mcp/client.ts";
import { invalidInputResult, serverExecute } from "../tool-execute.ts";

const SearchInput = Type.Object({
	kind: Type.Union([Type.Literal("models"), Type.Literal("datasets"), Type.Literal("papers")]),
	query: Type.String({ minLength: 1, maxLength: 100 }),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
}, { additionalProperties: false });
const ModelInput = Type.Object({ repo: Type.String({ pattern: "^[\\w.-]+(/[\\w.-]+)?$" }) }, { additionalProperties: false });
const SEARCH_DESCRIPTION = "Search the Hugging Face Hub for models, datasets or papers by name or topic. Only the query leaves the server. At most 5 Hub lookups per turn.";
const MODEL_DESCRIPTION = "Read a model's configuration and card on the Hugging Face Hub before you state its architecture numbers (layers, hidden size, heads, vocabulary, context length, parameter count). Cite the Hub page. If the lookup fails, say so and don't present remembered numbers as looked up.";
const FIELDS = [
	["Layers", "n_layer", "num_hidden_layers"],
	["Hidden width", "n_embd", "hidden_size"],
	["Heads", "n_head", "num_attention_heads"],
	["Vocabulary", "vocab_size"],
	["Context", "n_positions", "max_position_embeddings"],
	["Intermediate width", "intermediate_size"],
	["Key/value heads", "num_key_value_heads"],
	["Model type", "model_type"],
	["Dtype", "torch_dtype"],
] as const;
type Search = Extract<HubLookup, { kind: "search" }>;
function exactCount(value: string | undefined): number | undefined {
	return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
}
function repositoryResults(reply: string, kind: "models" | "datasets"): { results: Search["results"]; text: string } {
	const results: Search["results"] = [];
	const lines: string[] = [];
	for (const match of reply.matchAll(/^### ([\w.-]+(?:\/[\w.-]+)?)\s*\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)) {
		const id = match[1]!;
		const body = match[2]!;
		const task = body.match(/\*\*Task:\*\*\s*([^|\n]+)/)?.[1]?.trim();
		const reportedDownloads = body.match(/\*\*Downloads:\*\*\s*([^|\n]+)/)?.[1]?.trim();
		const downloads = exactCount(reportedDownloads) ?? reportedDownloads;
		const likes = exactCount(body.match(/\*\*Likes:\*\*\s*([^|\n]+)/)?.[1]?.trim());
		results.push({ id, ...(task ? { task } : {}), ...(downloads !== undefined ? { downloads } : {}), ...(likes !== undefined ? { likes } : {}), url: `https://huggingface.co/${kind === "datasets" ? "datasets/" : ""}${id}` });
		lines.push(`${results.length}. ${[id, ...(kind === "models" && task ? [task] : []), ...(reportedDownloads ? [reportedDownloads] : [])].join(" · ")}`);
	}
	if (!results.length && !/^Found 0 repositories\b/.test(reply)) throw new Error("Hugging Face returned an unreadable search response.");
	return { results, text: lines.join("\n") || reply.trim() };
}
function paperResults(reply: { text: string; structuredContent?: unknown }): { results: Search["results"]; text: string } {
	const content = reply.structuredContent as { results?: { status?: string; result?: { entries?: unknown[] } }[] } | undefined;
	const operation = content?.results?.[0];
	if (operation?.status !== "success" || !Array.isArray(operation.result?.entries)) throw new Error("Hugging Face returned an unreadable paper response.");
	const results: Search["results"] = operation.result.entries.map((value) => {
		const e = value as { type?: unknown; name?: unknown; title?: unknown };
		if (e.type !== "paper" || typeof e.name !== "string" || !/^\d{4}\.\d{4,5}(?:v\d+)?$/.test(e.name) || typeof e.title !== "string") throw new Error("Hugging Face returned an unreadable paper entry.");
		return { id: e.name, title: e.title, url: `https://huggingface.co/papers/${e.name}` };
	});
	return { results, text: results.map((p, i) => `${i + 1}. ${p.title} · ${p.id}`).join("\n") || reply.text.trim() };
}
async function getJson(url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
	const response = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]) });
	if (!response.ok) throw new Error(`Hugging Face returned HTTP ${response.status}.`);
	const value: unknown = await response.json();
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Hugging Face returned an invalid configuration.");
	return value as Record<string, unknown>;
}

/** One pair per teacher turn/researcher run; both tools spend the same cap. */
export function createHubTools() {
	let used = 0;
	function tool<S extends TSchema>(name: string, description: string, schema: S, run: (input: Static<S>, signal?: AbortSignal) => Promise<{ text: string; details: HubLookup }>): AgentTool<S> {
		const execute = serverExecute(name, schema, async (input, { signal }) => {
			signal?.throwIfAborted();
			tenantScoped("__lhHubAccess", () => true);
			if (used >= 5) throw new Error("The Hugging Face lookup is unavailable: at most 5 Hub lookups per turn.");
			used++;
			try { return await run(input, signal); }
			catch (error) {
				if (signal?.aborted) throw new Error("Operation aborted");
				throw new Error(`The Hugging Face lookup is unavailable: ${error instanceof Error ? error.message : String(error)}`);
			}
		});
		return { name, label: name, description, parameters: schema, execute: (id, input, signal) => {
			if (!Value.Check(schema, input) || (name === "hub_model" && (input as Static<typeof ModelInput>).repo.split("/").some((segment) => segment === "." || segment === ".."))) return Promise.resolve(invalidInputResult(name, ["The arguments do not match the tool's input schema."]));
			return execute(id, input, signal);
		} };
	}
	return {
		hub_search: tool("hub_search", SEARCH_DESCRIPTION, SearchInput, async ({ kind, query, limit = 5 }, signal) => {
			const started = Date.now();
			const reply = kind === "papers"
				? await callMcpToolResult("huggingface", "hf_fs", { operations: [{ cmd: "search", args: ["hf://papers", query, "--limit", String(limit)] }] }, signal)
				: await callMcpTool("huggingface", "hub_repo_search", { query, repo_types: [kind === "models" ? "model" : "dataset"], limit }, signal);
			const parsed = typeof reply === "string" ? repositoryResults(reply, kind as "models" | "datasets") : paperResults(reply);
			if (parsed.results.length > limit) throw new Error("Hugging Face returned more results than requested.");
			return { text: parsed.text, details: { kind: "search", what: kind, query, results: parsed.results, ms: Date.now() - started } };
		}),
		hub_model: tool("hub_model", MODEL_DESCRIPTION, ModelInput, async ({ repo }, signal) => {
			const started = Date.now();
			const url = `https://huggingface.co/${repo}`;
			const config = await getJson(`${url}/resolve/main/config.json`, signal);
			const fields: Extract<HubLookup, { kind: "model" }>["fields"] = [];
			for (const [label, ...keys] of FIELDS) for (const key of keys) {
				const value = config[key];
				if (typeof value === "number" && Number.isFinite(value) || typeof value === "string") fields.push({ label, key, value });
			}
			// The probe exposes a README, not a service-provided summary. Do
			// not invent cardSummary or architecture numbers from prose.
			try { await callMcpTool("huggingface", "hf_fs", { operations: [{ cmd: "cat", args: [`hf://models/${repo}/README.md`] }] }, signal); }
			catch { signal?.throwIfAborted(); }
			let metadata: Record<string, unknown> = {};
			try { metadata = await getJson(`https://huggingface.co/api/models/${repo}`, signal); }
			catch { signal?.throwIfAborted(); }
			const safetensors = metadata.safetensors as { total?: unknown } | undefined;
			const params = typeof safetensors?.total === "number" && Number.isSafeInteger(safetensors.total) && safetensors.total >= 0 ? safetensors.total : undefined;
			return { text: [repo, ...fields.map((f) => `${f.label} (${f.key}): ${f.value}`), ...(params === undefined ? [] : [`Parameters: ${params}`]), url].join("\n"), details: { kind: "model", repo, url, fields, ...(params === undefined ? {} : { params }), ms: Date.now() - started } };
		}),
	};
}
