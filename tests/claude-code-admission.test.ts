/**
 * SC-003: with the Claude Code opt-in off, no entry point starts a CLI
 * process. A fake `claude` on PATH writes a marker file whenever it is
 * executed; every model slot names claude-code:sonnet, and each entry point
 * (chat turn, background job, session title, notebook, card generation,
 * library references) refuses before write-ahead without the marker ever
 * appearing.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test, { after, before } from "node:test";

const testData = mkdtempSync(join(tmpdir(), "lh-cli-admission-data-"));
process.env.LH_DATA_DIR = testData;
const binDir = mkdtempSync(join(tmpdir(), "claude-admission-bin-"));
const marker = join(binDir, "executed");
const savedPath = process.env.PATH;
after(() => {
	if (savedPath === undefined) delete process.env.PATH; else process.env.PATH = savedPath;
	rmSync(testData, { recursive: true, force: true });
	rmSync(binDir, { recursive: true, force: true });
});

const { CLAUDE_CODE_UNAVAILABLE } = await import("../src/core/settings.ts");
const { writeSettings, readSettings } = await import("../src/store/settings.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { isTurnRunning } = await import("../src/server/turn-liveness.ts");
const { retitleSession } = await import("../src/server/session-titles.ts");
const { notebookModelRefusal } = await import("../src/server/notebook.ts");
const { cardModelRefusal } = await import("../src/server/card-generation.ts");
const { visionAvailable } = await import("../src/server/library-references.ts");
const { automaticFollowUpAllowed } = await import("../src/server/jobs.ts");
const { getClaudeBinary } = await import("../src/agent/claude-code/binary.ts");

const SONNET = { provider: "claude-code", id: "sonnet" };

before(() => {
	writeFileSync(join(binDir, process.platform === "win32" ? "claude.exe" : "claude"), `#!/bin/sh\ntouch "${marker}"\necho "2.1.321 (Claude Code)"\n`, { mode: 0o755 });
	process.env.PATH = `${binDir}${delimiter}${savedPath ?? ""}`;
	writeSettings({ version: 1, models: { strong: { model: SONNET }, cheap: { model: SONNET }, vision: { model: SONNET } } });
});

function assertNoCliProcess(): void {
	assert.equal(existsSync(marker), false, "the claude CLI must never be executed while the opt-in is off");
}

test("the fake CLI is the installation the app would find, and the opt-in is off", () => {
	assert.equal(getClaudeBinary(), join(binDir, "claude"));
	assert.equal(readSettings()?.claudeCode, undefined);
});

test("a chat turn refuses before write-ahead", async () => {
	const chat = chatStore.createChat("Claude Code admission: chat");
	chatStore.saveSettings(chat.id, { model: SONNET });
	const before = chatStore.getChat(chat.id)!.messages;
	const response = await handleChatRequest(new Request("http://test/api/chat", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "must not start" } }),
	}), () => assert.fail("a refused turn must not build an agent"));
	assert.equal(response.status, 503);
	assert.equal((await response.json()).error, CLAUDE_CODE_UNAVAILABLE);
	assert.equal(isTurnRunning(chat.id), false);
	assert.deepEqual(chatStore.getChat(chat.id)!.messages, before);
	assert.equal(automaticFollowUpAllowed(chat.id), false, "automatic follow-ups are background work too");
	assertNoCliProcess();
});

test("a background job is refused before any model call", async () => {
	const chat = chatStore.createChat("Claude Code admission: job");
	const job = jobStore.createJob({ kind: "research", chatId: chat.id, toolCallId: "cli-admission-job" });
	// The production runner, wired by chat-handler.ts (crash-recovery respawn seam).
	const wiring = (globalThis as { __lhWakeWiring?: { respawn?: (jobId: string) => void } }).__lhWakeWiring;
	assert.ok(wiring?.respawn, "chat-handler wires the job runner");
	wiring.respawn(job.id);
	const deadline = Date.now() + 5000;
	while (jobStore.getJob(job.id)!.status !== "error") {
		assert.ok(Date.now() < deadline, `job did not refuse: ${jobStore.getJob(job.id)!.status}`);
		await sleep(10);
	}
	assert.match(JSON.stringify(jobStore.getJob(job.id)!.result), /Enable and set it up in Settings/);
	assertNoCliProcess();
});

test("a session title is never generated", async () => {
	const chat = chatStore.createChat("Untitled session");
	await retitleSession(chat.id, "Teach me how sockets work");
	assert.equal(chatStore.getChat(chat.id)!.title, "Untitled session");
	assertNoCliProcess();
});

test("a notebook request is refused with the Claude Code sentence", () => {
	const refusal = notebookModelRefusal();
	assert.ok(refusal);
	assert.equal(refusal.status, 503);
	assert.equal(refusal.body.error, CLAUDE_CODE_UNAVAILABLE);
	assert.equal(refusal.body.reason, "key");
	assertNoCliProcess();
});

test("a card generation is refused with the Claude Code sentence", () => {
	const refusal = cardModelRefusal();
	assert.ok(refusal);
	assert.equal(refusal.status, 503);
	assert.equal(refusal.body.error, CLAUDE_CODE_UNAVAILABLE);
	assertNoCliProcess();
});

test("library references never offer a Claude Code vision read", () => {
	assert.equal(visionAvailable(), false);
	assertNoCliProcess();
});

test("no entry point executed the CLI", () => {
	assertNoCliProcess();
});
