import { chmodSync, mkdirSync } from "node:fs";
import { PATHS } from "../../config.ts";

/** Hosted mode: the current tenant's Claude Code CLI folder, created 0700
 * (chmod repairs a folder made with a looser mode). Throws outside a tenant
 * in hosted mode (PATHS fails closed). LearnHarness never reads or writes
 * inside it: the CLI keeps its login there. */
export function ensureClaudeCodeHome(): string {
	const home = PATHS.claudeCode;
	mkdirSync(home, { recursive: true, mode: 0o700 });
	chmodSync(home, 0o700);
	return home;
}
