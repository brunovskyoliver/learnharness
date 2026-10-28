/**
 * WITHDRAW ONE QUEUED STEER (feature 002, contracts/steer-cancel.md): the
 * learner's × on a queued row. A parked steer leaves the registry; a steer
 * handed to the live agent leaves its steering queue while every other
 * message (job results, other steers) stays, in order; a drained steer is
 * "already delivered"; unknown ids are honest 404s; a non-"all" steering
 * mode refuses. The fake agent models pi-agent-core 1.4.0's queue surface:
 * steer, peekQueuedMessages, clearSteeringQueue, steeringMode.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

// ── the seam, BEFORE any config-loading import ──────────────────────────────
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-steer-cancel-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { chatStore } = await import("../src/store/chats.ts");
const { cancelUserSteer, registerLiveAgent, reconcileUserSteers, steerLiveChat, unregisterLiveAgent } = await import("../src/server/jobs.ts");
const cancelRoute = await import("../app/api/chats/[id]/steer/[steerId]/route.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

type Msg = { id: string; role: string; content: string; timestamp: number };
const steer = (id: string, content = id): Msg => ({ id, role: "user", content, timestamp: 1 });

/** pi's Agent queue surface: "all" mode drains every queued message at once. */
function fakeAgent(steeringMode: "all" | "one-at-a-time" = "all") {
	let queue: Msg[] = [];
	const agent = {
		steeringMode,
		steer: (message: Msg) => { queue.push(message); },
		peekQueuedMessages: () => [...queue],
		clearSteeringQueue: () => { queue = []; },
	};
	return { agent, queued: () => queue.map((m) => m.id), drain: () => { const out = queue; queue = []; return out; } };
}

const del = (chatId: string, steerId: string) =>
	cancelRoute.DELETE(new Request(`http://test/api/chats/${chatId}/steer/${steerId}`, { method: "DELETE" }), { params: Promise.resolve({ id: chatId, steerId }) });

describe("cancelUserSteer", () => {
	it("a handed steer leaves the live queue; a job steer and another user steer stay, in order", () => {
		const chatId = chatStore.createChat("cancel: live").id;
		const live = fakeAgent();
		registerLiveAgent(chatId, live.agent as never);
		assert.equal(steerLiveChat(chatId, steer("s1") as never), true);
		live.agent.steer({ ...steer("job-result"), role: "custom" }); // a job marker sharing the queue
		assert.equal(steerLiveChat(chatId, steer("s2") as never), true);
		assert.deepEqual(live.queued(), ["s1", "job-result", "s2"]);

		assert.equal(cancelUserSteer(chatId, "s1"), "cancelled");
		assert.deepEqual(live.queued(), ["job-result", "s2"], "only the withdrawn steer is gone, order kept");

		// The agent drains what is left; the withdrawn one never reaches it.
		assert.deepEqual(live.drain().map((m) => m.id), ["job-result", "s2"]);
		unregisterLiveAgent(chatId);
		reconcileUserSteers(chatId, [steer("s2")] as never);
		// Nothing of s1 rides a later run either.
		const next = fakeAgent();
		registerLiveAgent(chatId, next.agent as never);
		assert.deepEqual(next.queued(), []);
		unregisterLiveAgent(chatId);
	});

	it("a parked steer (turn ended before delivery) is removed and never rides the next run", () => {
		const chatId = chatStore.createChat("cancel: parked").id;
		const first = fakeAgent();
		registerLiveAgent(chatId, first.agent as never);
		assert.equal(steerLiveChat(chatId, steer("p1") as never), true);
		unregisterLiveAgent(chatId);
		reconcileUserSteers(chatId, [] as never); // stranded: stays parked

		assert.equal(cancelUserSteer(chatId, "p1"), "cancelled");
		const next = fakeAgent();
		registerLiveAgent(chatId, next.agent as never);
		assert.deepEqual(next.queued(), [], "the next run receives nothing");
		unregisterLiveAgent(chatId);
	});

	it("a steer the agent already drained is delivered, and stays out of nothing", () => {
		const chatId = chatStore.createChat("cancel: drained").id;
		const live = fakeAgent();
		registerLiveAgent(chatId, live.agent as never);
		assert.equal(steerLiveChat(chatId, steer("d1") as never), true);
		live.drain();
		assert.equal(cancelUserSteer(chatId, "d1"), "delivered");
		unregisterLiveAgent(chatId);
		reconcileUserSteers(chatId, [steer("d1")] as never);
	});

	it("a steer the record already holds is delivered; an unknown id is unknown", () => {
		const chat = chatStore.createChat("cancel: persisted");
		chatStore.saveMessages(chat.id, [steer("in-record") as never]);
		assert.equal(cancelUserSteer(chat.id, "in-record"), "delivered");
		assert.equal(cancelUserSteer(chat.id, "never-sent"), "unknown");
	});

	it("refuses when the live agent does not drain all steers at once", () => {
		const chatId = chatStore.createChat("cancel: mode").id;
		const live = fakeAgent("one-at-a-time");
		registerLiveAgent(chatId, live.agent as never);
		assert.equal(steerLiveChat(chatId, steer("m1") as never), true);
		assert.equal(cancelUserSteer(chatId, "m1"), "unsupported");
		assert.deepEqual(live.queued(), ["m1"], "nothing was touched");
		unregisterLiveAgent(chatId);
		reconcileUserSteers(chatId, [steer("m1")] as never);
	});
});

describe("DELETE /api/chats/[id]/steer/[steerId]", () => {
	it("200, then 404 on a second DELETE (idempotence per the contract)", async () => {
		const chatId = chatStore.createChat("cancel route: ok").id;
		const live = fakeAgent();
		registerLiveAgent(chatId, live.agent as never);
		steerLiveChat(chatId, steer("r1") as never);
		const first = await del(chatId, "r1");
		assert.equal(first.status, 200);
		assert.deepEqual(await first.json(), { ok: true });
		const second = await del(chatId, "r1");
		assert.equal(second.status, 404);
		assert.deepEqual(await second.json(), { error: "unknown steer" });
		unregisterLiveAgent(chatId);
	});

	it("404 unknown chat; 409 already delivered; 409 cannot withdraw", async () => {
		assert.deepEqual(await (await del("chat_nope", "x")).json(), { error: "unknown chat" });
		assert.equal((await del("chat_nope", "x")).status, 404);

		const chat = chatStore.createChat("cancel route: delivered");
		chatStore.saveMessages(chat.id, [steer("landed") as never]);
		const delivered = await del(chat.id, "landed");
		assert.equal(delivered.status, 409);
		assert.deepEqual(await delivered.json(), { error: "already delivered" });

		const modeChat = chatStore.createChat("cancel route: mode").id;
		const live = fakeAgent("one-at-a-time");
		registerLiveAgent(modeChat, live.agent as never);
		steerLiveChat(modeChat, steer("m2") as never);
		const refused = await del(modeChat, "m2");
		assert.equal(refused.status, 409);
		assert.deepEqual(await refused.json(), { error: "cannot withdraw" });
		unregisterLiveAgent(modeChat);
		reconcileUserSteers(modeChat, [steer("m2")] as never);
	});
});
