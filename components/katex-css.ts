/**
 * The KaTeX stylesheet, loaded with whatever renders KaTeX (feature 024):
 * the message math renderer, the chain table's glyphs and the page editor's
 * formulas. It is no longer part of every page's first load. One request,
 * shared; under plain Node (tests, server) there is no document to style.
 * Never rejects: a missing stylesheet must not block the content.
 */
let request: Promise<void> | undefined;

export function loadKatexCss(): Promise<void> {
	if (typeof document === "undefined") return Promise.resolve();
	return request ??= import("katex/dist/katex.min.css").then(
		() => undefined,
		(error: unknown) => {
			console.error("The KaTeX stylesheet could not be loaded.", error);
			request = undefined;
		},
	);
}
