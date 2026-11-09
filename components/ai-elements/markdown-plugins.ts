/**
 * Streamdown plugins for message text (feature 024, US4; owner decision
 * 2026-11-09: math eager, code highlighter on demand).
 *
 * Math (KaTeX) stays in the page so math is server-rendered as before. The
 * code highlighter (shiki) is no longer in any page's first-load code: the
 * first message with a code block starts its download (one shared promise)
 * and nothing waits for it. Streamdown shows a code block's plain text until
 * a highlighter exists, then highlights it in place, as it always has while
 * shiki works. A failed download keeps the plain code and is logged.
 *
 * The server never loads the highlighter, so a server render and the
 * hydrating client render agree: both render without it.
 */
import { useMemo, useSyncExternalStore } from "react";
import { cjk } from "@streamdown/cjk";
import { createMathPlugin } from "@streamdown/math";
import remarkBreaks from "remark-breaks";
import type { PluginConfig } from "streamdown";

// ─── Detector (pure) ──────────────────────────────────────────────────────────

// A fence line, also inside quotes and list items.
const FENCE = /^[ \t>]*(?:(?:[-*+]|\d+[.)])[ \t]+)?[ \t>]*(`{3,}|~{3,})[ \t]*([^\s`]*)/;

/** Whether `text` has a code block for the highlighter: a fenced block
 * (backticks or tildes, finished or still streaming) other than mermaid,
 * which the app renders itself. Inline code needs nothing. */
export function needsCode(text: string): boolean {
	if (!text.includes("```") && !text.includes("~~~")) return false;
	let open: string | null = null;
	for (const line of text.split("\n")) {
		const m = FENCE.exec(line);
		if (open !== null) {
			// Closes on a fence of the same character, at least as long.
			if (m && m[1]![0] === open[0] && m[1]!.length >= open.length && !m[2]) open = null;
			continue;
		}
		if (!m) continue;
		if (m[1]![0] === "`" && line.slice(line.indexOf(m[1]!) + m[1]!.length).includes("`")) continue; // inline, not a fence
		if (m[2]!.toLowerCase() !== "mermaid") return true;
		open = m[1]!;
	}
	return false;
}

// ─── Code highlighter, shared download ────────────────────────────────────────

// The paper code theme (feature 025, T056: components/ai-elements/paper-code-theme.ts,
// its colours --lh-code-* variables that app/paper.css points at the current
// theme's paper inks), loaded with the highlighter. Type-only version skew:
// @streamdown/code bundles shiki@3 types while streamdown@2.5 expects shiki@4
// types; both work at runtime, so the plugin is held as unknown.
let codePlugin: unknown = undefined;
let request: Promise<void> | undefined;
const listeners = new Set<() => void>();

/** Start (once) and await the highlighter download. Never rejects. */
export function loadCodeHighlighter(): Promise<void> {
	return request ??= Promise.all([import("@streamdown/code"), import("./paper-code-theme")]).then(
		([mod, { paperCodeTheme }]) => {
			const themes = [paperCodeTheme("paper-light", "light"), paperCodeTheme("paper-dark", "dark")];
			codePlugin = mod.createCodePlugin({ themes } as unknown as Parameters<typeof mod.createCodePlugin>[0]);
			for (const listener of listeners) listener();
		},
		(error: unknown) => {
			console.error("The code highlighter could not be loaded; code stays plain.", error);
		},
	);
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}
const getSnapshot = () => codePlugin;
// The server reports what it has (only tests load it there); a hydrating
// client must report what the server rendered: no highlighter.
const getServerSnapshot = () => (typeof window === "undefined" ? codePlugin : undefined);

// ─── Plugin sets ──────────────────────────────────────────────────────────────

const base = {
	cjk: {
		...cjk,
		// remark-breaks rides in the cjk plugin's remarkPluginsAfter slot
		// (public PluginConfig API): Streamdown's bare `remarkPlugins` PROP
		// would REPLACE the defaults ([remark-gfm, codeMeta]), silently
		// dropping GFM and code-fence metastring parsing. The slot appends
		// after the defaults, which is the standard remark-gfm → remark-breaks
		// order.
		remarkPluginsAfter: [...cjk.remarkPluginsAfter, remarkBreaks],
	},
	math: createMathPlugin({ singleDollarTextMath: true }),
};

/** Plugins without the highlighter: text without code, and code until the
 * highlighter arrives. One stable object. */
export const streamdownPlugins = base as unknown as PluginConfig;

let withCode: { plugin: unknown; config: PluginConfig } | undefined;
function pluginsWith(plugin: unknown): PluginConfig {
	if (!withCode || withCode.plugin !== plugin) withCode = { plugin, config: { ...base, code: plugin } as unknown as PluginConfig };
	return withCode.config;
}

/** The plugins for `text`. Text with a code block starts the highlighter
 * download (client only) and gets it once it arrives; it renders at once
 * either way. Text without code keeps one stable plugin object. */
export function useStreamdownPlugins(text: string): PluginConfig {
	const code = useMemo(() => needsCode(text), [text]);
	if (code && typeof window !== "undefined") void loadCodeHighlighter();
	const plugin = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	return code && plugin ? pluginsWith(plugin) : streamdownPlugins;
}
