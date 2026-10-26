import type { GraphChain, GraphNode } from "./contracts/graph.ts";
import type { DerivedGraph } from "./graph.ts";

export interface QueryPage<T> {
	items: T[];
	total: number;
	offset: number;
	nextOffset: number | null;
}

export function queryPage<T>(items: readonly T[], offset = 0, limit = 20): QueryPage<T> {
	if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid result page.");
	const page = items.slice(offset, offset + limit);
	return { items: page, total: items.length, offset, nextOffset: offset + page.length < items.length ? offset + page.length : null };
}

/** Exclude incomplete arguments instead of presenting their surviving premises as sufficient. */
export function queryGraph(graph: DerivedGraph): DerivedGraph & { omittedChains: number } {
	const ids = new Set(graph.nodes.map((n) => n.id));
	const chains = graph.chains.filter((c) => c.premises.length > 0 && ids.has(c.conclusion) && c.premises.every((id) => ids.has(id)));
	return { nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)), chains: [...chains].sort((a, b) => a.id.localeCompare(b.id)), omittedChains: graph.chains.length - chains.length };
}

export function requireGraphNode(graph: DerivedGraph, id: string): GraphNode {
	const node = graph.nodes.find((n) => n.id === id);
	if (!node) throw new Error(`Unknown graph node: ${id}. Use search_graph to find a current node id.`);
	return node;
}

export function searchGraph(graph: DerivedGraph, query: string): GraphNode[] {
	const needle = query.trim().toLowerCase();
	if (!needle) throw new Error("Search text must not be empty.");
	return graph.nodes.filter((n) => [n.name, n.statement, ...n.aliases].some((s) => s.toLowerCase().includes(needle)));
}

export function inspectGraphNode(graph: DerivedGraph, id: string, offset = 0, limit = 20) {
	return {
		node: requireGraphNode(graph, id),
		incoming: queryPage(graph.chains.filter((c) => c.conclusion === id), offset, limit),
		outgoing: queryPage(graph.chains.filter((c) => c.premises.includes(id)), offset, limit),
	};
}

/** A directed structural path is not a proof from its starting node alone. */
export function explainGraphConnection(graph: DerivedGraph, from: string, to: string, maxSteps = 6) {
	requireGraphNode(graph, from); requireGraphNode(graph, to);
	if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 6) throw new Error("Choose 1–6 chain steps.");
	const outgoing = new Map<string, GraphChain[]>();
	for (const chain of graph.chains) for (const premise of chain.premises) {
		const bucket = outgoing.get(premise) ?? [];
		bucket.push(chain); outgoing.set(premise, bucket);
	}
	const queue: Array<{ id: string; path: GraphChain[] }> = [{ id: from, path: [] }];
	const seen = new Set([from]);
	let examinedLinks = 0;
	for (let i = 0; i < queue.length; i++) {
		const current = queue[i]!;
		if (current.id === to) return { status: "found" as const, path: current.path, maxSteps, examinedLinks };
		if (current.path.length === maxSteps) continue;
		for (const chain of outgoing.get(current.id) ?? []) {
			if (examinedLinks >= 10_000) return { status: "search_limit" as const, path: [], maxSteps, examinedLinks };
			examinedLinks++;
			if (seen.has(chain.conclusion)) continue;
			if (chain.conclusion === to) return { status: "found" as const, path: [...current.path, chain], maxSteps, examinedLinks };
			seen.add(chain.conclusion);
			queue.push({ id: chain.conclusion, path: [...current.path, chain] });
		}
	}
	return { status: "not_found_within_limit" as const, path: [], maxSteps, examinedLinks };
}

const STOP_WORDS = new Set("the and for with from that this these those into when then than are was were has have its can not all one each which their using given does".split(" "));
function words(node: GraphNode): Set<string> {
	return new Set(([node.name, node.statement, ...node.aliases].join(" ").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((s) => s.length >= 3 && !STOP_WORDS.has(s)));
}

export function suggestGraphConnections(graph: DerivedGraph, id: string) {
	const node = requireGraphNode(graph, id);
	const direct = new Set([id]);
	const prerequisites = new Map<string, Set<string>>(), consequences = new Map<string, Set<string>>();
	for (const chain of graph.chains) {
		const incoming = prerequisites.get(chain.conclusion) ?? new Set<string>();
		for (const premise of chain.premises) {
			incoming.add(premise);
			const outgoing = consequences.get(premise) ?? new Set<string>();
			outgoing.add(chain.conclusion); consequences.set(premise, outgoing);
		}
		prerequisites.set(chain.conclusion, incoming);
		if (chain.conclusion === id || chain.premises.includes(id)) for (const member of [...chain.premises, chain.conclusion]) direct.add(member);
	}
	const anchorWords = words(node);
	const overlap = (map: Map<string, Set<string>>, candidate: string) => [...(map.get(id) ?? [])].filter((value) => map.get(candidate)?.has(value)).sort();
	return graph.nodes.filter((candidate) => !direct.has(candidate.id)).map((candidate) => ({
		node: candidate,
		sharedPrerequisites: overlap(prerequisites, candidate.id),
		sharedConsequences: overlap(consequences, candidate.id),
		sharedWords: [...words(candidate)].filter((word) => anchorWords.has(word)).sort(),
	})).filter((c) => c.sharedPrerequisites.length + c.sharedConsequences.length + c.sharedWords.length > 0)
		.sort((a, b) => (b.sharedPrerequisites.length + b.sharedConsequences.length) - (a.sharedPrerequisites.length + a.sharedConsequences.length) || b.sharedWords.length - a.sharedWords.length || a.node.id.localeCompare(b.node.id));
}
