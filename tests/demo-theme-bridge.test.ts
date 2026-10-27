import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { DEMO_BRIDGE_SCRIPT } from "../components/artifacts/demo-card.tsx";
import { demoAppearanceVars } from "../src/core/demo-theme.ts";

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
	it("reads resolved app roles and keeps data series out of appearance updates", () => {
		const vars = demoAppearanceVars((name) => ({ "--background": "#101820", "--card": "#182028", "--lh-heading-weight": "600" })[name] ?? "", "Georgia");
		assert.equal(vars["--lh-bg"], "#101820");
		assert.equal(vars["--lh-surface"], "#182028");
		assert.equal(vars["--lh-heading-weight"], "600");
		assert.equal(vars["--lh-font"], '"Georgia", "LH Sans", system-ui, sans-serif');
		assert.equal(vars["--lh-blue"], undefined);
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
