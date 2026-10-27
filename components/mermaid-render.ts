/**
 * The app's ONE diagram renderer. Both the in-chat block
 * (components/md-blocks.tsx) and the session-scoped focus overlay
 * (components/session-overlay.tsx) render charts through this module.
 *
 * ui-v2 (2026-10-26): Mermaid syntax, rendered by pele (Obsidian's MIT
 * Mermaid → SVG renderer) instead of mermaid.js. Pele is synchronous, has no
 * runtime dependencies and themes through CSS variables (the `.pele` block in
 * app/globals.css), so the svg follows the app's tokens without re-rendering.
 * `pele/lazy` loads each diagram type's code on first use.
 */


/** The chart's base font size (px). Pele sizes all text relative to this, so
 *  it's the number the display-width cap (md-blocks) divides by: a chart
 *  shown at its natural width renders text at exactly this size. */
export const MERMAID_FONT_SIZE = 16;

let seq = 0;

/** Render one chart source to an svg string. The id prefix is unique per
 *  call so two charts on one page never share marker/gradient ids. */
export async function renderMermaid(chart: string): Promise<string> {
	const { renderAsync } = await import("pele/lazy");
	const { svg } = await renderAsync(chart, {
		fontSize: MERMAID_FONT_SIZE,
		// Pele measures text on a canvas, so it needs the resolved family
		// list, not a var() reference.
		fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-ui").trim() || "sans-serif",
		idPrefix: `lh-chart-${(seq++).toString(36)}-`,
	});
	return svg;
}
