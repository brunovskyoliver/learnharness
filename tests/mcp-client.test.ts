/**
 * The MCP client layer (feature 007) against an in-memory MCP server: text
 * content comes back; a dropped connection reconnects once; two failures
 * are "unavailable"; a server-side tool error is never retried; abort
 * wins; hosted mode refuses a call outside a tenant. No network.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createInMemoryTransportPair, type InMemoryTransport } from "@earendil-works/pi-mcp/testing";
import { callMcpTool, McpToolError, McpUnavailableError, setMcpTransportFactory } from "../src/agent/mcp/client.ts";
import { runAsTenant } from "../config.ts";

type Reply = { text: string; isError?: boolean } | "drop" | "hang";

/** A scripted MCP server: answers initialize, then each tools/call with
 *  the next reply ("drop" closes the connection mid-call). */
function fakeServer(replies: Reply[], seen: unknown[] = [], connects = { n: 0 }) {
	return () => {
		connects.n++;
		const { client, server } = createInMemoryTransportPair();
		const send = (m: unknown) => void (server as InMemoryTransport).send(m as never);
		server.onMessage((raw) => {
			const m = raw as { id?: number; method?: string; params?: { name?: string; arguments?: unknown } };
			if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } } });
			else if (m.method === "tools/call") {
				seen.push(m.params);
				const reply = replies.shift() ?? { text: "no script" };
				if (reply === "drop") void server.close();
				else if (reply === "hang") return;
				else send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: reply.text }], isError: reply.isError ?? false } });
			}
		});
		void server.start();
		return client;
	};
}

// Fresh client registry per test (outside a tenant the slot is global).
function resetSlots() {
	delete (globalThis as Record<string, unknown>).__lhMcpClients;
}

afterEach(() => {
	setMcpTransportFactory(null);
	resetSlots();
	delete process.env.LH_HOSTED;
});

describe("callMcpTool", () => {
	it("returns the tool's text content and sends exactly the arguments", async () => {
		const seen: unknown[] = [];
		setMcpTransportFactory(fakeServer([{ text: 'Out[1]= "OUTCOME: agreed"' }], seen));
		const text = await callMcpTool("wolfram", "WolframLanguageEvaluator", { code: "1 == 1", timeConstraint: 30 });
		assert.equal(text, 'Out[1]= "OUTCOME: agreed"');
		assert.deepEqual(seen, [{ name: "WolframLanguageEvaluator", arguments: { code: "1 == 1", timeConstraint: 30 } }]);
	});

	it("reuses one connection across calls", async () => {
		const connects = { n: 0 };
		setMcpTransportFactory(fakeServer([{ text: "a" }, { text: "b" }], [], connects));
		assert.equal(await callMcpTool("wolfram", "T", {}), "a");
		assert.equal(await callMcpTool("wolfram", "T", {}), "b");
		assert.equal(connects.n, 1);
	});

	it("reconnects once after a dropped connection", async () => {
		const connects = { n: 0 };
		setMcpTransportFactory(fakeServer(["drop", { text: "after reconnect" }], [], connects));
		assert.equal(await callMcpTool("wolfram", "T", {}), "after reconnect");
		assert.equal(connects.n, 2);
	});

	it("reports unavailable after two failures", async () => {
		setMcpTransportFactory(fakeServer(["drop", "drop"]));
		await assert.rejects(callMcpTool("wolfram", "T", {}), (e: unknown) => e instanceof McpUnavailableError && /^Wolfram is unavailable: /.test((e as Error).message));
	});

	it("reports unavailable when the connection cannot be made", async () => {
		setMcpTransportFactory(() => { throw new Error("fetch failed"); });
		await assert.rejects(callMcpTool("wolfram", "T", {}), /Wolfram is unavailable: fetch failed/);
	});

	it("does not retry a tool error from the server", async () => {
		const seen: unknown[] = [];
		setMcpTransportFactory(fakeServer([{ text: "kernel busy", isError: true }, { text: "never" }], seen));
		await assert.rejects(callMcpTool("wolfram", "T", {}), (e: unknown) => e instanceof McpToolError && (e as Error).message === "kernel busy");
		assert.equal(seen.length, 1);
	});

	it("stops when the turn is aborted", async () => {
		setMcpTransportFactory(fakeServer(["hang"]));
		const controller = new AbortController();
		const call = callMcpTool("wolfram", "T", {}, controller.signal);
		setTimeout(() => controller.abort(), 20);
		await assert.rejects(call, /Operation aborted/);
	});

	it("refuses an unknown server", async () => {
		await assert.rejects(callMcpTool("nope" as never, "T", {}), /Unknown MCP server "nope"/);
	});

	it("refuses a hosted call outside a tenant, and keeps tenants apart", async () => {
		process.env.LH_HOSTED = "1";
		const connects = { n: 0 };
		setMcpTransportFactory(fakeServer([{ text: "a" }, { text: "b" }], [], connects));
		await assert.rejects(callMcpTool("wolfram", "T", {}), /outside a tenant/);
		assert.equal(await runAsTenant("user_a", () => callMcpTool("wolfram", "T", {})), "a");
		assert.equal(await runAsTenant("user_b", () => callMcpTool("wolfram", "T", {})), "b");
		assert.equal(connects.n, 2);
	});
});
