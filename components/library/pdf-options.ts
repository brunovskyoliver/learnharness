/** How the reader opens a PDF (feature 020). Pure, so a test pins it.
 *  - Scripts in a PDF never run: this app doesn't use pdf.js's scripting manager or
 *    sandbox, and doesn't draw its annotation layer, so form and link actions don't
 *    exist here. Eval is off, closing the font path, and XFA forms are off.
 *  - The worker and every asset are same-origin (app/pdfjs), never a CDN.
 *  - The legacy build, for the older WebKit and Chromium the app also ships to. */
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
		verbosity: 0,
	} as const;
}
