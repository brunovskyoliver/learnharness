import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import { tenantScoped } from "../../../config.ts";
import type { PaperFiles } from "../../core/ports.ts";
import type { PaperRead, PaperResult, PaperSearch } from "../../core/lookups.ts";
import { invalidInputResult, serverExecute } from "../tool-execute.ts";
import { fetchPublicPdf } from "../papers/public-pdf.ts";
import { semanticScholarSearch } from "../papers/semantic-scholar.ts";
import { arxivPaper, arxivSearch } from "../papers/arxiv.ts";

const SearchInput = Type.Object({ query: Type.String({ minLength: 1, maxLength: 200 }), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })) }, { additionalProperties: false });
const ReadInput = Type.Object({ paper: Type.String({ minLength: 1 }), pages: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const SEARCH_DESCRIPTION = "Find research papers on Semantic Scholar and arXiv: title, authors, year, ids, abstract, and whether an open-access PDF exists. Only the query leaves the server.";
const READ_DESCRIPTION = "Read pages of an open-access paper PDF so you can explain from the source and cite the page. At most 10 pages per turn: read the method or the figure you need, not the whole paper. If no open-access PDF exists, work from the abstract and say the full text wasn't available.";
const MAX_BYTES = 25 * 1024 * 1024;
const ARXIV_ID = /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/;

function pageNumbers(spec: string, remaining: number): number[] {
	const pages = new Set<number>();
	for (const part of spec.split(",")) {
		const match = part.trim().match(/^([1-9]\d*)(?:\s*-\s*([1-9]\d*))?$/);
		if (!match) throw new Error("Use page numbers or ranges such as 4, 3-5 or 1,7.");
		const start = Number(match[1]), end = Number(match[2] ?? match[1]);
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) throw new Error("The page range is invalid.");
		if (end - start + 1 > remaining) throw new Error(`At most 10 pages per turn; ${remaining} pages left. No pages were read.`);
		for (let n = start; n <= end; n++) pages.add(n);
		if (pages.size > remaining) throw new Error(`At most 10 pages per turn; ${remaining} pages left. No pages were read.`);
	}
	return [...pages].sort((a, b) => a - b);
}
async function download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
	const response = await fetchPublicPdf(url, signal);
	if (!response.ok) throw new Error(`The PDF server returned HTTP ${response.status}.`);
	if (Number(response.headers.get("content-length")) > MAX_BYTES) { await response.body?.cancel(); throw new Error("The PDF is larger than 25 MB."); }
	const reader = response.body?.getReader();
	if (!reader) throw new Error("The PDF response was empty.");
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			signal?.throwIfAborted();
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_BYTES) throw new Error("The PDF is larger than 25 MB.");
			chunks.push(value);
		}
	} finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	return bytes;
}

/** Search provenance and counters live only for this tool pair's turn. */
export function createPaperTools(files?: PaperFiles) {
	let searches = 0, pagesUsed = 0, pagesReserved = 0;
	const found = new Map<string, PaperResult>();
	function tool<S extends TSchema>(name: string, description: string, schema: S, run: (input: Static<S>, signal?: AbortSignal) => Promise<{ text: string; details: PaperSearch | PaperRead }>): AgentTool<S> {
		const execute = serverExecute(name, schema, async (input, { signal }) => {
			try {
				signal?.throwIfAborted();
				tenantScoped("__lhPaperAccess", () => true);
				return await run(input, signal);
			} catch (error) {
				if (signal?.aborted) throw new Error("Operation aborted");
				throw new Error(`${name === "paper_search" ? "The paper search is unavailable" : "The paper could not be read"}: ${error instanceof Error ? error.message : String(error)}`);
			}
		});
		return { name, label: name, description, parameters: schema, execute: (id, input, signal) => {
			if (!Value.Check(schema, input)) return Promise.resolve(invalidInputResult(name, ["The arguments do not match the tool's input schema."]));
			return execute(id, input, signal);
		} };
	}
	return {
		paper_search: tool("paper_search", SEARCH_DESCRIPTION, SearchInput, async ({ query, limit = 5 }, signal) => {
			const started = Date.now();
			if (searches >= 5) throw new Error("At most 5 paper searches per turn.");
			searches++;
			let source: PaperSearch["source"] = "semantic-scholar", results: PaperResult[];
			try { results = await semanticScholarSearch(query, limit, signal); }
			catch { signal?.throwIfAborted(); source = "arxiv"; results = await arxivSearch(query, limit, signal); }
			if (results.length > limit) throw new Error("The source returned more papers than requested.");
			for (const paper of results) {
				if (paper.pdfUrl) found.set(paper.pdfUrl, paper);
				if (paper.arxivId) found.set(paper.arxivId, paper);
			}
			return { text: JSON.stringify({ source, query, results }), details: { source, query, results, ms: Date.now() - started } };
		}),
		paper_read: tool("paper_read", READ_DESCRIPTION, ReadInput, async ({ paper, pages }, signal) => {
			const started = Date.now();
			const selected = pageNumbers(pages, 10 - pagesUsed - pagesReserved);
			if (!files) throw new Error("Temporary PDF storage is unavailable.");
			pagesReserved += selected.length; // Reserve before IO, including simultaneous calls.
			try {
				let source = found.get(paper);
				if (!source && ARXIV_ID.test(paper)) source = await arxivPaper(paper, signal);
				if (!source?.pdfUrl) throw new Error("No open-access PDF from this turn's search is available for this paper.");
				const bytes = await download(source.pdfUrl, signal);
				signal?.throwIfAborted();
				const file = await files.write(bytes);
				const { pdfExtract } = await import("../subagents/pdf-ops.ts");
				const extracted = await pdfExtract(file, selected.join(","));
				signal?.throwIfAborted();
				const actual = [...extracted.matchAll(/^--- Page (\d+) ---$/gm)].map((m) => Number(m[1]));
				if (actual.join(",") !== selected.join(",")) throw new Error("One or more requested pages do not exist in the PDF. No page text was returned.");
				const hints = source.authors[0] && source.year !== undefined
					? selected.map((n) => `Cite as (${source.authors[0]} et al., ${source.year}, p. ${n}) linking ${source.pdfUrl}#page=${n}`)
					: ["Citation metadata is incomplete. Cite the paper title and page link.", ...selected.map((n) => `${source.title} · ${source.pdfUrl}#page=${n}`)];
				pagesUsed += selected.length;
				return { text: `${extracted.replace(/^--- Page (\d+) ---$/gm, "--- p. $1 ---")}\n\n${hints.join("\n")}`, details: { title: source.title, paper: { ...(source.arxivId ? { arxivId: source.arxivId } : {}), url: source.pdfUrl }, pages: selected, pagesUsedThisTurn: pagesUsed, cap: 10, ms: Date.now() - started } };
			} finally { pagesReserved -= selected.length; }
		}),
	};
}
