/** Layered layout for demo-kit flow panels: pure, shared by the browser
 *  runtime and tests. Ranks by longest path from the sources (cycles are
 *  broken at the first back edge), orders each rank by first appearance. */

export interface FlowLayoutNode {
	id: string;
}
export interface FlowLayoutEdge {
	from: string;
	to: string;
}

export function layeredLayout(
	nodes: readonly FlowLayoutNode[],
	edges: readonly FlowLayoutEdge[],
	opts: { direction?: "LR" | "TB"; gapMain?: number; gapCross?: number } = {},
): Map<string, { x: number; y: number }> {
	const { direction = "LR", gapMain = 220, gapCross = 110 } = opts;
	const ids = nodes.map((n) => n.id);
	const known = new Set(ids);
	const out = new Map<string, string[]>();
	for (const id of ids) out.set(id, []);
	for (const e of edges) if (known.has(e.from) && known.has(e.to) && e.from !== e.to) out.get(e.from)!.push(e.to);

	const rank = new Map<string, number>();
	const visiting = new Set<string>();
	const depth = (id: string): number => {
		const cached = rank.get(id);
		if (cached !== undefined) return cached;
		if (visiting.has(id)) return 0; // back edge: break the cycle
		visiting.add(id);
		let r = 0;
		for (const [from, tos] of out) if (tos.includes(id) && !visiting.has(from)) r = Math.max(r, depth(from) + 1);
		visiting.delete(id);
		rank.set(id, r);
		return r;
	};
	for (const id of ids) depth(id);

	const byRank = new Map<number, string[]>();
	for (const id of ids) {
		const r = rank.get(id)!;
		byRank.set(r, [...(byRank.get(r) ?? []), id]);
	}
	const positions = new Map<string, { x: number; y: number }>();
	const widest = Math.max(1, ...[...byRank.values()].map((list) => list.length));
	for (const [r, list] of byRank) {
		const offset = ((widest - list.length) * gapCross) / 2;
		list.forEach((id, i) => {
			const main = r * gapMain;
			const cross = offset + i * gapCross;
			positions.set(id, direction === "LR" ? { x: main, y: cross } : { x: cross, y: main });
		});
	}
	return positions;
}
