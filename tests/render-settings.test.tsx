/**
 * Settings-surface render tests (thin settings wave): SSR of the section
 * components pins the THIN markup — toggle rows, the graph ladder's
 * graying, the mode control's honest disabled state, the role rows and
 * tool rows. Fetches don't run under renderToStaticMarkup (effects never
 * fire), so the SSR state IS the loading state — asserted as such.
 * Same tsx classic-JSX shim as render-sidebar.test.tsx.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TOGGLE_TOOLS, AgentSection } from "../components/settings/agent-section.tsx";
import { AppearanceSection, GraphSection } from "../components/settings/appearance-section.tsx";
import { KeysSection } from "../components/settings/keys-section.tsx";
import { KeyboardSection } from "../components/settings/keyboard-section.tsx";
import type { GraphSettings } from "../src/core/index.ts";
import { SettingsDialogBody } from "../components/settings/settings-dialog-content.tsx";
import { SettingsDialogProvider } from "../components/settings/settings-dialog.tsx";
import { KEYBOARD_ACTIONS } from "../src/core/index.ts";
import { readdirSync, readFileSync } from "node:fs";
import { ConnectionRow } from "../components/settings/connection-controls.tsx";
import { SettingsFailure, SettingsGroup, SettingsSection } from "../components/settings/controls.tsx";

/** The full opening tag of the element carrying a testid — attribute
 *  order in React output is not contractual, so assertions run on the
 *  whole tag instead of ordered regex chains. */
function tagOf(html: string, testid: string): string {
	const i = html.indexOf(`data-testid="${testid}"`);
	assert.ok(i >= 0, `missing ${testid}`);
	return html.slice(html.lastIndexOf("<", i), html.indexOf(">", i) + 1);
}

describe("SettingsDialog (the designed surface, SSR)", () => {
	it("provider CLOSED: children only — no dialog, no portal content", () => {
		const html = renderToStaticMarkup(
			<SettingsDialogProvider>
				<p>the app</p>
			</SettingsDialogProvider>,
		);
		assert.ok(html.includes("the app"));
		assert.ok(!html.includes("settings-backdrop"));
		assert.ok(!html.includes("settings-dialog"));
	});

	it("the dialog frame: role=dialog + the ✕ + the six-section nav, Providers first and General last", () => {
		const html = renderToStaticMarkup(<SettingsDialogBody onClose={() => {}} />);
		assert.ok(html.includes('role="dialog"'));
		assert.ok(html.includes('aria-modal="true"'));
		assert.ok(html.includes('aria-label="Close settings"'));
		for (const id of ["general", "keys", "agent", "appearance", "graph", "keyboard"]) {
			assert.ok(html.includes(`data-testid="settings-nav-${id}"`), id);
		}
		// Providers is the first landing section; internal keys deep links survive.
		assert.ok(tagOf(html, "settings-nav-keys").includes('aria-current="true"'));
		assert.ok(html.indexOf('data-testid="settings-nav-keys"') < html.indexOf('data-testid="settings-nav-general"'));
		assert.ok(tagOf(html, "settings-nav-keyboard").includes('aria-current="false"'));
		// Fetches don't run under SSR — the loading state IS the SSR state.
		assert.ok(html.includes("Loading settings…"));
		// Modal-only doctrine: no link back to /settings anywhere in it.
		assert.ok(!html.includes('href="/settings"'));
	});
});

describe("Settings has no Files section (feature 009)", () => {
	it("in either mode", () => {
		for (const hosted of [false, true]) {
			const html = renderToStaticMarkup(<SettingsDialogProvider hosted={hosted}><SettingsDialogBody onClose={() => {}} /></SettingsDialogProvider>);
			assert.ok(!html.includes("settings-nav-files"));
			assert.ok(!html.includes(">Files<"));
		}
	});
});

