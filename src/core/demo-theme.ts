/** The app theme handed to every demo: CSS variables, a dark page and the
 *  reading font. Injected FIRST in <head>, so a demo's own CSS still wins;
 *  the builder is told to use these variables. The same CSS runs in the
 *  builder's headless test and in the lesson's sandboxed iframe. */

export const DEMO_THEME_VARS = {
	"--lh-bg": "#141414",
	"--lh-surface": "#1c1c1c",
	"--lh-surface-2": "#2a2a2a",
	"--lh-border": "#434343",
	"--lh-text": "#e6e6e6",
	"--lh-muted": "#a1a1a1",
	"--lh-blue": "#7cacf8",
	"--lh-teal": "#5fd4c4",
	"--lh-amber": "#e5b55a",
	"--lh-red": "#f28b82",
	"--lh-green": "#7fd18b",
	"--lh-font": `"LH Sans", system-ui, -apple-system, "Segoe UI", sans-serif`,
	"--lh-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/** Only these app-owned neutral and reading roles cross the sandbox bridge.
 * Series colors deliberately remain the demo's data palette. */
export const DEMO_APPEARANCE_PROPERTIES = {
	"--lh-bg": "--background",
	"--lh-surface": "--card",
	"--lh-surface-2": "--accent",
	"--lh-border": "--border",
	"--lh-text": "--foreground",
	"--lh-muted": "--muted-foreground",
	"--lh-heading-weight": "--lh-heading-weight",
	"--lh-ink-strong": "--lh-ink-strong",
	"--lh-ink-italic": "--lh-ink-italic",
} as const;

/** Values come from computed parent CSS after appearance preferences apply.
 * Font names from next/font are private to the parent document, so the
 * bundled iframe reading face is the fallback for explicit local fonts. */
export function demoAppearanceVars(read: (name: string) => string, family?: string | null): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const [name, source] of Object.entries(DEMO_APPEARANCE_PROPERTIES)) {
		const value = read(source).trim();
		if (value) vars[name] = value;
	}
	vars["--lh-font"] = family ? `${JSON.stringify(family)}, "LH Sans", system-ui, sans-serif` : DEMO_THEME_VARS["--lh-font"];
	return vars;
}

export const DEMO_FONT_PATH = "/fonts/source-sans-3-latin.woff2";

/** The theme <style>. `font` loads the reading font: a srcdoc iframe
 *  resolves the root-relative URL against the app page (CORS header in
 *  next.config.ts). The headless test has no app server, so it skips it. */
export function demoThemeStyle(font = false): string {
	const vars = Object.entries(DEMO_THEME_VARS).map(([k, v]) => `${k}:${v}`).join(";");
	const face = font
		? `@font-face{font-family:"LH Sans";src:url("${DEMO_FONT_PATH}") format("woff2");font-weight:200 900;font-display:swap}`
		: "";
	return `<style data-lh-theme>${face}:root{color-scheme:dark;${vars}}html{background:var(--lh-bg);color:var(--lh-text);font-family:var(--lh-font)}button,input,select,textarea{font:inherit}h1,h2,h3,h4,h5,h6{font-weight:var(--lh-heading-weight,700)}strong,b{color:var(--lh-ink-strong,var(--lh-text))}em,i{color:var(--lh-ink-italic,var(--lh-text))}::selection{background:color-mix(in srgb,var(--lh-text) 24%,var(--lh-bg))}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:1px solid var(--lh-muted);outline-offset:2px}</style>`;
}

/** Insert the theme at the start of <head> (or of the document). */
export function injectDemoTheme(html: string, font = false): string {
	const style = demoThemeStyle(font);
	const head = /<head(?:\s[^>]*)?>/i;
	const root = /<html(?:\s[^>]*)?>/i;
	if (head.test(html)) return html.replace(head, (m) => `${m}${style}`);
	if (root.test(html)) return html.replace(root, (m) => `${m}<head>${style}</head>`);
	return `${style}${html}`;
}

/** Demos built before the dark default declare a light page. They open
 *  inverted unless the learner set the switch. */
export function demoPrefersInvert(html: string): boolean {
	const head = html.slice(0, 20_000);
	if (/color-scheme\s*:\s*dark/i.test(head)) return false;
	if (/color-scheme\s*:\s*light/i.test(head)) return true;
	return /background(?:-color)?\s*:\s*(?:#fff(?:fff)?\b|white\b)/i.test(head);
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
