/**
 * Feature 024: Notebook contrast (owner, 2026-11-07: "Raise to pass").
 * Reads the theme tokens from notebook.css and checks WCAG 2 contrast:
 * faint and gray text 4.5:1, the focus ring 3:1, on paper and on shelf,
 * in light, dark and system-dark.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EXPORT_PALETTE } from "../src/core/notebook-export.ts";

const css = readFileSync(new URL("../app/(app)/notebook/notebook.css", import.meta.url), "utf8");

/** The `{ … }` body of the first rule whose selector text ends with `selector`. */
function block(selector: string): string {
	const at = css.indexOf(`${selector} {`);
	assert.ok(at >= 0, `no rule for ${selector}`);
	const open = css.indexOf("{", at);
	return css.slice(open + 1, css.indexOf("}", open));
}

function tokens(body: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [, name, hex] of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) if (name && hex) out[name] = hex.toLowerCase();
	return out;
}

const THEMES = {
	light: tokens(block('.nb-root[data-nb-theme="light"]')),
	dark: tokens(block('.nb-root[data-nb-theme="dark"]')),
	"system dark": tokens(block('.nb-root[data-nb-theme="system"]')),
};

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
	const at = (i: number) => channel(parseInt(hex.slice(i, i + 2), 16) / 255);
	return 0.2126 * at(1) + 0.7152 * at(3) + 0.0722 * at(5);
}
function contrast(a: string, b: string): number {
	const la = luminance(a), lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("notebook contrast", () => {
	it("computes WCAG ratios", () => {
		assert.equal(contrast("#000000", "#ffffff").toFixed(2), "21.00");
		assert.equal(contrast("#777777", "#ffffff").toFixed(2), "4.48");
	});

	for (const [theme, t] of Object.entries(THEMES)) {
		it(`${theme}: faint and gray text reach 4.5:1, the focus ring 3:1, on paper and shelf`, () => {
			const tok = (name: string): string => {
				const value = t[name];
				assert.ok(value, `${theme}: --${name} missing`);
				return value;
			};
			for (const ground of ["paper", "shelf"]) {
				for (const text of ["faint", "text-gray"]) {
					const ratio = contrast(tok(text), tok(ground));
					assert.ok(ratio >= 4.5, `${theme}: --${text} ${tok(text)} on --${ground} ${tok(ground)} is ${ratio.toFixed(2)}:1`);
				}
				const ring = contrast(tok("nb-focus"), tok(ground));
				assert.ok(ring >= 3, `${theme}: --nb-focus ${tok("nb-focus")} on --${ground} is ${ring.toFixed(2)}:1`);
			}
		});
	}

	it("system dark repeats the dark tokens", () => {
		assert.deepEqual(THEMES["system dark"], THEMES.dark);
	});

	it("focus outlines use --nb-focus; tethers and marks keep --riddle-line", () => {
		assert.doesNotMatch(css, /outline:\s*2px solid var\(--riddle-line\)/);
		assert.match(css, /--ring:\s*var\(--nb-focus\)/);
		assert.match(css, /\.nb-root :focus-visible \{ outline: 2px solid var\(--nb-focus\)/);
		assert.match(css, /text-decoration-color:\s*var\(--riddle-line\)/);
	});

	it("the slash and [[ menus ring their keyboard-active row", () => {
		const rule = /\[data-testid="page-wiki-menu"\]\) \[aria-selected="true"\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
		assert.match(rule, /outline:\s*2px solid var\(--nb-focus\)/);
	});

	const AI_INKS = ["riddle-ink", "text-blue", "text-green", "text-red", "text-purple", "text-brown", "text-orange"];
	const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	const hexOf = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
	/** `ink` at `alpha` over `ground`, as the browser composites an element's opacity. */
	const over = (ink: string, ground: string, alpha: number) => {
		const a = rgb(ink), g = rgb(ground);
		return hexOf(a.map((v, i) => v * alpha + (g[i] ?? 0) * (1 - alpha)));
	};
	const faded = (theme: keyof typeof THEMES): number => {
		const selector = { light: '.nb-root[data-nb-theme="light"]', dark: '.nb-root[data-nb-theme="dark"]', "system dark": '.nb-root[data-nb-theme="system"]' }[theme];
		const value = /--nb-faded:\s*([\d.]+)/.exec(block(selector))?.[1];
		assert.ok(value, `${theme}: --nb-faded missing`);
		return Number(value);
	};

	for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
		const t = THEMES[theme];
		it(`${theme}: every AI ink reaches 4.5:1 on paper and shelf, and on paper while faded`, () => {
			const alpha = faded(theme);
			assert.ok(alpha > 0 && alpha <= 1);
			for (const name of AI_INKS) {
				const ink = t[name];
				assert.ok(ink, `${theme}: --${name} missing`);
				for (const ground of ["paper", "shelf"]) {
					const ratio = contrast(ink, t[ground]!);
					assert.ok(ratio >= 4.5, `${theme}: --${name} ${ink} on --${ground} is ${ratio.toFixed(2)}:1`);
				}
				const ratio = contrast(over(ink, t.paper!, alpha), t.paper!);
				assert.ok(ratio >= 4.5, `${theme}: --${name} ${ink} faded to ${alpha} on --paper is ${ratio.toFixed(2)}:1`);
			}
		});
	}

	it("the fade is the smallest step that passes (two decimals), and the faded rule uses it", () => {
		for (const theme of ["light", "dark"] as const) {
			const t = THEMES[theme], lower = Math.round((faded(theme) - 0.01) * 100) / 100;
			const worst = Math.min(...AI_INKS.map((name) => contrast(over(t[name]!, t.paper!, lower), t.paper!)));
			assert.ok(worst < 4.5, `${theme}: --nb-faded could be ${lower} (worst ${worst.toFixed(2)}:1)`);
		}
		assert.equal(faded("system dark"), faded("dark"));
		assert.match(css, /\[data-faded="true"\] \{ opacity: var\(--nb-faded\); \}/);
	});

	it("a faded note reads at full strength once the keyboard reaches it", () => {
		assert.match(css, /\[data-faded="true"\]:focus-within \{ opacity: 1; \}/);
	});

	it("touch: taps act at once with a paper-toned tint; the running cost keeps fixed-width digits", () => {
		assert.match(css, /touch-action: manipulation;\s*-webkit-tap-highlight-color: color-mix\(in srgb, var\(--ink\) 8%, transparent\)/);
		assert.match(block(".nb-root .nb-corner-hint"), /font-variant-numeric: tabular-nums/);
	});

	it("exports use the light faint and gray", () => {
		assert.equal(EXPORT_PALETTE.faint, THEMES.light.faint);
		assert.equal(EXPORT_PALETTE["text-gray"], THEMES.light["text-gray"]);
		for (const name of AI_INKS.filter((n) => n.startsWith("text-"))) assert.equal(EXPORT_PALETTE[name], THEMES.light[name], name);
	});
});
