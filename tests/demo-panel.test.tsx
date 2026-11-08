/** Demo theme, light-demo inversion, the session demo list, and bold-title
 *  links that open the demo panel (2026-10-27). */
import React from "react";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO_ERROR_INK, DEMO_ERROR_TINT, DEMO_PAPER, DEMO_SERIES, DEMO_SERIES_NAMES, demoDeclaredScheme, demoPrefersInvert, injectDemoTheme } from "../src/core/demo-theme.ts";
import { PaperAppearanceProvider } from "../components/paper/appearance.tsx";
import { DEFAULT_SHARED_APPEARANCE } from "../src/core/index.ts";
import { buildSubagentSteer } from "../src/core/contracts.ts";
import { projectView } from "../src/core/view.ts";
import { SubagentSteerCard } from "../components/artifacts/steer-card.tsx";
import { DemoPanelContext, findDemoByTitle, resolveQuestionDemo, sessionDemos, type DemoPanelApi } from "../components/artifacts/demo-panel-context.ts";
import { MarkdownStrong } from "../components/md-blocks.tsx";

const LIGHT = "<!doctype html><html><head><style>:root{color-scheme:light}body{background:#fff}</style></head><body>x</body></html>";
const DARK = "<!doctype html><html><head><style>:root{color-scheme:dark}body{background:var(--lh-bg)}</style></head><body>x</body></html>";

function steer(id: string, title: string, html: string) {
	return buildSubagentSteer({ id, kind: "demo", toolCallId: `c-${id}` }, { title, html, tested: true });
}

