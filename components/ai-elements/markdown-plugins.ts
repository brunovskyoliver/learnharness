/**
 * Markdown renderers on demand (feature 024, US4). The math (KaTeX + its CSS)
 * and code-highlighting (shiki) plugins are no longer in any page's
 * first-load code: a message whose text needs one starts its download (one
 * shared promise per plugin, kicked from the first render that needs it) and
 * waits for it before appearing, so raw `$…$` or an unhighlighted block never
 * flashes (owner, Clarifications Q3). Text that needs neither renders at once.
 *
 * The server never loads them, so a server render and the hydrating client
 * render agree: both treat every renderer as pending. A failed import counts
 * as settled: the text renders with the plugins that did arrive, and the
 * error is logged (constitution IV: never a wait forever).
 */
import { useMemo, useRef, useSyncExternalStore } from "react";
import { cjk } from "@streamdown/cjk";
import remarkBreaks from "remark-breaks";
import type { PluginConfig } from "streamdown";
import { fromMarkdown } from "mdast-util-from-markdown";
import { mathFromMarkdown } from "mdast-util-math";
import { math as mathSyntax } from "micromark-extension-math";
import { loadKatexCss } from "@/components/katex-css";

// ─── Detectors (pure) ─────────────────────────────────────────────────────────

type MdNode = { type: string; lang?: string | null; position?: { start: { offset?: number }; end: { offset?: number } }; children?: MdNode[] };

export interface RendererNeeds { math: boolean; code: boolean }

const NONE: RendererNeeds = { math: false, code: false };
const escaped = (text: string, i: number) => {
	let n = 0; while (i > 0 && text[--i] === "\\") n++;
	return n % 2 === 1;
};

/** Which on-demand renderers `text` needs, read with the rendering stack's own
 * CommonMark + math grammar. Math: any unescaped `$`, `\(` or `\[` outside
 * code (conservative: a lone `$5` waits too, a raw-math flash never happens).
 * Code: any code block other than a mermaid fence (mermaid is app-rendered).
 * Inline code needs neither. */
