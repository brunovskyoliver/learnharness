/**
 * AI session titles (ui-v2, 2026-10-26). After a new session's first
 * message the cheap model writes a 3–6 word sentence-case title. A one-off
 * backfill per user does the same for sessions whose title is still the
 * cut-off first prompt or "Untitled session". Hand-renamed sessions are
 * never touched: every write re-checks the title right before it lands.
 *
 * Runs in the background inside the caller's tenant (AsyncLocalStorage
 * follows the promise chain). Failures are silent; the old title stays.
 */

import { normalizeContext, type Message } from "@earendil-works/pi-ai";
import { tenantScoped } from "../../config.ts";
import { piEngineForSpec } from "../agent/models.ts";
import { connectionBackgroundAllowed } from "../agent/subscription-connections.ts";
import { titleFromPrompt } from "../core/contracts/graph.ts";
import type { ChatRecord } from "../core/contracts.ts";
import { effectiveSettings, stores } from "./stores.ts";

const UNTITLED = "Untitled session";

const INSTRUCTIONS =
	"You name study sessions. Reply with a title of 3 to 6 words in sentence case " +
	"(only the first word and proper nouns capitalized) that names the topic the learner wants to study. " +
	"No quotes, no trailing punctuation, no emoji. Reply with the title only.";

/** The learner's first message as plain text, or null if none yet. */
export function firstUserText(record: Pick<ChatRecord, "messages">): string | null {
	for (const m of record.messages) {
		if (m.role !== "user") continue;
		const c = (m as { content: unknown }).content;
		if (typeof c === "string") return c.trim() || null;
		if (Array.isArray(c)) {
			const text = c
				.filter((p): p is { type: "text"; text: string } => p?.type === "text" && typeof p.text === "string")
				.map((p) => p.text)
				.join(" ")
				.trim();
			return text || null;
		}
		return null;
	}
	return null;
}

/** True while the title is still the app's own placeholder: the cut-off
 *  first prompt or "Untitled session". */
export function isUntouchedTitle(record: Pick<ChatRecord, "title" | "messages">): boolean {
	if (record.title === UNTITLED) return true;
	const first = firstUserText(record);
	return first !== null && record.title === titleFromPrompt(first);
}

/** Tidy the model's reply into a title, or null when it isn't one. */
export function cleanTitle(raw: string): string | null {
	const line = raw.split("\n").find((l) => l.trim()) ?? "";
	const t = line
		.trim()
		.replace(/^title:\s*/i, "")
		.replace(/^["'“‘`*]+|["'”’`*]+$/g, "")
		.replace(/[.!?:;,]+$/, "")
		.trim();
	const words = t.split(/\s+/).filter(Boolean);
	if (words.length === 0 || words.length > 8 || t.length > 80) return null;
	return t.charAt(0).toUpperCase() + t.slice(1);
}

/** One cheap-model call: first message in, title out (null on any miss). */
async function generateTitle(first: string): Promise<string | null> {
	const spec = effectiveSettings().models.cheap;
	if (!spec || !connectionBackgroundAllowed(spec.provider)) return null;
	// A title needs no reasoning: ask for the lowest level, clamped per model.
	const engine = piEngineForSpec({ ...spec, thinkingLevel: "minimal" }, true);
	const messages: Message[] = [{ role: "user", content: first.slice(0, 2000), timestamp: Date.now() }];
	const stream = engine.streamFn(engine.model, normalizeContext({ systemPrompt: INSTRUCTIONS, messages }), {} as never);
	for await (const event of stream) {
		if (event.type === "error") return null;
		if (event.type === "done") {
			const text = event.message.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("");
			return cleanTitle(text);
		}
	}
	return null;
}

/** Title one session if its title is still untouched. `prompt` is the
 *  first message when the caller already has it (session creation, before
 *  the turn has saved anything). Never throws. */
export async function retitleSession(chatId: string, prompt?: string): Promise<void> {
	try {
		const record = stores.chatStore.getChat(chatId);
		if (!record) return;
		const first = prompt?.trim() || firstUserText(record);
		if (!first) return;
		if (record.title !== UNTITLED && record.title !== titleFromPrompt(first)) return;
		const title = await generateTitle(first);
		if (!title) return;
		// Re-read: the learner may have renamed it while the model ran.
		const fresh = stores.chatStore.getChat(chatId);
		if (fresh && fresh.title === record.title) {
			stores.chatStore.renameChat(chatId, title);
			console.info(`[titles] ${chatId} → ${title}`);
		}
	} catch (err) {
		// A missing title is cosmetic; the cut-off prompt stays.
		console.warn(`[titles] ${chatId} failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/** The once-per-user backfill. ponytail: "once" is per server process;
 *  a restart re-scans, which is harmless because only untouched titles
 *  qualify and an AI title never matches the cut-off prompt. */
export function backfillTitles(): void {
	const state = tenantScoped("lh.title-backfill", () => ({ started: false }));
	if (state.started) return;
	state.started = true;
	void (async () => {
		for (const summary of stores.chatStore.listChats()) {
			const record = stores.chatStore.getChat(summary.id);
			if (record && isUntouchedTitle(record) && firstUserText(record)) await retitleSession(summary.id);
		}
	})();
}