describe("demo theme", () => {
	it("goes first in <head>, so the demo's own CSS still wins", () => {
		const out = injectDemoTheme(LIGHT);
		assert.ok(out.indexOf("data-lh-theme") < out.indexOf("color-scheme:light"));
		// Paper light or dark by the page's scheme (feature 025), until the bridge sets the app's.
		assert.match(out, /:root\{color-scheme:light dark;/);
		assert.match(out, /--lh-bg:light-dark\(#f8f7f4,#1a1a19\)/);
		assert.match(out, /--lh-text:light-dark\(#1d1c1a,#e9e7e2\)/);
		// Series per scheme (feature 025): the dark palette as before, the light one deepened to 3:1 on paper and shelf.
		assert.match(out, /--lh-blue:light-dark\(#4488f5,#7cacf8\)/, "series colours follow the scheme");
		assert.ok(!out.includes("@font-face"), "no font without an app server");
		assert.match(injectDemoTheme(LIGHT, true), /@font-face\{font-family:"LH Sans";src:url\("\/fonts\/instrument-sans-latin\.woff2"\)/);
	});

	it("never mistakes <header> for <head>", () => {
		const out = injectDemoTheme("<html><body><header>h</header></body></html>");
		assert.ok(out.indexOf("data-lh-theme") < out.indexOf("<body>"));
		assert.match(out, /<header>h<\/header>/);
	});

	it("fragments get the theme prepended", () => {
		assert.ok(injectDemoTheme("<div>d</div>").startsWith("<style data-lh-theme>"));
	});
});

describe("demos of the other scheme open inverted", () => {
	it("reads the scheme a demo's own page declares", () => {
		assert.equal(demoDeclaredScheme(LIGHT), "light");
		assert.equal(demoDeclaredScheme("<style>body{background:white}</style>"), "light");
		assert.equal(demoDeclaredScheme(DARK), "dark");
		assert.equal(demoDeclaredScheme("<style>body{background:#000}</style>"), "dark");
		assert.equal(demoDeclaredScheme("<body><canvas></canvas></body>"), null, "a page on the theme says nothing");
	});

	it("inverts only against the resolved theme", () => {
		assert.equal(demoPrefersInvert(LIGHT, "dark"), true);
		assert.equal(demoPrefersInvert(LIGHT, "light"), false);
		assert.equal(demoPrefersInvert(DARK, "light"), true);
		assert.equal(demoPrefersInvert(DARK, "dark"), false);
		assert.equal(demoPrefersInvert("<body><canvas></canvas></body>", "light"), false);
		assert.equal(demoPrefersInvert("<body><canvas></canvas></body>", "dark"), false);
	});

	it("a card follows the theme until the learner's saved switch says otherwise", () => {
		const card = (html: string, theme: "light" | "dark", inverted?: boolean) => {
			const record = steer("a", "Old", html) as { details: { ui?: { inverted: boolean } } };
			if (inverted !== undefined) record.details.ui = { inverted };
			const message = projectView([record as never])[0];
			return renderToStaticMarkup(<PaperAppearanceProvider initial={{ ...DEFAULT_SHARED_APPEARANCE, theme }}><SubagentSteerCard message={message as never} /></PaperAppearanceProvider>);
		};
		assert.match(card(LIGHT, "dark"), /hue-rotate\(180deg\)/);
		assert.ok(!card(LIGHT, "light").includes("hue-rotate"));
		assert.match(card(DARK, "light"), /hue-rotate\(180deg\)/);
		assert.ok(!card(DARK, "dark").includes("hue-rotate"));
		assert.ok(!card(LIGHT, "dark", false).includes("hue-rotate"), "the saved switch wins");
		assert.match(card(DARK, "dark", true), /hue-rotate\(180deg\)/);
	});

	it("keeps the defaults equal to the paper tokens", () => {
		const css = readFileSync(new URL("../app/paper.css", import.meta.url), "utf8");
		const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
		const light = block('html.lh-paper[data-theme="light"]');
		const dark = block('html.lh-paper[data-theme="dark"]');
		const token = (text: string, name: string) => text.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))![1];
		const roles = { "--lh-bg": "paper", "--lh-surface": "shelf", "--lh-surface-2": "code", "--lh-border": "rule", "--lh-text": "ink", "--lh-muted": "faint" } as const;
		for (const [role, name] of Object.entries(roles)) {
			assert.equal(DEMO_PAPER.light[role as keyof typeof roles], token(light, name), `light ${role}`);
			assert.equal(DEMO_PAPER.dark[role as keyof typeof roles], token(dark, name), `dark ${role}`);
		}
	});

	it("gives each scheme a series that reaches 3:1 on its paper and shelf, the same hues, lightness moved by the smallest step; error text 4.5:1", () => {
		const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
		const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
		const lum = (hex: string) => { const [r, g, b] = rgb(hex).map(channel) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
		const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
		const hsl = (hex: string) => {
			const [r, g, b] = rgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
			const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
			const h = d === 0 ? 0 : max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
			return [h / 6, s, l] as const;
		};
		const hex = ([h, s, l]: readonly [number, number, number]) => `#${[0, 8, 4].map((n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, "0"); }).join("")}`;
		for (const scheme of ["light", "dark"] as const) {
			for (const name of DEMO_SERIES_NAMES) {
				for (const ground of ["--lh-bg", "--lh-surface"] as const) {
					const ratio = contrast(DEMO_SERIES[scheme][name], DEMO_PAPER[scheme][ground]);
					assert.ok(ratio >= 3, `${scheme} ${name} ${DEMO_SERIES[scheme][name]} is ${ratio.toFixed(2)}:1 on ${ground}`);
				}
			}
		}
		for (const name of DEMO_SERIES_NAMES) {
			const [h, s, l] = hsl(DEMO_SERIES.dark[name]), [h2, s2, l2] = hsl(DEMO_SERIES.light[name]);
			assert.ok(Math.abs(h - h2) < 0.01 && Math.abs(s - s2) < 0.02, `${name}: the light series keeps the hue`);
			assert.ok(l2 < l, `${name}: light is deeper than dark`);
			// The first 0.1% lightness step down from the dark colour that reaches 3:1.
			let first = "";
			for (let i = 0; i <= 1000 && !first; i++) { const step = hex([h, s, l - i / 1000]); if (contrast(step, DEMO_PAPER.light["--lh-bg"]) >= 3 && contrast(step, DEMO_PAPER.light["--lh-surface"]) >= 3) first = step; }
			assert.equal(DEMO_SERIES.light[name], first, name);
		}
		// Error text: 4.5:1 on paper, shelf and its red tint over each, in both schemes;
		// light is the dark red's hue at the first lightness step that gets there.
		const tint = DEMO_ERROR_TINT.match(/[\d.]+/g)!.map(Number) as [number, number, number, number];
		const over = (ground: string) => `#${rgb(ground).map((c, i) => Math.round((c * (1 - tint[3]) + (tint[i]! / 255) * tint[3]) * 255).toString(16).padStart(2, "0")).join("")}`;
		const grounds = (scheme: "light" | "dark") => [DEMO_PAPER[scheme]["--lh-bg"], DEMO_PAPER[scheme]["--lh-surface"]].flatMap((g) => [g, over(g)]);
		for (const scheme of ["light", "dark"] as const) {
			for (const ground of grounds(scheme)) {
				const ratio = contrast(DEMO_ERROR_INK[scheme], ground);
				assert.ok(ratio >= 4.5, `${scheme} error ${DEMO_ERROR_INK[scheme]} is ${ratio.toFixed(2)}:1 on ${ground}`);
			}
		}
		assert.equal(DEMO_ERROR_INK.dark, DEMO_SERIES.dark["--lh-red"]);
		const [eh, es, el] = hsl(DEMO_ERROR_INK.dark);
		let firstError = "";
		for (let i = 0; i <= 1000 && !firstError; i++) { const step = hex([eh, es, el - i / 1000]); if (grounds("light").every((g) => contrast(step, g) >= 4.5)) firstError = step; }
		assert.equal(DEMO_ERROR_INK.light, firstError, "error ink");
	});
});

describe("session demos", () => {
	const messages = projectView([steer("a", "Choose a weight, watch the loss", LIGHT), steer("b", "Gradient descent and step size", DARK)]);

	it("lists delivered demos in order and skips failed ones", () => {
		const failed = projectView([steer("f", "Broken", "")]);
		const demos = sessionDemos([...messages, ...failed] as never);
		assert.deepEqual(demos.map((d) => d.title), ["Choose a weight, watch the loss", "Gradient descent and step size"]);
		// Nothing saved: the card follows the resolved theme (demoPrefersInvert).
		assert.equal(demos[0]!.inverted, null);
		assert.equal(demos[1]!.inverted, null);
	});

	it("matches titles ignoring case, quotes and spacing", () => {
		const demos = sessionDemos(messages as never);
		assert.equal(findDemoByTitle(demos, "gradient  descent and step size")?.title, "Gradient descent and step size");
		assert.equal(findDemoByTitle(demos, "“Choose a weight, watch the loss”")?.title, "Choose a weight, watch the loss");
		assert.equal(findDemoByTitle(demos, "learning rate"), undefined);
	});
});

describe("bold demo titles", () => {
	const demos = sessionDemos(projectView([steer("b", "Gradient descent and step size", DARK)]) as never);
	const api: DemoPanelApi = { demos, openId: null, open: () => {}, close: () => {} };

	it("link to the panel when they name a demo", () => {
		const html = renderToStaticMarkup(
			<DemoPanelContext.Provider value={api}>
				<MarkdownStrong>Gradient descent and step size</MarkdownStrong>
			</DemoPanelContext.Provider>,
		);
		assert.match(html, /<button[^>]*data-testid="demo-link"/);
		assert.match(html, /<strong data-streamdown="strong">Gradient descent and step size<\/strong>/);
	});

	it("stay plain bold otherwise, and outside a chat page", () => {
		const other = renderToStaticMarkup(
			<DemoPanelContext.Provider value={api}>
				<MarkdownStrong>learning rate</MarkdownStrong>
			</DemoPanelContext.Provider>,
		);
		assert.ok(!other.includes("demo-link"));
		const bare = renderToStaticMarkup(<MarkdownStrong>Gradient descent and step size</MarkdownStrong>);
		assert.ok(!bare.includes("demo-link"));
	});
});


describe("question demo references", () => {
	const demos = sessionDemos(projectView([steer("old", "Shared title", DARK), steer("new", "Shared title", DARK)]) as never);
	it("pins the exact revision even when titles repeat", () => {
		const result = resolveQuestionDemo(demos, { demoRef: { messageId: demos[0]!.id, panel: 2 } });
		assert.equal(result.demo?.id, demos[0]!.id);
		assert.equal(result.panel, 2);
	});
	it("does not guess between ambiguous legacy titles", () => {
		const result = resolveQuestionDemo(demos, { question: "In Shared title, what changes?" });
		assert.equal(result.demo, undefined);
		assert.equal(result.candidates.length, 2);
	});
	it("does not silently replace a missing revision with a matching title", () => {
		const result = resolveQuestionDemo(demos, { demoRef: { messageId: "missing" }, question: "Shared title" });
		assert.equal(result.demo, undefined);
		assert.equal(result.missing, true);
	});
	it("opens an unambiguous legacy reference and ignores unrelated questions", () => {
		assert.equal(resolveQuestionDemo(demos.slice(0, 1), { question: "In **Shared title**, what changes?" }).demo?.id, demos[0]!.id);
		assert.equal(resolveQuestionDemo(demos, { question: "Something else" }).candidates.length, 0);
	});
});
