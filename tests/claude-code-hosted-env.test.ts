/**
 * Hosted Claude Code child environment (T052, FR-012, FR-016, SC-002
 * hosted, research R6): an allowlist from the server env plus the tenant's
 * own 0700 CLI folder as HOME and CLAUDE_CONFIG_DIR. No operator credential
 * or routing variable reaches any kind of child, two tenants never share a
 * folder, and a call outside a tenant throws. A fake-CLI model turn spawns
 * with exactly that env, and the spawn logs the tenant's live process count
 * without ids (T060, O4).
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";

const testData = mkdtempSync(join(tmpdir(), "lh-cli-hosted-env-data-"));
process.env.LH_DATA_DIR = testData;
process.env.LH_HOSTED = "1";
after(() => {
	delete process.env.LH_HOSTED;
	rmSync(testData, { recursive: true, force: true });
});

const { PATHS, runAsTenant } = await import("../config.ts");
await import("../src/server/claude-code-config.ts"); // registers the env source
const { claudeCodeEnv, CLAUDE_CODE_FIXED_ENV } = await import("../src/agent/claude-code/env.ts");
const { CLAUDE_CODE_MODELS } = await import("../src/agent/claude-code/provider.ts");
const { createClaudeCodeStreamFunction } = await import("../src/agent/claude-code/stream.ts");
type RunClaude = import("../src/agent/claude-code/stream.ts").RunClaude;

// Seeded after the imports: hosted key boot may drop known keys, and this
// must hold whatever the server env holds at spawn time.
const OPERATOR_ENV: Record<string, string> = {
	ANTHROPIC_API_KEY: "sk-ant-operator-key",
	ANTHROPIC_AUTH_TOKEN: "operator-auth-token",
	CLAUDE_CODE_OAUTH_TOKEN: "operator-oauth-token",
	ANTHROPIC_BASE_URL: "https://operator-proxy.invalid",
	CLAUDE_CODE_USE_BEDROCK: "1",
	CLAUDE_CODE_USE_VERTEX: "1",
	AWS_ACCESS_KEY_ID: "AKIAOPERATOR",
	GOOGLE_APPLICATION_CREDENTIALS: "/operator/gcp.json",
	OPENROUTER_API_KEY: "sk-or-operator",
	HOME: "/home/operator",
	CLAUDE_CONFIG_DIR: "/home/operator/.claude",
	BROWSER: "firefox",
};
const PASSED = { LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", HTTPS_PROXY: "http://proxy.invalid:3128", no_proxy: "localhost" };
Object.assign(process.env, OPERATOR_ENV, PASSED);

const A = "user_env_a";
const B = "user_env_b";
const KINDS = ["probe", "model", "auth"] as const;
const ALLOWED = new Set(["PATH", "LANG", "LANGUAGE", "TZ", "TMPDIR", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "HOME", "CLAUDE_CONFIG_DIR", "DISABLE_AUTOUPDATER", "BROWSER", ...Object.keys(CLAUDE_CODE_FIXED_ENV)]);

test("no operator credential or routing variable reaches any hosted child", () => {
	for (const kind of KINDS) {
		const env = runAsTenant(A, () => claudeCodeEnv(kind));
		for (const name of Object.keys(env)) assert.ok(ALLOWED.has(name) || name.startsWith("LC_"), `${kind}: ${name} must not pass`);
		for (const [name, value] of Object.entries(OPERATOR_ENV)) assert.notEqual(env[name], value, `${kind}: ${name}`);
		for (const [name, value] of Object.entries(PASSED)) assert.equal(env[name], value, `${kind}: ${name} passes`);
		assert.equal(env.PATH, process.env.PATH);
		assert.equal(env.DISABLE_AUTOUPDATER, "1");
		for (const [name, value] of Object.entries(CLAUDE_CODE_FIXED_ENV)) assert.equal(env[name], value);
		assert.equal(env.BROWSER, kind === "auth" ? "/bin/true" : undefined, "only login children get the no-op browser");
	}
});

test("each tenant has its own 0700 CLI folder under its data root", () => {
	const envA = runAsTenant(A, () => claudeCodeEnv("model"));
	const envB = runAsTenant(B, () => claudeCodeEnv("model"));
	assert.equal(envA.HOME, join(testData, "users", A, "claude-code"));
	assert.equal(envA.CLAUDE_CONFIG_DIR, envA.HOME);
	assert.equal(envB.HOME, join(testData, "users", B, "claude-code"));
	assert.equal(envB.CLAUDE_CONFIG_DIR, envB.HOME);
	assert.notEqual(envA.HOME, envB.HOME);
	assert.equal(runAsTenant(A, () => PATHS.claudeCode), envA.HOME);
	for (const home of [envA.HOME!, envB.HOME!]) assert.equal(statSync(home).mode & 0o777, 0o700);
});

test("a folder made with a looser mode is tightened to 0700", () => {
	const home = runAsTenant(B, () => PATHS.claudeCode);
	chmodSync(home, 0o755);
	runAsTenant(B, () => claudeCodeEnv("probe"));
	assert.equal(statSync(home).mode & 0o777, 0o700);
});

test("removing a tenant's data root removes its CLI login", () => {
	const home = runAsTenant(B, () => claudeCodeEnv("auth")).HOME!;
	writeFileSync(join(home, ".credentials.json"), "{}", { mode: 0o600 }); // stands in for what the CLI writes
	rmSync(join(testData, "users", B), { recursive: true, force: true });
	assert.equal(existsSync(home), false);
	const again = runAsTenant(B, () => claudeCodeEnv("auth")).HOME!;
	assert.equal(again, home);
	assert.equal(existsSync(join(again, ".credentials.json")), false, "a fresh folder has no login");
});

test("a hosted CLI env outside a tenant throws", () => {
	for (const kind of KINDS) assert.throws(() => claudeCodeEnv(kind), /outside a tenant/);
});

test("a fake-CLI model turn spawns with the tenant's env and logs only the live count", async (t) => {
	const scenario = fileURLToPath(new URL("./fixtures/claude-code/text.jsonl", import.meta.url));
	const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/claude-code/fake-claude.mjs", import.meta.url));
	const spawned: NodeJS.ProcessEnv[] = [];
	const runClaude: RunClaude = async (args, options) => {
		spawned.push(options.env);
		const child = spawn(process.execPath, [FAKE_CLAUDE, ...args], {
			cwd: options.cwd, env: { ...options.env, FAKE_CLAUDE_SCENARIO: scenario }, stdio: ["pipe", "pipe", "pipe", "ipc"],
		}) as ChildProcessWithoutNullStreams;
		t.after(() => child.kill("SIGKILL"));
		return child;
	};
	const logged: string[] = [];
	const info = console.info;
	console.info = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
	t.after(() => { console.info = info; });

	const model = CLAUDE_CODE_MODELS[0]!;
	const context = normalizeContext({ systemPrompt: "You are a tutor.", messages: [{ role: "user", content: "hi", timestamp: 0 }], tools: [] });
	const events: AssistantMessageEvent[] = await runAsTenant(A, async () => {
		const collected: AssistantMessageEvent[] = [];
		for await (const event of createClaudeCodeStreamFunction(runClaude)(model, context, { sessionId: "hosted-env-turn" })) collected.push(event);
		return collected;
	});
	console.info = info;

	assert.equal(events.at(-1)?.type, "done");
	assert.equal(spawned.length, 1);
	assert.deepEqual(spawned[0], runAsTenant(A, () => claudeCodeEnv("model")));
	for (const name of Object.keys(OPERATOR_ENV)) assert.notEqual(spawned[0]![name], OPERATOR_ENV[name]);
	const counts = logged.filter((line) => line.startsWith("[claude-code] live CLI processes"));
	assert.deepEqual(counts, ["[claude-code] live CLI processes for this tenant: 1"]);
	assert.ok(!logged.join("\n").includes(A), "no tenant id is logged");
});
