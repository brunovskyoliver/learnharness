import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { FollowupInput } from "../src/core/followup-session.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-followup-"));
process.env.LH_DATA_DIR = dir;
const { runAsTenant, currentTenant } = await import("../config.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { startFollowupSession } = await import("../src/server/followup-sessions.ts");
const { projectView } = await import("../src/core/view.ts");
const { toLlmMessages, reconstructRequestCause, newUserMessage } = await import("../src/core/native-messages.ts");
const { phaseAt3Lh } = await import("../src/core/phases.ts");
const { createTeacherTools, createProberTools } = await import("../src/agent/tools.ts");
const { practiceTools } = await import("../src/agent/tools/practice.ts");
const { followupTool } = await import("../src/agent/tools/followup.ts");
const { jobStore } = await import("../src/store/jobs.ts");

after(() => fs.rmSync(dir, { recursive: true, force: true }));

const input: FollowupInput = {
	title: "A complete gradient update",
	kind: "practice",
	goal: "Work through a small dataset: predictions, loss, average gradient, and one update. Withhold intermediate results.",
	context: "The teacher explained weighted predictions and squared loss. The learner computed a conditional probability correctly. Independent execution of the entire training step is still untested.",
};

describe("teacher-created follow-up sessions", () => {
	it("seeds linked context and inherited settings before starting, without altering the source", async () => {
		const source = chatStore.createChat("Source lesson");
		chatStore.saveMessages(source.id, [newUserMessage("Help me practice this in a new session.")]);
		chatStore.saveSettings(source.id, { model: { provider: "openrouter", id: "test-model" }, thinkingLevel: "high" });
		const before = chatStore.getChat(source.id)!;
		const created = await startFollowupSession({
			chatId: source.id, chatStore,
			startTurn: async (id) => {
				const child = chatStore.getChat(id)!;
				assert.equal(child.kind, "practice");
				assert.deepEqual(child.settings, before.settings);
				assert.equal(child.messages.length, 1);
				assert.equal(child.messages[0]?.role, "custom");
				assert.match(String(child.messages[0]?.content), /not new learner answers/);
				assert.match(String(child.messages[0]?.content), /Withhold intermediate results/);
				assert.ok(String(child.messages[0]?.content).includes(`/chat/${source.id}`));
				return Response.json({ ok: true });
			},
		}, "call-create", input);
		assert.equal(created.startup.state, "started");
		assert.equal(created.reused, false);
		assert.equal(created.url, `/chat/${created.id}`);
		assert.deepEqual(chatStore.getChat(source.id), before);
		const child = chatStore.getChat(created.id)!;
		assert.equal(child.followup?.sourceChatId, source.id);
		assert.equal(child.followup?.startup.state, "started");
		const view = projectView(child.messages);
		assert.ok(view[0]?.parts.some((part) => part.type === "data-followup-context" && (part.data as { context: string }).context === input.context));
		assert.ok(!view[0]?.parts.some((part) => part.type === "text"), "teacher context is scaffolding, not learner prose");
		assert.ok(JSON.stringify(toLlmMessages(child.messages)).includes(input.goal));
		assert.equal(reconstructRequestCause(child.messages), "ambiguous", "teacher context cannot fabricate a learner authorization event");
	});

	it("reuses concurrent and persisted retries without running a second opening", async () => {
		const source = chatStore.createChat("Retry source");
		let resolve!: () => void;
		const gate = new Promise<void>((done) => { resolve = done; });
		let starts = 0;
		const ctx = { chatId: source.id, chatStore, startTurn: async () => { starts++; await gate; return Response.json({ ok: true }); } };
		const first = startFollowupSession(ctx, "call-retry", input);
		const concurrent = await startFollowupSession(ctx, "call-retry", input);
		assert.equal(concurrent.startup.state, "starting");
		assert.equal(concurrent.reused, true);
		resolve();
		const completed = await first;
		const replay = await startFollowupSession(ctx, "call-retry", input);
		assert.equal(replay.id, completed.id);
		assert.equal(concurrent.id, completed.id);
		assert.equal(replay.startup.state, "started");
		assert.equal(starts, 1);
	});

	it("keeps startup failures attached to the created session and returns the same failure on retry", async () => {
		const source = chatStore.createChat("Failure source");
		let starts = 0;
		const ctx = { chatId: source.id, chatStore, startTurn: async () => { starts++; return Response.json({ error: "Models are not configured." }, { status: 503 }); } };
		const created = await startFollowupSession(ctx, "call-refused", input);
		assert.deepEqual(created.startup, { state: "failed", error: "Models are not configured." });
		assert.equal((await startFollowupSession(ctx, "call-refused", input)).id, created.id);
		assert.equal(starts, 1);
		assert.ok(chatStore.getChat(created.id));
		const thrown = await startFollowupSession({ ...ctx, startTurn: async () => { throw new Error("private provider detail"); } }, "call-throw", input);
		assert.equal(thrown.startup.state, "failed");
		assert.ok(!JSON.stringify(thrown).includes("private provider detail"));
	});

	it("preserves child messages written during startup and keeps teaching in its normal probe phase", async () => {
		const source = chatStore.createChat("Teaching source");
		const created = await startFollowupSession({
			chatId: source.id, chatStore,
			startTurn: async (id) => {
				const child = chatStore.getChat(id)!;
				assert.equal(phaseAt3Lh(child.messages), "probe");
				assert.equal(child.kind, undefined);
				chatStore.saveMessages(id, [...child.messages, newUserMessage("A message arriving while startup runs")]);
				return Response.json({ ok: true });
			},
		}, "call-teach", { ...input, kind: "teach" });
		assert.equal(chatStore.getChat(created.id)?.messages.length, 2);
	});

	it("refuses invalid inputs or a missing source before creating a session", async () => {
		const source = chatStore.createChat("Validation source");
		const ctx = { chatId: source.id, chatStore, startTurn: async () => { throw new Error("must not start"); } };
		const count = chatStore.listChats().length;
		await assert.rejects(startFollowupSession(ctx, "call-blank", { ...input, context: " " }), /context/);
		await assert.rejects(startFollowupSession(ctx, "call-kind", { ...input, kind: "test" as "teach" }), /teach or practice/);
		await assert.rejects(startFollowupSession({ ...ctx, chatId: "missing" }, "call-missing", input), /Source session not found/);
		assert.equal(chatStore.listChats().length, count);
	});

	it("keeps creation, startup and retry lookup inside the source tenant across awaits", async () => {
		const created = await runAsTenant("followup_user_a", async () => {
			const source = chatStore.createChat("A's source");
			const result = await startFollowupSession({
				chatId: source.id, chatStore,
				startTurn: async (id) => {
					await Promise.resolve();
					assert.equal(currentTenant()?.userId, "followup_user_a");
					assert.ok(chatStore.getChat(id));
					return Response.json({ ok: true });
				},
			}, "same-call-id", input);
			return { source, result };
		});
		await runAsTenant("followup_user_b", async () => {
			assert.equal(chatStore.getChat(created.result.id), null);
			await assert.rejects(startFollowupSession({ chatId: created.source.id, chatStore, startTurn: async () => Response.json({ ok: true }) }, "same-call-id", input), /Source session not found/);
			const source = chatStore.createChat("B's source");
			const other = await startFollowupSession({ chatId: source.id, chatStore, startTurn: async () => Response.json({ ok: true }) }, "same-call-id", input);
			assert.notEqual(other.id, created.result.id);
		});
	});

	it("exposes the capability only to a wired teacher and returns the real link and status", async () => {
		const source = chatStore.createChat("Tool source");
		const ctx = { chatId: source.id, chatStore, jobStore, spawn: () => {} };
		const start = (id: string, args: FollowupInput) => startFollowupSession({ ...ctx, startTurn: async () => Response.json({ ok: true }) }, id, args);
		assert.ok(createTeacherTools({ ...ctx, startFollowup: start }).start_followup_session);
		assert.equal(createTeacherTools(ctx).start_followup_session, undefined);
		assert.equal(createProberTools({ ...ctx, deliver: () => {} }).start_followup_session, undefined);
		assert.equal(practiceTools(ctx).start_followup_session, undefined);
		const output = await followupTool(start).execute("call-tool", input);
		assert.ok(JSON.stringify(output.content).includes("Opening generation has started"));
		const details = output.details as { id: string; url: string };
		assert.equal(details.url, `/chat/${details.id}`);
		assert.ok(JSON.stringify(output.content).includes(details.url));
	});

	it("runs the seeded practice session through the ordinary turn runner and persists its first problem", async () => {
		const originalFetch = globalThis.fetch;
		const originalKey = process.env.OPENROUTER_API_KEY;
		globalThis.fetch = async () => { throw new Error("Network is closed in this test."); };
		process.env.OPENROUTER_API_KEY = "synthetic-followup-test-key";
		try {
			const { createFauxCore, fauxAssistantMessage, fauxToolCall } = await import("@earendil-works/pi-ai");
			const { handleChatInput } = await import("../src/server/chat-handler.ts");
			const { runningTurn } = await import("../src/server/turn-runs.ts");
			const { createPracticeAgent } = await import("../src/agent/teacher-agent.ts");
			const { activeProblemOf } = await import("../src/core/native-messages.ts");
			const faux = createFauxCore({});
			let modelCalls = 0;
			faux.setResponses([(context) => {
				modelCalls++;
				assert.ok(JSON.stringify(context.messages).includes(input.goal));
				assert.ok(JSON.stringify(context.messages).includes(input.context));
				return fauxAssistantMessage([fauxToolCall("problem", {
					statement: "Given x=2, y=5, w=1, eta=0.1, compute the prediction, loss, gradient and updated weight.",
					mode: "composition",
					modelSolution: "Prediction 2, error -3, loss 4.5, gradient -6, updated weight 1.6.",
				}, { id: "first-followup-problem" })], { stopReason: "toolUse" });
			}]);
			const source = chatStore.createChat("Runner source");
			chatStore.saveSettings(source.id, { model: { provider: "openrouter", id: "openai/gpt-4o-mini" } });
			let completion: Promise<string> | undefined;
			let startupError: unknown;
			const created = await startFollowupSession({
				chatId: source.id, chatStore,
				startTurn: async (id) => {
					try {
						const response = await handleChatInput(id, { type: "continue" }, (opts) => createPracticeAgent({ chatId: id, chatStore }, {
							...opts, engine: { model: faux.getModel(), streamFn: faux.streamSimple },
						}));
						const handle = runningTurn(id);
						if (handle) completion = new Response(handle.subscribe()).text();
						return response;
					} catch (error) { startupError = error; throw error; }
				},
			}, "call-runner", input);
			await completion;
			assert.equal(startupError, undefined);
			assert.deepEqual(created.startup, { state: "started" });
			assert.equal(modelCalls, 1);
			assert.ok(activeProblemOf(chatStore.getChat(created.id)!.messages));
			assert.equal(chatStore.getChat(created.id)?.followup?.startup.state, "started");
		} finally {
			globalThis.fetch = originalFetch;
			if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = originalKey;
		}
	});

	it("reports a subscription automatic-use refusal instead of claiming the opening started", async () => {
		const { handleChatInput } = await import("../src/server/chat-handler.ts");
		const source = chatStore.createChat("Subscription source");
		chatStore.saveSettings(source.id, { model: { provider: "chatgpt", id: "test-subscription-model" } });
		const created = await startFollowupSession({
			chatId: source.id, chatStore,
			startTurn: (id) => handleChatInput(id, { type: "continue" }),
		}, "call-background-off", input);
		assert.equal(created.startup.state, "failed");
		assert.match(created.startup.state === "failed" ? created.startup.error : "", /Background use is off/);
		assert.equal(chatStore.getChat(created.id)?.messages.length, 1);
	});
});
