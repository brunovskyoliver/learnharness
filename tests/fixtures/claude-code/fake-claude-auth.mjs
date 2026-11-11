/**
 * Stand-in for the claude CLI's auth subcommands (and --version) in hosted
 * tests, mimicking what 2.1.321 printed in the T048 spike. The hosted CLI env
 * is an allowlist, so test controls cannot travel as env variables: the
 * wrapper written by tests/helpers/fake-claude-auth.ts sets FAKE_CLAUDE_AUTH_DIR, and
 * this script reads <dir>/control.json and appends one JSON line per run to
 * <dir>/calls.jsonl ({ pid, argv, home, configDir, browser, envNames }).
 *
 * control.json (all optional):
 *   loginUrl     the URL printed after "visit:" (default: per method, as the real CLI)
 *   loginSilent  print nothing and wait (the URL never appears)
 *   logoutFail   `auth logout` exits 1
 *   expiresAt    loginExpiresAt written on success (default: 30 days ahead)
 *   version      what --version reports (default 2.1.321)
 *
 * Login state is $CLAUDE_CONFIG_DIR/fake-login.json, written only by a
 * successful `auth login` (code "good-code") and removed by `auth logout`.
 * A code starting "echo#" fails with a line that repeats it (redaction test).
 */
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const FAKE_TOKEN = "sk-ant-oat01-fake-token-never-leaves-the-cli";

const dir = process.env.FAKE_CLAUDE_AUTH_DIR;
const control = dir && existsSync(join(dir, "control.json")) ? JSON.parse(readFileSync(join(dir, "control.json"), "utf8")) : {};
const configDir = process.env.CLAUDE_CONFIG_DIR ?? "";
const loginFile = join(configDir, "fake-login.json");
const args = process.argv.slice(2);

if (dir) {
	appendFileSync(join(dir, "calls.jsonl"), `${JSON.stringify({
		pid: process.pid, argv: args, home: process.env.HOME ?? null, configDir: process.env.CLAUDE_CONFIG_DIR ?? null,
		browser: process.env.BROWSER ?? null, envNames: Object.keys(process.env).filter((name) => name !== "FAKE_CLAUDE_AUTH_DIR"),
	})}\n`);
}

function write(stream, text) {
	return new Promise((resolve) => stream.write(text, resolve));
}

if (args[0] === "--version") {
	await write(process.stdout, `${control.version ?? "2.1.321"} (Claude Code)\n`);
	process.exit(0);
}

if (args[0] === "auth" && args[1] === "status") {
	const login = existsSync(loginFile) ? JSON.parse(readFileSync(loginFile, "utf8")) : null;
	await write(process.stdout, `${JSON.stringify({
		loggedIn: !!login,
		authMethod: login ? "claude.ai" : "none",
		apiProvider: "firstParty",
		analyticsDisabled: false,
		projectsDirectory: join(configDir, "projects"),
		configDirectory: configDir,
		loginExpiresAt: login ? login.expiresAt : null,
		...(login ? { email: "learner@example.invalid", orgId: "org-fake", subscriptionType: "max" } : {}),
	}, null, 2)}\n`);
	process.exit(login ? 0 : 1);
}

if (args[0] === "auth" && args[1] === "logout") {
	if (control.logoutFail) { await write(process.stderr, "Logout failed.\n"); process.exit(1); }
	rmSync(loginFile, { force: true });
	await write(process.stdout, "Successfully logged out from your Anthropic account.\n");
	process.exit(0);
}

if (args[0] === "auth" && args[1] === "login") {
	if (control.loginSilent) { setInterval(() => {}, 60_000); }
	else {
		const console = args.includes("--console");
		const url = control.loginUrl ?? (console
			? "https://platform.claude.com/oauth/authorize?code=true&state=fake-state"
			: "https://claude.com/cai/oauth/authorize?code=true&state=fake-state");
		await write(process.stdout, "Opening browser to sign in…\n");
		await write(process.stdout, `If the browser didn't open, visit: ${url}\n`);
		await write(process.stdout, "Paste code here if prompted > ");
		createInterface({ input: process.stdin }).on("line", async (code) => {
			if (code === "good-code") {
				const expiresAt = control.expiresAt ?? new Date(Date.now() + 30 * 86_400_000).toISOString();
				writeFileSync(loginFile, JSON.stringify({ token: FAKE_TOKEN, expiresAt }), { mode: 0o600 });
				await write(process.stdout, "Login successful.\n");
				process.exit(0);
			}
			if (code.startsWith("echo#")) {
				// Not seen in 2.1.321; exercises the relay's code redaction.
				await write(process.stderr, `Login failed: code ${code} was rejected\n`);
				process.exit(1);
			}
			if (!code.includes("#")) {
				// The real CLI keeps waiting for another line after this.
				await write(process.stderr, "Invalid code. Please make sure the full code was copied.\n");
				return;
			}
			await write(process.stderr, "Login failed: That code wasn't accepted. It may be incomplete, expired, already used, or from an earlier sign-in attempt. Sign in again to get a new code.\n");
			process.exit(1);
		});
	}
} else if (!(args[0] === "auth")) {
	await write(process.stderr, `fake-claude-auth: unsupported ${args.join(" ")}\n`);
	process.exit(2);
}
