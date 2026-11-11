export const CLAUDE_CODE_PROVIDER = "claude-code";

/** Installation/version only. Never an authentication, quota, or billing verdict. */
export interface ClaudeCodeStatus {
	state: "not-found" | "meets-minimum" | "update-required" | "version-unchecked";
	version: string | null;
	minimumVersion: string;
}

// --permission-prompts none was added in 2.1.259. This is not an official
// minimum-version/stability contract for claudecode/toolUseId; admission fails closed.
export const CLAUDE_CODE_MINIMUM_VERSION = "2.1.259";

/** Hosted mode only: the tenant's CLI sign-in, from `claude auth status --json`.
 *  `unchecked` when the command fails, times out or prints invalid JSON. A past
 *  `expiresAt` counts as signed out. Never carries paths or tokens. */
export interface ClaudeCodeAuthStatus {
	state: "signed-in" | "signed-out" | "unchecked";
	/** Null when signed out. */
	method: "claude-subscription" | "console" | "other" | null;
	/** ISO time from the CLI's `loginExpiresAt`, else null. */
	expiresAt: string | null;
}

/** The `claude auth login` flag: `--claudeai` or `--console`. */
export type ClaudeCodeSignInMethod = "claudeai" | "console";

/** Client view of the tenant's one pending sign-in. `expiresAt` is ISO. */
export interface ClaudeCodePendingSignIn {
	method: ClaudeCodeSignInMethod;
	url: string;
	expiresAt: string;
}
