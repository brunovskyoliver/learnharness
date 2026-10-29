import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, describe, it } from "node:test";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "lh-paper-tests-"));
process.env.LH_DATA_DIR = root;
const { createPaperTools } = await import("../src/agent/tools/papers.ts");
const { arxivSearch } = await import("../src/agent/papers/arxiv.ts");
const { createPaperFiles } = await import("../src/store/papers.ts");
const { runAsTenant } = await import("../config.ts");
import type { PaperRead, PaperSearch } from "../src/core/lookups.ts";
const originalFetch = globalThis.fetch;
const fixture = await fs.readFile(new URL("./fixtures/papers/sample.pdf", import.meta.url));
const pdfUrl = "https://arxiv.org/pdf/1706.03762";
const s2 = { data: [{ paperId: "s2-fixture", title: "Attention Is All You Need", authors: [{ name: "Ashish Vaswani" }, { name: "Noam Shazeer" }], year: 2017, externalIds: { ArXiv: "1706.03762" }, abstract: "A synthetic abstract.", openAccessPdf: { url: pdfUrl } }] };
const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title><published>2017-06-12T17:57:34Z</published><summary>Attention &amp; tensors.</summary><author><name>Ashish Vaswani</name></author><link href="https://arxiv.org/pdf/1706.03762v7" type="application/pdf" title="pdf"/></entry></feed>`;
const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");
const cleanups: (() => Promise<void>)[] = [];
function toolsWithFiles() {
	const files = createPaperFiles();
	cleanups.push(() => files.dispose());
	return createPaperTools(files);
}
function sourceStub(urls: string[] = []) {
	globalThis.fetch = async (url) => {
		urls.push(String(url));
		if (String(url).includes("semanticscholar")) return Response.json(s2);
		if (String(url).includes("/api/query")) return new Response(atom);
		return new Response(fixture, { headers: { "content-type": "application/pdf" } });
	};
}
afterEach(async () => {
	globalThis.fetch = originalFetch;
	delete process.env.LH_HOSTED;
	for (const cleanup of cleanups.splice(0)) await cleanup();
});
after(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("paper tools", () => {
	it("parses Semantic Scholar metadata and sends only the query and fixed fields", async () => {
		const urls: string[] = [];
		sourceStub(urls);
		const result = await toolsWithFiles().paper_search.execute("s2", { query: "attention", limit: 3 }, undefined);
		const details = result.details as PaperSearch;
		assert.equal(details.source, "semantic-scholar");
		assert.equal(details.query, "attention");
		assert.deepEqual(details.results, [{ title: "Attention Is All You Need", authors: ["Ashish Vaswani", "Noam Shazeer"], year: 2017, arxivId: "1706.03762", s2Id: "s2-fixture", abstract: "A synthetic abstract.", pdfUrl, url: "https://www.semanticscholar.org/paper/s2-fixture" }]);
		const url = new URL(urls[0]!);
		assert.equal(url.origin, "https://api.semanticscholar.org");
		assert.equal(url.pathname, "/graph/v1/paper/search");
		assert.equal(url.searchParams.get("query"), "attention");
		assert.deepEqual([...url.searchParams.keys()].sort(), ["fields", "limit", "query"]);
		assert.match(text(result), /Attention Is All You Need/);
	});
	it("falls back on S2 429 and identifies the arXiv source", async () => {
		const urls: string[] = [];
		globalThis.fetch = async (url) => { urls.push(String(url)); return String(url).includes("semanticscholar") ? new Response("", { status: 429 }) : new Response(atom); };
		const r = await toolsWithFiles().paper_search.execute("fallback", { query: "attention" }, undefined);
		const d = r.details as PaperSearch;
		assert.equal(d.source, "arxiv");
		assert.equal(d.results[0]?.arxivId, "1706.03762v7");
		assert.equal(d.results[0]?.abstract, "Attention & tensors.");
		assert.equal(d.results[0]?.pdfUrl, "https://arxiv.org/pdf/1706.03762v7");
		assert.deepEqual([...new URL(urls[1]!).searchParams.keys()].sort(), ["max_results", "search_query"]);
		assert.equal(new URL(urls[1]!).searchParams.get("search_query"), 'all:"attention"');
	});
	it("keeps quotes, backslashes, Unicode and Boolean-looking text inside one literal arXiv phrase", async () => {
		const urls: string[] = [];
		globalThis.fetch = async (url) => { urls.push(String(url)); return String(url).includes("semanticscholar") ? new Response("", { status: 429 }) : new Response(atom); };
		const query = 'A "quoted" \\ path OR ti:(Échelle)';
		const result = await toolsWithFiles().paper_search.execute("literal", { query }, undefined);
		assert.equal(new URL(urls[0]!).searchParams.get("query"), query);
		assert.equal(new URL(urls[1]!).searchParams.get("search_query"), String.raw`all:"A \"quoted\" \\ path OR ti:(Échelle)"`);
		assert.equal((result.details as PaperSearch).query, query);
	});

	it("extracts only selected pages, emits the citation hint, and keeps source text out of details", async () => {
		const urls: string[] = [];
		sourceStub(urls);
		const tools = toolsWithFiles();
		await tools.paper_search.execute("find", { query: "attention" }, undefined);
		const result = await tools.paper_read.execute("read", { paper: pdfUrl, pages: "3-5" }, undefined);
		assert.match(text(result), /--- p\. 3 ---\nPage 3:/);
		assert.match(text(result), /--- p\. 4 ---\nPage 4: Scaled Dot-Product Attention/);
		assert.match(text(result), /--- p\. 5 ---/);
		assert.doesNotMatch(text(result), /--- p\. [126] ---/);
		assert.match(text(result), /Cite as \(Ashish Vaswani et al\., 2017, p\. 4\) linking https:\/\/arxiv.org\/pdf\/1706.03762#page=4/);
		const d = result.details as PaperRead;
		assert.deepEqual(d.pages, [3, 4, 5]);
		assert.equal(d.pagesUsedThisTurn, 3);
		assert.equal(d.cap, 10);
		assert.doesNotMatch(JSON.stringify(d), /Scaled Dot/);
		assert.equal(urls.at(-1), pdfUrl);
	});
	it("returns pages with the approved citation fallback when authors or year are missing", async () => {
		for (const missing of [{ authors: [] }, { year: null }]) {
			globalThis.fetch = async (url) => String(url).includes("semanticscholar")
				? Response.json({ data: [{ ...s2.data[0], ...missing, openAccessPdf: { url: "https://papers.example/fixture.pdf" } }] })
				: new Response(fixture);
			const tools = toolsWithFiles();
			await tools.paper_search.execute("find", { query: "attention" }, undefined);
			const result = await tools.paper_read.execute("read", { paper: "https://papers.example/fixture.pdf", pages: "4" }, undefined);
			assert.match(text(result), /Citation metadata is incomplete\. Cite the paper title and page link\./);
			assert.match(text(result), /Attention Is All You Need/);
			assert.match(text(result), /https:\/\/papers.example\/fixture.pdf#page=4/);
			assert.doesNotMatch(text(result), /n\.d\.|Cite as \(Attention/);
		}
	});

	it("accepts a direct arXiv id and retrieves its citation metadata", async () => {
		sourceStub();
		const result = await toolsWithFiles().paper_read.execute("direct", { paper: "1706.03762", pages: "4" }, undefined);
		assert.match(text(result), /Scaled Dot-Product Attention/);
		assert.equal((result.details as PaperRead).title, "Attention Is All You Need");
	});
	it("refuses the whole four-page call after seven pages, stating three remain", async () => {
		const urls: string[] = [];
		sourceStub(urls);
		const tools = toolsWithFiles();
		await tools.paper_search.execute("find", { query: "attention" }, undefined);
		await tools.paper_read.execute("seven", { paper: pdfUrl, pages: "1-7" }, undefined);
		const before = urls.length;
		await assert.rejects(tools.paper_read.execute("four", { paper: pdfUrl, pages: "8-11" }, undefined), /10 pages per turn.*3 pages left/);
		assert.equal(urls.length, before);
	});
	it("counts concurrent requested pages together and refuses an over-cap call", async () => {
		sourceStub();
		const tools = toolsWithFiles();
		await tools.paper_search.execute("find", { query: "attention" }, undefined);
		const results = await Promise.allSettled([tools.paper_read.execute("seven", { paper: pdfUrl, pages: "1-7" }, undefined), tools.paper_read.execute("four", { paper: pdfUrl, pages: "8-11" }, undefined)]);
		assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
		assert.match(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason), /3 pages left/);
	});
	it("reports only committed pages when a concurrent reserved read later fails", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let writes = 0;
		const tools = createPaperTools({
			write: async () => { if (++writes === 1) { await gate; throw new Error("synthetic write failure"); } return new URL("./fixtures/papers/sample.pdf", import.meta.url).pathname; },
			dispose: async () => {},
		});
		globalThis.fetch = async (url) => String(url).includes("semanticscholar") ? Response.json({ data: [{ ...s2.data[0], openAccessPdf: { url: "https://papers.example/fixture.pdf" } }] }) : new Response(fixture);
		await tools.paper_search.execute("find", { query: "attention" }, undefined);
		const failed = tools.paper_read.execute("pending", { paper: "https://papers.example/fixture.pdf", pages: "1-7" }, undefined);
		const failure = assert.rejects(failed, /synthetic write failure/);
		const result = await tools.paper_read.execute("complete", { paper: "https://papers.example/fixture.pdf", pages: "8-10" }, undefined);
		try { assert.equal((result.details as PaperRead).pagesUsedThisTurn, 3); } finally { release(); await failure; }
		const remaining = await tools.paper_read.execute("remaining", { paper: "https://papers.example/fixture.pdf", pages: "1-7" }, undefined);
		assert.equal((remaining.details as PaperRead).pagesUsedThisTurn, 10);
	});

	it("refuses unknown URLs or missing open-access PDFs without downloading", async () => {
		globalThis.fetch = async () => Response.json({ data: [{ ...s2.data[0], externalIds: {}, openAccessPdf: null }] });
		const tools = toolsWithFiles();
		await tools.paper_search.execute("find", { query: "closed" }, undefined);
		globalThis.fetch = async () => { assert.fail("must not download"); };
		await assert.rejects(tools.paper_read.execute("closed", { paper: "https://example.test/closed.pdf", pages: "1" }, undefined), /The paper could not be read: .*open-access PDF/);
	});
	it("rejects malformed or unavailable pages without silently clamping", async () => {
		sourceStub();
		const tools = toolsWithFiles();
		await tools.paper_search.execute("find", { query: "attention" }, undefined);
		for (const pages of ["0", "all", "3-x", "5-3", "13"]) await assert.rejects(tools.paper_read.execute("bad", { paper: pdfUrl, pages }, undefined), /pages|page/i);
	});
	it("limits paper searches to five per turn", async () => {
		sourceStub();
		const tools = toolsWithFiles();
		for (let i = 0; i < 5; i++) await tools.paper_search.execute(String(i), { query: "attention" }, undefined);
		await assert.rejects(tools.paper_search.execute("six", { query: "attention" }, undefined), /5 paper searches per turn/);
	});
	it("honors abort before fetching and during download", async () => {
		globalThis.fetch = async () => { assert.fail("must not fetch"); };
		await assert.rejects(toolsWithFiles().paper_search.execute("abort", { query: "attention" }, AbortSignal.abort()), /aborted/i);
		sourceStub();
		const tools = toolsWithFiles();
		await tools.paper_search.execute("find", { query: "attention" }, undefined);
		globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("Operation aborted")), { once: true }));
		const controller = new AbortController();
		const pending = tools.paper_read.execute("abort-read", { paper: pdfUrl, pages: "4" }, controller.signal);
		setTimeout(() => controller.abort(), 5);
		await assert.rejects(pending, /aborted/i);
	});
	it("refuses more than 25 MB and reports failed sources in plain words", async () => {
		sourceStub();
		const tools = toolsWithFiles();
		await tools.paper_search.execute("find", { query: "attention" }, undefined);
		globalThis.fetch = async () => new Response("", { headers: { "content-length": String(25 * 1024 * 1024 + 1) } });
		await assert.rejects(tools.paper_read.execute("big", { paper: pdfUrl, pages: "1" }, undefined), /The paper could not be read: .*25 MB/);
		globalThis.fetch = async () => new Response("", { status: 503 });
		await assert.rejects(tools.paper_search.execute("down", { query: "attention" }, undefined), /The paper search is unavailable:/);
	});
	it("rejects extra learner text before sending it to either service", async () => {
		globalThis.fetch = async () => { assert.fail("must not fetch"); };
		assert.equal((await toolsWithFiles().paper_search.execute("private", { query: "attention", learnerText: "secret" } as never, undefined)).isError, true);
	});
	it("creates temp files lazily in each tenant root and removes them on disposal", async () => {
		process.env.LH_HOSTED = "1";
		assert.throws(() => createPaperFiles(), /outside a tenant/);
		const a = runAsTenant("paper_a", () => createPaperFiles());
		const b = runAsTenant("paper_b", () => createPaperFiles());
		await assert.rejects(fs.access(path.join(root, "users", "paper_a")));
		const ap = await runAsTenant("paper_a", () => a.write(fixture));
		const bp = await runAsTenant("paper_b", () => b.write(fixture));
		assert.ok(ap.startsWith(path.join(root, "users", "paper_a") + path.sep));
		assert.ok(bp.startsWith(path.join(root, "users", "paper_b") + path.sep));
		await assert.rejects(runAsTenant("paper_b", () => a.write(fixture)), /tenant/);
		await runAsTenant("paper_a", () => a.dispose());
		await runAsTenant("paper_b", () => b.dispose());
		await assert.rejects(fs.access(ap));
		await assert.rejects(fs.access(bp));
	});
});

it("spaces arXiv requests by three seconds, retries 429 once, and aborts while queued", async (t) => {
	t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() + 100_000 });
	const times: number[] = [];
	let responses = 0;
	globalThis.fetch = async () => { times.push(Date.now()); return responses++ === 0 ? new Response("", { status: 429 }) : new Response(atom); };
	const first = arxivSearch("attention", 1);
	await new Promise((resolve) => process.nextTick(resolve));
	t.mock.timers.tick(3000);
	await first;
	const second = arxivSearch("another", 1);
	await new Promise((resolve) => process.nextTick(resolve));
	t.mock.timers.tick(2999);
	assert.equal(times.length, 2);
	t.mock.timers.tick(1);
	await second;
	assert.deepEqual(times.slice(1).map((time, i) => time - times[i]!), [3000, 3000]);
	const controller = new AbortController();
	const waiting = arxivSearch("cancelled", 1, controller.signal);
	controller.abort();
	await assert.rejects(waiting, /aborted/i);
	assert.equal(times.length, 3);
	t.mock.timers.reset();
});