export function rendererNeeds(text: string): RendererNeeds {
	if (!text) return NONE;
	const mathCandidate = /\$|\\[([]/.test(text);
	// A fenced or indented block needs a fence marker or a 4-space/tab line.
	const codeCandidate = /```|~~~|(^|\n)( {4}|\t)/.test(text);
	if (!mathCandidate && !codeCandidate) return NONE;
	let tree: MdNode;
	try {
		tree = fromMarkdown(text, { extensions: [mathSyntax({ singleDollarTextMath: true })], mdastExtensions: [mathFromMarkdown()] }) as MdNode;
	} catch {
		return { math: mathCandidate, code: codeCandidate };
	}
	let code = false;
	const literal: Array<[number, number]> = [];
	const pending: MdNode[] = [tree];
	while (pending.length) {
		const node = pending.pop()!;
		if (node.type === "code" || node.type === "inlineCode") {
			if (node.type === "code" && (node.lang ?? "").toLowerCase() !== "mermaid") code = true;
			const start = node.position?.start.offset, end = node.position?.end.offset;
			if (start !== undefined && end !== undefined) literal.push([start, end]);
		} else if (node.children) pending.push(...node.children);
	}
	let math = false;
	if (mathCandidate) {
		const inLiteral = (i: number) => literal.some(([s, e]) => i >= s && i < e);
		for (let i = 0; i < text.length && !math; i++) {
			const c = text[i];
			const opens = c === "$" || (c === "\\" && (text[i + 1] === "(" || text[i + 1] === "["));
			if (opens && !escaped(text, i) && !inLiteral(i)) math = true;
		}
	}
	return { math, code };
}

export const needsMath = (text: string): boolean => rendererNeeds(text).math;
export const needsCode = (text: string): boolean => rendererNeeds(text).code;

// ─── Shared loaders ───────────────────────────────────────────────────────────

type Kind = "math" | "code";
type Loaded = { plugin: unknown } | { failed: true };
/** Immutable snapshot: replaced on every settle so subscribers re-render. */
type RendererState = Readonly<Partial<Record<Kind, Loaded>>>;

const PENDING: RendererState = Object.freeze({});
let state: RendererState = PENDING;
const listeners = new Set<() => void>();
const requests: Partial<Record<Kind, Promise<void>>> = {};

// The house code theme (moved from message.tsx). Type-only version skew:
// @streamdown/code bundles shiki@3 types while streamdown@2.5 expects shiki@4
// types; both work at runtime, so the plugin is held as unknown.
const CODE_THEMES = ["github-light", {
	name: "learnharness-dark",
	type: "dark",
	colors: { "editor.background": "#141414", "editor.foreground": "#dedede" },
	tokenColors: [
		{ scope: ["comment"], settings: { foreground: "#929292" } },
		{ scope: ["string", "constant.other.symbol"], settings: { foreground: "#b9c7ad" } },
		{ scope: ["constant.numeric"], settings: { foreground: "#d0be96" } },
		{ scope: ["keyword", "storage"], settings: { foreground: "#b1b9c4" } },
		{ scope: ["entity.name.function", "support.function"], settings: { foreground: "#b6ccdf" } },
		{ scope: ["entity.name.type", "support.class"], settings: { foreground: "#bcafca" } },
	],
}] as const;

const importers: Record<Kind, () => Promise<unknown>> = {
	math: async () => {
		// The KaTeX stylesheet rides with the plugin: math appears styled.
		const [mod] = await Promise.all([import("@streamdown/math"), loadKatexCss()]);
		return mod.createMathPlugin({ singleDollarTextMath: true });
	},
	code: async () => {
		const mod = await import("@streamdown/code");
		return mod.createCodePlugin({ themes: CODE_THEMES } as unknown as Parameters<typeof mod.createCodePlugin>[0]);
	},
};

function settle(kind: Kind, loaded: Loaded) {
	state = Object.freeze({ ...state, [kind]: loaded });
	for (const listener of listeners) listener();
}

/** Start (once) and await the download of one renderer. Never rejects. */
export function loadRenderer(kind: Kind): Promise<void> {
	return requests[kind] ??= importers[kind]().then(
		(plugin) => settle(kind, { plugin }),
		(error: unknown) => {
			console.error(`The ${kind} renderer could not be loaded; rendering without it.`, error);
			settle(kind, { failed: true });
		},
	);
}

/** Load every renderer up front (tests, and anything that must render
 * synchronously afterwards). */
export function preloadRenderers(): Promise<void> {
	return Promise.all([loadRenderer("math"), loadRenderer("code")]).then(() => undefined);
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}
const getSnapshot = () => state;
// The server reports what it has (only tests preload there); a hydrating
// client must report what the server rendered, which is nothing loaded.
const getServerSnapshot = () => (typeof window === "undefined" ? state : PENDING);

// ─── Plugin sets ──────────────────────────────────────────────────────────────

const cjkWithBreaks = {
	...cjk,
	// remark-breaks rides in the cjk plugin's remarkPluginsAfter slot (public
	// PluginConfig API): Streamdown's bare `remarkPlugins` PROP would REPLACE
	// the defaults ([remark-gfm, codeMeta]), silently dropping GFM and
	// code-fence metastring parsing. The slot appends after the defaults,
	// which is the standard remark-gfm → remark-breaks order.
	remarkPluginsAfter: [...cjk.remarkPluginsAfter, remarkBreaks],
};

/** One stable config object per (math, code) combination and snapshot, so a
 * message's plugins only change when a renderer it uses arrives. */
const configs = new WeakMap<RendererState, Map<string, PluginConfig>>();
function pluginConfig(snapshot: RendererState, needs: RendererNeeds): PluginConfig {
	const math = needs.math && snapshot.math && "plugin" in snapshot.math ? snapshot.math.plugin : undefined;
	const code = needs.code && snapshot.code && "plugin" in snapshot.code ? snapshot.code.plugin : undefined;
	// Unused renderers stay out of the key, so a plain message keeps the same
	// object when a renderer it does not use arrives.
	const key = `${math ? "m" : ""}${code ? "c" : ""}`;
	let byKey = configs.get(snapshot);
	if (!byKey) configs.set(snapshot, (byKey = new Map()));
	let config = byKey.get(key);
	if (!config) {
		config = { cjk: cjkWithBreaks, ...(code ? { code } : {}), ...(math ? { math } : {}) } as unknown as PluginConfig;
		byKey.set(key, config);
	}
	return key === "" ? plainConfig : config;
}
const plainConfig = { cjk: cjkWithBreaks } as unknown as PluginConfig;

export interface StreamdownRenderers {
	/** True once every renderer `text` needs has settled (loaded or failed). */
	ready: boolean;
	plugins: PluginConfig;
}

export function renderersFor(snapshot: RendererState, needs: RendererNeeds): StreamdownRenderers {
	const ready = (!needs.math || snapshot.math !== undefined) && (!needs.code || snapshot.code !== undefined);
	return { ready, plugins: pluginConfig(snapshot, needs) };
}

/** The renderer snapshot, re-rendering the caller when a renderer settles.
 * Kicks the downloads `needs` asks for (client only; idempotent). */
export function useRendererState(needs: RendererNeeds): RendererState {
	if (typeof window !== "undefined") {
		if (needs.math) void loadRenderer("math");
		if (needs.code) void loadRenderer("code");
	}
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface ShownMarkdown {
	/** The text to render now: `text` once its renderers are ready; until
	 * then the last text of this caller that was ready, or null (not shown
	 * yet). Nothing that appeared disappears while a stream reaches its first
	 * formula; it holds there, as it holds an unfinished block. */
	text: string | null;
	plugins: PluginConfig;
	ready: boolean;
}

export function useStreamdownPlugins(text: string): ShownMarkdown {
	const needs = useMemo(() => rendererNeeds(text), [text]);
	const snapshot = useRendererState(needs);
	const current = renderersFor(snapshot, needs);
	const held = useRef<{ text: string; needs: RendererNeeds } | null>(null);
	if (current.ready) {
		held.current = { text, needs };
		return { text, plugins: current.plugins, ready: true };
	}
	if (held.current) return { text: held.current.text, plugins: renderersFor(snapshot, held.current.needs).plugins, ready: false };
	return { text: null, plugins: current.plugins, ready: false };
}
