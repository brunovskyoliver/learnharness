/**
 * The tenant seam (hosted multi-user, 2026-10-26): every mutable path
 * resolves under DATA_ROOT/users/<userId>/ inside runAsTenant, one
 * tenant can never read another's records, and hosted mode fails closed
 * outside a tenant. LH_DATA_DIR is read at config load, so set it first.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-tenant-"));
process.env.LH_DATA_DIR = dir;
const { PATHS, authFile, runAsTenant, settingsFile } = await import("../config.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { authStore } = await import("../src/store/auth.ts");
after(() => {
	delete process.env.LH_HOSTED;
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("tenant seam", () => {
	it("resolves every mutable path under users/<id>", () => {
		runAsTenant("user_a", () => {
			const root = path.join(dir, "users", "user_a");
			assert.equal(PATHS.chats, path.join(root, "chats"));
			assert.equal(settingsFile(), path.join(root, "settings.json"));
			assert.equal(authFile(), path.join(root, "auth.json"));
		});
	});

	it("keeps the pre-tenant paths outside hosted mode", () => {
		assert.equal(PATHS.chats, path.join(dir, "chats"));
	});

	it("isolates chats and keys between tenants, across awaits", async () => {
		const id = await runAsTenant("user_a", async () => {
			await new Promise((resolve) => setTimeout(resolve, 1));
			authStore.setAuthVar("OPENAI_API_KEY", "sk-a");
			return chatStore.createChat("A's chat").id;
		});
		runAsTenant("user_b", () => {
			assert.equal(chatStore.getChat(id), null);
			assert.deepEqual(chatStore.listChats().map((c) => c.id), []);
			assert.equal(authStore.authVars().OPENAI_API_KEY, undefined);
		});
		runAsTenant("user_a", () => assert.equal(chatStore.getChat(id)?.title, "A's chat"));
	});

	it("rejects tenant ids that could escape users/", () => {
		for (const bad of ["", "..", "../x", "a/b", "a\\b", "x".repeat(65)]) {
			assert.throws(() => runAsTenant(bad, () => {}), /invalid tenant id/);
		}
	});

	it("fails closed in hosted mode with no tenant", () => {
		process.env.LH_HOSTED = "1";
		try {
			assert.throws(() => PATHS.chats, /outside a tenant/);
			assert.throws(() => authFile(), /outside a tenant/);
			// Reads swallow fs errors and show nothing; writes throw.
			assert.deepEqual(chatStore.listChats(), []);
			assert.throws(() => chatStore.createChat("x"), /outside a tenant/);
		} finally {
			delete process.env.LH_HOSTED;
		}
	});
});
