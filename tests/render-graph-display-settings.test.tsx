/**
 * Settings → Graph → Display (feature 002): the graph's display controls,
 * moved out of the gear that floated over the graph. SSR pins: the full
 * control set renders from the settings value, dependent controls lock with
 * their switch, and the section shows an honest loading state before the
 * saved settings arrive (effects never run under renderToStaticMarkup).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphDisplayControls, GraphDisplaySection } from "../components/settings/graph-display-section.tsx";
import { DEFAULT_RENDER_SETTINGS } from "../src/core/index.ts";

describe("GraphDisplayControls", () => {
	it("renders every display control the gear panel had", () => {
		const html = renderToStaticMarkup(<GraphDisplayControls settings={DEFAULT_RENDER_SETTINGS} changeSettings={() => {}} />);
		for (const label of ["Node size", "Edge width", "Arrowhead size", "Label size", "Labels until zoom", "Regions", "Background colors", "Dilation", "Blur", "Edge alpha", "Bitmap resolution", "Cluster labels", "Cluster label size", "Physics", "Node repulsion", "Edge attraction", "Edge length", "Central pull", "Cluster pull", "Friction", "Depth anchor", "Depth strength", "Depth spacing", "Base ring radius"]) {
			assert.ok(html.includes(label), label);
		}
	});

	it("region controls use the muted ink and lock while background colors are off, with no opacity", () => {
		const off = { ...DEFAULT_RENDER_SETTINGS, regions: { ...DEFAULT_RENDER_SETTINGS.regions, enabled: false } };
		const html = renderToStaticMarkup(<GraphDisplayControls settings={off} changeSettings={() => {}} />);
		assert.match(html, /<span class="[^"]*text-muted-foreground[^"]*">Dilation/);
		assert.ok(!html.includes("opacity-"));
	});
});

describe("GraphDisplaySection", () => {
	it("says it is loading until the saved settings arrive", () => {
		const html = renderToStaticMarkup(<GraphDisplaySection />);
		assert.match(html, /role="status"[^>]*>Loading display settings…/);
		assert.doesNotMatch(html, /Node size/);
	});
});
