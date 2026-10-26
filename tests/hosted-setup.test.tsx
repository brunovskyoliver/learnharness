/**
 * Hosted ChatGPT-first setup (2026-10-26): the first screen leads with
 * Connect ChatGPT and keeps keys + other subscriptions under "Other
 * providers"; once connected, empty slots prefill from the pinned ids the
 * live catalog actually offers. The local screen is unchanged.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chatGPTAutofill, SetupKeysBody } from "../components/setup-dialog.tsx";
import type { ModelCatalogEntry } from "../src/core/index.ts";

const model = (id: string, provider = "chatgpt", image = true): ModelCatalogEntry => ({
	id, name: id, provider, reasoning: true, input: image ? ["text", "image"] : ["text"],
	supportedLevels: ["low", "medium", "high", "xhigh"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1,
});

describe("chatGPTAutofill", () => {
	it("fills empty slots with the first pinned id the catalog offers, at the pinned level", () => {
		const { picked, levels } = chatGPTAutofill([model("gpt-6-sol"), model("gpt-6-luna"), model("gpt-6.1-sol", "openai")], {});
		assert.equal(picked.strong?.id, "gpt-6-sol", "an API-key provider's copy of the id does not count");
		assert.equal(picked.cheap?.id, "gpt-6-luna");
		assert.equal(picked.vision?.id, "gpt-6-luna");
		assert.deepEqual(levels, { strong: "medium", cheap: "xhigh", vision: "xhigh" });
	});

	it("leaves pinned slots and unmatched slots alone", () => {
		const mine = model("claude-x", "anthropic");
		const { picked } = chatGPTAutofill([model("gpt-6.1-sol"), model("gpt-6-luna", "chatgpt", false)], { strong: mine });
		assert.equal(picked.strong, undefined, "a slot the user already pinned is kept");
		assert.equal(picked.cheap?.id, "gpt-6-luna");
		assert.equal(picked.vision, undefined, "vision needs an image-capable model");
	});
});

describe("SetupKeysBody hosted", () => {
	const base = { providers: [], provider: null, value: "", saving: false, error: null, menuOpen: false, onToggleMenu() {}, onPick() {}, onValue() {}, onSave() {}, menuAnchor: { current: null } };

	it("leads with ChatGPT and moves keys and other subscriptions under Other providers", () => {
		const html = renderToStaticMarkup(createElement(SetupKeysBody, { ...base, hosted: true }));
		const lead = html.indexOf('data-testid="setup-chatgpt-lead"'), other = html.indexOf('data-testid="setup-other-providers"');
		assert.ok(lead >= 0 && other > lead);
		assert.equal(html.match(/data-testid="chatgpt-connection"/g)?.length, 1, "ChatGPT appears once, in the lead");
		assert.ok(html.indexOf('data-testid="setup-key-provider"') > other);
	});

	it("the local screen keeps its layout", () => {
		const html = renderToStaticMarkup(createElement(SetupKeysBody, base));
		assert.equal(html.includes("setup-chatgpt-lead"), false);
		assert.match(html, />Subscriptions</);
	});
});
