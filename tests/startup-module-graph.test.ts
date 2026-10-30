/** Check the browser import graph without invoking Next or writing build output. */
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

for (const entry of ["components/sidebar.tsx", "components/home.tsx", "components/graph-view.tsx"]) {
	test(`${entry} keeps schema engines and math rendering outside its static startup graph`, async () => {
		const { metafile } = await build({
			entryPoints: [entry], bundle: true, write: false, metafile: true,
			platform: "browser", format: "esm", splitting: true,
			outdir: process.env.TMPDIR ?? "/tmp",
			external: ["react", "react-dom", "react-dom/*", "next", "next/*", "@clerk/nextjs"],
			// These are the explicit graph download boundaries. Keep their
			// implementations external here: esbuild otherwise co-locates a
			// shared runtime helper with D3 in a synthetic common chunk, which
			// tests its chunk placement rather than this static module graph.
			plugins: [{ name: "graph-download-boundaries", setup(builder) {
				builder.onResolve({ filter: /\/(?:graph-canvas|graph-layout-engine)\.ts$/ }, (args) => args.kind === "dynamic-import" ? { path: args.path, external: true } : undefined);
			} }],
		});
		const entryOutput = Object.entries(metafile.outputs).find(([, output]) => output.entryPoint === entry);
		assert.ok(entryOutput);
		const visited = new Set<string>();
		const walk = (path: string) => {
			if (visited.has(path)) return;
			visited.add(path);
			const output = metafile.outputs[path];
			if (!output) return; // External framework import.
			for (const [input, attribution] of Object.entries(output.inputs)) {
				if (attribution.bytesInOutput === 0) continue;
				assert.doesNotMatch(input, /node_modules\/(?:typebox|katex)\//, `${input} entered initial JS`);
				assert.doesNotMatch(input, /node_modules\/(?:mdast-util-from-markdown|micromark[^/]*)\//, `${input} entered startup JS without a Markdown surface`);
				assert.doesNotMatch(input, /components\/library\//, `${input} entered startup JS; the Library loads with its own route`);
				if (entry === "components/graph-view.tsx") assert.doesNotMatch(input, /(?:components\/graph-canvas\.ts|src\/core\/layout\.ts|node_modules\/d3-[^/]+\/)/, `${input} entered the empty graph's static JS`);
			}
			for (const imported of output.imports) if (imported.kind === "import-statement" && !imported.external) walk(imported.path);
		};
		walk(entryOutput[0]);
	});
}