describe("AgentSection (thin SSR)", () => {
	it("renders the three model SLOT rows (slots-only, fix wave: unpicked reads —, no Default option)", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} graph={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		for (const slot of ["strong", "cheap", "vision"]) {
			assert.ok(html.includes(`data-testid="slot-row-${slot}"`), slot);
			// The shared model-picker dropdown as the opened menu (owner,
			// 2026-09-20), the thin trigger as the collapsed look.
			assert.ok(html.includes(`data-testid="slot-model-${slot}"`), `${slot} model trigger`);
			assert.ok(html.includes(`data-testid="slot-thinking-${slot}"`), `${slot} thinking trigger`);
			// the roster hint rides every row
			assert.ok(html.includes("The main model for your sessions") || slot !== "strong", "strong roster");
		}
		// Fix wave: no Default anywhere — an unpicked slot reads "—"
		// (the owner's no-factory-fallback language), and no menu
		// carries a Default row (menu-default testid is retired).
		assert.equal((html.match(/>Default<\/span>/g) ?? []).length, 0, "no Default trigger");
		assert.ok(!html.includes('data-testid="menu-default"'), "no Default row");
		assert.equal((html.match(/>—<\/span>/g) ?? []).length, 6, "three slots × two — triggers");
		// the per-role rows are GONE (slots-only)
		for (const role of ["researcher", "demoBuilder", "visualMaker"]) {
			assert.ok(!html.includes(`data-testid="role-row-${role}"`), `${role} retired`);
		}
		assert.ok(html.includes('data-testid="group-models"'), "Models sub-group");
		assert.ok(html.includes('data-testid="group-tools"'), "Tools sub-group");
		assert.ok(html.includes('data-testid="group-prompts"'), "System prompts sub-group");
	});

	it("the search-engine row renders with its live reason (search wave 2026-09-20)", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} graph={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		assert.ok(html.includes('data-testid="search-engine-row"'), "the row");
		assert.ok(html.includes('data-testid="search-engine-trigger"'), "the trigger");
		// SSR: /api/search never fired → no reason line yet, trigger reads Automatic
		assert.ok(html.includes("Automatic"), "unset engine reads Automatic");
		// the explicit preference shows the chosen engine in the trigger
		const html2 = renderToStaticMarkup(
			<AgentSection agent={{ search: { engine: "tavily" } }} models={undefined} graph={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />,
		);
		assert.ok(html2.includes("Tavily"), "pinned engine visible in the trigger");
	});

	it("the prober graph-tools row: FIRST in the Tools group, default ON, its own key (wave 7)", () => {
		// Default state: graph on, graphTools absent → ON, the describing
		// hint rides (the search-row hint discipline).
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} graph={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		const toolsGroup = html.split('data-testid="group-tools"')[1] ?? "";
		const rows = [...toolsGroup.matchAll(/data-testid="(graph-tools-row|tool-row-\w+)"/g)].map((m) => m[1]);
		assert.equal(rows[0], "graph-tools-row", "graph tools is the FIRST row of the Tools group");
		// (the apostrophe in "sessions'" HTML-escapes — match up to it)
		assert.ok(html.includes("Lets the tutor consult your knowledge map between sessions"), "the describing hint");
		assert.ok((html.split('data-testid="graph-tools-row"')[1] ?? "").includes('aria-checked="true"'), "absent = on");
		const rowHtml = html.split('data-testid="graph-tools-row"')[1]?.split('data-testid="tool-row-')[0] ?? "";
		assert.ok(!tagOf(html, "graph-tools-row").includes("data-disabled"), "available while the graph is on (the search row may lock, with no keys in SSR)");
		assert.ok(rowHtml.includes("Lets the tutor"));
	});

	it("graph disabled dims the graph-tools row with the honest hint (the predicate composes)", () => {
		const html = renderToStaticMarkup(
			<AgentSection agent={undefined} models={undefined} graph={{ enabled: false }} onSectionChange={() => {}} onModelsChange={() => {}} />,
		);
		const row = html.split('data-testid="graph-tools-row"')[1]?.split('data-testid="tool-row-')[0] ?? "";
		const tag = tagOf(html, "graph-tools-row");
		assert.ok(tag.includes('data-disabled="true"'), "the row is unavailable when the graph is off");
		assert.ok(!/ opacity-\d|"opacity-\d/.test(tag), "no opacity on the row");
		assert.ok(row.includes("text-muted-foreground"), "muted ink on the label");
		assert.ok(tagOf(html, "toggle-graph-tools").includes("disabled"), "the control locks");
		assert.ok(row.includes("Graph is disabled"), "the reason hint replaces the description");
		assert.ok(row.includes("disabled"), "toggle untouchable while the graph is off");
	});

	it("an explicit graphTools off shows stored-off (the record never lies)", () => {
		const html = renderToStaticMarkup(
			<AgentSection agent={{ graphTools: { enabled: false } }} models={undefined} graph={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />,
		);
		const row = html.split('data-testid="graph-tools-row"')[1] ?? "";
		assert.ok(row.includes('aria-checked="false"'), "stored-off renders off");
	});

	it("renders the owner's tool list — research, demo, visual, pdf, math check (feature 007)", () => {
		assert.deepEqual([...TOGGLE_TOOLS], ["research", "demo", "visual", "pdf", "math_check", "ml_visuals", "model_hub", "papers", "pages"]);
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} graph={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		for (const id of TOGGLE_TOOLS) assert.ok(html.includes(`data-testid="tool-row-${id}"`), id);
	});

	it("tools default ON (absent key = enabled)", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} graph={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		for (const id of TOGGLE_TOOLS) {
			assert.ok(tagOf(html, `toggle-tool-${id.replaceAll("_", "-")}`).includes('aria-checked="true"'), `${id} defaults on`);
		}
	});

	it("an overridden SLOT shows its model in the trigger, tools carry the delta", () => {
		const html = renderToStaticMarkup(
			<AgentSection
				agent={{ tools: { demo: false } }}
				models={{ strong: { model: { provider: "zai", id: "glm-4.7-flash" } } }}
				onSectionChange={() => {}}
				onModelsChange={() => {}}
			/>,
		);
		// The trigger shows the stored id even with no catalog loaded (a
		// trigger reading "Default" over a live override would lie).
		assert.ok(html.includes("glm-4.7-flash"), "the override id is visible (prettyModel form, no auto-caps)");
		assert.ok(tagOf(html, "toggle-tool-demo").includes('aria-checked="false"'), "demo off");
		assert.ok(tagOf(html, "toggle-tool-visual").includes('aria-checked="true"'), "visual still on");
	});

	it("prompts show the loading state under SSR (effects never fire)", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} graph={undefined} onSectionChange={() => {}} onModelsChange={() => {}} />);
		assert.ok(html.includes("Loading prompt segments"));
	});
});

