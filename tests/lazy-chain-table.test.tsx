import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { LazyChainTableOverlay } from "../components/lazy-chain-table.tsx";

const props = { nodes: [], chains: [], sessions: {}, fileSources: {}, onClose: () => {} };

test("closed chain overlay has no output", () => {
	assert.equal(renderToStaticMarkup(<LazyChainTableOverlay {...props} open={false} />), "");
});

test("first chain opening immediately renders loading status and a close action", () => {
	const html = renderToStaticMarkup(<LazyChainTableOverlay {...props} open />);
	assert.match(html, /role="status"/);
	assert.match(html, /Loading chains/);
	assert.match(html, /aria-label="Close chains"/);
	assert.match(html, /absolute inset-0/);
});

for (const entry of ["components/graph-view.tsx", "components/minimal-home.tsx", "components/new-session.tsx"]) {
test(`${entry} defers the chain table and KaTeX`, async () => {
	const { metafile } = await build({
		entryPoints: [entry], bundle: true, write: false, metafile: true,
		platform: "browser", format: "esm", splitting: true,
		outdir: process.env.TMPDIR ?? "/tmp",
		external: ["react", "react-dom", "react-dom/*", "next", "next/*", "@clerk/nextjs"],
	});
	const root = Object.entries(metafile.outputs).find(([, output]) => output.entryPoint === entry);
	assert.ok(root);
	const seen = new Set<string>();
	function walk(path: string) {
		if (seen.has(path)) return;
		seen.add(path);
		const output = metafile.outputs[path];
		if (!output) return;
		for (const [input, info] of Object.entries(output.inputs)) {
			if (info.bytesInOutput === 0) continue;
			assert.doesNotMatch(input, /(?:components\/(?:chain-table|latex-glyph)\.tsx|node_modules\/katex\/)/, `${input} entered graph startup`);
		}
		for (const imported of output.imports) if (imported.kind === "import-statement" && !imported.external) walk(imported.path);
	}
	walk(root[0]);
});
}
