import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { GraphView } from "../components/graph-view.tsx";
import type { GraphSnapshot } from "../src/core/index.ts";
(globalThis as Record<string, unknown>).React = React;

const render = (node: React.ReactNode) => renderToStaticMarkup(<ServerEventsProvider>{node}</ServerEventsProvider>);

const empty: GraphSnapshot = { nodes: [], propositions: [], edges: [], logicalEdges: [], impLinks: [], chains: [], sessions: {}, fileSources: {}, nodeSessions: {}, clusters: [] };

test("server-seeded empty graph is ready with no canvas or engine placeholder", () => {
	const html = render(<GraphView initialSnapshot={empty} />);
	assert.ok(html.includes('data-graph-ready="true"'));
	assert.ok(html.includes("Start a session or import notes"));
	assert.ok(!html.includes("<canvas"));
});

test("unseeded graph is not marked ready before its snapshot arrives", () => {
	assert.ok(!render(<GraphView />).includes('data-graph-ready="true"'));
});

test("populated graph waits for its renderer and feeds before publishing readiness", () => {
	const node = { id: "n_test", name: "Evidence", statement: "Evidence changes belief.", aliases: [], createdAt: "2026-10-27", provenance: [] };
	const html = render(<GraphView initialSnapshot={{ ...empty, nodes: [node], propositions: [node] }} />);
	assert.ok(html.includes("<canvas"));
	assert.ok(html.includes('role="status" aria-label="Loading knowledge graph"'));
	assert.ok(html.includes('data-testid="graph-search-toggle"'), "search remains available while its engine downloads");
	assert.ok(!html.includes('data-graph-ready="true"'));
});
