import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { buildMlReviewChats } from "../scripts/seed-ml.mjs";
import { projectView } from "../src/core/view.ts";
import { activeProblemOf } from "../src/core/native-messages.ts";

test("ML review records cover panels, lookup states and an active practice without network", async () => {
	const lesson = JSON.parse(await readFile(new URL("./fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", import.meta.url), "utf8"));
	const chats = await buildMlReviewChats(lesson, new Date("2026-10-29T12:00:00Z"));
	assert.deepEqual(chats.map(c => c.title), ["UI review · ML panels", "UI review · ML lookups", "UI review · ML practice"]);
	const panels = chats[0]!.messages.filter((m: any) => m.role === "toolResult" && !m.isError);
	assert.equal(panels.length, 8);
	const specs = panels.map((m: any) => JSON.parse(m.details.result.html.match(/id="lh-kit-spec">([\s\S]*?)<\/script>/)![1]));
	assert.deepEqual(new Set(specs.flatMap((s: any) => s.panels.map((p: any) => p.type))), new Set(["tokens","next_token","heatmap","network","scatter","shapes"]));
	const token = specs[0]!.panels[0]; assert.deepEqual(Object.keys(token.tokenized), ["o200k","cl100k","gpt2"]);
	assert.ok(token.tokenized.o200k.every((t: any) => Number.isInteger(t.id)));
	const parts = projectView(chats[1]!.messages).flatMap(m => m.parts);
	for (const tool of ["hub_search","hub_model","paper_search","paper_read","tokenize"]) {
		assert.ok(parts.some(p => p.type === `tool-${tool}` && p.state === "output-available"));
		assert.ok(parts.some(p => p.type === `tool-${tool}` && p.state === "output-error"));
	}
	assert.equal(chats[2]!.kind, "practice"); assert.ok(activeProblemOf(chats[2]!.messages));
});
