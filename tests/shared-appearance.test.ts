/**
 * Feature 025, T001: the shared Appearance resolution (data-model.md).
 * Theme: notebook.appearance on disk → Study's appearance.mode → system;
 * text size, lettering and ink from the notebook section, else defaults.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SHARED_APPEARANCE, FACTORY_SETTINGS, resolveSharedAppearance, sharedAppearanceAttributes } from "../src/core/index.ts";

describe("resolveSharedAppearance", () => {
	it("no record: system theme and the defaults", () => {
		assert.deepEqual(resolveSharedAppearance(null), { theme: "system", textSize: "default", lettering: "serif", ink: "ink" });
		assert.deepEqual(resolveSharedAppearance(undefined), DEFAULT_SHARED_APPEARANCE);
		assert.deepEqual(resolveSharedAppearance({ version: 1 }), DEFAULT_SHARED_APPEARANCE);
	});

	it("the stored notebook theme wins over Study's mode", () => {
		assert.equal(resolveSharedAppearance({ version: 1, notebook: { appearance: "light" }, appearance: { mode: "dark" } }).theme, "light");
		assert.equal(resolveSharedAppearance({ version: 1, notebook: { appearance: "system" }, appearance: { mode: "dark" } }).theme, "system");
	});

	it("without a notebook theme, Study's stored mode seeds it", () => {
		assert.equal(resolveSharedAppearance({ version: 1, appearance: { mode: "dark" } }).theme, "dark");
		assert.equal(resolveSharedAppearance({ version: 1, notebook: { ink: "blue" }, appearance: { mode: "light" } }).theme, "light");
	});

	it("neither on disk: system", () => {
		assert.equal(resolveSharedAppearance({ version: 1, appearance: { background: "#101010" }, notebook: {} }).theme, "system");
	});

	it("invalid values fall to the next step or the default", () => {
		const a = resolveSharedAppearance({ version: 1, notebook: { appearance: "sepia", textSize: "huge", lettering: 3, ink: "gold" }, appearance: { mode: "dim" } });
		assert.deepEqual(a, DEFAULT_SHARED_APPEARANCE);
		assert.equal(resolveSharedAppearance({ version: 1, notebook: { appearance: "sepia" }, appearance: { mode: "dark" } }).theme, "dark");
		assert.deepEqual(resolveSharedAppearance({ version: 1, notebook: [], appearance: "dark" }), DEFAULT_SHARED_APPEARANCE);
		assert.deepEqual(resolveSharedAppearance("nonsense"), DEFAULT_SHARED_APPEARANCE);
	});

	it("text size, lettering and ink come from the notebook section", () => {
		assert.deepEqual(resolveSharedAppearance({ version: 1, notebook: { appearance: "dark", textSize: "large", lettering: "plain", ink: "orange" } }), { theme: "dark", textSize: "large", lettering: "plain", ink: "orange" });
	});

	it("a factory-only record (the merged defaults, not the disk) does not count as a choice for the theme", () => {
		// The factory says notebook.appearance "system" and appearance.mode "dark": resolved from it, the notebook key wins.
		// The layout passes the stored record (readSettingsRecord), so this only shows the precedence is per key.
		assert.equal(resolveSharedAppearance(FACTORY_SETTINGS).theme, FACTORY_SETTINGS.notebook.appearance);
		assert.equal(resolveSharedAppearance({ version: 1, appearance: { ...FACTORY_SETTINGS.appearance } }).theme, FACTORY_SETTINGS.appearance.mode);
	});

	it("does not change the record it reads", () => {
		const record = { version: 1, appearance: { mode: "dark" as const } };
		resolveSharedAppearance(record);
		assert.deepEqual(record, { version: 1, appearance: { mode: "dark" } });
	});

	it("html attributes", () => {
		assert.deepEqual(sharedAppearanceAttributes({ theme: "dark", textSize: "small", lettering: "plain", ink: "red" }), { "data-theme": "dark", "data-ink": "red", "data-text-size": "small", "data-lettering": "plain" });
	});
});
