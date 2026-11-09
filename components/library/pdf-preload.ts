/**
 * Starts a PDF's first network work at the click (feature 024, T009d): the first
 * chunk with its version and length, pdf.js itself and its worker script, all in
 * parallel with the reader's own code. The reader then takes the waiting first
 * chunk instead of asking again. Small on purpose: the pane imports it up front,
 * pdf.js still arrives only with the first PDF.
 */
import { PDF_WORKER_SRC } from "./pdf-options.ts";
import { openPdfSource, PDF_CHUNK_SIZE, type PdfSource } from "./pdf-transport.ts";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

/** A first chunk older than this is asked for again, so an open never starts from a stale answer. */
export const PRELOAD_TTL_MS = 10_000;

export const pdfContentUrl = (id: string) => `/api/library/items/${encodeURIComponent(id)}/content`;

const waiting = new Map<string, { source: Promise<PdfSource>; at: number }>();

let pdfjsPromise: Promise<PdfJs> | null = null;
/** pdf.js, once per page, with its worker pointed at the app's own copy. */
export function loadPdfJs(): Promise<PdfJs> {
	pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
		pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
		// One worker for the page, started now: it compiles while the reader's own code
		// loads, and later PDFs reuse it instead of starting another.
		if (typeof Worker !== "undefined" && !pdfjs.GlobalWorkerOptions.workerPort) {
			try {
				pdfjs.GlobalWorkerOptions.workerPort = new Worker(PDF_WORKER_SRC, { type: "module" });
			} catch {
				// pdf.js starts its own from workerSrc.
			}
		}
		return pdfjs;
	}).catch((error: unknown) => {
		pdfjsPromise = null;
		throw error;
	});
	return pdfjsPromise;
}

/** Starts the first-chunk request for an item unless one is already waiting. */
export function preloadPdfSource(id: string, now = Date.now()): void {
	const held = waiting.get(id);
	if (held && now - held.at < PRELOAD_TTL_MS) return;
	const source = openPdfSource(pdfContentUrl(id), PDF_CHUNK_SIZE);
	source.catch(() => {}); // The reader reports failures when it takes this.
	waiting.set(id, { source, at: now });
}

/** The waiting first chunk for an item (used once), or a new request. */
export function takePdfSource(id: string, signal?: AbortSignal, now = Date.now()): Promise<PdfSource> {
	const held = waiting.get(id);
	waiting.delete(id);
	if (held && now - held.at < PRELOAD_TTL_MS) return held.source;
	return openPdfSource(pdfContentUrl(id), PDF_CHUNK_SIZE, fetch, signal);
}

/** Everything a PDF open needs from the network, started together: the first
 *  chunk, pdf.js, and (through loadPdfJs) its worker. */
export function preloadPdf(id: string): void {
	preloadPdfSource(id);
	void loadPdfJs().catch(() => {});
}
