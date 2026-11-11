/** Feature 029 (FR-013, research R2): the MCP SDK loads on demand, inside
 * createToolBridge, never through a static import on the server's startup
 * path. Checks the server import graph with esbuild, without Next or output. */
import assert from "node:assert/strict";
import test from "node:test";
import { build, type ImportKind } from "esbuild";

const SDK = /^@modelcontextprotocol\/sdk(?:\/|$)/;

async function sdkEdges(entry: string): Promise<{ importer: string; path: string; kind: ImportKind }[]> {
	const edges: { importer: string; path: string; kind: ImportKind }[] = [];
	await build({
		entryPoints: [entry], bundle: true, write: false, metafile: true,
		platform: "node", format: "esm", splitting: true,
		outdir: process.env.TMPDIR ?? "/tmp",
		logLevel: "silent",
		plugins: [{ name: "packages-external-record-sdk", setup(builder) {
			builder.onResolve({ filter: /^[^./]/ }, (args) => {
				// The repo's own "@/…" alias resolves through tsconfig paths.
				if (args.path.startsWith("@/")) return undefined;
				if (SDK.test(args.path)) edges.push({ importer: args.importer, path: args.path, kind: args.kind });
				return { path: args.path, external: true };
			});
		} }],
	});
	return edges;
}

for (const entry of ["src/agent/models.ts", "src/server/index.ts"]) {
	test(`${entry} reaches @modelcontextprotocol/sdk only through dynamic imports`, async () => {
		for (const edge of await sdkEdges(entry)) {
			assert.equal(edge.kind, "dynamic-import", `${edge.importer} imports ${edge.path} statically (${edge.kind})`);
		}
	});
}

// Control: the check sees the bridge's on-demand load, so an empty result
// above means "no static path", not "the SDK was never looked at".
test("the tool bridge's on-demand SDK load is visible to the check", async () => {
	const edges = await sdkEdges("src/agent/claude-code/stream.ts");
	assert.ok(edges.length > 0, "stream.ts → tool-bridge.ts → SDK edges expected");
	for (const edge of edges) assert.equal(edge.kind, "dynamic-import", `${edge.importer} imports ${edge.path} statically (${edge.kind})`);
});
