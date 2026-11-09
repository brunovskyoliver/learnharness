/**
 * The Settings search index (feature 009, research R12): one plain entry per
 * row, loaded with the dialog. tests/settings-index.test.tsx fails when a
 * rendered `data-settings-row` has no entry here, or an entry no row.
 */
import { AUTH_KEYS, KEYBOARD_ACTIONS, NATIVE_SUBSCRIPTIONS, fuzzyScore } from "@/src/core";

export type SettingsIndexSection = "customize" | "reviewers" | "keys" | "agent" | "graph" | "keyboard" | "general";

export interface SettingsIndexEntry {
	section: SettingsIndexSection;
	/** The `data-settings-row` value, which is also the deep-link row id. */
	row: string;
	label: string;
	hint?: string;
	hostedOnly?: boolean;
	desktopOnly?: boolean;
}

/** The owner's final toggleable-tool list (confirm with the user before
 *  changing; the Teacher stream settled this 2026-09-19). */
export const TOGGLE_TOOLS = ["research", "demo", "visual", "pdf", "math_check", "ml_visuals", "model_hub", "papers", "pages", "diagrams"] as const;

/** Row copy for the tool toggles (ui-v2: every tool row gets a description). */
export const TOOL_COPY: Record<(typeof TOGGLE_TOOLS)[number], { label: string; hint: string }> = {
	research: { label: "Research", hint: "Checks facts and current data on the web in the background" },
	demo: { label: "Demos", hint: "Builds interactive demos you can play with in the lesson" },
	visual: { label: "Figures", hint: "Draws precise figures: plots, geometry, number lines" },
	pdf: { label: "PDF reading", hint: "Reads PDFs you share and cites the pages it used" },
	math_check: { label: "Math check", hint: "Checks computed answers and equivalent forms with Wolfram" },
	ml_visuals: { label: "ML visuals", hint: "Shows tokens, attention, sampling, networks and shapes as interactive panels" },
	model_hub: { label: "Model hub", hint: "Looks up model configs, datasets and papers on Hugging Face" },
	papers: { label: "Papers", hint: "Finds papers on arXiv and Semantic Scholar and cites their pages" },
	pages: { label: "Pages", hint: "Creates and revises pages you can edit beside the lesson" },
	diagrams: { label: "Diagrams", hint: "Proposes diagrams and concept maps for you to review and approve" },
};

export const AUTO_UPDATE_HINT = "Check at startup and every 24 hours. Turning this off does not stop updates already in progress or ready to install.";

/** The graph display sliders and switches, in panel order. */
const DISPLAY_ROWS = ["Node size", "Edge width", "Arrowhead size", "Label size", "Labels until zoom", "Background colors", "Dilation", "Blur", "Edge alpha", "Bitmap resolution", "Cluster labels", "Cluster label size", "Node repulsion", "Edge attraction", "Edge length", "Central pull", "Cluster pull", "Friction", "Depth anchor", "Depth strength", "Depth spacing", "Base ring radius"] as const;

export function displayRowId(label: string): string {
	return `display-${label.toLowerCase().replaceAll(" ", "-")}`;
}

export const SETTINGS_INDEX: readonly SettingsIndexEntry[] = [
	// Customize (feature 025): the shared Appearance, then Notebook's own options.
	{ section: "customize", row: "theme", label: "Appearance", hint: "Theme: system, light or dark" },
	{ section: "customize", row: "text-size", label: "Text size", hint: "Small, default or large" },
	{ section: "customize", row: "lettering", label: "Lettering", hint: "The tutor's hand: serif or plain" },
	{ section: "customize", row: "ink", label: "Ink colour", hint: "The colour the AI writes in" },
	{ section: "customize", row: "start-mode", label: "New notes start in", hint: "In Notebook: thinks with you, or when you ask" },
	{ section: "customize", row: "pointer-ink", label: "Ink from the pointer", hint: "In Notebook" },
	{ section: "customize", row: "pace", label: "Reading pace", hint: "In Notebook: regular or slow" },
	{ section: "customize", row: "layout", label: "Where questions appear", hint: "In Notebook: both margins, right margin or marks only" },
	{ section: "reviewers", row: "reviewers", label: "Reviewers", hint: "Whose eyes a note is read with" },
	{ section: "reviewers", row: "new-reviewer", label: "New reviewer" },
	...AUTH_KEYS.map((key) => ({ section: "keys" as const, row: key.id, label: `${key.label} key`, hint: "Search" })),
	{ section: "keys", row: "add-provider", label: "Add provider key", hint: "Model API keys" },
	{ section: "keys", row: "chatgpt", label: "ChatGPT", hint: "Subscriptions" },
	...NATIVE_SUBSCRIPTIONS.map((sub) => ({ section: "keys" as const, row: sub.providerId, label: sub.label, hint: "Subscriptions" })),
	{ section: "agent", row: "slot-strong", label: "Strong model and thinking", hint: "The main model for your sessions" },
	{ section: "agent", row: "slot-cheap", label: "Cheap model and thinking", hint: "The assistants that research, build demos, and grade your work" },
	{ section: "agent", row: "slot-vision", label: "Vision model and thinking", hint: "The assistants that draw and read PDFs" },
	{ section: "agent", row: "graph-tools", label: "Graph tools", hint: "Lets the tutor consult your knowledge map between sessions" },
	{ section: "agent", row: "quiz-mechanics", label: "Quizzing", hint: "How both tutors check your understanding" },
	...TOGGLE_TOOLS.map((id) => ({ section: "agent" as const, row: `tool-${id}`, label: TOOL_COPY[id].label, hint: TOOL_COPY[id].hint })),
	{ section: "agent", row: "search-engine", label: "Search engine" },
	{ section: "agent", row: "compaction-threshold", label: "Compaction threshold" },
	{ section: "agent", row: "system-prompts", label: "System prompts" },
	{ section: "graph", row: "extraction", label: "Extraction", hint: "Off = the graph stops growing" },
	{ section: "graph", row: "rendering", label: "Graph rendering", hint: "Off = home shows the chains view" },
	{ section: "graph", row: "chunk-budget", label: "Extraction chunk budget" },
	...DISPLAY_ROWS.map((label) => ({ section: "graph" as const, row: displayRowId(label), label, hint: "Display" })),
	...KEYBOARD_ACTIONS.map((action) => ({ section: "keyboard" as const, row: `kbd-${action.id}`, label: action.label })),
	{ section: "general", row: "version", label: "Version", hint: "Release notes" },
	{ section: "general", row: "auto-update", label: "Automatic updates", hint: AUTO_UPDATE_HINT, desktopOnly: true },
];

/** Stored provider keys depend on the learner's data, so they can be deep
 *  linked but have no static entry. Curated keys are indexed above. */
export function isDynamicSettingsRow(row: string): boolean {
	return /^[A-Z0-9_]+$/.test(row) && !AUTH_KEYS.some((key) => key.id === row);
}

export function searchSettings(query: string, mode: { hosted: boolean; desktop: boolean }, index: readonly SettingsIndexEntry[] = SETTINGS_INDEX): SettingsIndexEntry[] {
	if (!query.trim()) return [];
	return index
		.filter((entry) => (!entry.hostedOnly || mode.hosted) && (!entry.desktopOnly || mode.desktop))
		.map((entry) => ({ entry, score: fuzzyScore(query, entry.label, entry.hint ?? "") }))
		.filter((hit): hit is { entry: SettingsIndexEntry; score: number } => hit.score !== null)
		.sort((a, b) => b.score - a.score)
		.map((hit) => hit.entry);
}
