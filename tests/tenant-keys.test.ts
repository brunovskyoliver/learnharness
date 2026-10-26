/**
 * Per-user keys in hosted mode (2026-10-26): a saved key lives only in
 * that tenant's auth.json — never in the shared process.env, never visible
 * to another tenant — the server's own env keys never serve users, and the
 * engine hands pi-ai the tenant's keys per request. keys.ts boots at
 * import, so the env is set before the dynamic imports.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-tenant-keys-"));
process.env.LH_DATA_DIR = dir;
process.env.LH_HOSTED = "1";
process.env.OPENAI_API_KEY = "sk-operator-owned-key";
const { runAsTenant } = await import("../config.ts");
const { keyValue, saveKey, deleteKey, keyStatuses } = await import("../src/server/keys.ts");
const { piEngineForSpec, piModels } = await import("../src/agent/models.ts");
after(() => {
	delete process.env.LH_HOSTED;
	fs.rmSync(dir, { recursive: true, force: true });
});

const KEY = "sk-proj-tenant-a-0123456789";

describe("hosted per-user keys", () => {
	it("drops the server's own env keys at boot", () => {
		assert.equal(process.env.OPENAI_API_KEY, undefined);
		runAsTenant("user_b", () => assert.equal(keyValue("OPENAI_API_KEY"), undefined));
	});

	it("keeps a saved key in its tenant only", () => {
		runAsTenant("user_a", () => assert.equal(saveKey("OPENAI_API_KEY", KEY).ok, true));
		assert.equal(process.env.OPENAI_API_KEY, undefined, "never reflected into process.env");
		runAsTenant("user_a", () => assert.equal(keyValue("OPENAI_API_KEY"), KEY));
		runAsTenant("user_b", () => {
			assert.equal(keyValue("OPENAI_API_KEY"), undefined);
			assert.equal(keyStatuses().find((s) => s.id === "OPENAI_API_KEY")?.present ?? false, false);
		});
	});

	it("passes the tenant's keys to pi-ai per request", async () => {
		const models = piModels();
		const real = models.streamSimple;
		let seen: Record<string, string> | undefined;
		models.streamSimple = ((_model: unknown, _context: unknown, options?: { env?: Record<string, string> }) => {
			seen = options?.env;
			return { async *[Symbol.asyncIterator]() {} };
		}) as unknown as typeof models.streamSimple;
		try {
			const model = models.getModels("openai")[0]!;
			const run = (user: string) => runAsTenant(user, () => {
				piEngineForSpec({ provider: "openai", id: model.id }).streamFn(model, { messages: [] } as unknown as Parameters<ReturnType<typeof piEngineForSpec>["streamFn"]>[1], {});
				return seen;
			});
			assert.equal(run("user_a")?.OPENAI_API_KEY, KEY);
			assert.equal(run("user_b")?.OPENAI_API_KEY, undefined);
		} finally {
			models.streamSimple = real;
		}
	});

	it("deleting a key never touches process.env", () => {
		runAsTenant("user_a", () => deleteKey("OPENAI_API_KEY"));
		runAsTenant("user_a", () => assert.equal(keyValue("OPENAI_API_KEY"), undefined));
		assert.equal(process.env.OPENAI_API_KEY, undefined);
	});
});
