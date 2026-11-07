"use client";

/** What a proposal or a version changes, in words, so colour never carries it. */
import type { ReactNode } from "react";
import type { DiagramDiff, DiagramEdgeRow } from "@/src/core";

const WHAT: Record<string, string> = { text: "text", position: "position", links: "links", type: "type" };

const edgeWords = (edge: DiagramEdgeRow) => `${edge.from} → ${edge.to}${edge.label ? ` (${edge.label})` : ""}`;

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
	if (count === 0) return null;
	return (
		<section className="flex flex-col gap-1" data-testid="diagram-diff-section" data-title={title}>
			<h4 className="text-xs font-medium text-faint">{title} ({count})</h4>
			<ul className="flex flex-col gap-0.5 text-sm text-ink [overflow-wrap:anywhere]">{children}</ul>
		</section>
	);
}

export function DiagramDiffView({ diff }: { diff: DiagramDiff }) {
	if (diff.empty) return <p className="text-sm text-graphite" data-testid="diagram-diff-empty">No changes.</p>;
	return (
		<div className="flex flex-col gap-3" data-testid="diagram-diff">
			{diff.formChanged && <p className="text-sm text-graphite">Changes the form.</p>}
			<Section title="Added nodes" count={diff.nodes.added.length}>{diff.nodes.added.map((node) => <li key={node.id}>{node.name}</li>)}</Section>
			<Section title="Removed nodes" count={diff.nodes.removed.length}>{diff.nodes.removed.map((node) => <li key={node.id}>{node.name}</li>)}</Section>
			<Section title="Changed nodes" count={diff.nodes.changed.length}>
				{diff.nodes.changed.map((node) => <li key={node.id}>{node.before === node.after ? node.after : `${node.before} → ${node.after}`} <span className="text-faint">· {node.what.map((what) => WHAT[what]).join(", ")}</span></li>)}
			</Section>
			<Section title="Added connections" count={diff.edges.added.length}>{diff.edges.added.map((edge) => <li key={edge.id}>{edgeWords(edge)}</li>)}</Section>
			<Section title="Removed connections" count={diff.edges.removed.length}>{diff.edges.removed.map((edge) => <li key={edge.id}>{edgeWords(edge)}</li>)}</Section>
			<Section title="Changed connections" count={diff.edges.changed.length}>{diff.edges.changed.map((edge) => <li key={edge.id}>{edgeWords(edge.before)} → {edgeWords(edge.after)}</li>)}</Section>
			<Section title="Added links" count={diff.links.added.length}>{diff.links.added.map((words) => <li key={words}>{words}</li>)}</Section>
			<Section title="Removed links" count={diff.links.removed.length}>{diff.links.removed.map((words) => <li key={words}>{words}</li>)}</Section>
		</div>
	);
}
