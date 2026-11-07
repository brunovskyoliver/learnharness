import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { DEMO_BRIDGE_SCRIPT } from "../components/artifacts/demo-card.tsx";
import { demoAppearanceVars, demoScheme } from "../src/core/demo-theme.ts";

function bridge() {
	const listeners = new Map<string, (event: unknown) => void>();
	const values: Record<string, string> = {};
	const parent = { postMessage() {} };
	const root = { selectorText: ":root", style: { setProperty: (key: string, value: string) => { values[key] = value; } } };
	const context = {
		parent,
		document: { querySelector: () => ({ sheet: { cssRules: [root] } }) },
		window: { addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn), dispatchEvent() {} },
		CSS: { supports: (_property: string, value: string) => value !== "invalid" },
		Event: class {},
		setTimeout() {},
	};
	runInNewContext(DEMO_BRIDGE_SCRIPT.replace(/^<script>|<\/script>$/g, ""), context);
	return { values, send: (vars: unknown, source: unknown = parent) => listeners.get("message")!({ source, data: { type: "lh-demo-theme", vars } }) };
}

describe("sandbox appearance bridge", () => {
	it("reads the paper roles and the resolved scheme, and keeps data series out of appearance updates", () => {
		const css: Record<string, string> = { "--paper": "#1a1a19", "--shelf": "#151514", "--code": "#151514", "--rule": "#33322f", "--ink": "#e9e7e2", "--faint": "#858279", "color-scheme": "dark", "--background": "#000000" };
		const vars = demoAppearanceVars((name) => css[name] ?? "", "Georgia");
		assert.deepEqual(vars, {
			"--lh-bg": "#1a1a19", "--lh-surface": "#151514", "--lh-surface-2": "#151514", "--lh-border": "#33322f", "--lh-text": "#e9e7e2", "--lh-muted": "#858279",
			"--lh-font": '"Georgia", "LH Sans", system-ui, sans-serif',
			"color-scheme": "dark",
		});
		assert.equal(demoAppearanceVars((name) => (name === "color-scheme" ? "light" : ""))["color-scheme"], "light");
		assert.equal(demoAppearanceVars(() => "")["color-scheme"], "light", "nothing resolved reads as light");
		assert.equal(demoScheme("only dark"), "dark");
		assert.equal(demoScheme("light dark"), "light");
	});

	it("sets the page's colour scheme, light or dark only", () => {
		const { values, send } = bridge();
		send({ "color-scheme": "dark" });
		assert.equal(values["color-scheme"], "dark");
		send({ "color-scheme": "light" });
		assert.equal(values["color-scheme"], "light");
		send({ "color-scheme": "normal" });
		send({ "color-scheme": "light dark" });
		send({ "color-scheme": 1 });
		assert.equal(values["color-scheme"], "light");
		send({ "--lh-heading-weight": "900", "--lh-ink-strong": "red" });
		assert.equal(values["--lh-heading-weight"], undefined, "retired roles no longer cross");
	});

	it("accepts only parent appearance messages and approved, bounded CSS values", () => {
		const { values, send } = bridge();
		send({ "--lh-bg": "#101820" }, {});
		assert.deepEqual(values, {});
		send({ "--lh-bg": "#101820", "--lh-blue": "red", "--lh-text": 42, "--lh-muted": "invalid", "--lh-font": "x".repeat(513) });
		assert.deepEqual(values, { "--lh-bg": "#101820" });
		send(null);
		send([]);
		assert.deepEqual(values, { "--lh-bg": "#101820" });
	});

	it("updates the injected rule so later demo CSS can still override it", () => {
		const { values, send } = bridge();
		send({ "--lh-bg": "#101820", "--lh-font": '"Georgia", serif' });
		send({ "--lh-bg": "#141414" });
		assert.equal(values["--lh-bg"], "#141414");
		assert.equal(values["--lh-font"], '"Georgia", serif');
	});
});