describe("GraphSection — master switch + chunk budget (wave 7 + 2026-10-02)", () => {
	// Wave 7 (owner ruling 2026-09-23): the section is the master switch —
	// the embedding/clustering/labeling rungs and the BYOK model picker are
	// gone (clustering is the free birth-session partition, labels ARE
	// session names). The chunk budget (2026-10-02) joined as the second and
	// only other control — it denominates the coverage ring and gates the
	// auto-extraction trigger, resolved through the same core resolver the
	// server uses (the 4096-fallback fix).
	it("renders the master-switch row — EXTRACTION since 2026-10-06 (the data channel, renamed when rendering split off)", () => {
		const html = renderToStaticMarkup(<GraphSection graph={undefined} onSectionChange={() => {}} />);
		assert.ok(html.includes('data-testid="graph-row-enabled"'));
		assert.ok(html.includes(">Extraction<"), "the row names the DATA channel, not 'Graph'");
		assert.ok(!html.includes("graph-row-embedding"), "the dead rungs render nothing");
		assert.ok(!html.includes("Embedding model"), "the picker is gone");
		assert.ok(!html.includes("graph-row-clustering"));
		assert.ok(!html.includes("graph-row-labeling"));
		assert.ok(tagOf(html, "toggle-extraction-enabled").includes('aria-checked="true"'), "absent record = factory ON");
	});

	it("a stored off record shows the extraction switch off", () => {
		const html = renderToStaticMarkup(<GraphSection graph={{ enabled: false }} onSectionChange={() => {}} />);
		assert.ok(tagOf(html, "toggle-extraction-enabled").includes('aria-checked="false"'));
	});

	it("the GRAPH RENDERING row (2026-10-06): display-only — absent record = factory ON, stored off shows off", () => {
		const html = renderToStaticMarkup(<GraphSection graph={undefined} onSectionChange={() => {}} />);
		assert.ok(html.includes('data-testid="graph-row-rendering"'));
		assert.ok(html.includes(">Graph rendering<"));
		assert.ok(tagOf(html, "toggle-graph-rendering-enabled").includes('aria-checked="true"'), "the home defaults to the canvas");
		const off = renderToStaticMarkup(<GraphSection graph={{ rendering: false }} onSectionChange={() => {}} />);
		assert.ok(tagOf(html, "toggle-extraction-enabled").includes('aria-checked="true"'), "rendering off does NOT touch extraction");
		assert.ok(tagOf(off, "toggle-graph-rendering-enabled").includes('aria-checked="false"'));
	});

	it("the chunk-budget row: unset shows EMPTY with the factory placeholder + hint — one truth with the trigger", () => {
		const html = renderToStaticMarkup(<GraphSection graph={undefined} onSectionChange={() => {}} />);
		const input = tagOf(html, "input-chunk-tokens");
		assert.ok(input.includes('placeholder="4096"'), "the placeholder IS the resolved factory default");
		assert.ok(!/value="\d/.test(input), "unset renders EMPTY, not a materialized 4096");
		assert.ok(html.includes(">4096 tok</"), "the hint reports the resolved truth");
	});

	it("a stored budget shows its value and denominates the hint", () => {
		const html = renderToStaticMarkup(
			<GraphSection graph={{ enabled: true, extractionChunkTokens: 6000 }} onSectionChange={() => {}} />,
		);
		assert.ok(tagOf(html, "input-chunk-tokens").includes('value="6000"'));
		assert.ok(html.includes(">6000 tok</"));
	});
});

describe("KeysSection (thin SSR)", () => {
	it("SSR = the loading state (effects never fire)", () => {
		const html = renderToStaticMarkup(<KeysSection />);
		assert.ok(html.includes("Loading keys…"));
	});
});

describe("AppearanceSection (thin SSR)", () => {
	it("no mode row: the app is dark-only, so there is no control to show", () => {
		const html = renderToStaticMarkup(<AppearanceSection appearance={undefined} onSectionChange={() => {}} />);
		assert.ok(!html.includes('data-testid="row-mode"'));
		assert.ok(!html.includes("Coming soon"));
	});

	it("hex inputs carry the factory placeholders; prose size resolves against the factory", () => {
		const html = renderToStaticMarkup(<AppearanceSection appearance={undefined} onSectionChange={() => {}} />);
		assert.ok(html.includes(`placeholder="#000000"`));
		// The reading font is the searchable dropdown now (font-menu
		// wave): its trigger shows the factory family; the emphasis
		// inks' empty state is "same as text" (the old hexes died with
		// the factory token change).
		assert.ok(html.includes('data-testid="font-trigger"'));
		assert.equal((html.match(/placeholder="same as text"/g) ?? []).length, 2);
		assert.ok(html.includes('placeholder="17"'), "reading size shows the factory default");
		assert.ok(html.includes('placeholder="700"'), "heading weight shows the factory default");
	});

	it("a set background shows in the input, not the placeholder", () => {
		const html = renderToStaticMarkup(
			<AppearanceSection appearance={{ background: "#1a1a2e" }} onSectionChange={() => {}} />,
		);
		assert.ok(html.includes(`value="#1a1a2e"`));
	});
});

describe("KeyboardSection (thin SSR)", () => {
	it("renders every registry action in its scope group", () => {
		const html = renderToStaticMarkup(<KeyboardSection />);
		for (const def of KEYBOARD_ACTIONS) {
			assert.ok(html.includes(`data-testid="kbd-row-${def.id}"`), def.id);
		}
		assert.ok(html.includes("kbd-scope-global"));
		assert.ok(html.includes("kbd-scope-chat"));
	});

	it("open-settings is in the registry with the settings chord", () => {
		const def = KEYBOARD_ACTIONS.find((a) => a.id === "open-settings");
		assert.ok(def, "the action exists");
		assert.equal(def?.scope, "global");
		assert.equal(def?.binding, "mod+,");
	});

	it("displayOnly actions list but never offer Rebind", () => {
		const html = renderToStaticMarkup(<KeyboardSection />);
		assert.ok(html.includes("Fixed — part of this screen"));
		assert.ok(!html.includes(`data-testid="kbd-rebind-question-next-row"`), "surface keys stay put");
		// The model-menu entries are GONE entirely (owner, 2026-10-10):
		// obvious in-field navigation, not settings material.
		assert.ok(!html.includes("Model menu"), "model-menu rows removed");
		assert.ok(!KEYBOARD_ACTIONS.some((a) => a.id as string === "model-menu-walk"));
		assert.ok(!KEYBOARD_ACTIONS.some((a) => a.id as string === "model-menu-pick"));
	});
});

it("renders the approved ML tools copy and accessible toggle names", () => {
	const html = renderToStaticMarkup(<AgentSection agent={{}} onSectionChange={() => {}} />);
	for (const [id, label, hint] of [
		["ml-visuals", "ML visuals", "Shows tokens, attention, sampling, networks and shapes as interactive panels"],
		["model-hub", "Model hub", "Looks up model configs, datasets and papers on Hugging Face"],
		["papers", "Papers", "Finds papers on arXiv and Semantic Scholar and cites their pages"],
		["pages", "Pages", "Creates and revises pages you can edit beside the lesson"],
	]) {
		assert.ok(html.includes(label!)); assert.ok(html.includes(hint!));
		assert.ok(tagOf(html, `toggle-tool-${id}`).includes(`aria-label="tool ${id!.replaceAll("-", " ")}"`));
	}
	assert.ok(html.indexOf("ML visuals") > html.indexOf("Math check"));
	assert.ok(html.indexOf("Creates and revises pages") > html.indexOf("Finds papers on arXiv"), "Pages comes after Papers");
});

describe("Settings meets DESIGN.md (feature 009, findings 6-12)", () => {
	const dir = new URL("../components/settings/", import.meta.url);
	const sources = readdirSync(dir).filter((name) => name.endsWith(".tsx")).map((name) => [name, readFileSync(new URL(name, dir), "utf8")] as const);
	const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

	it("titles sit on the scale in the title serif", () => {
		const html = renderToStaticMarkup(<SettingsSection title="Agent"><SettingsGroup label="Models">x</SettingsGroup></SettingsSection>);
		assert.match(html, /<h2 class="[^"]*font-title[^"]*text-xl/);
		assert.match(html, /<h3 class="[^"]*font-title[^"]*text-lg/);
	});

	it("radii are 6px controls and 10px cards only; no rounded-sm, -xl or bare rounded", () => {
		for (const [name, source] of sources) assert.doesNotMatch(strip(source), /\brounded-(sm|xl|2xl|xs)\b|\brounded(?=[\s"`])/, name);
		assert.ok(sources.find(([name]) => name === "settings-dialog-content.tsx")![1].includes("rounded-lg border border-border bg-background"), "dialog frame is 10px");
	});

	it("connection rows have no separator", () => {
		const html = renderToStaticMarkup(<ConnectionRow label="ChatGPT" action="Connect" disabled={false} onAction={() => {}} testid="row" />);
		assert.ok(!tagOf(html, "row").includes("border-b"));
		for (const [name, source] of sources) assert.doesNotMatch(strip(source), /\bborder-b\b|\blast:border-b/, name);
	});

	it("no opacity on text or surfaces in components/settings, apart from cancelling the field primitive's", () => {
		for (const [name, source] of sources) {
			const cleaned = strip(source).replaceAll("group-data-[disabled=true]/field:opacity-100", "");
			assert.doesNotMatch(cleaned, /\bopacity-\d|\b(bg|border|text)-[a-z-]+\/\d+/, name);
		}
	});

	it("a disabled Button in Settings uses muted ink, not its opacity", () => {
		const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
		assert.match(css, /\[data-settings-surface\] \[data-slot="button"\]:disabled \{ opacity: 1; color: var\(--muted-foreground\); \}/);
	});

	it("small controls grow to 44px on coarse pointers", () => {
		const html = renderToStaticMarkup(<AgentSection agent={undefined} models={undefined} graph={undefined} compaction={undefined} onSectionChange={() => {}} onModelsChange={() => {}} onCompactionChange={() => {}} />);
		assert.ok(tagOf(html, "slot-model-strong").includes("pointer-coarse:h-11"));
		assert.ok(tagOf(html, "input-compaction-threshold").includes("pointer-coarse:h-11"));
		assert.ok(tagOf(html, "quiz-mechanics-free").includes("pointer-coarse:h-11"));
		assert.ok(tagOf(renderToStaticMarkup(<ConnectionRow label="x" action="Connect" disabled={false} onAction={() => {}} actionTestid="act" />), "act").includes("pointer-coarse:min-h-11"));
		assert.ok(tagOf(html, "toggle-tool-demo").includes("pointer-coarse:before:-inset-3.5"));
		for (const name of ["keys-section.tsx"]) assert.doesNotMatch(sources.find(([file]) => file === name)![1], /h-7 (?![^"`]*pointer-coarse:h-11)/);
	});

	it("a failure reads in words, with details on demand and Try again", () => {
		const html = renderToStaticMarkup(<SettingsFailure testid="f" retryTestid="r" detailsTestid="d" message="Your Agent settings could not be saved." detail="500: secret" onRetry={() => {}} />);
		assert.ok(html.includes("Your Agent settings could not be saved."));
		assert.ok(tagOf(html, "f").includes('role="alert"'));
		assert.ok(html.includes("Show details") && !html.includes("500: secret"), "raw detail stays hidden until asked");
		assert.ok(html.includes("Try again"));
	});
});
