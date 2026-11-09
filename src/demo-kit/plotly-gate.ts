/** Which plotly build a kit plot needs (specs/024-instant-loads research R5).
 *  The light build (public/demo-kit/plotly-light.js, plotly-light-entry.ts)
 *  carries plotly's core (scatter) plus these trace types; a plot with any
 *  other type loads the full public/demo-kit/plotly.js for that plot. Keep
 *  this list and the entry's registrations the same. */
export const LIGHT_PLOTLY_TRACES = ["scatter", "scatter3d", "surface", "mesh3d", "cone", "streamtube", "isosurface", "volume", "contour", "heatmap"] as const;

const LIGHT = new Set<string>(LIGHT_PLOTLY_TRACES);

/** True when every trace's type (plotly's default: scatter) is in the light build. */
export function lightPlotlyCovers(traces: unknown): boolean {
	if (!Array.isArray(traces)) return true;
	return traces.every((trace) => {
		if (!trace || typeof trace !== "object") return true;
		const type = (trace as { type?: unknown }).type;
		return type === undefined || (typeof type === "string" && LIGHT.has(type));
	});
}
