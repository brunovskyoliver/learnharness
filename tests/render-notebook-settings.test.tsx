/** Notebook's settings modal (feature 024, US8; ui-contract "Settings modal", visual-reference §19). */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PREFERENCES, type NotebookPreferences } from "../components/notebook/nb-shared.tsx";
import { dropAlpha, makeDrop } from "../components/notebook/pointer-ink.tsx";
import { AppearanceThumb, CustomizePage, LayoutThumb, NOT_SAVED_LINE, SECTION_LABELS } from "../components/notebook/settings-modal.tsx";

const noop = () => {};
const page = (over: Partial<NotebookPreferences> = {}, failed = false) =>
	renderToStaticMarkup(<CustomizePage preferences={{ ...DEFAULT_PREFERENCES, ...over }} failed={failed} onChange={noop} onRetry={noop} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** The radio items of one group, as [value, checked]. */
function group(html: string, field: string): [string, boolean][] {
	const start = html.indexOf(`data-testid="nb-set-${field}"`);
	assert.ok(start > 0, field);
	const open = html.lastIndexOf("<div", start);
	const end = html.indexOf("</section>", start);
	const chunk = html.slice(open, end);
	assert.match(chunk.slice(0, chunk.indexOf(">")), /role="radiogroup"/);
	return [...chunk.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map((m) => {
		const tag = m[0];
		return [/data-testid="nb-set-[A-Za-z]+-([a-z]+)"/.exec(tag)![1]!, /aria-checked="true"/.test(tag)];
	});
}

describe("settings: Customize", () => {
	it("has the title and every section in the contract's order", () => {
		const words = text(page());
		assert.ok(words.startsWith(" Customize ") || words.startsWith("Customize "));
		const order = [SECTION_LABELS.startMode, "Ink from the pointer", SECTION_LABELS.pace, SECTION_LABELS.layout, SECTION_LABELS.appearance, SECTION_LABELS.textSize, SECTION_LABELS.lettering, SECTION_LABELS.ink];
		let at = -1;
		for (const label of order) {
			const next = words.indexOf(label);
			assert.ok(next > at, label);
			at = next;
		}
	});

	it("words every card exactly as the contract does", () => {
		const words = text(page());
		for (const phrase of [
			"Thinks with you", "Reads along and speaks up when a line deserves a second look.",
			"When you ask", "Stays quiet until you select something or open the chat.",
			"Each note can change on its own, from the row above its title.",
			"Now and then a drop of ink falls where you move the pointer, then dries.",
			"Regular", "Reads a moment after you stop typing.", "Slow", "Waits about twice as long, for when you think between lines.",
			"Both margins", "Your words in the middle, questions on both sides.",
			"Right margin", "Every question in one column beside your words.",
			"Marks only", "A small ? after the passage. Open it when you want.",
			"System", "Light", "Dark", "A thought.", "Small", "Default", "Large",
			"Does this hold?", "Its own hand", "Same as yours",
			"Ink", "Blue", "Green", "Red", "Purple", "Brown", "Orange",
		]) assert.ok(words.includes(phrase), phrase);
		const html = page();
		assert.ok(html.includes('aria-label="Serif: Its own hand"') && html.includes('aria-label="Plain: Same as yours"'));
	});

	it("each card group is a radio group with the stored choice checked (cards only, no fill)", () => {
		const html = page({ startMode: "ask", pace: "slow", layout: "marks", appearance: "dark", textSize: "large", lettering: "plain", ink: "purple" });
		assert.deepEqual(group(html, "startMode"), [["thinks", false], ["ask", true]]);
		assert.deepEqual(group(html, "pace"), [["regular", false], ["slow", true]]);
		assert.deepEqual(group(html, "layout"), [["both", false], ["right", false], ["marks", true]]);
		assert.deepEqual(group(html, "appearance"), [["system", false], ["light", false], ["dark", true]]);
		assert.deepEqual(group(html, "textSize"), [["small", false], ["default", false], ["large", true]]);
		assert.deepEqual(group(html, "lettering"), [["serif", false], ["plain", true]]);
		assert.equal(group(html, "ink").length, 7);
		assert.deepEqual(group(html, "ink").find(([, checked]) => checked), ["purple", true]);
		// Only the checked item is in the tab order (arrow keys move within a group).
		const defaults = page();
		assert.match(defaults, /role="radio" aria-checked="true"[^>]*data-state="checked"[^>]*data-testid="nb-set-pace-regular"/);
		assert.ok(defaults.includes('class="nb-option-card nb-set-card '));
	});

	it("the pointer ink is a switch, off by default", () => {
		assert.match(page(), /role="switch" aria-checked="false"[^>]*data-testid="nb-set-pointerInk"/);
		assert.match(page({ pointerInk: true }), /role="switch" aria-checked="true"[^>]*data-testid="nb-set-pointerInk"/);
	});

	it("samples show in their size and face; swatches in their ink", () => {
		const html = page();
		assert.ok(html.includes('data-size="small"') && html.includes('data-size="large"'));
		assert.ok(html.includes('data-lettering="serif"') && html.includes('data-lettering="plain"'));
		assert.ok(html.includes("background:var(--text-blue)") && html.includes("color:var(--riddle-ink)"));
	});

	it("a failed save says so, with Try again", () => {
		assert.ok(!page().includes("nb-settings-problem"));
		const html = page({}, true);
		assert.match(html, /role="alert" data-testid="nb-settings-problem"/);
		assert.ok(text(html).includes(NOT_SAVED_LINE) && text(html).includes("Try again"));
	});

	it("thumbnails are drawn, not pictures", () => {
		for (const layout of ["both", "right", "marks"] as const) {
			const svg = renderToStaticMarkup(<LayoutThumb layout={layout} />);
			assert.match(svg, /^<svg[^>]*aria-hidden="true"/);
			assert.ok(svg.includes("nb-thumb-note"));
		}
		assert.ok(renderToStaticMarkup(<LayoutThumb layout="both" />).match(/nb-thumb-tick/g)!.length === 2);
		assert.ok(renderToStaticMarkup(<LayoutThumb layout="marks" />).includes("nb-thumb-ring"));
		assert.equal((renderToStaticMarkup(<AppearanceThumb appearance="system" />).match(/<clipPath/g) ?? []).length, 2);
		assert.ok(renderToStaticMarkup(<AppearanceThumb appearance="dark" />).includes("#1a1a19"));
	});
});

describe("pointer ink drops (§21)", () => {
	it("fade in over 90ms, hold, fade over the last 45%, at .42", () => {
		assert.equal(dropAlpha(0, 2000), 0);
		assert.equal(dropAlpha(45, 2000), 0.21);
		assert.equal(dropAlpha(500, 2000), 0.42);
		assert.ok(Math.abs(dropAlpha(1550, 2000) - 0.21) < 1e-9);
		assert.equal(dropAlpha(2000, 2000), 0);
	});
	it("30% big with a drip, 70% small without", () => {
		const seq = (values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };
		const big = makeDrop(100, 100, 0, seq([0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
		assert.ok(big.drip && big.r >= 3.4 && big.r <= 5.2 && big.life >= 3600 && big.life <= 5200);
		assert.ok(big.drip.length >= 14 && big.drip.length <= 48 && big.drip.ms >= 1200 && big.drip.ms <= 2600);
		assert.equal(big.y, 108);
		const small = makeDrop(100, 100, 0, seq([0.9, 0.5, 0.5, 0.5]));
		assert.equal(small.drip, null);
		assert.ok(small.r >= 1.4 && small.r <= 3.8 && small.life >= 1900 && small.life <= 3100);
	});
});
