import type { PaperResult } from "../../core/lookups.ts";

export async function semanticScholarSearch(query: string, limit: number, signal?: AbortSignal): Promise<PaperResult[]> {
	signal?.throwIfAborted();
	const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
	url.searchParams.set("query", query);
	url.searchParams.set("limit", String(limit));
	url.searchParams.set("fields", "title,authors,year,externalIds,abstract,openAccessPdf");
	const response = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]) });
	if (!response.ok) throw new Error(`Semantic Scholar returned HTTP ${response.status}.`);
	const body: unknown = await response.json();
	if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) throw new Error("Semantic Scholar returned an unreadable response.");
	return (body as { data: unknown[] }).data.map((value) => {
		const p = value as { title?: unknown; paperId?: unknown; authors?: { name?: unknown }[]; year?: unknown; externalIds?: { ArXiv?: unknown } | null; abstract?: unknown; openAccessPdf?: { url?: unknown } | null };
		if (typeof p?.title !== "string" || typeof p.paperId !== "string" || !Array.isArray(p.authors) || p.authors.some((a) => typeof a?.name !== "string")) throw new Error("Semantic Scholar returned an unreadable paper.");
		const pdfUrl = typeof p.openAccessPdf?.url === "string" && /^https?:\/\//.test(p.openAccessPdf.url) ? p.openAccessPdf.url : undefined;
		return {
			title: p.title, authors: p.authors.map((a) => a.name as string), s2Id: p.paperId,
			...(typeof p.year === "number" && Number.isInteger(p.year) ? { year: p.year } : {}),
			...(typeof p.externalIds?.ArXiv === "string" ? { arxivId: p.externalIds.ArXiv } : {}),
			...(typeof p.abstract === "string" ? { abstract: p.abstract } : {}),
			...(pdfUrl ? { pdfUrl } : {}), url: `https://www.semanticscholar.org/paper/${encodeURIComponent(p.paperId)}`,
		};
	});
}
