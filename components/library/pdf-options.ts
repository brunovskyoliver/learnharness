/** How the reader opens a PDF (feature 020). Pure, so a test pins it.
 *  - Scripts in a PDF never run: this app doesn't use pdf.js's scripting manager or
 *    sandbox, and doesn't draw its annotation layer, so form and link actions don't
 *    exist here. Eval is off, closing the font path, and XFA forms are off.
 *  - The worker and every asset are same-origin (app/pdfjs), never a CDN.
 *  - The legacy build, for the older WebKit and Chromium the app also ships to.
 *  - Ranges only (feature 024): no whole-file stream and no background fetch of
 *    the rest, so page 1 comes from the bytes it needs. The reader hands pdf.js
 *    versioned chunks of PDF_CHUNK_SIZE (pdf-transport.ts), so pdf.js's range
 *    chunk size must be the same. */
import { PDF_CHUNK_SIZE } from "./pdf-transport.ts";

export const PDFJS_BASE = "/pdfjs/";
export const PDF_WORKER_SRC = `${PDFJS_BASE}legacy/build/pdf.worker.min.mjs`;

export function pdfLoadOptions(url: string) {
	return {
		url,
		isEvalSupported: false,
		enableXfa: false,
		disableFontFace: false,
		standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
		cMapUrl: `${PDFJS_BASE}cmaps/`,
		cMapPacked: true,
		wasmUrl: `${PDFJS_BASE}wasm/`,
		iccUrl: `${PDFJS_BASE}iccs/`,
		disableStream: true,
		disableAutoFetch: true,
		rangeChunkSize: PDF_CHUNK_SIZE,
		verbosity: 0,
	} as const;
}

/** Pages the reader reads text from to decide its "no text" note: the first
 *  three (owner, 2026-11-09), so a scan doesn't pull the whole file for it. */
export const TEXT_CHECK_PAGES = 3;
export function textCheckPages(numPages: number): number[] {
	return Array.from({ length: Math.max(0, Math.min(TEXT_CHECK_PAGES, numPages)) }, (_, i) => i + 1);
}
