/**
 * Puts a `claude` on PATH that runs tests/fixtures/claude-code/fake-claude-auth.mjs
 * (the T056 fake). The wrapper carries the control folder itself, because
 * the hosted CLI env passes no test variables through.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The token the fake writes into its login file; it must never surface. */
export const FAKE_CLAUDE_TOKEN = "sk-ant-oat01-fake-token-never-leaves-the-cli";

export type FakeClaudeCall = { pid: number; argv: string[]; home: string | null; configDir: string | null; browser: string | null; envNames: string[] };
export type FakeClaudeControl = { loginUrl?: string; loginSilent?: boolean; logoutFail?: boolean; expiresAt?: string; version?: string };

const FIXTURE = fileURLToPath(new URL("../fixtures/claude-code/fake-claude-auth.mjs", import.meta.url));

export function installFakeClaudeAuth() {
	const dir = mkdtempSync(join(tmpdir(), "fake-claude-auth-"));
	const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
	writeFileSync(join(dir, "claude"), `#!/bin/sh\nFAKE_CLAUDE_AUTH_DIR=${quote(dir)} exec ${quote(process.execPath)} ${quote(FIXTURE)} "$@"\n`, { mode: 0o755 });
	const savedPath = process.env.PATH;
	process.env.PATH = `${dir}${delimiter}${savedPath ?? ""}`;
	return {
		dir,
		binary: join(dir, "claude"),
		calls(): FakeClaudeCall[] {
			const file = join(dir, "calls.jsonl");
			return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as FakeClaudeCall) : [];
		},
		clearCalls(): void { rmSync(join(dir, "calls.jsonl"), { force: true }); },
		control(next: FakeClaudeControl): void { writeFileSync(join(dir, "control.json"), JSON.stringify(next)); },
		restore(): void {
			if (savedPath === undefined) delete process.env.PATH; else process.env.PATH = savedPath;
			rmSync(dir, { recursive: true, force: true });
		},
	};
}
