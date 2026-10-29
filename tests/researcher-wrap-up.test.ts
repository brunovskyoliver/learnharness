/**
 * Researcher wrap-up (researcher-turn-cap, 2026-10-28): when the 12-turn cap
 * runs out while the researcher is still searching, one more call over the
 * gathered material asks for the brief instead of failing the job with
 * "the researcher produced no text".
 *
 * Offline: a scripted faux engine; web_search runs with no provider (it
 * reports "unavailable" as tool output, no network).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall,
	type AssistantMessage, type TranscriptContext,
} from "@earendil-works/pi-ai";
import type { PiEngine } from "../src/agent/models.ts";
import { runResearcherAgent, WRAP_UP_MESSAGE } from "../src/agent/subagents/researcher.ts";

const BRIEF = "## Summary\nGathered enough to answer.";

const searching = (round: number) =>
	fauxAssistantMessage([fauxToolCall("web_search", { query: `facet ${round}` }, { id: `call_${round}` })], { stopReason: "toolUse" });
const answering = (text: string) => fauxAssistantMessage([fauxText(text)], { stopReason: "stop" });

function scripted(responses: AssistantMessage[]) {
	const faux = createFauxCore({ tokenSize: { min: 8, max: 8 } });
	faux.setResponses(responses);
	const requests: TranscriptContext[] = [];
	const engine: PiEngine = {
		model: faux.getModel(), level: "medium",
		streamFn: (model, context, options) => {
			requests.push(context);
			return faux.streamSimple(model, context, options);
		},
	};
	return { engine, requests };
}

async function run(responses: AssistantMessage[]) {
	const { engine, requests } = scripted(responses);
	let wrapUps = 0;
	let usages = 0;
	const text = await runResearcherAgent("Research question: q", {
		engine,
		onUsage: () => usages++,
		onWrapUp: () => wrapUps++,
	});
	return { text, requests, wrapUps, usages };
}

describe("researcher wrap-up after the turn cap", () => {
	it("asks for the brief once the cap is spent and returns it", async () => {
		const r = await run([...Array.from({ length: 12 }, (_, i) => searching(i)), answering(BRIEF)]);
		assert.equal(r.text, BRIEF);
		assert.equal(r.wrapUps, 1);
		assert.equal(r.requests.length, 13);
		assert.equal(r.usages, 13, "the wrap-up call is billed");
		const last = JSON.stringify(r.requests[12]);
		assert.ok(last.includes(WRAP_UP_MESSAGE), "the wrap-up call ends with the wrap-up message");
		assert.ok(last.includes("Research question: q"), "the wrap-up call carries the original prompt");
		assert.ok(last.includes("facet 11"), "the wrap-up call carries the gathered tool history");
		assert.ok(last.includes("web_search"), "tools stay declared for provider compatibility");
	});

	it("returns empty text when the wrap-up also produces none", async () => {
		const r = await run([...Array.from({ length: 13 }, (_, i) => searching(i))]);
		assert.equal(r.text, "");
		assert.equal(r.wrapUps, 1);
		assert.equal(r.requests.length, 13, "the wrap-up is a single call");
	});

	it("makes no wrap-up call when the brief arrives within the cap", async () => {
		const r = await run([searching(0), searching(1), answering(BRIEF)]);
		assert.equal(r.text, BRIEF);
		assert.equal(r.wrapUps, 0);
		assert.equal(r.requests.length, 3);
	});
});


it("registers Hub tools under the researcher's model_hub toggle with the exact source doctrine", async () => {
	for (const model_hub of [undefined, false]) {
		const { engine, requests } = scripted([answering(BRIEF)]);
		await runResearcherAgent("q", { engine, toolToggles: { model_hub } });
		const systems = requests[0]!.messages.filter((m) => m.role === "system");
		const names = systems.flatMap((m) => m.toolsAdded?.map((t) => t.name) ?? []);
		assert.equal(names.includes("hub_search"), model_hub !== false);
		assert.equal(names.includes("hub_model"), model_hub !== false);
		assert.match(systems.map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n"), /6\. Model and paper sources: use `hub_model` for a model's configuration, and `paper_search` \+ `paper_read` for papers \(10 pages per turn at most\)\. Cite the Hub page or the paper page in the brief\./);
	}
});
