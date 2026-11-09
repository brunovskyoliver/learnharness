/**
 * Study's Appearance section is retired (feature 025, T043; owner gate 1 Q1):
 * the shared Appearance in Customize styles both modes. The old section's
 * code is gone, its stored values stay on disk and the settings API still
 * accepts them (rollback-safe, data-model.md "Retired from styling").
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { sanitizeUserSettings } from "../src/core/index.ts";

describe("the retired Appearance section", () => {
	it("its files are gone", () => {
		for (const file of ["appearance-section.tsx", "appearance.tsx", "appearance-vars.ts"]) {
			assert.equal(fs.existsSync(`components/settings/${file}`), false, file);
		}
		assert.doesNotMatch(fs.readFileSync("components/settings/model-menu.tsx", "utf8"), /FontMenuList/);
	});

	it("stored appearance values still pass the settings sanitizer", () => {
		const stored = { version: 1, appearance: { mode: "light", background: "#1a1a2e", fontFamily: "Georgia", proseFontSize: 19, sessionNameSerif: true, mdRendering: { headingWeight: 600, boldColor: "#ff0000", italicColor: null } } };
		const clean = sanitizeUserSettings(stored);
		assert.equal(clean?.appearance?.background, "#1a1a2e");
		assert.equal(clean?.appearance?.fontFamily, "Georgia");
		assert.equal(clean?.appearance?.proseFontSize, 19);
		assert.equal(clean?.appearance?.mode, "light");
	});
});

describe("the emphasis-ink factory ruling (globals.css)", () => {
	it("the old emphasis hexes are gone and bold/italic take the paper ink", () => {
		const css = fs.readFileSync("app/globals.css", "utf-8");
		assert.ok(!css.includes("--lh-ink-strong: #ee928c"));
		assert.ok(!css.includes("--lh-ink-italic: #6fa9d6"));
		assert.match(css, /\.lh-prose :where\(strong, b\) \{\s*color: var\(--ink\);/);
		assert.match(css, /\.lh-prose :where\(em, i\) \{\s*color: var\(--ink\);/);
	});
});
