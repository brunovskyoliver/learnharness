"use client";

import { createContext, useContext } from "react";

/** The expand seam: md-blocks' mermaid hover button calls openMermaid with
 *  the chart source; the figure card's fullscreen button calls openFigure
 *  with the raw svg (+ its invert state). The chat page (which provides
 *  this context) opens the overlay. Null when no chat page is mounted
 *  (sidebar previews etc.) — the buttons simply don't render there. */
export const SessionMermaidContext = createContext<{
	openMermaid: (chart: string) => void;
	openFigure: (svg: string, inverted: boolean) => void;
} | null>(null);

export function useSessionMermaid() {
	return useContext(SessionMermaidContext);
}

/** A chart svg's natural size — mermaid always emits a viewBox; this is the
 *  extent at zoom 1 (1 svg unit = 1 px), like the plan diagram's natural
 *  size. Figure svgs (2026-10-07) may declare width/height instead — that
 *  pair is the fallback. The final fallback covers a degenerate svg with
 *  neither. Pure. */
export function chartSize(svg: string): { w: number; h: number } {
	const m = /<svg[^>]*\bviewBox="([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)"/.exec(svg);
	if (m) {
		const w = Number.parseFloat(m[3]!);
		const h = Number.parseFloat(m[4]!);
		if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h };
	}
	const attr = (name: string): number | null => {
		const a = new RegExp(`<svg\\b[^>]*?\\b${name}\\s*=\\s*["'](\\d+(?:\\.\d+)?)(?:px)?["']`, "i").exec(svg);
		if (!a) return null;
		const n = Number.parseFloat(a[1]!);
		return Number.isFinite(n) && n > 0 ? n : null;
	};
	const w = attr("width");
	const h = attr("height");
	if (w !== null && h !== null) return { w, h };
	return { w: 600, h: 400 };
}

