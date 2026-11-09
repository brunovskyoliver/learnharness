import assert from "node:assert/strict";
import { it } from "node:test";
import { createDemoLibCache, demoLibUrl, DEMO_LIB_FILES, isDemoLibFile } from "../components/artifacts/demo-lib-cache.ts";

function counting(body: (url: string) => Response | Promise<Response>) {
	const calls: string[] = [];
	const fetcher = (async (url: RequestInfo | URL) => { calls.push(String(url)); return body(String(url)); }) as typeof fetch;
	return { calls, fetcher };
}

it("allows exactly the kit files of the bridge contract", () => {
	assert.deepEqual([...DEMO_LIB_FILES], ["runtime.js", "vega.js", "plotly.js", "flow.js", "flow.css"]);
	for (const file of DEMO_LIB_FILES) assert.ok(isDemoLibFile(file));
	for (const bad of ["", "plotly", "../auth.json", "runtime.js?x", "/demo-kit/vega.js", "VEGA.JS", 1, null, undefined, {}]) assert.equal(isDemoLibFile(bad), false);
});

it("never fetches a file outside the allow-list", async () => {
	const { calls, fetcher } = counting(() => new Response("x"));
	const cache = createDemoLibCache({ fetcher, version: "abc" });
	await assert.rejects(cache.get("../../auth.json"), /could not load/);
	await assert.rejects(cache.get("plotly-light.js"), /could not load/);
	assert.deepEqual(calls, []);
});

it("fetches the versioned URL, once per file across concurrent callers", async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const { calls, fetcher } = counting(async (url) => { await gate; return new Response(`code of ${url}`); });
	const cache = createDemoLibCache({ fetcher, version: "1a2b3c" });
	const waiting = [cache.get("plotly.js"), cache.get("plotly.js"), cache.get("vega.js"), cache.get("plotly.js")];
	release();
	const codes = await Promise.all(waiting);
	assert.deepEqual(calls, ["/demo-kit/plotly.js?v=1a2b3c", "/demo-kit/vega.js?v=1a2b3c"]);
	assert.equal(codes[0], "code of /demo-kit/plotly.js?v=1a2b3c");
	assert.equal(codes[3], codes[0]);
	assert.equal(await cache.get("plotly.js"), codes[0]);
	assert.equal(calls.length, 2);
});

it("uses the plain URL when the kit has no version", () => {
	assert.equal(demoLibUrl("flow.css", ""), "/demo-kit/flow.css");
	assert.equal(demoLibUrl("flow.css", "v1"), "/demo-kit/flow.css?v=v1");
});

it("drops a failed download so the next plot retries", async () => {
	let fail = true;
	const { calls, fetcher } = counting(() => (fail ? new Response("nope", { status: 503 }) : new Response("vega code")));
	const cache = createDemoLibCache({ fetcher, version: "v" });
	await assert.rejects(cache.get("vega.js"), /could not load vega\.js/);
	fail = false;
	assert.equal(await cache.get("vega.js"), "vega code");
	assert.equal(calls.length, 2);

	const offline = createDemoLibCache({ fetcher: (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch, version: "v" });
	await assert.rejects(offline.get("runtime.js"), /could not load runtime\.js/);
});
