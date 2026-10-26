/**
 * Shared in-memory state under tenants (hosted multi-user, 2026-10-26):
 * registries keyed by chat/job id are per tenant (a leaked chat id must
 * not let another user see a live turn or abort a job), permit pools are
 * per tenant, SSE windows only carry their own tenant's events, and the
 * whole server barrel imports cleanly in hosted mode (module-load code
 * must not touch tenant state).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { runAsTenant } from "../config.ts";
import { emit } from "../src/core/events.ts";
import { eventsResponse } from "../src/server/events-stream.ts";
import { beginTurn, endTurn, isTurnRunning } from "../src/server/turn-liveness.ts";
import { fireJobAbort, registerJobAbort, unregisterJobAbort } from "../src/agent/subagents/aborts.ts";
import { bgLlmSlots } from "../src/agent/subagents/bg-llm-semaphore.ts";

const REPO = path.resolve(import.meta.dirname, "..");

async function firstFrame(response: Response): Promise<string | null> {
	const reader = response.body!.getReader();
	const next = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 50))]);
	await reader.cancel();
	return next && !next.done ? new TextDecoder().decode(next.value) : null;
}

describe("tenant-scoped registries", () => {
	it("a turn running for one tenant is invisible to another", () => {
		runAsTenant("user_a", () => assert.equal(beginTurn("chat1"), true));
		try {
			runAsTenant("user_b", () => assert.equal(isTurnRunning("chat1"), false));
			runAsTenant("user_a", () => assert.equal(isTurnRunning("chat1"), true));
			assert.equal(isTurnRunning("chat1"), false, "the local (no-tenant) registry is separate too");
		} finally {
			runAsTenant("user_a", () => endTurn("chat1"));
		}
	});

	it("another tenant cannot abort a job by id", () => {
		const controller = new AbortController();
		runAsTenant("user_a", () => registerJobAbort("job1", controller));
		try {
			runAsTenant("user_b", () => assert.equal(fireJobAbort("job1"), false));
			assert.equal(controller.signal.aborted, false);
		} finally {
			runAsTenant("user_a", () => unregisterJobAbort("job1"));
		}
	});

	it("each tenant gets its own background permit pool", () => {
		const a = runAsTenant("user_a", () => bgLlmSlots());
		assert.notEqual(a, runAsTenant("user_b", () => bgLlmSlots()));
		assert.equal(a, runAsTenant("user_a", () => bgLlmSlots()));
	});

	it("SSE windows only receive their own tenant's events", async () => {
		const a = runAsTenant("user_a", () => eventsResponse());
		const b = runAsTenant("user_b", () => eventsResponse());
		runAsTenant("user_a", () => emit("chats-changed", {}));
		assert.match((await firstFrame(a)) ?? "", /event: chats-changed/);
		assert.equal(await firstFrame(b), null);
	});

	it("the server barrel imports in hosted mode without touching tenant state", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-hosted-import-"));
		try {
			const out = execFileSync(process.execPath, ["--import", "tsx", "--eval", `await import(${JSON.stringify(path.join(REPO, "src/server/index.ts"))}); console.log("ok")`], {
				cwd: REPO,
				env: { ...process.env, LH_HOSTED: "1", LH_DATA_DIR: dir },
				encoding: "utf8",
			});
			assert.match(out, /ok/);
			assert.deepEqual(fs.readdirSync(dir), [], "nothing written at import");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
