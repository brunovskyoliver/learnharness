/** The app theme handed to every demo: CSS variables, the page's colour
 *  scheme and the reading font. Neutral defaults go first in <head>; scrolling invariants go last, so authored
 *  content keeps its design while native scrollbar tracks stay hidden;
 *  the builder is told to use these variables. The same CSS runs in the
 *  builder's headless test and in the lesson's sandboxed iframe. */

/** The paper neutrals (app/paper.css, feature 025) a demo starts from, per
 *  scheme: bg paper, surface shelf, surface-2 code, border rule, text ink,
 *  muted faint. The live iframe then follows the app's resolved theme
 *  through the bridge; these are the defaults before (and without) it. */
export const DEMO_PAPER = {
	light: { "--lh-bg": "#f8f7f4", "--lh-surface": "#f1f0ec", "--lh-surface-2": "#ebe9e3", "--lh-border": "#dedbd4", "--lh-text": "#1d1c1a", "--lh-muted": "#716d67" },
	dark: { "--lh-bg": "#1a1a19", "--lh-surface": "#151514", "--lh-surface-2": "#151514", "--lh-border": "#33322f", "--lh-text": "#e9e7e2", "--lh-muted": "#858279" },
} as const;

const NEUTRALS = Object.keys(DEMO_PAPER.light) as (keyof typeof DEMO_PAPER.light)[];

/** The default data series per scheme. Dark keeps the kit's original
 *  palette (tuned for a dark ground); light has the same hues with HSL
 *  lightness lowered by the smallest 0.1% step that reaches 3:1 against
 *  both light paper and shelf (WCAG 1.4.11, feature 025). A demo's own
 *  colours still win. */
export const DEMO_SERIES = {
	light: { "--lh-blue": "#4488f5", "--lh-teal": "#299a8b", "--lh-amber": "#b5811d", "--lh-red": "#ec5a4d", "--lh-green": "#389d47" },
	dark: { "--lh-blue": "#7cacf8", "--lh-teal": "#5fd4c4", "--lh-amber": "#e5b55a", "--lh-red": "#f28b82", "--lh-green": "#7fd18b" },
} as const;
/** The kit's error text (`.k-error`, chrome, not data): the dark red series
 *  colour; on light, the same hue and saturation at the first 0.1% HSL-
 *  lightness step reaching 4.5:1 on paper, shelf and the error's own red
 *  tint over each (WCAG 1.4.3, feature 025). */
export const DEMO_ERROR_INK = { light: "#c92315", dark: "#f28b82" } as const;
/** The tint under `.k-error` text: the dark red at 12%. */
export const DEMO_ERROR_TINT = "rgba(242,139,130,.12)";
export const DEMO_SERIES_NAMES = Object.keys(DEMO_SERIES.light) as (keyof typeof DEMO_SERIES.light)[];

/** Defaults: each neutral and each series colour is `light-dark(light, dark)`,
 *  resolved by the page's `color-scheme` (the bridge sets it to the app's
 *  theme; the default follows the viewer's system). The series stay the
 *  demo's data palette: they never cross the bridge. */
export const DEMO_THEME_VARS = {
	...Object.fromEntries(NEUTRALS.map((name) => [name, `light-dark(${DEMO_PAPER.light[name]},${DEMO_PAPER.dark[name]})`])) as Record<keyof typeof DEMO_PAPER.light, string>,
	...Object.fromEntries(DEMO_SERIES_NAMES.map((name) => [name, `light-dark(${DEMO_SERIES.light[name]},${DEMO_SERIES.dark[name]})`])) as Record<keyof typeof DEMO_SERIES.light, string>,
	"--lh-font": `"LH Sans", system-ui, -apple-system, "Segoe UI", sans-serif`,
	"--lh-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
};

/** Only these app-owned neutral roles cross the sandbox bridge, read from the
 * paper tokens on <html>. Series colors deliberately remain the demo's data palette. */
export const DEMO_APPEARANCE_PROPERTIES = {
	"--lh-bg": "--paper",
	"--lh-surface": "--shelf",
	"--lh-surface-2": "--code",
	"--lh-border": "--rule",
	"--lh-text": "--ink",
	"--lh-muted": "--faint",
} as const;

/** Every key the iframe accepts: the neutrals, the font and the page's colour scheme. */
export const DEMO_BRIDGE_KEYS = [...Object.keys(DEMO_APPEARANCE_PROPERTIES), "--lh-font", "color-scheme"] as const;

/** The resolved scheme from a computed `color-scheme` ("light", "dark", or a
 *  list when nothing resolved it, which reads as light). */
export function demoScheme(colorScheme: string): "light" | "dark" {
	return /^\s*(only\s+)?dark\b/.test(colorScheme) ? "dark" : "light";
}

