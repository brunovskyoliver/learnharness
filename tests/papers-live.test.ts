/** Opt-in public paper sources; never runs in the default offline suite. */
import assert from "node:assert/strict";
import { it } from "node:test";
import { createPaperTools } from "../src/agent/tools/papers.ts";
import { createPaperFiles } from "../src/store/papers.ts";
import type { PaperRead, PaperSearch } from "../src/core/lookups.ts";

it("finds Attention Is All You Need and reads its attention definition on page four", { skip: process.env.LH_LIVE_PAPERS !== "1", timeout: 60_000 }, async () => {
	const files = createPaperFiles();
	try {
		const tools = createPaperTools(files);
		const search = await tools.paper_search.execute("live-search", { query: "Attention Is All You Need" }, undefined);
		const details = search.details as PaperSearch;
		assert.ok(["semantic-scholar", "arxiv"].includes(details.source));
		assert.ok(details.results.some((p) => p.title.toLowerCase() === "attention is all you need"));
		const read = await tools.paper_read.execute("live-read", { paper: "1706.03762", pages: "4" }, undefined);
		assert.match(read.content.map((c) => c.type === "text" ? c.text : "").join(""), /Scaled Dot-Product Attention/);
		assert.deepEqual((read.details as PaperRead).pages, [4]);
	} finally { await files.dispose(); }
});
