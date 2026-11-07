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
	const SELECTORS = { light: '.nb-root[data-nb-theme="light"]', dark: '.nb-root[data-nb-theme="dark"]', "system dark": '.nb-root[data-nb-theme="system"]' } as const;
	/** The ink setting's name, and the colour token it maps --riddle to (§1.2). */
	const INK_SETTINGS = { ink: "riddle-ink", blue: "text-blue", green: "text-green", red: "text-red", purple: "text-purple", brown: "text-brown", orange: "text-orange" } as const;
	const num = (theme: keyof typeof THEMES, name: string): number => {
		const value = new RegExp(`--${name}:\\s*([\\d.]+);`).exec(block(SELECTORS[theme]))?.[1];
		assert.ok(value, `${theme}: --${name} missing`);
		return Number(value);
	};
	const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	const hexOf = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
	/** `ink` at `alpha` over `ground`, as the browser composites an element's opacity. */
	const over = (ink: string, ground: string, alpha: number) => {
		const a = rgb(ink), g = rgb(ground);
		return hexOf(a.map((v, i) => v * alpha + (g[i] ?? 0) * (1 - alpha)));
	};

	for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
		const t = THEMES[theme];
		it(`${theme}: every AI ink reaches 4.5:1 on paper and shelf`, () => {
			for (const name of AI_INKS) {
				const ink = t[name];
				assert.ok(ink, `${theme}: --${name} missing`);
				for (const ground of ["paper", "shelf"]) {
					const ratio = contrast(ink, t[ground]!);
					assert.ok(ratio >= 4.5, `${theme}: --${name} ${ink} on --${ground} is ${ratio.toFixed(2)}:1`);
				}
			}
		});
	}

	for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
		const t = THEMES[theme];
		for (const [setting, token] of Object.entries(INK_SETTINGS)) {
			it(`${theme}, ${setting} ink: faded words reach 4.5:1 on paper at --nb-faded-${setting}, and one step lower does not`, () => {
				const alpha = num(theme, `nb-faded-${setting}`), ink = t[token]!, paper = t.paper!;
				assert.ok(alpha > 0 && alpha < 1, `${theme}: --nb-faded-${setting} ${alpha} does not fade`);
				const ratio = contrast(over(ink, paper, alpha), paper);
				assert.ok(ratio >= 4.5, `${theme}: --${token} ${ink} at ${alpha} on --paper is ${ratio.toFixed(2)}:1`);
				const lower = Math.round((alpha - 0.01) * 100) / 100;
				const below = contrast(over(ink, paper, lower), paper);
				assert.ok(below < 4.5, `${theme}: --nb-faded-${setting} could be ${lower} (${below.toFixed(2)}:1)`);
			});
		}
		it(`${theme}: the default ink fades visibly; marks fade to Riddled's .38`, () => {
			assert.match(block(SELECTORS[theme]), /--nb-faded:\s*var\(--nb-faded-ink\);/);
			assert.ok(num(theme, "nb-faded-ink") <= 0.7, `${theme}: default ink fade ${num(theme, "nb-faded-ink")}`);
			assert.equal(num(theme, "nb-faded-mark"), 0.38);
		});
		it(`${theme}: the "{n} replies" line in a faded note stays at full strength and reaches 4.5:1`, () => {
			// The count is not inside the faded words, so it composites at opacity 1.
			assert.doesNotMatch(css, /\[data-faded="true"\][^{]*\.nb-note-(meta|count)/);
			const ratio = contrast(over(t.faint!, t.paper!, 1), t.paper!);
			assert.ok(ratio >= 4.5, `${theme}: --faint on --paper in a faded note is ${ratio.toFixed(2)}:1`);
		});
	}

	it("system dark repeats the dark fades", () => {
		for (const name of [...Object.keys(INK_SETTINGS).map((s) => `nb-faded-${s}`), "nb-faded-mark"]) assert.equal(num("system dark", name), num("dark", name), name);
	});

	it("each ink setting picks its own fade", () => {
		for (const [setting, token] of Object.entries(INK_SETTINGS)) {
			assert.ok(css.includes(`.nb-root[data-nb-ink="${setting}"] { --riddle: var(--${token}); --nb-faded: var(--nb-faded-${setting}); }`), setting);
		}
	});

	it("faded words take --nb-faded, the dot, rail and tether --nb-faded-mark; the note itself is not dimmed", () => {
		assert.match(css, /\[data-faded="true"\]:not\(:focus-within\) :is\(\.nb-note-text, \.nb-inline-text, \.nb-sketch\) \{ opacity: var\(--nb-faded\); \}/);
		assert.match(css, /\[data-faded="true"\]:not\(:focus-within\) > :is\(\.nb-ink-dot, \.nb-thread-rail\) \{ filter: opacity\(var\(--nb-faded-mark\)\); \}/);
		assert.match(css, /\.nb-tether > g\[data-faded="true"\] \{ opacity: var\(--nb-faded-mark\); \}/);
		assert.doesNotMatch(css, /\)\[data-faded="true"\] \{ opacity/);
	});

	it("a faded note reads at full strength once the keyboard reaches it", () => {
		// Every faded rule excludes :focus-within, so focus lifts the words and the marks.
		let checked = 0;
		for (const [, rule] of css.matchAll(/([^\n{}]*\[data-faded="true"\][^{]*)\{[^}]*(?:opacity)/g)) {
			if (rule!.includes(".nb-tether") || rule!.includes(":not([data-faded")) continue;
			assert.match(rule!, /:not\(:focus-within\)/, rule);
			checked++;
		}
		assert.ok(checked >= 2, `only ${checked} faded rules found`);
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
