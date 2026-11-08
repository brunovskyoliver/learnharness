/** Repo link tokens (feature 026, research R8): a 0600 sibling of auth.json,
 *  masked to the client, per tenant, never in auth.json or process.env. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-repo-tokens-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_AUTH_FILE = path.join(dir, "auth.json");
const { runAsTenant } = await import("../config.ts");
const { repoTokens } = await import("../src/store/repo-tokens.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const file = path.join(dir, "git-tokens.json");
const SENTINEL = "ghp_sentinelTOKEN0000a1b2";

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

describe("repo token store", () => {
	it("absent or corrupt reads as no tokens", () => {
		assert.equal(repoTokens.get("rpl_1"), null);
		assert.equal(repoTokens.mask("rpl_1"), null);
		fs.writeFileSync(file, "{not json");
		assert.equal(repoTokens.get("rpl_1"), null);
		fs.writeFileSync(file, "[1,2]");
		assert.equal(repoTokens.get("rpl_1"), null);
	});

	it("sets, gets, masks and deletes per link", () => {
		repoTokens.set("rpl_1", SENTINEL);
		repoTokens.set("rpl_2", "glpat-other9999");
		assert.equal(repoTokens.get("rpl_1"), SENTINEL);
		assert.equal(repoTokens.mask("rpl_1"), "…a1b2");
		assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { rpl_1: SENTINEL, rpl_2: "glpat-other9999" });
		repoTokens.delete("rpl_1");
		repoTokens.delete("rpl_missing");
		assert.equal(repoTokens.get("rpl_1"), null);
		assert.equal(repoTokens.get("rpl_2"), "glpat-other9999");
	});

	it("keeps the file at 0600 across rewrites and leaves no temp files", () => {
		repoTokens.set("rpl_1", SENTINEL);
		assert.equal(fs.statSync(file).mode & 0o777, 0o600);
		fs.chmodSync(file, 0o644);
		repoTokens.set("rpl_2", "x");
		assert.equal(fs.statSync(file).mode & 0o777, 0o600);
		assert.deepEqual(fs.readdirSync(dir), ["git-tokens.json"]);
	});

	it("never writes auth.json or process.env", () => {
		repoTokens.set("rpl_1", SENTINEL);
		assert.equal(fs.existsSync(path.join(dir, "auth.json")), false);
		assert.ok(!Object.values(process.env).includes(SENTINEL));
	});

	it("is per tenant in hosted mode", () => {
		const hosted = process.env.LH_HOSTED;
		process.env.LH_HOSTED = "1";
		try {
			runAsTenant("user_a", () => repoTokens.set("rpl_1", "token-a-1111"));
			runAsTenant("user_b", () => assert.equal(repoTokens.get("rpl_1"), null));
			runAsTenant("user_a", () => assert.equal(repoTokens.get("rpl_1"), "token-a-1111"));
			assert.ok(fs.existsSync(path.join(dir, "users", "user_a", "git-tokens.json")));
			assert.equal(fs.existsSync(file), false);
			assert.throws(() => repoTokens.get("rpl_1"), /outside a tenant/);
		} finally {
			if (hosted === undefined) delete process.env.LH_HOSTED;
			else process.env.LH_HOSTED = hosted;
		}
	});
});
