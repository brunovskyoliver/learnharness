/** Demo theme, light-demo inversion, the session demo list, and bold-title
 *  links that open the demo panel (2026-10-27). */
import React from "react";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO_PAPER, demoDeclaredScheme, demoPrefersInvert, injectDemoTheme } from "../src/core/demo-theme.ts";
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
		assert.match(out, /--lh-blue:#7cacf8/, "series colours stay the demo's data");
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
