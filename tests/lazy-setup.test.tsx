import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import { LazySetupDialog } from "../components/lazy-setup-dialog.tsx";

test("closed setup does not render or start the deferred dialog", () => {
	assert.equal(renderToStaticMarkup(<LazySetupDialog open={false} onClose={() => {}} onDone={() => {}} />), "");
});

for (const entry of ["components/home.tsx", "components/new-session.tsx"]) {
	test(`${entry} defers setup and settings presentation until requested`, async () => {
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
				assert.doesNotMatch(input, /components\/(?:setup-dialog|settings\/(?:keys-section|agent-section))\.tsx$/, `${input} entered startup`);
				assert.doesNotMatch(input, /(?:components\/settings\/connection-dialog\.tsx)/, `${input} entered startup`);
			}
			for (const imported of output.imports) if (imported.kind === "import-statement" && !imported.external) walk(imported.path);
		}
		walk(root[0]);
	});
}
