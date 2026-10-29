import type { PaperResult } from "../../core/lookups.ts";

// Only timing is shared process-wide: no query, paper or tenant cache.
let nextRequest = 0;
function delay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const abort = () => { clearTimeout(timer); reject(new Error("Operation aborted")); };
		const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
		if (signal?.aborted) abort();
		else signal?.addEventListener("abort", abort, { once: true });
	});
}
async function slot(signal?: AbortSignal): Promise<void> {
	signal?.throwIfAborted();
	const wait = Math.max(0, nextRequest - Date.now());
	nextRequest = Date.now() + wait + 3000;
	if (wait) await delay(wait, signal);
	signal?.throwIfAborted();
}
/** Both API and PDF requests respect the same three-second process budget. */
export async function arxivFetch(url: string, signal?: AbortSignal): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		await slot(signal);
		const response = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]) });
		if (response.status !== 429 || attempt === 1) return response;
		await response.body?.cancel();
	}
}
async function papers(url: URL, signal?: AbortSignal): Promise<PaperResult[]> {
	const response = await arxivFetch(url.toString(), signal);
	if (!response.ok) throw new Error(`arXiv returned HTTP ${response.status}.`);
	const xml = await response.text();
	const { DOMParser } = await import("linkedom");
	const document = new DOMParser().parseFromString(xml, "text/xml");
	if (document.documentElement?.localName !== "feed") throw new Error("arXiv returned an unreadable response.");
	return [...document.querySelectorAll("entry")].map((entry) => {
		const field = (name: string) => entry.querySelector(name)?.textContent?.replace(/\s+/g, " ").trim();
		const id = field("id")?.match(/^https?:\/\/arxiv\.org\/abs\/(.+)$/)?.[1];
		const title = field("title");
		if (!id || !title) throw new Error("arXiv returned an unreadable paper.");
		const year = Number(field("published")?.slice(0, 4));
		return { title, authors: [...entry.querySelectorAll("author > name")].map((a) => a.textContent?.trim() ?? ""), arxivId: id,
			...(Number.isInteger(year) && year > 0 ? { year } : {}), ...(field("summary") ? { abstract: field("summary") } : {}),
			pdfUrl: `https://arxiv.org/pdf/${id}`, url: `https://arxiv.org/abs/${id}` };
	});
}
export async function arxivSearch(query: string, limit: number, signal?: AbortSignal): Promise<PaperResult[]> {
	const url = new URL("https://export.arxiv.org/api/query");
	// arXiv's classic parser accepts ESCAPED_STRING. Keep the submitted
	// text inside one phrase, including literal quotes and backslashes.
	const phrase = query.replace(/[\\"]/g, "\\$&");
	url.searchParams.set("search_query", `all:"${phrase}"`);
	url.searchParams.set("max_results", String(limit));
	return papers(url, signal);
}
export async function arxivPaper(id: string, signal?: AbortSignal): Promise<PaperResult> {
	const url = new URL("https://export.arxiv.org/api/query");
	url.searchParams.set("id_list", id);
	const results = await papers(url, signal);
	if (results.length !== 1) throw new Error("The arXiv paper could not be found.");
	return { ...results[0]!, arxivId: id, pdfUrl: `https://arxiv.org/pdf/${id}` };
}
