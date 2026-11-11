/**
 * The claude CLI child environment seam. The agent layer never imports the
 * server or store layers, so the server registers the source once
 * (configureClaudeCodeEnv) and every CLI spawn reads it through
 * claudeCodeEnv(kind) — the configureProviderEnv pattern in ../models.ts.
 *
 * Without a registered source, the local (upstream) environment applies:
 * the launch environment minus LearnHarness's key-store injections, plus
 * three fixed variables that always override inherited values.
 */
import { externalCliEnv } from "../../core/auth-env.ts";

/** What the child is for: the `--version` probe, a model turn, or an `auth` subcommand. */
export type ClaudeCodeEnvKind = "probe" | "model" | "auth";

export type ClaudeCodeEnvSource = {
	env(kind: ClaudeCodeEnvKind): NodeJS.ProcessEnv;
	/** The CLI reported authentication_failed for the current tenant. */
	onNotSignedIn?(): void;
	/** A model process spawned; `live` counts this tenant's running CLI
	 * model processes, this one included (hosted logs it, O4). */
	onSpawn?(live: number): void;
};

// A held MCP call lasts until pi calls back with the tool result, which for a question tool is
// whenever the learner answers; this must outlast the live-process idle timeout so the CLI never
// times out first.
// A held call sends no progress, so the CLI's separate idle timeout (300 s by default) needs
// the same bound, or it aborts an unanswered question first.
const MCP_TOOL_TIMEOUT_MS = 30 * 60_000;

/** Fixed in every mode; they override inherited values. Loading user
 * settings also loads ~/.claude/CLAUDE.md and memory files; the tutor's
 * system prompt must not inherit them. */
export const CLAUDE_CODE_FIXED_ENV: Readonly<Record<string, string>> = {
	MCP_TOOL_TIMEOUT: String(MCP_TOOL_TIMEOUT_MS),
	CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: String(MCP_TOOL_TIMEOUT_MS),
	CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
};

/** Upstream's local environment: preserve native CLI auth/routing, including
 * launch-environment credentials; Claude Code chooses the account and billing
 * method, not LearnHarness. */
export function localClaudeCodeEnv(): NodeJS.ProcessEnv {
	return { ...externalCliEnv(), ...CLAUDE_CODE_FIXED_ENV };
}

const DEFAULT_SOURCE: ClaudeCodeEnvSource = { env: () => localClaudeCodeEnv() };

const CLAUDE_CODE_ENV = Symbol.for("lh.claudeCodeEnv");

function source(): ClaudeCodeEnvSource {
	return ((globalThis as Record<symbol, unknown>)[CLAUDE_CODE_ENV] as ClaudeCodeEnvSource | undefined) ?? DEFAULT_SOURCE;
}

/** Server-side registration; passing undefined restores the local default. */
export function configureClaudeCodeEnv(next: ClaudeCodeEnvSource | undefined): void {
	(globalThis as Record<symbol, unknown>)[CLAUDE_CODE_ENV] = next;
}

export function claudeCodeEnv(kind: ClaudeCodeEnvKind): NodeJS.ProcessEnv {
	return source().env(kind);
}

export function notifyClaudeCodeNotSignedIn(): void {
	source().onNotSignedIn?.();
}

export function notifyClaudeCodeSpawned(live: number): void {
	source().onSpawn?.(live);
}
