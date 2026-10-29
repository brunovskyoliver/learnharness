import type { MlPanelData } from "./demo-kit.ts";

export type Point = MlPanelData<"scatter">["points"][number];
export type Arithmetic = NonNullable<MlPanelData<"scatter">["arithmetic"]>;
export type Metric = MlPanelData<"scatter">["metric"];
export const coordinates = (point: Point): number[] => point.z === undefined ? [point.x, point.y] : [point.x, point.y, point.z];

export function validatePoints(points: Point[]): void {
	if (!Array.isArray(points) || points.length < 1 || points.length > 200) throw new Error("points: provide 1–200 points");
	if (points.some(p => !p || typeof p.label !== "string" || !coordinates(p).every(Number.isFinite) || (p.group !== undefined && typeof p.group !== "string"))) throw new Error("points: use labelled finite coordinates");
	if (new Set(points.map(p => p.label)).size !== points.length) throw new Error("points: labels must be unique");
	if (points.some(p => (p.z === undefined) !== (points[0]!.z === undefined))) throw new Error("points: use all 2D or all 3D points");
}

export function arithmetic(points: Point[], expression: Arithmetic): number[] {
	validatePoints(points);
	if (!expression || !Array.isArray(expression.plus) || !Array.isArray(expression.minus)) throw new Error("arithmetic: provide plus and minus label lists");
	const result = coordinates(points[0]!).map(() => 0);
	for (const [labels, sign] of [[expression.plus, 1], [expression.minus, -1]] as const) for (const label of labels) {
		const point = points.find(p => p.label === label);
		if (!point) throw new Error("arithmetic: every operand must name a point");
		coordinates(point).forEach((value, i) => { result[i] += sign * value; });
	}
	if (!result.every(Number.isFinite)) throw new Error("arithmetic: calculation overflowed; use smaller finite values");
	return result;
}

function distance(a: number[], b: number[], metric: Metric): number {
	if (metric === "euclidean") return Math.hypot(...a.map((v, i) => v - b[i]!));
	// Normalize by the largest coordinate before taking norms to avoid overflow.
	const sa = Math.max(...a.map(Math.abs)), sb = Math.max(...b.map(Math.abs));
	if (sa === 0 || sb === 0) throw new Error("cosine: distance is undefined for a zero vector");
	const aa = a.map(v => v / sa), bb = b.map(v => v / sb);
	const cosine = aa.reduce((sum, v, i) => sum + v * bb[i]!, 0) / (Math.hypot(...aa) * Math.hypot(...bb));
	return 1 - Math.max(-1, Math.min(1, cosine));
}

export function nearest(points: Point[], result: number[], metric: Metric, excluded: string[] = []): { point: Point; distance: number } {
	validatePoints(points);
	if (!Array.isArray(result) || result.length !== coordinates(points[0]!).length || !result.every(Number.isFinite)) throw new Error("result: use finite coordinates matching the points");
	if (metric !== "cosine" && metric !== "euclidean") throw new Error("metric: use cosine or euclidean");
	const candidates = points.filter(point => !excluded.includes(point.label));
	if (!candidates.length) throw new Error("arithmetic: no candidate remains after excluding the operands");
	let best: { point: Point; distance: number } | undefined;
	for (const point of candidates) {
		const d = distance(result, coordinates(point), metric);
		if (!Number.isFinite(d)) throw new Error("distance: calculation overflowed; use smaller finite values");
		if (!best || d < best.distance) best = { point, distance: d };
	}
	return best!;
}
