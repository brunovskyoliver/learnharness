import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { seedReviewChats } from "../scripts/seed-review.mjs";

const data = await mkdtemp(path.join(os.tmpdir(), "lh-review-seed-"));
process.env.LH_DATA_DIR = data;
process.env.LH_HOSTED = "0";
const { chatStore } = await import("../src/store/chats.ts");
const { activeProblemOf, danglingQuestionOf } = await import("../src/core/native-messages.ts");
const { phaseAt3Lh } = await import("../src/core/phases.ts");
after(() => rm(data, { recursive: true, force: true }));

test("review seeds load through the production store with active lesson and practice states", async () => {
	const results = await seedReviewChats(data);
	assert.equal(results.filter(result => result.status === "created").length, 4);
	assert.equal(chatStore.listChats().length, 4);
	const lesson = chatStore.getChat("review-gradient-descent");
	assert.ok(lesson);
	assert.equal(phaseAt3Lh(lesson.messages), "teach");
	const question = danglingQuestionOf(lesson.messages);
	assert.ok(question);
	assert.match(JSON.stringify(question), /review_gradient_demo/);
	assert.ok(danglingQuestionOf(chatStore.getChat("review-belief-check")!.messages));
	const practice = chatStore.getChat("review-practice");
	assert.equal(practice?.kind, "practice");
	assert.ok(activeProblemOf(practice!.messages));
	assert.equal(activeProblemOf(chatStore.getChat("review-practice-history")!.messages), null);
});

test("reseeding preserves learner edits, unrelated chats and settings", async () => {
	const file = path.join(data, "chats/review-gradient-descent.json");
	const record = JSON.parse(await readFile(file, "utf8"));
	record.title = "My edited review";
	const edited = JSON.stringify(record);
	await writeFile(file, edited);
	await writeFile(path.join(data, "chats/my-existing-chat.json"), "existing chat bytes");
	await writeFile(path.join(data, "settings.json"), "existing settings bytes");
	const results = await seedReviewChats(data);
	assert.ok(results.every(result => result.status === "kept"));
	assert.equal(await readFile(file, "utf8"), edited);
	assert.equal(await readFile(path.join(data, "chats/my-existing-chat.json"), "utf8"), "existing chat bytes");
	assert.equal(await readFile(path.join(data, "settings.json"), "utf8"), "existing settings bytes");
});

test("review seeding refuses hosted mode", async () => {
	process.env.LH_HOSTED = "1";
	try { await assert.rejects(seedReviewChats(data), /local development/); }
	finally { process.env.LH_HOSTED = "0"; }
});

test("the Node CLI honors an explicit local data root", async () => {
	const cliData = path.join(data, "cli-data");
	const { stdout } = await promisify(execFile)(process.execPath, ["scripts/seed-review.mjs"], {
		cwd: path.resolve(import.meta.dirname, ".."),
		env: { ...process.env, LH_DATA_DIR: cliData, LH_HOSTED: "0" },
	});
	assert.match(stdout, /created: \/chat\/review-gradient-descent/);
	const record = JSON.parse(await readFile(path.join(cliData, "chats/review-gradient-descent.json"), "utf8"));
	assert.equal(record.version, 1);
	assert.equal(record.id, "review-gradient-descent");
});
