/** Settings search (feature 009, FR-017, research R12): the index against the
 *  rows that really render, in every section and both modes. No network. */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { SETTINGS_INDEX, TOOL_COPY, TOGGLE_TOOLS, isDynamicSettingsRow, searchSettings, type SettingsIndexSection } from "../components/settings/settings-index.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Node: dom.window.Node, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent, MutationObserver: dom.window.MutationObserver,
	requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0), cancelAnimationFrame: clearTimeout });
const { AgentSection } = await import("../components/settings/agent-section.tsx");
const { AppearanceSection, GraphSection } = await import("../components/settings/appearance-section.tsx");
const { GraphDisplayControls } = await import("../components/settings/graph-display-section.tsx");
const { KeyboardSection } = await import("../components/settings/keyboard-section.tsx");
const { KeysSection } = await import("../components/settings/keys-section.tsx");
const { UpdateSettings } = await import("../components/settings/update-settings.tsx");
const { DEFAULT_RENDER_SETTINGS, KEYBOARD_ACTIONS } = await import("../src/core/index.ts");

const rowsOf = (html: string) => [...html.matchAll(/data-settings-row="([^"]+)"/g)].map((match) => match[1]!);
const roots: { root: Root; host: HTMLElement }[] = [];
const realFetch = globalThis.fetch;
after(async () => {
	for (const { root, host } of roots) { await act(async () => root.unmount()); host.remove(); }
	globalThis.fetch = realFetch;
});
async function clientRows(element: React.ReactElement) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	roots.push({ root, host });
	await act(async () => { root.render(element); });
	await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
	return rowsOf(host.innerHTML);
}

const noop = () => {};
async function renderedRows(desktop: boolean): Promise<Record<SettingsIndexSection, string[]>> {
	globalThis.fetch = (async (url: string) => {
		if (String(url) === "/api/keys") return Response.json({ keys: [{ id: "OPENAI_API_KEY", info: null, present: true, masked: "…ab12 (64 chars)", source: "file", shadowedByEnv: false }], providers: [{ id: "openai", envVar: "OPENAI_API_KEY", label: "OpenAI" }, { id: "x", envVar: "X_API_KEY", label: "X" }] });
		if (String(url) === "/api/settings/prompts") return Response.json({ prober: [], teacher: [] });
		if (String(url) === "/api/models") return Response.json({ models: [], slots: { strong: null, cheap: null, vision: null } });
		if (String(url) === "/api/search") return Response.json({ available: false, engine: null, reason: "" });
		return Response.json({});
	}) as typeof fetch;
	const lh = (window as unknown as { lh?: unknown });
	lh.lh = desktop ? { getUpdateState: async () => ({ status: "idle", version: null, revision: 0 }), onUpdateStatus: () => () => {}, checkForUpdates: async () => {}, installUpdate: noop, onOpenSettings: () => noop, expandWindow: noop } : undefined;
	const rows = {
		keys: await clientRows(<KeysSection />),
		agent: rowsOf(renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} graph={undefined} compaction={undefined} onSectionChange={noop} onModelsChange={noop} onCompactionChange={noop} />)),
		appearance: rowsOf(renderToStaticMarkup(<AppearanceSection appearance={undefined} onSectionChange={noop} />)),
		graph: [
			...rowsOf(renderToStaticMarkup(<GraphSection graph={undefined} onSectionChange={noop} />)),
			...rowsOf(renderToStaticMarkup(<GraphDisplayControls settings={DEFAULT_RENDER_SETTINGS} changeSettings={noop} />)),
		],
		keyboard: rowsOf(renderToStaticMarkup(<KeyboardSection />)),
		general: await clientRows(<UpdateSettings autoUpdate onAutoUpdateChange={noop} version="1.0.0" homepage="" />),
	};
	lh.lh = undefined;
	return rows;
}

describe("the index does not drift from the rows", () => {
	for (const desktop of [false, true]) {
		it(`${desktop ? "desktop" : "hosted or browser"}: every row indexed, every indexed row rendered`, async () => {
			const rows = await renderedRows(desktop);
			for (const [section, ids] of Object.entries(rows)) {
				const indexed = SETTINGS_INDEX.filter((entry) => entry.section === section && (desktop || !entry.desktopOnly)).map((entry) => entry.row);
				for (const id of ids) if (!isDynamicSettingsRow(id)) assert.ok(indexed.includes(id), `${section}/${id} has no index entry`);
				for (const id of indexed) assert.ok(ids.includes(id), `${section}/${id} is indexed but did not render`);
			}
			assert.ok(rows.keys.includes("OPENAI_API_KEY"), "a stored provider row is still a deep-link target");
		});
	}

	it("no duplicate row ids", () => {
		const ids = SETTINGS_INDEX.map((entry) => `${entry.section}/${entry.row}`);
		assert.deepEqual(ids, [...new Set(ids)]);
	});

	it("every keyboard action and tool is indexed from its shared copy", () => {
		for (const action of KEYBOARD_ACTIONS) assert.ok(SETTINGS_INDEX.some((entry) => entry.row === `kbd-${action.id}` && entry.label === action.label));
		for (const id of TOGGLE_TOOLS) assert.ok(SETTINGS_INDEX.some((entry) => entry.row === `tool-${id}` && entry.hint === TOOL_COPY[id].hint));
	});
});

describe("searchSettings", () => {
	const local = { hosted: false, desktop: false };
	it('"thinking" and "font" find rows, not just category names', () => {
		const thinking = searchSettings("thinking", local).map((entry) => entry.row);
		for (const row of ["slot-strong", "slot-cheap", "slot-vision", "kbd-cycle-thinking"]) assert.ok(thinking.includes(row), row);
		const font = searchSettings("font", local).map((entry) => entry.row);
		assert.deepEqual(font.slice(0, 2).sort(), ["font", "prose-size"]);
	});
	it("matches hints as well as names", () => {
		assert.ok(searchSettings("wolfram", local).some((entry) => entry.row === "tool-math_check"));
	});
	it("filters desktop-only and hosted-only rows by mode", () => {
		assert.equal(searchSettings("automatic updates", { hosted: false, desktop: false }).some((entry) => entry.row === "auto-update"), false);
		assert.equal(searchSettings("automatic updates", { hosted: true, desktop: false }).some((entry) => entry.row === "auto-update"), false);
		assert.equal(searchSettings("automatic updates", { hosted: false, desktop: true }).some((entry) => entry.row === "auto-update"), true);
		const index = [{ section: "general", row: "only-hosted", label: "Hosted thing", hostedOnly: true }] as const;
		assert.equal(searchSettings("hosted thing", local, index).length, 0);
		assert.equal(searchSettings("hosted thing", { hosted: true, desktop: false }, index).length, 1);
	});
	it("an empty query or a miss gives nothing", () => {
		assert.deepEqual(searchSettings("   ", local), []);
		assert.deepEqual(searchSettings("zzzqqq", local), []);
	});
});
