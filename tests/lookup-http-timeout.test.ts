import assert from "node:assert/strict";
import { afterEach, beforeEach, it, mock } from "node:test";
import { mockPdfHttps } from "./helpers/mock-pdf-https.ts";
import { semanticScholarSearch } from "../src/agent/papers/semantic-scholar.ts";
import { arxivFetch } from "../src/agent/papers/arxiv.ts";
import { createHubTools } from "../src/agent/tools/hub.ts";
import { createPaperTools } from "../src/agent/tools/papers.ts";

const originalFetch = globalThis.fetch;
const originalTimeout = AbortSignal.timeout;
beforeEach(() => mockPdfHttps());
afterEach(() => { mock.restoreAll(); globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; });

async function verifyDeadline(run: (signal: AbortSignal) => Promise<unknown>, prepare?: () => Promise<void>) {
	const deadlines: { ms: number; controller: AbortController }[] = [];
	AbortSignal.timeout = (ms: number) => { const controller = new AbortController(); deadlines.push({ ms, controller }); return controller.signal; };
	if (prepare) await prepare();
	deadlines.length = 0;
	let entered!: () => void;
	const started = new Promise<void>(resolve => { entered = resolve; });
	globalThis.fetch = async (_url, options) => {
		const signal = options?.signal;
		assert.ok(signal, "HTTP request carries an abort signal");
		entered();
		return new Promise<Response>((_resolve, reject) => {
			if (signal.aborted) reject(signal.reason);
			else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
		});
	};
	const parent = new AbortController();
	const operation = run(parent.signal);
	try {
		await started;
		assert.deepEqual(deadlines.map(d => d.ms), [20_000], "each HTTP request has the plan's twenty-second deadline");
		deadlines[0]!.controller.abort(new Error("lookup timed out"));
		await assert.rejects(operation, /lookup timed out/);
	} finally { parent.abort(); await operation.catch(() => {}); }
}

it("bounds Semantic Scholar HTTP independently of the outer tool guard", () => verifyDeadline(signal => semanticScholarSearch("attention", 1, signal)));
it("bounds arXiv HTTP independently of the outer tool guard", () => verifyDeadline(signal => arxivFetch("https://export.arxiv.org/api/query?id_list=1706.03762", signal)));
it("bounds Hub config HTTP independently of the outer tool guard", () => verifyDeadline(signal => createHubTools().hub_model.execute("deadline", { repo: "gpt2" }, signal)));
it("bounds open-access PDF download HTTP independently of the outer tool guard", async () => {
	const tools = createPaperTools({ write: async () => { throw new Error("must not write a timed-out download"); }, dispose: async () => {} });
	await verifyDeadline(signal => tools.paper_read.execute("deadline", { paper: "https://papers.example/test.pdf", pages: "1" }, signal), async () => {
		globalThis.fetch = async () => Response.json({ data: [{ title: "Paper", paperId: "p", authors: [{ name: "Author" }], year: 2020, openAccessPdf: { url: "https://papers.example/test.pdf" } }] });
		await tools.paper_search.execute("find", { query: "Paper" }, undefined);
	});
});
