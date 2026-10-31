/** Source lookup details stored with tool results and the approved row headlines. */
export type HubLookup = {
	kind: "search"; what: "models" | "datasets" | "papers"; query: string;
	results: { id: string; title?: string; task?: string; downloads?: number | string; likes?: number; url: string }[];
	ms: number;
} | {
	kind: "model"; repo: string; url: string;
	fields: { label: string; key: string; value: string | number }[];
	params?: number; cardSummary?: string; ms: number;
};
export interface PaperResult {
	title: string; authors: string[]; year?: number; arxivId?: string; s2Id?: string;
	abstract?: string; pdfUrl?: string; url: string;
}
export interface PaperSearch { source: "semantic-scholar" | "arxiv"; query: string; results: PaperResult[]; ms: number }
export interface PaperRead { title: string; paper: { arxivId?: string; url: string }; pages: number[]; pagesUsedThisTurn: number; cap: 10; ms: number }
export interface TokenizeDetails { encoding: "o200k" | "cl100k" | "gpt2"; count: number; tokens: { id: number; text: string | null; bytes?: number[] }[] }
export type LookupDetails = HubLookup | PaperSearch | PaperRead | TokenizeDetails;

export function lookupFailureHeadline(tool: string): string | null {
	if (tool === "hub_search" || tool === "hub_model") return "Hugging Face · lookup failed";
	if (tool === "paper_search") return "Papers · search failed";
	if (tool === "paper_read") return "Read · failed";
	return null;
}

/** Compress only consecutive pages; gaps remain visible. */
export function paperPageRange(pages: readonly number[]): string {
	const ranges: string[] = [];
	for (let i = 0; i < pages.length; i++) {
		const start = pages[i]!;
		let end = start;
		while (i + 1 < pages.length && pages[i + 1] === end + 1) end = pages[++i]!;
		ranges.push(start === end ? String(start) : `${start}–${end}`);
	}
	return ranges.join(", ");
}

/** "1 model", "3 models": the count with its noun in the right number. */
function counted(count: number, plural: string): string {
	return `${count} ${count === 1 ? plural.replace(/s$/, "") : plural}`;
}

export function lookupHeadline(details: LookupDetails): string {
	if ("encoding" in details) return `Tokenized · ${counted(details.count, "tokens")} (${details.encoding})`;
	if ("kind" in details) return details.kind === "model"
		? `Hugging Face · ${details.repo.split("/").at(-1)} config`
		: `Hugging Face · ${counted(details.results.length, details.what)} for '${details.query}'`;
	if ("pages" in details) return `Read · ${details.title} · ${details.pages.length === 1 ? "p." : "pp."} ${paperPageRange(details.pages)}`;
	if (details.source === "arxiv" && details.results.length === 1) return `arXiv · ${details.results[0]!.title}`;
	return `${details.source === "arxiv" ? "arXiv" : "Semantic Scholar"} · ${counted(details.results.length, "papers")} for '${details.query}'`;
}

// ── Page and Library rows (feature 009, contracts/ui-contract.md) ──
export type PageRowDetails =
	| { outcome: "created" | "revised"; itemId: string; name: string; version: number; savedLearnerVersion?: number }
	| { outcome: "stale"; reason: string; itemId?: string; savedLearnerVersion?: number }
	| { outcome: "failed"; reason: string }
	| { outcome: "read"; itemId: string; name: string; kind: string; size: number };

export function pageRowHeadline(tool: string, details: PageRowDetails | null): string {
	if (tool === "library_read") return details?.outcome === "read" ? `Library · read ${details.name}` : "Library · failed";
	switch (details?.outcome) {
		case "created": return `Page · created ${details.name}`;
		case "revised": return `Page · revised ${details.name} · version ${details.version}`;
		case "stale": return "Page · couldn't revise, it changed";
		default: return "Page · failed";
	}
}
