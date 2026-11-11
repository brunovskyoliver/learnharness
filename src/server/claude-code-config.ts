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
import { CLAUDE_CODE_FIXED_ENV, configureClaudeCodeEnv, localClaudeCodeEnv, type ClaudeCodeEnvKind } from "../agent/claude-code/env.ts";
import { connectionBackgroundAllowed } from "../agent/subscription-connections.ts";
import { CLAUDE_CODE_PROVIDER } from "../core/contracts/claude-code.ts";
import { CLAUDE_CODE_SIGN_IN, CLAUDE_CODE_UNAVAILABLE } from "../core/settings.ts";
import { hostedMode } from "../../config.ts";
import { ensureClaudeCodeHome } from "../store/claude-code-home.ts";
import { settingsStore } from "../store/settings.ts";
import { cachedClaudeCodeSignedIn, markClaudeCodeSignedOut } from "./claude-code-auth.ts";
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
 * claudeCodeAvailable (authentication is the CLI's business). Hosted, the
 * tenant must also be signed in per the cached `auth status` (R8, O6). */
export function claudeCodeAdmissible(): boolean {
	return claudeCodeAvailable() && (!hostedMode() || cachedClaudeCodeSignedIn());
}

/** The refusal sentence for a Claude Code request that may not start:
 * hosted, enabled and installed but signed out asks the user to sign in. */
export function claudeCodeRefusalText(): string {
	return hostedMode() && claudeCodeAvailable() && !cachedClaudeCodeSignedIn() ? CLAUDE_CODE_SIGN_IN : CLAUDE_CODE_UNAVAILABLE;
}

/** Background starts: the subscription consent gate, and for Claude Code
 * also the admission gate (opt-in + installation). */
export function cliBackgroundAllowed(provider: string | undefined): boolean {
	return connectionBackgroundAllowed(provider) && (provider !== CLAUDE_CODE_PROVIDER || providerKeyPresent(provider));
}

/** Hosted children inherit only these from the server environment
 * (research R6): an allowlist, so no Anthropic/Bedrock/Vertex/Foundry
 * credential or routing variable, present or future, reaches them (FR-016). */
const HOSTED_ENV_NAMES: ReadonlySet<string> = new Set([
	"PATH", "LANG", "LANGUAGE", "TZ", "TMPDIR", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
	"HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
]);

/** The hosted CLI environment for the current tenant: the allowlist, then
 * HOME = CLAUDE_CONFIG_DIR = the tenant's 0700 folder (throws outside a
 * tenant), no auto-updates, the fixed variables, and for `auth` children a
 * no-op browser (the CLI runs $BROWSER with the sign-in URL, T048). */
export function hostedClaudeCodeEnv(kind: ClaudeCodeEnvKind): NodeJS.ProcessEnv {
	const home = ensureClaudeCodeHome();
	const env: Record<string, string> = {};
	for (const [name, value] of Object.entries(process.env)) {
		if (value !== undefined && (HOSTED_ENV_NAMES.has(name) || name.startsWith("LC_"))) env[name] = value;
	}
	Object.assign(env, { HOME: home, CLAUDE_CONFIG_DIR: home, DISABLE_AUTOUPDATER: "1" }, CLAUDE_CODE_FIXED_ENV);
	if (kind === "auth") env.BROWSER = "/bin/true";
	// Next's ProcessEnv typing requires NODE_ENV; the child deliberately has none.
	return env as NodeJS.ProcessEnv;
}

// The CLI child environment: local mode uses upstream's environment; hosted
// mode the tenant's own folder, and authentication_failed marks the tenant
// signed out. Hosted logs the tenant's live process count on spawn (O4).
configureClaudeCodeEnv({
	env: (kind) => (hostedMode() ? hostedClaudeCodeEnv(kind) : localClaudeCodeEnv()),
	onNotSignedIn: () => { if (hostedMode()) markClaudeCodeSignedOut(); },
	onSpawn: (live) => { if (hostedMode()) console.info(`[claude-code] live CLI processes for this tenant: ${live}`); },
});
