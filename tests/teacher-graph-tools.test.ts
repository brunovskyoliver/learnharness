import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { GraphNode, GraphChain } from "../src/core/contracts/graph.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-teacher-graph-"));
process.env.LH_DATA_DIR = dir;
const { runAsTenant } = await import("../config.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { graphStore } = await import("../src/store/graph.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { teacherGraphTools } = await import("../src/agent/tools/teacher-graph.ts");
const { createTeacherTools, createProberTools } = await import("../src/agent/tools.ts");
const { startFollowupSession } = await import("../src/server/followup-sessions.ts");
const { queryGraph, explainGraphConnection } = await import("../src/core/graph-queries.ts");
const { newThinkingMessage } = await import("../src/core/native-messages.ts");
const { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } = await import("@earendil-works/pi-ai");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const NAMES = ["search_graph", "inspect_node", "explain_connection", "read_node_sources", "suggest_connections", "practice_nodes"];
const stamp = "2026-10-26T00:00:00Z";
function node(id: string, statement: string, source: string): GraphNode {
	return { id, name: id, statement, aliases: [], createdAt: stamp, provenance: [{ chatId: source, messageId: "teacher1" }] };
}
function chain(id: string, premises: string[], conclusion: string, source: string): GraphChain {
	return { id, premises, conclusion, createdAt: stamp, provenance: [{ chatId: source, messageId: "teacher1" }] };
}
function seed() {
	const source = chatStore.createChat("ML source");
	const nodes = [node("a", "Weighted predictions", source.id), node("b", "Residual error", source.id), node("c", "Squared loss", source.id), node("d", "Loss gradient", source.id), node("e", "Weight update", source.id), node("f", "Average loss", source.id), node("g", "Gradient direction", source.id), node("h", "Unrelated topic", source.id)];
	nodes[0]!.aliases.push("Linear score");
	for (const n of nodes) graphStore.appendNode(n);
	const chains = [chain("arg_ac", ["a", "b"], "c", source.id), chain("arg_cd", ["c", "b"], "d", source.id), chain("arg_de", ["d"], "e", source.id), chain("arg_cf", ["c"], "f", source.id), chain("arg_cycle", ["e"], "a", source.id), chain("arg_dangling", ["missing", "a"], "g", source.id)];
	for (const c of chains) graphStore.appendChain(c);
	graphStore.appendChain({ ...chains[0]!, id: "arg_duplicate", provenance: [{ chatId: source.id, messageId: "teacher2" }] });
	return { source, tools: teacherGraphTools({ chatStore, graphStore }) };
}
async function call(tools: ReturnType<typeof teacherGraphTools>, name: string, args: unknown) {
	return (await tools[name]!.execute(`call-${name}`, args)).details as any;
}

describe("teacher graph queries", () => {
	it("searches merged claims and aliases with stable pagination, without writing graph data", async () => runAsTenant("graph_search", async () => {
		const { tools } = seed();
		graphStore.appendNode({ ...node("a", "Alternative weighted sum", "other"), aliases: [] });
		const before = JSON.stringify([graphStore.readNodes(), graphStore.readChains()]);
		assert.equal((await call(tools, "search_graph", { query: "LINEAR SCORE" })).items[0].id, "a");
		assert.equal((await call(tools, "search_graph", { query: "Alternative weighted sum" })).items[0].id, "a");
		const first = await call(tools, "search_graph", { query: "loss", limit: 1 });
		assert.equal(first.total, 3); assert.equal(first.nextOffset, 1);
		const second = await call(tools, "search_graph", { query: "loss", offset: first.nextOffset, limit: 1 });
		assert.notEqual(first.items[0].id, second.items[0].id);
		assert.equal((await call(tools, "search_graph", { query: "[literal unmatched]" })).total, 0);
		assert.equal(JSON.stringify([graphStore.readNodes(), graphStore.readChains()]), before);
	}));

	it("shows merged arguments with all co-premises and anchored provenance", async () => runAsTenant("graph_inspect", async () => {
		const { tools, source } = seed();
		const result = await call(tools, "inspect_node", { nodeId: "c" });
		assert.equal(result.incoming.total, 1);
		assert.deepEqual(result.incoming.items[0].jointPremises.map((n: GraphNode) => n.id), ["a", "b"]);
		assert.equal(result.incoming.items[0].sources.length, 2);
		assert.equal(result.node.sources[0].url, `/chat/${source.id}#message-teacher1`);
		assert.equal(result.omittedIncompleteChains, 1);
		await assert.rejects(call(tools, "inspect_node", { nodeId: "missing" }), /Unknown graph node/);
	}));

	it("finds shortest directed paths, preserves additional premises, and terminates on cycles", async () => runAsTenant("graph_paths", async () => {
		const { tools } = seed();
		const found = await call(tools, "explain_connection", { fromNodeId: "a", toNodeId: "e" });
		assert.equal(found.status, "found");
		assert.deepEqual(found.path.map((c: GraphChain) => c.id), ["arg_ac", "arg_cd", "arg_de"]);
		assert.deepEqual(found.path[1].jointPremises.map((n: GraphNode) => n.id), ["c", "b"]);
		assert.match(found.interpretation, /does not establish entailment/);
		assert.equal((await call(tools, "explain_connection", { fromNodeId: "a", toNodeId: "e", maxSteps: 2 })).status, "not_found_within_limit");
		assert.equal((await call(tools, "explain_connection", { fromNodeId: "a", toNodeId: "h" })).status, "not_found_within_limit");
		assert.equal((await call(tools, "explain_connection", { fromNodeId: "a", toNodeId: "a" })).path.length, 0);
	}));

	it("reports the traversal budget rather than claiming no connection exists", () => {
		const nodes = Array.from({ length: 10_003 }, (_, i) => node(`n${i}`, `claim ${i}`, "source"));
		const chains = nodes.slice(1).map((n, i) => chain(`arg_${String(i).padStart(5, "0")}`, ["n0"], n.id, "source"));
		const graph = queryGraph({ nodes, chains });
		assert.equal(explainGraphConnection(graph, "n0", "n1").status, "found");
		const result = explainGraphConnection(graph, "n0", "n10002");
		assert.equal(result.status, "search_limit"); assert.equal(result.examinedLinks, 10_000);
	});

	it("returns evidence for proposed connections without storing new implications", async () => runAsTenant("graph_suggestions", async () => {
		const { tools } = seed();
		const before = graphStore.readChains();
		const result = await call(tools, "suggest_connections", { nodeId: "d" });
		assert.equal(result.status, "proposed_connections");
		assert.equal(result.items[0].node.id, "f");
		assert.deepEqual(result.items[0].sharedPrerequisites.map((n: GraphNode) => n.id), ["c"]);
		assert.ok(result.items.some((candidate: any) => candidate.node.id === "g" && candidate.sharedWords.includes("gradient")));
		assert.ok(!result.items.some((candidate: any) => ["b", "c", "e"].includes(candidate.node.id)));
		assert.deepEqual(graphStore.readChains(), before);
	}));

	it("reads learner evidence while omitting keys, solutions and agent thinking", async () => runAsTenant("graph_sources", async () => {
		const { source, tools } = seed();
		const teacher = { ...fauxAssistantMessage([fauxText("Teacher explanation."), fauxThinking("HIDDEN_REASONING"), fauxToolCall("quiz", { question: "Which value?", correctAnswer: "HIDDEN_KEY", explanation: "HIDDEN_EXPLANATION" }, { id: "question1" }), fauxToolCall("problem", { statement: "A pending problem.", modelSolution: "HIDDEN_SOLUTION" }, { id: "problem1" })], { stopReason: "toolUse" }), id: "teacher1" } as LhMessage;
		const answer = { id: "answer1", role: "toolResult", toolName: "quiz", toolCallId: "question1", isError: false, content: [{ type: "text", text: "HIDDEN_RAW_RESULT" }], details: { kind: "quiz", questionText: "Which value?", dontKnow: false, answers: [{ index: 2, label: "My actual answer", value: "mine" }], thinking: "My reasoning", readingThinking: "My reading thoughts", correct: false, confidence: 35, correctIndices: [1], explanation: "HIDDEN_EXPLANATION", committed: "HIDDEN_COMMITMENT", answeredAt: stamp }, timestamp: 2 } as LhMessage;
		chatStore.saveMessages(source.id, [teacher, answer, newThinkingMessage("problem1", "My practice reasoning")]);
		const index = await call(tools, "read_node_sources", { nodeId: "a" });
		assert.equal(index.items[0].sourceId, source.id);
		const result = await call(tools, "read_node_sources", { nodeId: "a", sourceId: source.id });
		const serialized = JSON.stringify(result);
		assert.ok(result.anchorFound);
		for (const text of ["My actual answer", "My reading thoughts", "My practice reasoning", "Teacher explanation."]) assert.ok(serialized.includes(text));
		assert.ok(!serialized.includes("HIDDEN_"));
		assert.equal(result.messages[1].speaker, "learner");
		assert.equal((await call(tools, "read_node_sources", { nodeId: "a", sourceId: source.id, limit: 1 })).nextOffset, 1);
		await assert.rejects(call(tools, "read_node_sources", { nodeId: "a", sourceId: "unrelated" }), /not recorded/);
	}));

	it("returns imported file labels and missing-source status without opening files", async () => runAsTenant("graph_notes", async () => {
		const { tools } = seed();
		graphStore.appendNode(node("notes", "Imported claim", "src_notes"));
		graphStore.upsertSource({ id: "src_notes", filePath: "/outside/never-open-this-file.md", importedAt: stamp });
		const result = await call(tools, "read_node_sources", { nodeId: "notes", sourceId: "src_notes" });
		assert.equal(result.excerptAvailable, false);
		assert.equal(result.references[0].filePath, "/outside/never-open-this-file.md");
		graphStore.appendNode(node("missing_source", "Deleted source claim", "deleted"));
		assert.equal((await call(tools, "read_node_sources", { nodeId: "missing_source", sourceId: "deleted" })).references[0].kind, "unavailable");
	}));

	it("registers queries only for a graph-enabled teacher and practice only with startup wiring", () => runAsTenant("graph_registry", () => {
		const { source } = seed();
		const ctx = { chatId: source.id, chatStore, jobStore, spawn: () => {} };
		const bare = createTeacherTools(ctx);
		for (const name of NAMES) assert.equal(bare[name], undefined);
		const enabled = createTeacherTools({ ...ctx, graphStore });
		for (const name of NAMES.slice(0, 5)) assert.ok(enabled[name]);
		assert.equal(enabled.practice_nodes, undefined);
		const prober = createProberTools({ ...ctx, graphStore, deliver: () => {} });
		for (const name of NAMES) assert.equal(prober[name], undefined);
	}));

	it("starts practice with canonical ids and complete chains, preserving retry identity", async () => runAsTenant("graph_practice", async () => {
		const { source } = seed();
		let starts = 0;
		const tools = teacherGraphTools({ chatStore, graphStore, startFollowup: (id, input) => startFollowupSession({ chatId: source.id, chatStore, startTurn: async () => { starts++; return Response.json({ ok: true }); } }, id, input) });
		const args = { nodeIds: ["a", "b", "c"], title: "Selected practice", goal: "Apply the claims. Withhold intermediate results." };
		const result = await call(tools, "practice_nodes", args);
		const child = chatStore.getChat(result.id)!;
		assert.equal(child.kind, "practice"); assert.equal(child.messages.length, 2);
		const marker = child.messages[1]!;
		assert.equal(marker.role === "custom" && marker.customType, "graph-context");
		assert.deepEqual(marker.role === "custom" && (marker.details as any).propositions.map((p: any) => p.id), ["a", "b", "c"]);
		assert.ok(String(marker.content).includes("a, b → c"));
		assert.equal((await call(tools, "practice_nodes", args)).id, result.id);
		assert.equal(starts, 1);
		const count = chatStore.listChats().length;
		await assert.rejects(call(tools, "practice_nodes", { ...args, nodeIds: ["missing"] }), /Unknown graph node/);
		assert.equal(chatStore.listChats().length, count);
	}));

	it("reads the active tenant at execution time and refuses foreign node ids", async () => {
		await runAsTenant("graph_tenant_a", async () => { seed(); });
		const tools = teacherGraphTools({ chatStore, graphStore });
		await runAsTenant("graph_tenant_b", async () => {
			await Promise.resolve();
			assert.equal((await call(tools, "search_graph", { query: "loss" })).total, 0);
			await assert.rejects(call(tools, "inspect_node", { nodeId: "a" }), /Unknown graph node/);
		});
		await runAsTenant("graph_tenant_a", async () => assert.equal((await call(tools, "search_graph", { query: "loss" })).total, 3));
	});

	it("keeps subscription automatic-use permission checks for practice with two context markers", async () => runAsTenant("graph_background", async () => {
		const { source } = seed();
		chatStore.saveSettings(source.id, { model: { provider: "chatgpt", id: "test-model" } });
		const { handleChatInput } = await import("../src/server/chat-handler.ts");
		const tools = teacherGraphTools({ chatStore, graphStore, startFollowup: (id, input) => startFollowupSession({ chatId: source.id, chatStore, startTurn: (child) => handleChatInput(child, { type: "continue" }) }, id, input) });
		const result = await call(tools, "practice_nodes", { nodeIds: ["a", "b", "c"], title: "Practice", goal: "Practice these claims." });
		assert.equal(result.startup.state, "failed");
		assert.match(result.startup.error, /Background use is off/);
		assert.equal(chatStore.getChat(result.id)?.messages.length, 2);
	}));
});
