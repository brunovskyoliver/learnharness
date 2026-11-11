/**
 * Hosted Claude Code sign-in relay (T057, FR-014/FR-015/FR-017, research
 * R8-R11), driven against the fake CLI (fixtures/claude-code/fake-claude-auth.mjs)
 * for two tenants: the CLI's URL is relayed only for Anthropic hosts, the
 * pasted code reaches the CLI's stdin and nowhere else, one pending sign-in
 * per tenant with expiry and cancel, failures without the code, status
 * reduced to { state, method, expiresAt }, and nothing logged.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test, { after } from "node:test";
import { FAKE_CLAUDE_TOKEN, installFakeClaudeAuth } from "./helpers/fake-claude-auth.ts";

const testData = mkdtempSync(join(tmpdir(), "lh-cli-auth-data-"));
process.env.LH_DATA_DIR = testData;
process.env.LH_HOSTED = "1";
const fake = installFakeClaudeAuth();

// Every console line from here on; checked at the end for codes and tokens.
const logged: string[] = [];
const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
const savedConsole = Object.fromEntries(consoleMethods.map((name) => [name, console[name]]));
for (const name of consoleMethods) console[name] = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
after(() => {
	for (const name of consoleMethods) console[name] = savedConsole[name]!;
	fake.restore();
	delete process.env.LH_HOSTED;
	rmSync(testData, { recursive: true, force: true });
});

const { PATHS, runAsTenant } = await import("../config.ts");
const auth = await import("../src/server/claude-code-auth.ts");
const { allowedSignInUrl, cachedClaudeCodeSignedIn, cancelSignIn, markClaudeCodeSignedOut, pendingSignIn, readClaudeCodeAuth, signInTimeouts, signOut, startSignIn, submitSignInCode, toAuthStatus } = auth;
const DEFAULT_TIMEOUTS = { ...signInTimeouts };

const A = "user_auth_a";
const B = "user_auth_b";
const CODES = ["good-code", "wrong#code-1234", "nohash-code-5678", "echo#secret-code-9999"];
const responses: string[] = [];
const record = <T>(value: T): T => { responses.push(JSON.stringify(value)); return value; };

function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitDead(pid: number): Promise<boolean> {
	for (let i = 0; i < 50 && alive(pid); i++) await sleep(20);
	return !alive(pid);
}

function loginPids(): number[] {
	return fake.calls().filter((call) => call.argv[0] === "auth" && call.argv[1] === "login").map((call) => call.pid);
}

function reset(): void {
	Object.assign(signInTimeouts, DEFAULT_TIMEOUTS);
	for (const tenant of [A, B]) runAsTenant(tenant, () => cancelSignIn());
	fake.control({});
}

test("only https sign-in URLs on Anthropic hosts are allowed", () => {
	for (const url of ["https://claude.com/cai/oauth/authorize?x=1", "https://claude.ai/a", "https://console.anthropic.com/a", "https://platform.claude.com/oauth/authorize"]) {
		assert.equal(allowedSignInUrl(url), url);
	}
	for (const url of ["http://claude.com/a", "https://claude.com.evil.invalid/a", "https://claude.com@evil.invalid/a", "https://evil.invalid/?claude.com", "javascript:alert(1)", "not a url"]) {
		assert.equal(allowedSignInUrl(url), null, url);
	}
});

test("status keeps only state, method and expiry", () => {
	const now = Date.parse("2026-11-11T00:00:00Z");
	const raw = { loggedIn: true, authMethod: "claude.ai", configDirectory: "/x", projectsDirectory: "/x/projects", email: "e", loginExpiresAt: "2026-11-24T18:42:03.623Z" };
	assert.deepEqual(toAuthStatus(JSON.stringify(raw), now), { state: "signed-in", method: "claude-subscription", expiresAt: "2026-11-24T18:42:03.623Z" });
	assert.deepEqual(toAuthStatus(JSON.stringify({ ...raw, authMethod: "console-or-unknown" }), now).method, "other");
	assert.deepEqual(toAuthStatus(JSON.stringify({ ...raw, loginExpiresAt: null }), now), { state: "signed-in", method: "claude-subscription", expiresAt: null });
	assert.equal(toAuthStatus(JSON.stringify({ ...raw, loginExpiresAt: "2026-11-10T00:00:00Z" }), now).state, "signed-out", "a past expiry is signed out");
	assert.deepEqual(toAuthStatus(JSON.stringify({ loggedIn: false, authMethod: "none", loginExpiresAt: null }), now), { state: "signed-out", method: null, expiresAt: null });
	assert.equal(toAuthStatus("not json", now).state, "unchecked");
	assert.equal(toAuthStatus("{}", now).state, "unchecked");
});

test("a fresh tenant reads signed out from its own folder", async () => {
	const status = record(await runAsTenant(A, () => readClaudeCodeAuth()));
	assert.deepEqual(status, { state: "signed-out", method: null, expiresAt: null });
	const call = fake.calls().at(-1)!;
	assert.deepEqual(call.argv, ["auth", "status", "--json"]);
	assert.equal(call.configDir, runAsTenant(A, () => PATHS.claudeCode));
	assert.equal(runAsTenant(A, () => cachedClaudeCodeSignedIn()), false);
});

test("sign-in relays the CLI's URL, and the code reaches the CLI's stdin", async (t) => {
	t.after(reset);
	const started = record(await runAsTenant(A, () => startSignIn("claudeai")));
	assert.ok(started.ok);
	assert.match(started.pending.url, /^https:\/\/claude\.com\/cai\/oauth\/authorize\?/);
	assert.equal(started.pending.method, "claudeai");
	assert.ok(Date.parse(started.pending.expiresAt) > Date.now() + 9 * 60_000, "a 10-minute pending sign-in");
	const login = fake.calls().at(-1)!;
	assert.deepEqual(login.argv, ["auth", "login", "--claudeai"]);
	assert.equal(login.browser, "/bin/true");
	assert.deepEqual(runAsTenant(A, () => pendingSignIn()), started.pending);

	const done = record(await runAsTenant(A, () => submitSignInCode("good-code")));
	assert.ok(done.ok);
	assert.deepEqual(Object.keys(done.auth).sort(), ["expiresAt", "method", "state"]);
	assert.equal(done.auth.state, "signed-in");
	assert.equal(done.auth.method, "claude-subscription");
	assert.ok(existsSync(join(runAsTenant(A, () => PATHS.claudeCode), "fake-login.json")), "the CLI wrote its login in A's folder");
	assert.equal(runAsTenant(A, () => pendingSignIn()), null);
	assert.equal(runAsTenant(A, () => cachedClaudeCodeSignedIn()), true);
	assert.equal(runAsTenant(B, () => cachedClaudeCodeSignedIn()), false, "B's cache is untouched");
	assert.equal(record(await runAsTenant(B, () => readClaudeCodeAuth())).state, "signed-out", "B's folder has no login");
});

test("the Console method relays the platform URL", async (t) => {
	t.after(reset);
	const started = record(await runAsTenant(B, () => startSignIn("console")));
	assert.ok(started.ok);
	assert.match(started.pending.url, /^https:\/\/platform\.claude\.com\/oauth\/authorize\?/);
	assert.deepEqual(fake.calls().at(-1)!.argv, ["auth", "login", "--console"]);
});

test("a URL on any other host is never relayed", async (t) => {
	t.after(reset);
	fake.control({ loginUrl: "https://claude.com.evil.invalid/oauth" });
	const started = record(await runAsTenant(B, () => startSignIn("claudeai")));
	assert.deepEqual(started, { ok: false, status: 502, error: "Sign-in could not be started." });
	assert.equal(runAsTenant(B, () => pendingSignIn()), null);
	assert.ok(await waitDead(loginPids().at(-1)!));
});

test("no URL within the wait ends the attempt", async (t) => {
	t.after(reset);
	fake.control({ loginSilent: true });
	signInTimeouts.urlMs = 200;
	const started = record(await runAsTenant(B, () => startSignIn("claudeai")));
	assert.deepEqual(started, { ok: false, status: 502, error: "Sign-in could not be started." });
	assert.ok(await waitDead(loginPids().at(-1)!), "the silent CLI is killed");
});

test("a second start replaces the first; one pending sign-in per tenant", async (t) => {
	t.after(reset);
	const first = record(await runAsTenant(B, () => startSignIn("claudeai")));
	const firstPid = loginPids().at(-1)!;
	const second = record(await runAsTenant(B, () => startSignIn("console")));
	assert.ok(first.ok && second.ok);
	assert.ok(await waitDead(firstPid), "the first login child is killed");
	assert.equal(runAsTenant(B, () => pendingSignIn())?.method, "console");
	assert.ok(alive(loginPids().at(-1)!));
});

test("cancel kills the child; another tenant's cancel or code never touches it", async (t) => {
	t.after(reset);
	const started = record(await runAsTenant(A, () => startSignIn("claudeai")));
	assert.ok(started.ok);
	const pid = loginPids().at(-1)!;
	runAsTenant(B, () => cancelSignIn());
	assert.deepEqual(record(await runAsTenant(B, () => submitSignInCode("good-code"))), { ok: false, status: 409, error: "This sign-in expired. Start again." });
	assert.equal(runAsTenant(B, () => pendingSignIn()), null);
	assert.ok(alive(pid), "B never reaches A's pending sign-in");
	assert.deepEqual(runAsTenant(A, () => pendingSignIn()), started.pending);
	runAsTenant(A, () => cancelSignIn());
	assert.equal(runAsTenant(A, () => pendingSignIn()), null);
	assert.ok(await waitDead(pid));
});

test("a pending sign-in expires and is killed", async (t) => {
	t.after(reset);
	signInTimeouts.pendingMs = 200;
	const started = record(await runAsTenant(B, () => startSignIn("claudeai")));
	assert.ok(started.ok);
	const pid = loginPids().at(-1)!;
	await sleep(350);
	assert.ok(await waitDead(pid), "expiry kills the child");
	assert.equal(runAsTenant(B, () => pendingSignIn()), null);
	assert.deepEqual(record(await runAsTenant(B, () => submitSignInCode("good-code"))), { ok: false, status: 409, error: "This sign-in expired. Start again." });
});

test("invalid codes are refused before reaching the CLI", async (t) => {
	t.after(reset);
	assert.ok((await runAsTenant(B, () => startSignIn("claudeai"))).ok);
	for (const code of ["", "a\nb", "tab\tcode", "x".repeat(513), 42, null]) {
		assert.deepEqual(await runAsTenant(B, () => submitSignInCode(code)), { ok: false, status: 400, error: "Paste the code from Anthropic's page." });
	}
	assert.ok(runAsTenant(B, () => pendingSignIn()), "a refused code leaves the sign-in waiting");
});

test("failures carry the CLI's line without the code, and end the attempt", async (t) => {
	t.after(reset);
	const cases: [string, string][] = [
		["wrong#code-1234", "Sign-in failed: Login failed: That code wasn't accepted. It may be incomplete, expired, already used, or from an earlier sign-in attempt. Sign in again to get a new code."],
		// 2.1.321 keeps waiting after "Invalid code"; the relay ends the attempt at once.
		["nohash-code-5678", "Sign-in failed: Invalid code. Please make sure the full code was copied."],
		["echo#secret-code-9999", "Sign-in failed: Login failed: code … was rejected"],
	];
	for (const [code, error] of cases) {
		assert.ok(record(await runAsTenant(B, () => startSignIn("claudeai"))).ok);
		const pid = loginPids().at(-1)!;
		const started = Date.now();
		const result = record(await runAsTenant(B, () => submitSignInCode(code)));
		assert.deepEqual(result, { ok: false, status: 422, error });
		assert.ok(Date.now() - started < 5000, "no wait for the 60-second limit");
		assert.ok(await waitDead(pid));
		assert.equal(runAsTenant(B, () => pendingSignIn()), null, "the pending sign-in ends either way");
	}
	assert.equal(runAsTenant(B, () => cachedClaudeCodeSignedIn()), false);
});

test("sign-out runs logout, then status; a failing logout reports not ok", async () => {
	assert.equal(runAsTenant(A, () => cachedClaudeCodeSignedIn()), true);
	fake.control({ logoutFail: true });
	const failed = record(await runAsTenant(A, () => signOut()));
	assert.deepEqual(failed, { ok: false, auth: failed.auth });
	assert.equal(failed.auth.state, "signed-in");
	fake.control({});
	const done = record(await runAsTenant(A, () => signOut()));
	assert.deepEqual(done, { ok: true, auth: { state: "signed-out", method: null, expiresAt: null } });
	assert.deepEqual(fake.calls().slice(-2).map((call) => call.argv.join(" ")), ["auth logout", "auth status --json"]);
	assert.equal(runAsTenant(A, () => cachedClaudeCodeSignedIn()), false);
});

test("sign-out without a status run (opt-in off) reports signed out", async () => {
	fake.clearCalls();
	const done = record(await runAsTenant(A, () => signOut({ readStatus: false })));
	assert.deepEqual(done, { ok: true, auth: { state: "signed-out", method: null, expiresAt: null } });
	assert.deepEqual(fake.calls().map((call) => call.argv.join(" ")), ["auth logout"]);
});

test("an authentication failure marks only that tenant signed out", async (t) => {
	t.after(reset);
	assert.ok((await runAsTenant(A, () => startSignIn("claudeai"))).ok);
	assert.ok((await runAsTenant(A, () => submitSignInCode("good-code"))).ok);
	assert.ok((await runAsTenant(B, () => startSignIn("claudeai"))).ok);
	assert.ok((await runAsTenant(B, () => submitSignInCode("good-code"))).ok);
	runAsTenant(A, () => markClaudeCodeSignedOut());
	assert.equal(runAsTenant(A, () => cachedClaudeCodeSignedIn()), false);
	assert.equal(runAsTenant(B, () => cachedClaudeCodeSignedIn()), true);
});

test("outside a tenant the relay fails closed", async () => {
	await assert.rejects(() => startSignIn("claudeai"));
	assert.throws(() => pendingSignIn());
});

test("no code, token, URL or CLI path appears in any response or log line", () => {
	const text = [...logged, ...responses].join("\n");
	for (const code of CODES.filter((code) => code !== "good-code")) assert.ok(!text.includes(code), code);
	assert.ok(!text.includes(FAKE_CLAUDE_TOKEN));
	assert.ok(!text.includes(testData), "no tenant folder path");
	assert.ok(!logged.join("\n").includes("oauth"), "no sign-in URL is logged");
	assert.ok(!logged.join("\n").includes("good-code"));
});
