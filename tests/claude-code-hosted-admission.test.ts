/**
 * Hosted Claude Code admission (T059, FR-017, O5, O6, research R8): the
 * chat handler refreshes the tenant's cached `auth status` before its
 * admission check. A signed-out tenant is refused with the sign-in sentence
 * before write-ahead and without a model process; a signed-in tenant's turn
 * runs in its own CLI folder; an authentication_failed run flips that
 * tenant's cache; background work for a signed-out tenant refuses; with the
 * opt-in off no `auth status` child ever starts.
 *
 * `claude` on PATH is the auth fake (status/login/logout/--version); model
 * turns go through the runClaude seam with fixtures/claude-code/fake-claude.mjs.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test, { after, type TestContext } from "node:test";
import { installFakeClaudeAuth } from "./helpers/fake-claude-auth.ts";
import type { RunClaude } from "../src/agent/claude-code/stream.ts";
import type { PiEngine } from "../src/agent/models.ts";

const testData = mkdtempSync(join(tmpdir(), "lh-cli-hosted-admission-data-"));
process.env.LH_DATA_DIR = testData;
process.env.LH_HOSTED = "1";
const fake = installFakeClaudeAuth();
after(() => {
	fake.restore();
	delete process.env.LH_HOSTED;
	rmSync(testData, { recursive: true, force: true });
});

const { PATHS, runAsTenant } = await import("../config.ts");
const { CLAUDE_CODE_SIGN_IN, CLAUDE_CODE_UNAVAILABLE } = await import("../src/core/settings.ts");
const { writeSettings } = await import("../src/store/settings.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { isTurnRunning } = await import("../src/server/turn-liveness.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { cachedClaudeCodeSignedIn, startSignIn, submitSignInCode } = await import("../src/server/claude-code-auth.ts");
const { cliBackgroundAllowed } = await import("../src/server/claude-code-config.ts");
const { CLAUDE_CODE_MODELS } = await import("../src/agent/claude-code/provider.ts");
const { createClaudeCodeStreamFunction } = await import("../src/agent/claude-code/stream.ts");
const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");

const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/claude-code/fake-claude.mjs", import.meta.url));
const TEXT = fileURLToPath(new URL("./fixtures/claude-code/text.jsonl", import.meta.url));
const SIGNED_OUT = fileURLToPath(new URL("./fixtures/claude-code/signed-out.jsonl", import.meta.url));
const SONNET = { provider: "claude-code", id: "sonnet" };
const A = "user_admit_a";
const B = "user_admit_b";
const C = "user_admit_c";

function setup(tenant: string, enabled: boolean): void {
	runAsTenant(tenant, () => writeSettings({ version: 1, claudeCode: { enabled }, models: { strong: { model: SONNET }, cheap: { model: SONNET }, vision: { model: SONNET } } }));
}

type FakeTurns = { factory: Parameters<typeof handleChatRequest>[1]; spawned: NodeJS.ProcessEnv[]; built: number };

function fakeTurns(t: TestContext, scenario: string): FakeTurns {
	const result: FakeTurns = { factory: undefined as never, spawned: [], built: 0 };
	const runClaude: RunClaude = async (args, options) => {
		result.spawned.push(options.env);
		const child = spawn(process.execPath, [FAKE_CLAUDE, ...args], {
			cwd: options.cwd, env: { ...options.env, FAKE_CLAUDE_SCENARIO: scenario }, stdio: ["pipe", "pipe", "pipe", "ipc"],
		}) as ChildProcessWithoutNullStreams;
		t.after(() => child.kill("SIGKILL"));
		return child;
	};
	const model = CLAUDE_CODE_MODELS.find((candidate) => candidate.id === "sonnet")!;
	const engine: PiEngine = { model, streamFn: createClaudeCodeStreamFunction(runClaude) };
	result.factory = (options) => { result.built++; return createTeacherAgent(undefined, { engine, chatId: options.chatId, messages: options.messages }); };
	return result;
}

function chatRequest(chatId: string): Request {
	return new Request("http://test/api/chat", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chatId, input: { type: "text", text: "Teach me sockets" } }),
	});
}

async function settle(chatId: string): Promise<void> {
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
	const deadline = Date.now() + 8000;
	while (isTurnRunning(chatId)) {
		assert.ok(Date.now() < deadline, "turn did not settle");
		await sleep(10);
	}
}

function statusCalls(tenant: string): number {
	const folder = runAsTenant(tenant, () => PATHS.claudeCode);
	return fake.calls().filter((call) => call.argv.join(" ") === "auth status --json" && call.configDir === folder).length;
}

test("a signed-out tenant is refused with the sign-in sentence before write-ahead", async (t) => {
	setup(B, true);
	const turns = fakeTurns(t, TEXT);
	await runAsTenant(B, async () => {
		const chat = chatStore.createChat("Hosted admission: signed out");
		chatStore.saveSettings(chat.id, { model: SONNET });
		const before = chatStore.getChat(chat.id)!.messages;
		const response = await handleChatRequest(chatRequest(chat.id), turns.factory);
		assert.equal(response.status, 503);
		const body = await response.json() as { error: string; provider: string };
		assert.equal(body.error, CLAUDE_CODE_SIGN_IN);
		assert.equal(body.provider, "claude-code");
		assert.deepEqual(chatStore.getChat(chat.id)!.messages, before, "nothing persisted");
		assert.equal(isTurnRunning(chat.id), false);
	});
	assert.equal(turns.built, 0);
	assert.equal(turns.spawned.length, 0, "no model process");
	assert.equal(statusCalls(B), 1, "the stale cache was refreshed from B's folder");
});

test("background work for a signed-out tenant refuses", async () => {
	await runAsTenant(B, async () => {
		assert.equal(cliBackgroundAllowed("claude-code"), false);
		const chat = chatStore.createChat("Hosted admission: job");
		const job = jobStore.createJob({ kind: "research", chatId: chat.id, toolCallId: "hosted-admission-job" });
		const wiring = (globalThis as { __lhWakeWiring?: { respawn?: (jobId: string) => void } }).__lhWakeWiring;
		assert.ok(wiring?.respawn, "chat-handler wires the job runner");
		wiring.respawn(job.id);
		const deadline = Date.now() + 5000;
		while (jobStore.getJob(job.id)!.status !== "error") {
			assert.ok(Date.now() < deadline, `job did not refuse: ${jobStore.getJob(job.id)!.status}`);
			await sleep(10);
		}
		assert.match(JSON.stringify(jobStore.getJob(job.id)!.result), /Sign in to Claude Code in Settings/);
	});
});

test("a signed-in tenant's turn runs in its own CLI folder", async (t) => {
	setup(A, true);
	await runAsTenant(A, async () => {
		assert.ok((await startSignIn("claudeai")).ok);
		assert.ok((await submitSignInCode("good-code")).ok);
	});
	const turns = fakeTurns(t, TEXT);
	await runAsTenant(A, async () => {
		const chat = chatStore.createChat("Hosted admission: signed in");
		chatStore.saveSettings(chat.id, { model: SONNET });
		const response = await handleChatRequest(chatRequest(chat.id), turns.factory);
		assert.equal(response.status, 200, await response.clone().text());
		await settle(chat.id);
		const assistant = chatStore.getChat(chat.id)!.messages.findLast((message) => message.role === "assistant");
		assert.equal(assistant?.role === "assistant" && assistant.stopReason, "stop");
	});
	assert.equal(turns.spawned.length, 1);
	assert.equal(turns.spawned[0]!.HOME, runAsTenant(A, () => PATHS.claudeCode));
	assert.equal(turns.spawned[0]!.CLAUDE_CONFIG_DIR, runAsTenant(A, () => PATHS.claudeCode));
	assert.equal(runAsTenant(B, () => cachedClaudeCodeSignedIn()), false, "B is still signed out");
});

test("an authentication_failed run marks that tenant signed out", async (t) => {
	const turns = fakeTurns(t, SIGNED_OUT);
	await runAsTenant(A, async () => {
		assert.equal(cachedClaudeCodeSignedIn(), true);
		const chat = chatStore.createChat("Hosted admission: token revoked");
		chatStore.saveSettings(chat.id, { model: SONNET });
		const response = await handleChatRequest(chatRequest(chat.id), turns.factory);
		assert.equal(response.status, 200);
		await settle(chat.id);
		assert.equal(cachedClaudeCodeSignedIn(), false);
	});
	assert.equal(turns.spawned.length, 1);
});

test("with the opt-in off no auth status child starts", async (t) => {
	setup(C, false);
	const turns = fakeTurns(t, TEXT);
	await runAsTenant(C, async () => {
		const chat = chatStore.createChat("Hosted admission: opt-in off");
		chatStore.saveSettings(chat.id, { model: SONNET });
		const response = await handleChatRequest(chatRequest(chat.id), turns.factory);
		assert.equal(response.status, 503);
		assert.equal((await response.json() as { error: string }).error, CLAUDE_CODE_UNAVAILABLE);
	});
	assert.equal(statusCalls(C), 0);
	assert.equal(fake.calls().filter((call) => call.configDir === runAsTenant(C, () => PATHS.claudeCode)).length, 0, "no CLI process at all");
	assert.equal(turns.spawned.length, 0);
});
