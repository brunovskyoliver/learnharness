/**
 * GET/POST /api/claude-code/auth (T058, contracts/http.md, O1, O5): hosted
 * only, same-origin browser intent, the opt-in gate (status, start and code
 * need it; cancel and sign-out do not, and sign-out is the only CLI process
 * allowed while off), the owner-approved messages and status codes, and
 * saving the opt-in off ends a pending sign-in. Driven against the fake CLI.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test, { after, type TestContext } from "node:test";
import { installFakeClaudeAuth } from "./helpers/fake-claude-auth.ts";

const testData = mkdtempSync(join(tmpdir(), "lh-cli-auth-http-data-"));
process.env.LH_DATA_DIR = testData;
process.env.LH_HOSTED = "1";
const fake = installFakeClaudeAuth();
after(() => {
	fake.restore();
	delete process.env.LH_HOSTED;
	rmSync(testData, { recursive: true, force: true });
});

const { runAsTenant } = await import("../config.ts");
const { claudeCodeAuthResponse, pendingSignIn, cancelSignIn } = await import("../src/server/claude-code-auth.ts");
const { writeSettings } = await import("../src/store/settings.ts");
const { PUT } = await import("../app/api/settings/[section]/route.ts");

const ORIGIN = "https://learn.example.invalid";
const TENANT = "user_http_a";
const OTHER = "user_http_b";

function request(method: "GET" | "POST", body?: unknown, headers: Record<string, string> = {}): Request {
	return new Request(`${ORIGIN}/api/claude-code/auth`, {
		method,
		headers: { "x-learnharness-claude-code": "1", "sec-fetch-site": "same-origin", ...(method === "POST" ? { origin: ORIGIN, "content-type": "application/json" } : {}), ...headers },
		...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
	});
}

async function call(tenant: string, req: Request): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
	const response = await runAsTenant(tenant, () => claudeCodeAuthResponse(req));
	return { status: response.status, body: await response.json() as Record<string, unknown>, headers: response.headers };
}

function setEnabled(tenant: string, enabled: boolean): void {
	runAsTenant(tenant, () => writeSettings({ version: 1, claudeCode: { enabled } }));
}

function cliCalls(): string[] {
	return fake.calls().map((entry) => entry.argv.join(" "));
}

function fresh(t: TestContext): void {
	fake.clearCalls();
	fake.control({});
	t.after(() => { for (const tenant of [TENANT, OTHER]) runAsTenant(tenant, () => cancelSignIn()); });
}

function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

test("outside hosted mode the endpoint does not exist", async (t) => {
	fresh(t);
	delete process.env.LH_HOSTED;
	t.after(() => { process.env.LH_HOSTED = "1"; });
	for (const req of [request("GET"), request("POST", { action: "sign-out" })]) {
		const response = await claudeCodeAuthResponse(req);
		assert.equal(response.status, 404);
		assert.deepEqual(await response.json(), { error: "Claude Code sign-in is only available on the hosted site." });
	}
	assert.deepEqual(cliCalls(), []);
});

for (const [name, req] of [
	["foreign Origin", () => request("GET", undefined, { origin: "https://attacker.invalid" })],
	["cross-site fetch", () => request("GET", undefined, { "sec-fetch-site": "cross-site" })],
	["missing intent header", () => request("GET", undefined, { "x-learnharness-claude-code": "" })],
	["POST without Origin", () => new Request(`${ORIGIN}/api/claude-code/auth`, { method: "POST", headers: { "x-learnharness-claude-code": "1" }, body: JSON.stringify({ action: "sign-out" }) })],
	["POST from a foreign Origin", () => request("POST", { action: "sign-out" }, { origin: "https://attacker.invalid" })],
] as const) test(`refuses a ${name} without running the CLI`, async (t) => {
	fresh(t);
	setEnabled(TENANT, true);
	const { status, body, headers } = await call(TENANT, req());
	assert.equal(status, 403);
	assert.deepEqual(body, { error: "Claude Code checks require a same-origin LearnHarness request." });
	assert.equal(headers.get("access-control-allow-origin"), null);
	assert.deepEqual(cliCalls(), []);
});

test("while the opt-in is off: no status, no sign-in; cancel and sign-out still work", async (t) => {
	fresh(t);
	setEnabled(TENANT, false);
	for (const req of [request("GET"), request("POST", { action: "start", method: "claudeai" }), request("POST", { action: "code", code: "good-code" })]) {
		const { status, body } = await call(TENANT, req);
		assert.equal(status, 403);
		assert.deepEqual(body, { error: "Claude Code is disabled." });
	}
	assert.deepEqual(cliCalls(), [], "no CLI process while off");
	assert.deepEqual(await call(TENANT, request("POST", { action: "cancel" })).then((r) => [r.status, r.body]), [200, { pending: null }]);
	const signedOut = await call(TENANT, request("POST", { action: "sign-out" }));
	assert.equal(signedOut.status, 200);
	assert.deepEqual(signedOut.body, { auth: { state: "signed-out", method: null, expiresAt: null }, pending: null });
	assert.deepEqual(cliCalls(), ["auth logout"], "sign-out is the only CLI process allowed while off");
});

test("status, sign-in and sign-out for the current user", async (t) => {
	fresh(t);
	setEnabled(TENANT, true);
	const first = await call(TENANT, request("GET"));
	assert.equal(first.status, 200);
	assert.equal(first.headers.get("cache-control"), "no-store");
	assert.equal(first.headers.get("x-content-type-options"), "nosniff");
	assert.deepEqual(first.body, { auth: { state: "signed-out", method: null, expiresAt: null }, pending: null });

	const started = await call(TENANT, request("POST", { action: "start", method: "claudeai" }));
	assert.equal(started.status, 200);
	const pending = started.body.pending as { method: string; url: string; expiresAt: string };
	assert.equal(pending.method, "claudeai");
	assert.match(pending.url, /^https:\/\/claude\.com\//);
	assert.deepEqual((await call(TENANT, request("GET"))).body.pending, pending);

	const done = await call(TENANT, request("POST", { action: "code", code: "good-code" }));
	assert.equal(done.status, 200);
	assert.equal((done.body.auth as { state: string }).state, "signed-in");
	assert.equal(done.body.pending, null);
	assert.equal(JSON.stringify(done.body).includes(testData), false, "no folder path in a response");

	fake.control({ logoutFail: true });
	const failed = await call(TENANT, request("POST", { action: "sign-out" }));
	assert.equal(failed.status, 502);
	assert.equal(failed.body.error, "Sign-out could not be completed.");
	assert.equal((failed.body.auth as { state: string }).state, "signed-in", "the status is still returned");
	fake.control({});
	const out = await call(TENANT, request("POST", { action: "sign-out" }));
	assert.equal(out.status, 200);
	assert.deepEqual(out.body, { auth: { state: "signed-out", method: null, expiresAt: null }, pending: null });
});

test("code errors: invalid 400, nothing pending 409, CLI failure 422", async (t) => {
	fresh(t);
	setEnabled(TENANT, true);
	const none = await call(TENANT, request("POST", { action: "code", code: "good-code" }));
	assert.deepEqual([none.status, none.body], [409, { error: "This sign-in expired. Start again." }]);
	assert.equal((await call(TENANT, request("POST", { action: "start", method: "console" }))).status, 200);
	for (const code of ["", "two\nlines", 7]) {
		const invalid = await call(TENANT, request("POST", { action: "code", code }));
		assert.deepEqual([invalid.status, invalid.body], [400, { error: "Paste the code from Anthropic's page." }]);
	}
	const wrong = await call(TENANT, request("POST", { action: "code", code: "echo#http-secret-code" }));
	assert.equal(wrong.status, 422);
	assert.equal(wrong.body.error, "Sign-in failed: Login failed: code … was rejected");
	const again = await call(TENANT, request("POST", { action: "code", code: "good-code" }));
	assert.deepEqual([again.status, again.body], [409, { error: "This sign-in expired. Start again." }], "the failed attempt ended");
});

test("an outdated CLI cannot start a sign-in", async (t) => {
	fresh(t);
	setEnabled(TENANT, true);
	fake.control({ version: "2.1.200" });
	const started = await call(TENANT, request("POST", { action: "start", method: "claudeai" }));
	assert.deepEqual([started.status, started.body], [409, { error: "Claude Code is unavailable. Enable and set it up in Settings → Providers." }]);
	assert.deepEqual(cliCalls(), ["--version"]);
});

test("unknown actions and bodies are 400", async (t) => {
	fresh(t);
	setEnabled(TENANT, true);
	for (const body of [{ action: "delete" }, { action: "start", method: "email" }, {}, "not json", [1]]) {
		const result = await call(TENANT, request("POST", body));
		assert.deepEqual([result.status, result.body], [400, { error: "Unknown action." }], JSON.stringify(body));
	}
	assert.deepEqual(cliCalls(), []);
});

test("saving the opt-in off ends the user's pending sign-in, not another user's", async (t) => {
	fresh(t);
	setEnabled(TENANT, true);
	setEnabled(OTHER, true);
	assert.equal((await call(TENANT, request("POST", { action: "start", method: "claudeai" }))).status, 200);
	const pid = fake.calls().at(-1)!.pid;
	assert.equal((await call(OTHER, request("POST", { action: "start", method: "claudeai" }))).status, 200);
	const otherPid = fake.calls().at(-1)!.pid;

	// The settings route is withTenant-wrapped; without Clerk, run it locally inside the tenant.
	delete process.env.LH_HOSTED;
	let response: Response;
	try {
		response = await runAsTenant(TENANT, () => PUT(new Request(`${ORIGIN}/api/settings/claudeCode`, {
			method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: false }),
		}), { params: Promise.resolve({ section: "claudeCode" }) }));
	} finally {
		process.env.LH_HOSTED = "1";
	}
	assert.equal(response.status, 200);
	assert.equal(runAsTenant(TENANT, () => pendingSignIn()), null);
	for (let i = 0; i < 50 && alive(pid); i++) await sleep(20);
	assert.equal(alive(pid), false, "the login child is killed");
	assert.ok(runAsTenant(OTHER, () => pendingSignIn()), "the other user's sign-in keeps waiting");
	assert.ok(alive(otherPid));
});
