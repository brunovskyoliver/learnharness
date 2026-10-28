/** The MCP servers LearnHarness's own agents may use (feature 007). A
 *  fixed list by owner decision (2026-10-28): adding a server takes a spec. */

export interface McpServerEntry {
	/** Plain name for messages ("The Wolfram check is unavailable…"). */
	label: string;
	url: string;
	transport: "streamable-http";
	/** Per request; stays under the 30 s tool guard (tool-execute.ts). */
	timeoutMs: number;
}

export const MCP_SERVERS = {
	/** Wolfram Cloud MCP: free, no authentication (support.wolfram.com/75237). */
	wolfram: {
		label: "Wolfram",
		url: "https://agenttools.wolfram.com/mcp",
		transport: "streamable-http",
		timeoutMs: 25_000,
	},
} as const satisfies Record<string, McpServerEntry>;

export type McpServerId = keyof typeof MCP_SERVERS;
