import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { INITIAL_DEMO_BRIDGE_STATE, reduceDemoBridgeState, replyDemoTokenize } from "../components/artifacts/demo-card.tsx";
const frame = {} as Window;
const request = { type: "demo-tokenize" as const, requestId: "r1", text: "hello", encoding: "cl100k" as const };
it("accepts tokenize only with exact own-frame source and a validated bounded payload", () => {
	const state = INITIAL_DEMO_BRIDGE_STATE;
	assert.deepEqual(reduceDemoBridgeState(state, request, frame, frame).tokenize, request);
	for (const bad of [null, {}, { ...request, requestId: 1 }, { ...request, requestId: "a".repeat(41) }, { ...request, text: "a".repeat(2001) }, { ...request, text: 1 }, { ...request, encoding: "bad" }]) assert.equal(reduceDemoBridgeState(state, bad, frame, frame), state);
	assert.equal(reduceDemoBridgeState(state, request, {} as Window, frame), state);
	assert.equal(reduceDemoBridgeState(state, request, null, null), state);
	assert.equal(reduceDemoBridgeState(state, request), state);
});
it("sends edited text only to the local tokenizer and shapes success/failure replies", async () => {
	const calls: unknown[] = [];
	const reply = await replyDemoTokenize(request, async (url, options) => { calls.push([url, options]); return Response.json({ encoding: "cl100k", tokens: [{ id: 15339, text: "hello" }] }); });
	assert.deepEqual(reply, { type: "lh-demo-tokens", requestId: "r1", encoding: "cl100k", tokens: [{ id: 15339, text: "hello" }] });
	assert.deepEqual(calls, [["/api/tokenize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "hello", encoding: "cl100k" }) }]]);
	assert.deepEqual(await replyDemoTokenize(request, async () => Response.json({ error: "bad text" }, { status: 400 })), { type: "lh-demo-tokens", requestId: "r1", error: "bad text" });
	assert.deepEqual(await replyDemoTokenize(request, async () => { throw new Error("offline"); }), { type: "lh-demo-tokens", requestId: "r1", error: "offline" });
});
it("tokenize route returns exact tokens, rejects bad bodies, and refuses a missing hosted tenant", async () => {
	const { POST } = await import("../app/api/tokenize/route.ts");
	const req = (body: unknown) => new Request("http://localhost/api/tokenize", { method: "POST", body: JSON.stringify(body) });
	const good = await POST(req({ text: "hello", encoding: "cl100k" }));
	assert.equal(good.status, 200); assert.deepEqual(await good.json(), { encoding: "cl100k", tokens: [{ id: 15339, text: "hello" }] });
	assert.deepEqual(await (await POST(req({ text: "", encoding: "cl100k" }))).json(), { encoding: "cl100k", tokens: [] });
	for (const body of [null, {}, { text: 1, encoding: "gpt2" }, { text: "a".repeat(2001), encoding: "gpt2" }, { text: "hi", encoding: "unknown" }]) assert.equal((await POST(req(body))).status, 400);
	assert.equal((await POST(new Request("http://localhost/api/tokenize", { method: "POST", body: "{" }))).status, 400);
	const saved = process.env.LH_HOSTED; process.env.LH_HOSTED = "1";
	try { assert.equal((await POST(req({ text: "hello", encoding: "cl100k" }))).status, 401); }
	finally { if (saved === undefined) delete process.env.LH_HOSTED; else process.env.LH_HOSTED = saved; }
	assert.doesNotMatch(readFileSync(new URL("../app/api/tokenize/route.ts", import.meta.url), "utf8"), /models|create.*Agent|generateText|streamText/);
});
