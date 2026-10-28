/**
 * Empty-graph chrome pins (empty-graph chrome wave, owner 2026-09-25):
 * Search and chains render only when the snapshot has nodes (dead
 * controls are lies — the honesty principle). Feature 002 moved Import
 * notes to Home's "Knowledge graph" section header (always there — the
 * empty graph's entry point) and the display-settings gear into
 * Settings → Graph → Display.
 * GraphChromeRow is the pure seam (the DeleteNodeBody pattern): SSR of
 * both states pins the ruling. Fetches don't run under renderToStaticMarkup
 * (effects never fire), so these pins exercise the component directly.
 */

import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphChromeRow } from "../components/graph-view.tsx";

/** Ref doubles — the SSR harness never attaches them. */
const ref = { current: null };

const PROPS = {
	query: "",
	onQuery: () => {},
	noMatch: false,
	searchInputRef: ref,
	onOpenChains: () => {},
};

describe("GraphChromeRow — the empty-graph ruling (owner, 2026-09-25)", () => {
	it("EMPTY graph: nothing renders (Import notes lives in Home's section header)", () => {
		const html = renderToStaticMarkup(createElement(GraphChromeRow, { ...PROPS, isEmpty: true }));
		assert.ok(!html.includes('data-testid="import-notes"'), "Import notes moved to the section header");
		assert.ok(!html.includes("Search ideas…"), "search is a lie on an empty graph");
		// the settings gear is the lucide-settings svg (tooltip wave: its old
		// native title is gone — the styled tooltip carries the label now)
		assert.ok(!html.includes("lucide-settings"), "settings is a lie on an empty graph");
		assert.ok(!html.includes('data-testid="open-chain-table"'), "chains is a lie on an empty graph");
		assert.ok(!html.includes("graph-chrome-fade-in"), "nothing gated = nothing fading in");
	});

	it("POPULATED graph: search and chains render with the fade; no Import, no gear", () => {
		const html = renderToStaticMarkup(createElement(GraphChromeRow, { ...PROPS, isEmpty: false }));
		assert.ok(!html.includes('data-testid="import-notes"'), "Import notes moved to the section header");
		assert.ok(html.includes("Search ideas…"));
		assert.ok(!html.includes("lucide-settings"), "the display gear moved into Settings → Graph");
		assert.ok(html.includes('data-testid="open-chain-table"'), "the chains entry renders");
		// the appear-once fade rides exactly the two gated controls
		assert.equal(html.split("graph-chrome-fade-in").length - 1, 2, "two fade carriers: search + chains");
	});

	it("the no-match note renders only when the wrapper says so (its truth stays upstream)", () => {
		const html = renderToStaticMarkup(
			createElement(GraphChromeRow, { ...PROPS, isEmpty: false, query: "zzz", noMatch: true }),
		);
		assert.ok(html.includes("No matching ideas."));
		const quiet = renderToStaticMarkup(
			createElement(GraphChromeRow, { ...PROPS, isEmpty: false, query: "zzz", noMatch: false }),
		);
		assert.ok(!quiet.includes("No matching ideas."));
	});
});