/** Demo theme, light-demo inversion, the session demo list, and bold-title
 *  links that open the demo panel (2026-10-27). */
import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { demoPrefersInvert, injectDemoTheme } from "../src/core/demo-theme.ts";
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
		assert.match(out, /--lh-bg:#000000/);
		assert.ok(!out.includes("@font-face"), "no font without an app server");
		assert.match(injectDemoTheme(LIGHT, true), /@font-face\{font-family:"LH Sans";src:url\("\/fonts\/source-sans-3-latin\.woff2"\)/);
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

describe("light demos open inverted", () => {
	it("detects a declared light page, and leaves dark or unstyled pages alone", () => {
		assert.equal(demoPrefersInvert(LIGHT), true);
		assert.equal(demoPrefersInvert("<style>body{background:white}</style>"), true);
		assert.equal(demoPrefersInvert(DARK), false);
		assert.equal(demoPrefersInvert("<body><canvas></canvas></body>"), false);
	});

	it("a light demo's card starts inverted; the learner's saved switch wins", () => {
		const light = renderToStaticMarkup(<SubagentSteerCard message={projectView([steer("a", "Old", LIGHT)])[0] as never} />);
		assert.match(light, /hue-rotate\(180deg\)/);
		const dark = renderToStaticMarkup(<SubagentSteerCard message={projectView([steer("b", "New", DARK)])[0] as never} />);
		assert.ok(!dark.includes("hue-rotate"));
	});
});

describe("session demos", () => {
	const messages = projectView([steer("a", "Choose a weight, watch the loss", LIGHT), steer("b", "Gradient descent and step size", DARK)]);

	it("lists delivered demos in order and skips failed ones", () => {
		const failed = projectView([steer("f", "Broken", "")]);
		const demos = sessionDemos([...messages, ...failed] as never);
		assert.deepEqual(demos.map((d) => d.title), ["Choose a weight, watch the loss", "Gradient descent and step size"]);
		assert.equal(demos[0]!.inverted, true);
		assert.equal(demos[1]!.inverted, false);
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
