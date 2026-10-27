import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-feed-scan-"));
process.env.LH_DATA_DIR = directory;
Object.assign(process.env, { NODE_ENV: "test" });
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { activityFeed } = await import("../src/server/observability.ts");
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("activity reads the job directory once across chats and excludes orphaned/finished jobs", (t) => {
	const chats = Array.from({ length: 4 }, (_, index) => chatStore.createChat(`Session ${index}`));
	const running = chats.map((chat, index) => {
		const job = jobStore.createJob({ kind: "research", chatId: chat.id, toolCallId: `running-${index}` });
		jobStore.updateJob(job.id, { updatedAt: `2026-10-27T00:00:0${3 - index}.000Z` });
		return job;
	});
	const done = jobStore.createJob({ kind: "research", chatId: chats[0]!.id, toolCallId: "done" });
	jobStore.updateJob(done.id, { status: "done" });
	jobStore.createJob({ kind: "research", chatId: "missing", toolCallId: "orphan" });
	const spy = t.mock.method(jobStore, "listJobs");
	const feed = activityFeed();
	assert.equal(spy.mock.callCount(), 1, "one file scan, independent of the number of chats");
	assert.deepEqual(feed.jobs.map((job) => job.id), running.map((job) => job.id).reverse());
	for (const job of feed.jobs) assert.equal(job.title, chats.find((chat) => chat.id === job.chatId)!.title);
});
