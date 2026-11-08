/**
 * VERIFICATION ONLY (feature 025, T063, research R14): Study's side of the
 * `LH_NOTEBOOK_ENGINE=codex-verify` switch (024 research R13). Under the
 * switch every Study model resolution (lesson and practice turns, answers,
 * selection actions, compaction, titles, flashcards, graph extraction, jobs,
 * the PDF reader) resolves to the one pi-ai `openai-codex` spec, and
 * piEngineForSpec builds it with the verification engine (the token read
 * read-only from LH_NOTEBOOK_CODEX_AUTH per request). The gates count it as
 * configured. Same rule as Notebook: inert when the variable is unset or
 * different, and inert whenever NODE_ENV is "production" (so `next start`
 * never honours it). No setting reaches it, and nothing here writes settings.
 */
import {
	CODEX_VERIFY_LEVEL,
	CODEX_VERIFY_MODEL_ID,
	CODEX_VERIFY_PROVIDER,
	codexVerifyModel,
	notebookCodexVerifyEnabled,
	readCodexVerifyToken,
} from "../agent/subagents/notebook-codex-verify.ts";
import type { ModelRole } from "../../config.ts";
import { resolveConversationSpec, resolveRoleSpec, type EffectiveModelSpec } from "../core/settings-resolution.ts";
import { slotsConfigured, type ModelsSettings, type UserSettings } from "../core/settings.ts";

/** The one spec every Study resolution lands on under the switch. */
export function codexVerifySpec(): EffectiveModelSpec | undefined {
	return notebookCodexVerifyEnabled() ? { provider: CODEX_VERIFY_PROVIDER, id: CODEX_VERIFY_MODEL_ID, thinkingLevel: CODEX_VERIFY_LEVEL } : undefined;
}

/** resolveRoleSpec, or the verification spec under the switch. */
export function studyRoleSpec(role: ModelRole, record: UserSettings | null): EffectiveModelSpec | undefined {
	return codexVerifySpec() ?? resolveRoleSpec(role, record);
}

/** resolveConversationSpec, or the verification spec under the switch. */
export function studyConversationSpec(...args: Parameters<typeof resolveConversationSpec>): EffectiveModelSpec | null {
	return codexVerifySpec() ?? resolveConversationSpec(...args);
}

/** The first-run gate: every slot counts as set under the switch. */
export function studySlotsConfigured(models: ModelsSettings | undefined): boolean {
	return notebookCodexVerifyEnabled() || slotsConfigured(models);
}

/** Under the switch a missing or expired token is a plain refusal (the
 *  Notebook gate's wording); null otherwise. */
export function codexVerifyProblem(): string | null {
	if (!notebookCodexVerifyEnabled()) return null;
	const read = readCodexVerifyToken();
	return "problem" in read ? read.problem : null;
}

export { codexVerifyModel, CODEX_VERIFY_PROVIDER };
