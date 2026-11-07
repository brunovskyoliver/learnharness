/** Feature 024 runs on real stores with scripted engines: the model gate,
 *  write-ahead, quote verification, one automatic read per page, Stop,
 *  failures, the SSE replay for late subscribers, the activity feed and
 *  tenants kept apart. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-nb-runs-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_HOSTED = "1";
delete process.env.LH_NOTEBOOK_FAUX;
const { runAsTenant } = await import("../config.ts");
const { stores } = await import("../src/server/stores.ts");
const nb = await import("../src/server/notebook.ts");
const { notebookModelOverride, fauxNotebookEngine } = await import("../src/agent/subagents/notebook.ts");
const { activityFeed } = await import("../src/server/observability.ts");
const { subscribe } = await import("../src/core/events.ts");
const { isRefusal } = await import("../src/core/library.ts");
const { writeSettings } = await import("../src/store/settings.ts");
after(() => { delete process.env.LH_HOSTED; notebookModelOverride.current = undefined; fs.rmSync(dir, { recursive: true, force: true }); });

let tenantN = 0;
const fresh = <T>(fn: () => Promise<T>) => runAsTenant(`nbruns${++tenantN}`, fn) as Promise<T>;
const NOTE = "Entropy always rises in a closed system. So a cup of tea cools down.";

const page = async (text = NOTE, name = "Heat") => {
	const made = await stores.libraryStore.createPage(name, text, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item.id;
};
const companion = async (pageId: string) => (await stores.notebookStore.read(pageId)).companion;
const start = async (pageId: string, body: unknown) => {
	const out = await nb.startNotebookRun(pageId, body);
	assert.equal(out.status, 202, JSON.stringify(out));
	return (out as { run: { id: string } }).run.id;
};
type Engine = NonNullable<typeof notebookModelOverride.current>;
const scripted = (...steps: Parameters<ReturnType<typeof createFauxCore>["setResponses"]>[0]): Engine => {
	const faux = createFauxCore({});
	faux.setResponses(steps);
	return { model: faux.getModel(), streamFn: faux.streamSimple } as never;
};
const submitRead = (args: Record<string, unknown>) => fauxAssistantMessage([fauxToolCall("submit_read", args as never, { id: "s" })], { stopReason: "toolUse" });
const withEngine = async <T>(engine: Engine, fn: () => Promise<T>) => {
	notebookModelOverride.current = engine;
	try {
		return await fn();
	} finally {
		notebookModelOverride.current = undefined;
	}
};
const held = () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	return { gate, release };
};
async function readStream(runId: string): Promise<{ event: string; data: Record<string, unknown> }[]> {
	const response = nb.notebookRunStreamResponse(runId);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("Content-Type"), "text/event-stream");
	const text = await response.text();
	return text.trim().split("\n\n").map((frame) => {
		const [eventLine, dataLine] = frame.split("\n");
		return { event: eventLine!.replace("event: ", ""), data: JSON.parse(dataLine!.replace("data: ", "")) };
	});
}

describe("the model gate", () => {
	it("refuses honestly with 503 and persists nothing: no models, then no key", () => fresh(async () => {
		const id = await page();
		const none = await nb.startNotebookRun(id, { kind: "chat", text: NOTE, message: "Hi?" });
		assert.equal(none.status, 503);
		assert.equal((none as unknown as { body: { reason: string } }).body.reason, "models");
		assert.deepEqual((await companion(id)).chat, [], "the write-ahead did not happen");
		const savedKey = process.env.OPENROUTER_API_KEY;
		delete process.env.OPENROUTER_API_KEY;
		try {
			writeSettings({ version: 1, models: { strong: { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } } } } as never);
			const noKey = await nb.startNotebookRun(id, { kind: "read", text: NOTE, auto: true });
			assert.equal(noKey.status, 503);
			assert.equal((noKey as unknown as { body: { reason: string; code: string } }).body.reason, "key");
			assert.equal((noKey as unknown as { body: { code: string } }).body.code, "provider_key_missing");
		} finally {
			if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
		}
	}));

	it("rejects bad bodies and unknown pages", () => fresh(async () => {
		const id = await page();
		assert.equal((await nb.startNotebookRun(id, { kind: "nope" })).status, 400);
		assert.equal((await nb.startNotebookRun(id, { kind: "think", text: NOTE })).status, 400);
		assert.equal((await nb.startNotebookRun(id, { kind: "chat", message: "" })).status, 400);
		assert.equal((await nb.startNotebookRun("lib_missing", { kind: "read", text: NOTE })).status, 404);
		assert.equal((await nb.startNotebookRun("../x", { kind: "read" })).status, 400);
	}));
});

describe("reads", () => {
	it("a read lands one margin thread on the verified quote, emits notebook-changed, and replays to a late subscriber", () => fresh(async () => {
		const id = await page();
		const seen: string[] = [];
		const stop = subscribe((event) => { if (event.type === "notebook-changed") seen.push((event as unknown as { pageId: string }).pageId); });
		try {
			const runId = await withEngine(fauxNotebookEngine("read", NOTE), async () => {
				const runId = await start(id, { kind: "read", text: NOTE, auto: true });
				await nb.notebookRunIdle();
				return runId;
			});
			const c = await companion(id);
			assert.equal(c.threads.length, 1);
			const thread = c.threads[0]!;
			assert.equal(thread.origin, "read");
			assert.equal(thread.side, "right");
			assert.equal(thread.anchor.quote, "Entropy always rises in a closed system.");
			assert.equal(thread.messages[0]!.author, "ai");
			assert.equal(thread.messages[0]!.runId, runId);
			assert.ok(c.readCursor, "the read cursor moved");
			assert.ok(seen.includes(id));
			assert.equal(nb.notebookRun(runId)?.status, "done");
			assert.ok(nb.notebookRun(runId)?.usage?.model, "usage accumulates per step, for the cost at read time");
			const events = await readStream(runId);
			assert.deepEqual(events.map((e) => e.event), ["phase", "phase", "delta", "done"]);
			assert.equal(events[1]!.data.anchor, thread.anchor.quote);
			assert.equal(events.at(-1)!.data.threadId, thread.id);
		} finally {
			stop();
		}
	}));

	it("a quote that isn't in the text ends silent and writes no thread", () => fresh(async () => {
		const id = await page();
		const runId = await withEngine(scripted(submitRead({ action: "margin", quote: "words he never wrote", text: "Why?" })), async () => {
			const runId = await start(id, { kind: "read", text: NOTE, auto: true });
			await nb.notebookRunIdle();
			return runId;
		});
		assert.equal(nb.notebookRun(runId)?.status, "silent");
		assert.deepEqual((await companion(id)).threads, []);
		assert.deepEqual((await readStream(runId)).at(-1), { event: "done", data: { status: "silent" } });
	}));

	it("a second automatic read on the page stops the first, which leaves no trace", () => fresh(async () => {
		const id = await page();
		const first = held();
		const engine = scripted(
			async (_ctx, options) => {
				await Promise.race([first.gate, new Promise((resolve) => options?.signal?.addEventListener("abort", resolve))]);
				return submitRead({ action: "margin", quote: "a cup of tea", text: "First?" });
			},
			() => submitRead({ action: "margin", quote: "Entropy always rises", text: "Second?" }),
		);
		await withEngine(engine, async () => {
			const one = await start(id, { kind: "read", text: NOTE, auto: true });
			const two = await start(id, { kind: "read", text: NOTE, auto: true });
			first.release();
			await nb.notebookRunIdle();
			assert.equal(nb.notebookRun(one)?.status, "stopped");
			assert.equal(nb.notebookRun(two)?.status, "done");
		});
		const threads = (await companion(id)).threads;
		assert.deepEqual(threads.map((t) => t.messages[0]!.text), ["Second?"]);
	}));

	it("think and visualize land on the passage he chose", () => fresh(async () => {
		const id = await page();
		const anchor = { quote: "a cup of tea", prefix: "system. So ", suffix: " cools down." };
		await withEngine(fauxNotebookEngine("think", NOTE, anchor.quote), async () => { await start(id, { kind: "think", text: NOTE, anchor }); await nb.notebookRunIdle(); });
		await withEngine(fauxNotebookEngine("visualize", NOTE, anchor.quote), async () => { await start(id, { kind: "visualize", text: NOTE, anchor }); await nb.notebookRunIdle(); });
		const [think, sketch] = (await companion(id)).threads;
		assert.equal(think!.origin, "think");
		assert.equal(sketch!.origin, "visualize");
		assert.equal(sketch!.placement, "inline");
		assert.equal(sketch!.messages[0]!.sketch?.steps.length, 4);
	}));
});

describe("replies and chat", () => {
	it("write his message ahead, stream the answer into a placeholder, and complete it", () => fresh(async () => {
		const id = await page();
		const anchor = { quote: "a cup of tea", prefix: "", suffix: "" };
		await stores.notebookStore.update(id, (c) => {
			c.threads.push({ id: "thr_x", anchor, placement: "margin", side: "right", status: "open", origin: "ask", createdAt: "2026-11-06T10:00:00.000Z", updatedAt: "2026-11-06T10:00:00.000Z", messages: [{ id: "m_user", author: "user", text: "Why does it cool?", at: "2026-11-06T10:00:00.000Z" }] });
			return { companion: c, result: null };
		});
		const gate = held();
		const engine = scripted(async () => { await gate.gate; return fauxAssistantMessage("Heat leaves. Into the room."); });
		await withEngine(engine, async () => {
			const runId = await start(id, { kind: "reply", text: NOTE, threadId: "thr_x" });
			const during = (await companion(id)).threads[0]!.messages;
			assert.equal(during.length, 2);
			assert.equal(during[1]!.state, "streaming", "the placeholder is written before the model answers");
			assert.deepEqual(activityFeed().notebookRuns.map((r) => [r.kind, r.pageName, "costUsd" in r]), [["reply", "Heat", true]]);
			gate.release();
			await nb.notebookRunIdle();
			const after = (await companion(id)).threads[0]!.messages;
			assert.equal(after[1]!.text, "Heat leaves. Into the room.");
			assert.equal(after[1]!.state, undefined);
			const events = await readStream(runId);
			assert.equal(events.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), "Heat leaves. Into the room.");
			assert.equal(events.at(-1)!.event, "done");
			assert.deepEqual(activityFeed().notebookRuns, [], "ended runs leave the feed");
			// Nothing to reply to: the last message is the AI's.
			assert.equal((await nb.startNotebookRun(id, { kind: "reply", text: NOTE, threadId: "thr_x" })).status, 409);
			assert.equal((await nb.startNotebookRun(id, { kind: "reply", text: NOTE, threadId: "thr_gone" })).status, 404);
		});
	}));

	it("Stop keeps what arrived and says stopped; his message stays", () => fresh(async () => {
		const id = await page();
		let runId = "";
		const engine = fauxNotebookEngine("chat", NOTE);
		await withEngine(engine, async () => {
			runId = await start(id, { kind: "chat", text: NOTE, message: "What have we worked out?" });
			// Wait for some text, then stop.
			for (let i = 0; i < 300 && nb.notebookRunEvents(runId).filter((e) => e.event === "delta").length < 2; i++) await new Promise((r) => setTimeout(r, 10));
			assert.equal(nb.abortNotebookRun(runId), true);
			await nb.notebookRunIdle();
		});
		assert.equal(nb.abortNotebookRun(runId), false, "nothing left to stop");
		assert.equal(nb.notebookRun(runId)?.status, "stopped");
		const chat = (await companion(id)).chat;
		assert.equal(chat[0]!.author, "user");
		assert.equal(chat[0]!.text, "What have we worked out?");
		assert.equal(chat[1]!.state, "stopped");
		assert.ok(chat[1]!.text.length > 0, "the partial text is kept");
		assert.equal((await readStream(runId)).at(-1)!.event, "stopped");
	}));

	it("a failed answer is marked failed in place, with the error kept out of the text", () => fresh(async () => {
		const id = await page();
		const engine = scripted(() => fauxAssistantMessage("", { stopReason: "error", errorMessage: "upstream 500" }));
		const runId = await withEngine(engine, async () => {
			const runId = await start(id, { kind: "chat", text: NOTE, message: "Hm?" });
			await nb.notebookRunIdle();
			return runId;
		});
		assert.equal(nb.notebookRun(runId)?.status, "failed");
		assert.equal((await companion(id)).chat[1]!.state, "failed");
		const last = (await readStream(runId)).at(-1)!;
		assert.equal(last.event, "failed");
		assert.equal(last.data.error, "That didn't come through.");
	}));

	it("Try again on a failed reply replaces that answer; his message stays; a running one refuses", () => fresh(async () => {
		const id = await page();
		const at = "2026-11-06T10:00:00.000Z";
		await stores.notebookStore.update(id, (c) => {
			c.threads.push({ id: "thr_r", anchor: { quote: "a cup of tea", prefix: "", suffix: "" }, placement: "margin", side: "left", status: "open", origin: "read", createdAt: at, updatedAt: at, messages: [
				{ id: "m_ai", author: "ai", text: "Why tea?", at },
				{ id: "m_user", author: "user", text: "Because it cools.", at },
			] });
			return { companion: c, result: null };
		});
		await withEngine(scripted(() => fauxAssistantMessage("", { stopReason: "error", errorMessage: "upstream 500" })), async () => {
			await start(id, { kind: "reply", text: NOTE, threadId: "thr_r" });
			await nb.notebookRunIdle();
		});
		assert.deepEqual((await companion(id)).threads[0]!.messages.map((m) => [m.author, m.state ?? "ok"]), [["ai", "ok"], ["user", "ok"], ["ai", "failed"]]);
		const gate = held();
		await withEngine(scripted(async () => { await gate.gate; return fauxAssistantMessage("Heat leaves."); }), async () => {
			await start(id, { kind: "reply", text: NOTE, threadId: "thr_r" });
			assert.equal((await nb.startNotebookRun(id, { kind: "reply", text: NOTE, threadId: "thr_r" })).status, 409, "one answer at a time");
			gate.release();
			await nb.notebookRunIdle();
		});
		const messages = (await companion(id)).threads[0]!.messages;
		assert.deepEqual(messages.map((m) => [m.author, m.text, m.state ?? "ok"]), [["ai", "Why tea?", "ok"], ["user", "Because it cools.", "ok"], ["ai", "Heat leaves.", "ok"]]);
	}));
});

describe("tenancy", () => {
	it("a run belongs to its tenant: invisible and unstoppable from another", async () => {
		const gate = held();
		const engine = scripted(async () => { await gate.gate; return submitRead({ action: "silent" }); });
		notebookModelOverride.current = engine;
		try {
			const runId = await runAsTenant("nb-alice", async () => start(await page(), { kind: "read", text: NOTE, auto: true }));
			await runAsTenant("nb-bob", async () => {
				assert.deepEqual(activityFeed().notebookRuns, []);
				assert.equal(nb.abortNotebookRun(runId), false);
				assert.equal(nb.notebookRunStreamResponse(runId).status, 404);
			});
			await runAsTenant("nb-alice", async () => {
				assert.equal(activityFeed().notebookRuns.length, 1);
				gate.release();
				await nb.notebookRunIdle();
			});
		} finally {
			notebookModelOverride.current = undefined;
		}
	});
});
