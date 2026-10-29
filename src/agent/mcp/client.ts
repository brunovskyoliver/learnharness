/** The MCP client layer (feature 007): one lazily connected client per
 *  tenant and server, the turn's abort signal on every call, and one
 *  reconnect when the connection drops (Wolfram's server sends HTTP/2
 *  GOAWAY now and then — research R4). pi-mcp loads on the first call,
 *  never at startup (Principle VIII). In hosted mode a call outside a
 *  tenant throws (tenantScoped), so tenants never share a connection. */
import type { McpClient, McpTransport } from "@earendil-works/pi-mcp";
import { tenantScoped } from "../../../config.ts";
import { MCP_SERVERS, type McpServerEntry, type McpServerId } from "./servers.ts";

/** The server's own tool failure: not a connection problem, never retried. */
export class McpToolError extends Error {}

/** The server could not be reached (after one reconnect) or timed out. */
export class McpUnavailableError extends Error {}

type TransportFactory = (server: McpServerEntry) => McpTransport | Promise<McpTransport>;
let transportFactory: TransportFactory | null = null;

/** Test seam: in-memory transports instead of the network. null restores. */
export function setMcpTransportFactory(factory: TransportFactory | null): void {
	transportFactory = factory;
}

interface Slot { client?: Promise<McpClient> }

function slots(): Map<McpServerId, Slot> {
	return tenantScoped("__lhMcpClients", () => new Map<McpServerId, Slot>());
}

async function connect(server: McpServerEntry, slot: Slot): Promise<McpClient> {
	const mcp = await import("@earendil-works/pi-mcp");
	const client = new mcp.McpClient({ name: "learnharness", version: "1", requestTimeoutMs: server.timeoutMs });
	const transport = transportFactory ? await transportFactory(server) : new mcp.StreamableHttpTransport({ url: server.url });
	await client.connect(transport);
	const self = slot.client;
	// A dropped connection clears the slot so the next call reconnects.
	client.onClose(() => { if (slot.client === self) slot.client = undefined; });
	return client;
}

function aborted(signal?: AbortSignal): boolean {
	return signal?.aborted === true;
}

/** Call one tool on a listed server, retaining optional structured data. */
export async function callMcpToolResult(serverId: McpServerId, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<{ text: string; structuredContent?: unknown }> {
	const server: McpServerEntry | undefined = MCP_SERVERS[serverId];
	if (!server) throw new Error(`Unknown MCP server "${String(serverId)}".`);
	const map = slots();
	let lastError: unknown;
	for (let attempt = 0; attempt < 2; attempt++) {
		if (aborted(signal)) throw new Error("Operation aborted");
		let slot = map.get(serverId);
		if (!slot) map.set(serverId, (slot = {}));
		const pending = (slot.client ??= connect(server, slot));
		try {
			const client = await pending;
			const result = await client.callTool(tool, args, { signal, timeoutMs: server.timeoutMs });
			const text = result.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
			if (result.isError) throw new McpToolError(text || `${server.label} reported an error.`);
			return { text, structuredContent: result.structuredContent };
		} catch (error) {
			if (error instanceof McpToolError) throw error;
			if (aborted(signal)) throw new Error("Operation aborted");
			if (slot.client === pending) slot.client = undefined;
			void pending.then((c) => c.close()).catch(() => {});
			lastError = error;
			// A timeout already spent the budget; only a dropped or failed
			// connection is worth one fresh attempt.
			if ((error as Error)?.name === "McpTimeoutError" || /timed out/i.test(String((error as Error)?.message))) break;
		}
	}
	const reason = lastError instanceof Error ? lastError.message : String(lastError);
	throw new McpUnavailableError(`${server.label} is unavailable: ${reason}`);
}

/** Existing text-only API used by the Wolfram tools. */
export async function callMcpTool(serverId: McpServerId, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
	return (await callMcpToolResult(serverId, tool, args, signal)).text;
}
