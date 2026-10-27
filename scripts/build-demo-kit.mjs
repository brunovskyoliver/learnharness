/** Build the demo-kit runtime into public/demo-kit/ (git-ignored):
 *  runtime.js (always loaded by kit demos), vega.js, flow.js + flow.css and
 *  plotly.js (each loaded only when a panel needs it). Classic IIFE
 *  scripts: they load from a sandboxed iframe and from file:// in the
 *  headless check, where module scripts would need CORS.
 *  node scripts/build-demo-kit.mjs */
import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "demo-kit");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const common = {
	bundle: true,
	format: "iife",
	minify: true,
	target: ["chrome120", "safari17"],
	legalComments: "none",
	define: { "process.env.NODE_ENV": '"production"' },
	logLevel: "warning",
};
await Promise.all([
	build({ ...common, entryPoints: [path.join(root, "src/demo-kit/runtime.ts")], outfile: path.join(out, "runtime.js") }),
	build({ ...common, entryPoints: [path.join(root, "src/demo-kit/vega-entry.ts")], outfile: path.join(out, "vega.js") }),
	build({ ...common, entryPoints: [path.join(root, "src/demo-kit/flow-entry.tsx")], outfile: path.join(out, "flow.js"), jsx: "automatic" }),
	copyFile(path.join(root, "node_modules/plotly.js-dist-min/plotly.min.js"), path.join(out, "plotly.js")),
]);
console.log("demo kit built →", path.relative(root, out));
