/**
 * Home's "Knowledge graph" section (feature 002): the live graph at a fixed
 * height (420px, 260px on phones) on a raised 10px box; Expand turns the
 * same element into a full-viewport dialog with a Close control; the empty
 * graph says how it fills in one sentence (no centred icon); the header
 * counts read "ideas · chains". SSR pins (effects never run here).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphView, graphStatsLabel } from "../components/graph-view.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import type { GraphSnapshot } from "../src/core/index.ts";

const empty = { nodes: [], propositions: [], edges: [], logicalEdges: [], impLinks: [], chains: [], sessions: {}, fileSources: {} } as unknown as GraphSnapshot;

const render = (expanded: boolean, snapshot: GraphSnapshot = empty) =>
	renderToStaticMarkup(<ServerEventsProvider><GraphView initialSnapshot={snapshot} section={{ expanded, onCollapse: () => {} }} /></ServerEventsProvider>);

describe("graph section", () => {
	it("sits in a fixed-height raised box", () => {
		const html = render(false);
		assert.match(html, /data-testid="graph-section-view"/);
		assert.match(html, /h-\[260px\][^"]*rounded-\[10px\][^"]*bg-card[^"]*sm:h-\[420px\]/);
		assert.doesNotMatch(html, /role="dialog"/);
		assert.doesNotMatch(html, /data-testid="graph-collapse"/);
	});

	it("an empty graph says how it fills, in one sentence and without an icon", () => {
		const html = render(false);
		assert.match(html, /<p data-testid="graph-empty"[^>]*>Start a session or import notes to build your graph\.<\/p>/);
		assert.doesNotMatch(html, /Knowledge graph<\/div>/, "the old Empty title is gone");
		assert.doesNotMatch(html, /lucide-waypoints/);
	});

	it("expanded: the same element is a full-viewport dialog with Close", () => {
		const html = render(true);
		assert.match(html, /role="dialog"/);
		assert.match(html, /aria-modal="true"/);
		assert.match(html, /aria-label="Knowledge graph"/);
		assert.match(html, /fixed inset-0 z-50/);
		assert.match(html, /data-testid="graph-collapse"[^>]*>.*Close<\/button>/);
	});

	it("never renders Import notes inside the graph", () => {
		assert.doesNotMatch(render(false), /Import notes/);
	});
});

describe("graphStatsLabel", () => {
	it("counts ideas and chains, singular and plural", () => {
		assert.equal(graphStatsLabel({ ideas: 38, chains: 12 }), "38 ideas · 12 chains");
		assert.equal(graphStatsLabel({ ideas: 1, chains: 1 }), "1 idea · 1 chain");
		assert.equal(graphStatsLabel({ ideas: 2, chains: 0 }), "2 ideas · 0 chains");
	});

	it("is absent for an empty or unknown graph", () => {
		assert.equal(graphStatsLabel({ ideas: 0, chains: 0 }), null);
		assert.equal(graphStatsLabel(null), null);
	});
});
