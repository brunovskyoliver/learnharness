import assert from "node:assert/strict";
import { it } from "node:test";
import { buildInlinedDemoSrcDoc, DEMO_BRIDGE_SCRIPT, inlineDemoKit } from "../components/artifacts/demo-card.tsx";
import { kitDemoHtml } from "../src/core/demo-kit-document.ts";
import type { DemoLibFile } from "../components/artifacts/demo-lib-cache.ts";

function libs(code: Partial<Record<DemoLibFile, string>>) {
	const asked: string[] = [];
	const getLib = async (file: DemoLibFile) => { asked.push(file); const c = code[file]; if (c === undefined) throw new Error(`could not load ${file}`); return c; };
	return { asked, getLib };
}

it("replaces each /demo-kit/ script and the flow stylesheet with inline code", async () => {
	const { asked, getLib } = libs({ "vega.js": "window.vega={v:1}", "plotly.js": "window.Plotly={p:1}", "flow.css": ".react-flow{color:red}", "flow.js": "window.LHFlow={}" });
	const html = `<!doctype html><html><head><link rel="stylesheet" href="/demo-kit/flow.css"><script src="/demo-kit/vega.js"></script></head><body>
<script defer src='/demo-kit/plotly.js' id="p"></script><script src="/demo-kit/flow.js?v=old"></script><script src="/demo-kit/vega.js"></script></body></html>`;
	const out = await inlineDemoKit(html, getLib);
	assert.doesNotMatch(out, /\/demo-kit\//);
	assert.match(out, /<style>\.react-flow\{color:red\}<\/style>/);
	assert.equal(out.split("<script>window.vega={v:1}</script>").length, 3);
	assert.match(out, /<script defer id="p">window\.Plotly=\{p:1\}<\/script>/);
	assert.match(out, /<script>window\.LHFlow=\{\}<\/script>/);
	assert.deepEqual(asked.sort(), ["flow.css", "flow.js", "plotly.js", "vega.js"], "one request per file");
});

it("escapes closing tags inside inlined code", async () => {
	const { getLib } = libs({ "runtime.js": 'var a="</script><b>",b="</SCRIPT >";', "flow.css": '.x::after{content:"</style>"}' });
	const out = await inlineDemoKit('<body><link href="/demo-kit/flow.css" rel=stylesheet><script src="/demo-kit/runtime.js"></script></body>', getLib);
	assert.match(out, /<script>var a="<\\\/script><b>",b="<\\\/SCRIPT >";<\/script>/);
	assert.match(out, /<style>\.x::after\{content:"<\\\/style>"\}<\/style>/);
	assert.equal(out.match(/<\/script/gi)!.length, 1, "only the element's own closing tag");
});

it("leaves other tags and non-kit URLs untouched", async () => {
	const { asked, getLib } = libs({});
	const html = [
		'<script src="https://cdn.example/plotly.js"></script>',
		'<script src="/other/vega.js"></script>',
		'<script src="/demo-kit/unknown.js"></script>',
		'<script src="/demo-kit/../auth.json"></script>',
		'<link rel="preload" href="/demo-kit/flow.css">',
		'<link rel="stylesheet" href="/demo-kit/vega.js">',
		'<script>const tag = \'<script src="/demo-kit/vega.js"></\' + \'script>\';</script>',
		'<!-- <script src="/demo-kit/plotly.js"></script> -->',
		'<style>/* <link rel="stylesheet" href="/demo-kit/flow.css"> */</style>',
		'<script src="/demo-kit/vega.js">window.inline = 1</script>',
		'<img src="/demo-kit/runtime.js">',
	].join("\n");
	assert.equal(await inlineDemoKit(html, getLib), html);
	assert.deepEqual(asked, []);
});

it("keeps the bridge script last and inlines the kit runtime of a kit demo", async () => {
	const { getLib } = libs({ "runtime.js": "window.__lhKit={}" });
	const html = kitDemoHtml({ panels: [{ type: "note", text: "hi" }] } as never);
	const out = await buildInlinedDemoSrcDoc(html, getLib);
	assert.doesNotMatch(out, /\/demo-kit\//);
	assert.ok(out.indexOf("window.__lhKit={}") < out.indexOf(DEMO_BRIDGE_SCRIPT));
	assert.ok(out.trimEnd().endsWith(`${DEMO_BRIDGE_SCRIPT}</body></html>`));
	assert.match(out, /id="lh-kit-spec"/);
});

it("fails when a referenced kit file cannot be fetched", async () => {
	const { getLib } = libs({});
	await assert.rejects(buildInlinedDemoSrcDoc('<body><script src="/demo-kit/plotly.js"></script></body>', getLib), /could not load plotly\.js/);
	assert.equal(await buildInlinedDemoSrcDoc("<body><p>no kit</p></body>", getLib), (await import("../components/artifacts/demo-card.tsx")).buildDemoSrcDoc("<body><p>no kit</p></body>"));
});
