/**
 * Feature 025: the paper system's text roles pass WCAG AA on paper and shelf
 * in light, dark and system dark (024's owner ruling "Raise to pass": move
 * lightness only, the smallest step that reaches 4.5:1). Covers the roles
 * Study uses as text: ink, graphite, faint, red, green and the bulb's text ink
 * (`--bulb-ink`: "Your turn", Home's kind labels, the waiting dot), plus the
 * focus ring at 3:1. `--bulb` itself stays for Notebook's lit bulb.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const paper = readFileSync(new URL("../app/paper.css", import.meta.url), "utf8");
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const notebook = readFileSync(new URL("../app/(app)/notebook/notebook.css", import.meta.url), "utf8");

function block(selector: string): string {
	const at = paper.indexOf(`${selector} {`);
	assert.ok(at >= 0, `no rule for ${selector}`);
	const open = paper.indexOf("{", at);
	return paper.slice(open + 1, paper.indexOf("}", open));
}
function tokens(body: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [, name, hex] of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) if (name && hex) out[name] = hex.toLowerCase();
	return out;
}
const THEMES = {
	light: tokens(block('html.lh-paper[data-theme="light"]')),
	dark: tokens(block('html.lh-paper[data-theme="dark"]')),
	"system dark": tokens(block('html.lh-paper[data-theme="system"]')),
};

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
function luminance(hex: string): number {
	const [r, g, b] = rgb(hex).map(channel) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
	const la = luminance(a), lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function hsl(hex: string): [number, number, number] {
	const [r, g, b] = rgb(hex);
	const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [h / 6, s, l];
}
function fromHsl([h, s, l]: [number, number, number]): string {
	const f = (n: number) => {
		const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, "0")).join("")}`;
}

describe("paper contrast", () => {
	for (const [theme, t] of Object.entries(THEMES)) {
		const tok = (name: string) => {
			const value = t[name];
			assert.ok(value, `${theme}: --${name} missing`);
			return value;
		};
		it(`${theme}: ink, graphite, faint, red, green and the bulb's ink reach 4.5:1, the focus ring 3:1, on paper and shelf`, () => {
			for (const ground of ["paper", "shelf"]) {
				for (const text of ["ink", "graphite", "faint", "text-red", "text-green", "bulb-ink"]) {
					const ratio = contrast(tok(text), tok(ground));
					assert.ok(ratio >= 4.5, `${theme}: --${text} ${tok(text)} on --${ground} ${tok(ground)} is ${ratio.toFixed(2)}:1`);
				}
				const ring = contrast(tok("nb-focus"), tok(ground));
				assert.ok(ring >= 3, `${theme}: --nb-focus on --${ground} is ${ring.toFixed(2)}:1`);
			}
		});
		it(`${theme}: --bulb-ink is --bulb moved along lightness only, by the smallest step that passes`, () => {
			const bulb = tok("bulb"), ink = tok("bulb-ink");
			const passes = (hex: string) => contrast(hex, tok("paper")) >= 4.5 && contrast(hex, tok("shelf")) >= 4.5;
			if (passes(bulb)) {
				assert.equal(ink, bulb, `${theme}: --bulb already passes, so --bulb-ink should equal it`);
				return;
			}
			const [h, s, l] = hsl(bulb), [h2, s2, l2] = hsl(ink);
			assert.ok(Math.abs(h - h2) < 0.01 && Math.abs(s - s2) < 0.01, `${theme}: --bulb-ink ${ink} changes hue or saturation`);
			// One 0.1% lightness step back toward --bulb no longer passes.
			const back = fromHsl([h, s, l2 + Math.sign(l - l2) * 0.001]);
			assert.ok(!passes(back), `${theme}: --bulb-ink could be ${back}`);
		});
	}

	it("system dark repeats the dark bulb ink", () => {
		assert.equal(THEMES["system dark"]["bulb-ink"], THEMES.dark["bulb-ink"]);
	});

	it("text and the waiting dot take --bulb-ink; Notebook's lit bulb keeps --bulb", () => {
		assert.match(globals, /--color-bulb-ink:\s*var\(--bulb-ink\)/);
		assert.match(globals, /\.lh-check-turn \{ color: var\(--bulb-ink\)/);
		assert.match(paper, /\.nb-side-waiting \{[^}]*background: var\(--bulb-ink\)/);
		assert.match(notebook, /\.nb-bulb-lit \{\s*color: var\(--bulb\);/);
	});

	// T069 (reviews.md): the ring for a dialog that takes the focus itself, and
	// no one-off fade on the check's disabled submit (the shared pill's state).
	it("a focused dialog shows the --nb-focus ring inside its edge; the check submit has no fade of its own", () => {
		assert.match(paper, /\.lh-paper \.lh-dialog:focus-visible \{ outline: 2px solid var\(--nb-focus\); outline-offset: -2px; \}/);
		assert.doesNotMatch(globals, /\.lh-check-submit:disabled \{[^}]*opacity/);
		assert.match(paper, /\.lh-paper \.nb-pill:disabled \{ opacity: 0\.6;/);
	});
});