/** Values come from computed parent CSS after appearance preferences apply.
 * Font names from next/font are private to the parent document, so the
 * bundled iframe face (Instrument Sans) stands in, after an explicit family. */
export function demoAppearanceVars(read: (name: string) => string, family?: string | null): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const [name, source] of Object.entries(DEMO_APPEARANCE_PROPERTIES)) {
		const value = read(source).trim();
		if (value) vars[name] = value;
	}
	vars["--lh-font"] = family ? `${JSON.stringify(family)}, "LH Sans", system-ui, sans-serif` : DEMO_THEME_VARS["--lh-font"];
	vars["color-scheme"] = demoScheme(read("color-scheme"));
	return vars;
}

/** The app's UI face (Instrument Sans, latin, variable 400-700, OFL; public/fonts/OFL-InstrumentSans.txt). */
export const DEMO_FONT_PATH = "/fonts/instrument-sans-latin.woff2";

/** The theme <style>. `font` loads the reading font: a srcdoc iframe
 *  resolves the root-relative URL against the app page (CORS header in
 *  next.config.ts). The headless test has no app server, so it skips it. */
export function demoThemeStyle(font = false): string {
	const vars = Object.entries(DEMO_THEME_VARS).map(([k, v]) => `${k}:${v}`).join(";");
	const face = font
		? `@font-face{font-family:"LH Sans";src:url("${DEMO_FONT_PATH}") format("woff2");font-weight:400 700;font-stretch:75% 100%;font-display:swap}`
		: "";
	return `<style data-lh-theme>@layer lh-scrollbars;${face}:root{color-scheme:light dark;${vars}}html{background:var(--lh-bg);color:var(--lh-text);font-family:var(--lh-font)}button,input,select,textarea{font:inherit}::selection{background:color-mix(in srgb,var(--lh-text) 24%,var(--lh-bg))}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid var(--lh-muted);outline-offset:2px}</style>`;
}

/** Kept separate from overridable theme defaults. High specificity and
 * important defeat authored thin-scrollbar rules without disabling scrolling. */
export const DEMO_SCROLLBAR_CSS = `@layer lh-scrollbars{:root:root:root,:root:root:root *{scrollbar-width:none!important;-ms-overflow-style:none!important}:root:root:root::-webkit-scrollbar,:root:root:root *::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}}`;

/** Theme defaults precede authored CSS; the scrolling invariant follows it.
 * This works in sandboxed srcdoc, downloaded demos and the builder test. */
export function injectDemoTheme(html: string, font = false): string {
	const style = demoThemeStyle(font);
	const head = /<head(?:\s[^>]*)?>/i;
	const root = /<html(?:\s[^>]*)?>/i;
	const themed = head.test(html) ? html.replace(head, (m) => `${m}${style}`)
		: root.test(html) ? html.replace(root, (m) => `${m}<head>${style}</head>`)
		: `${style}${html}`;
	const invariant = `<style data-lh-scrollbars>${DEMO_SCROLLBAR_CSS}</style>`;
	if (/<\/body>/i.test(themed)) return themed.replace(/<\/body>/i, `${invariant}</body>`);
	return `${themed}${invariant}`;
}

/** The scheme a demo's own page declares: an explicit `color-scheme`, else a
 *  hard white or black page background; null when it uses the theme (or says
 *  nothing). */
export function demoDeclaredScheme(html: string): "light" | "dark" | null {
	const head = html.slice(0, 20_000);
	if (/color-scheme\s*:\s*dark/i.test(head)) return "dark";
	if (/color-scheme\s*:\s*light/i.test(head)) return "light";
	if (/background(?:-color)?\s*:\s*(?:#fff(?:fff)?\b|white\b)/i.test(head)) return "light";
	if (/background(?:-color)?\s*:\s*(?:#000(?:000)?\b|black\b)/i.test(head)) return "dark";
	return null;
}

/** A demo whose own page is the other scheme than the app's resolved theme
 *  opens inverted, unless the learner set the switch (feature 025: per
 *  resolved theme; before it the app was always dark). */
export function demoPrefersInvert(html: string, theme: "light" | "dark"): boolean {
	const declared = demoDeclaredScheme(html);
	return declared !== null && declared !== theme;
}

/** Evaluated in the headless page: the effective page background when it is
 *  light (relative luminance > 0.5), else null. */
export const LIGHT_BACKGROUND_PROBE = `(() => {
	const pick = (el) => {
		if (!el) return null;
		const m = getComputedStyle(el).backgroundColor.match(/[\\d.]+/g);
		if (!m) return null;
		const [r, g, b, a = 1] = m.map(Number);
		return a === 0 ? null : [r, g, b];
	};
	const c = pick(document.body) || pick(document.documentElement);
	if (!c) return null;
	const l = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
	return l > 0.5 ? "rgb(" + c.join(", ") + ")" : null;
})()`;
