/**
 * Claude Code opt-in, availability and admission (feature 029).
 *
 * Upstream's claudeCodeEnabled/claudeCodeAvailable plus the fork's
 * admission seams: providerKeyPresent (keys.ts) asks claudeCodeAdmissible,
 * refusals carry claudeCodeRefusalText, and every background start goes
 * through cliBackgroundAllowed so a disabled Claude Code never starts a
 * CLI process (SC-003).
 */
import { getClaudeBinary } from "../agent/claude-code/binary.ts";
import { configureClaudeCodeEnv, localClaudeCodeEnv } from "../agent/claude-code/env.ts";
import { connectionBackgroundAllowed } from "../agent/subscription-connections.ts";
import { CLAUDE_CODE_PROVIDER } from "../core/contracts/claude-code.ts";
import { CLAUDE_CODE_UNAVAILABLE } from "../core/settings.ts";
import { settingsStore } from "../store/settings.ts";
import { providerKeyPresent } from "./keys.ts";

/** Fresh admission state, not a process-wide cache. Existing runs retain
 * their engines; only new chat/job/extraction/compaction admissions consult it. */
export function claudeCodeEnabled(): boolean {
	return settingsStore.readSettings()?.claudeCode?.enabled === true;
}

/** Installation/opt-in availability only, never authenticated readiness.
 * The model catalog lists Claude Code models on this. */
export function claudeCodeAvailable(): boolean {
	return claudeCodeEnabled() && getClaudeBinary() !== null;
}

/** May a new Claude Code request start? Locally the same as
 * claudeCodeAvailable (authentication is the CLI's business). */
export function claudeCodeAdmissible(): boolean {
	return claudeCodeAvailable();
}

/** The refusal sentence for a Claude Code request that may not start. */
export function claudeCodeRefusalText(): string {
	return CLAUDE_CODE_UNAVAILABLE;
}

/** Background starts: the subscription consent gate, and for Claude Code
 * also the admission gate (opt-in + installation). */
export function cliBackgroundAllowed(provider: string | undefined): boolean {
	return connectionBackgroundAllowed(provider) && (provider !== CLAUDE_CODE_PROVIDER || providerKeyPresent(provider));
}

// The CLI child environment: local mode uses upstream's environment.
configureClaudeCodeEnv({ env: () => localClaudeCodeEnv() });
