/**
 * Make flashcards from a source (feature 021): on an explicit click only, through
 * the same submit-agent seam and model slots as extraction, with the run's cost on
 * the activity dock and an abort. A run is a server-side object: leaving the view
 * detaches, and only Stop cancels. What comes back is DRAFTS, which join nothing
 * until the learner keeps them, one by one.
 */
import { nanoid } from "nanoid";
import { tenantScoped } from "../../config.ts";
import { cardModelOverride, runCardMaker } from "../agent/subagents/card-maker.ts";
import { piEngineForSpec } from "../agent/models.ts";
import { CARD_GENERATION_MAX_CHARS, CARD_TEXT_MAX, type CardGenerationSource, type CardRun, type CardSource } from "../core/cards.ts";
import { accumulateJobUsage, piUsageToStep } from "../core/contracts.ts";
import { citationQuote } from "../core/document-anchors.ts";
import { emit } from "../core/events.ts";
import { getGraph } from "../core/graph.ts";
import { lessonPassages, graphLinksOf } from "../core/note-sources.ts";
import { modelsNotConfigured, providerKeyMissing } from "../core/settings.ts";
import { studyRoleSpec as resolveRoleSpec } from "./codex-verify.ts";
import { cardStore } from "../store/cards.ts";
import { providerKeyPresent } from "./keys.ts";
import { claudeCodeRefusalText } from "./claude-code-config.ts";
import { CLAUDE_CODE_PROVIDER } from "../core/contracts/claude-code.ts";
import { jobCost } from "./pricing.ts";
import { stores } from "./stores.ts";

const AUTO_CONCEPTS = 3;

interface Live { run: CardRun; controller: AbortController; done: Promise<void> }

const registry = () => tenantScoped("__lhCardRuns", () => new Map<string, Live>());

export type ResolvedSource = { label: string; text: string; truncated: boolean; source: CardSource };

/** What a source says as text, with the source reference its drafts will carry.
 *  A lesson gives only delivered prose: tool calls and question payloads aren't
 *  read, so an unseen answer can't reach a card this way. */
export async function resolveCardSource(input: CardGenerationSource): Promise<ResolvedSource | { error: string; status: number }> {
	const shaped = (label: string, raw: string, source: CardSource): ResolvedSource => ({
		label, source,
		text: raw.length > CARD_GENERATION_MAX_CHARS ? raw.slice(0, CARD_GENERATION_MAX_CHARS) : raw,
		truncated: raw.length > CARD_GENERATION_MAX_CHARS,
	});
	if (input.kind === "page") {
		const page = await stores.libraryStore.readPage(input.itemId);
		if (!page) return { error: "That page is no longer in your Library.", status: 404 };
		const text = page.draft?.content ?? page.head.content;
		if (!text.trim()) return { error: "This page has nothing to make cards from yet.", status: 409 };
		return shaped(page.item.name, text, { type: "item", itemId: page.item.id, name: page.item.name });
	}
	if (input.kind === "passage") {
		const item = await stores.libraryStore.get(input.itemId);
		// A PDF passage names its page; a note's passage (Notebook's selection menu) is his own text and names none.
		const fits = item && (input.page === undefined ? item.kind === "page" : item.kind === "pdf");
		if (!item || !fits) return { error: "That item is no longer in your Library.", status: 404 };
		if (!input.text.trim()) return { error: "That passage could not be read.", status: 400 };
		if (input.page === undefined) return shaped(`a passage of ${item.name}`, input.text, { type: "item", itemId: item.id, name: item.name });
		return shaped(`${item.name}, page ${input.page}`, input.text, { type: "citation", itemId: item.id, name: item.name, page: input.page, quote: citationQuote(input.text) });
	}
	const chat = stores.chatStore.getChat(input.chatId);
	if (!chat) return { error: "That session is no longer here.", status: 404 };
	if (chat.kind === "practice") return { error: "Flashcards are made from lessons.", status: 409 };
	const passages = lessonPassages(chat.messages);
	if (passages.length === 0) return { error: "This lesson has nothing to make cards from yet.", status: 409 };
	return shaped(chat.title, passages.map((passage) => passage.text).join("\n\n"), { type: "message", chatId: chat.id, messageId: null, title: chat.title });
}

/** The gate, read fresh. A refusal persists nothing and starts nothing. */
export function cardModelRefusal(): { body: Record<string, unknown>; status: 503 } | null {
	if (cardModelOverride.current) return null;
	const spec = resolveRoleSpec("extractor", stores.settingsStore.readSettings());
	if (!spec) return { body: { ...modelsNotConfigured(["cheap"]) }, status: 503 };
	if (!providerKeyPresent(spec.provider)) return { body: { ...providerKeyMissing(spec.provider, ["cheap"], spec.provider === CLAUDE_CODE_PROVIDER ? claudeCodeRefusalText() : undefined) }, status: 503 };
	return null;
}

export const cardModelName = (): string | null => {
	const spec = resolveRoleSpec("extractor", stores.settingsStore.readSettings());
	return spec ? spec.id : null;
};

export function runCardGeneration(resolved: ResolvedSource, now: () => Date): CardRun {
	const stamp = now().toISOString();
	const live: Live = {
		run: { id: `run_${nanoid()}`, label: resolved.label, status: "running", truncated: resolved.truncated, drafts: 0, createdAt: stamp, updatedAt: stamp },
		controller: new AbortController(),
		done: Promise.resolve(),
	};
	registry().set(live.run.id, live);
	const settle = async (patch: Partial<CardRun>, drafts?: { front: string; back: string }[]) => {
		const finished: CardRun = { ...live.run, ...patch, updatedAt: now().toISOString() };
		live.run = finished;
		const nodes = drafts?.length ? getGraph(stores.graphStore).nodes : [];
		await cardStore.finishRun(finished, (drafts ?? []).map((draft) => ({
			front: draft.front.slice(0, CARD_TEXT_MAX), back: draft.back.slice(0, CARD_TEXT_MAX), source: resolved.source, status: "draft" as const, schedule: null, runId: finished.id,
			// A suggestion the learner sees and can remove: word overlap only, no model.
			conceptIds: graphLinksOf(`${draft.front} ${draft.back}`, [], nodes).slice(0, AUTO_CONCEPTS).map((row) => row.id),
		})), now());
		registry().delete(finished.id);
		emit("cards-changed", {});
		emit("activity-changed", {});
	};
	live.done = (async () => {
		try {
			await cardStore.saveRun(live.run);
			emit("activity-changed", {});
			const spec = resolveRoleSpec("extractor", stores.settingsStore.readSettings());
			const cards = await runCardMaker({
				label: resolved.label, text: resolved.text,
				engine: cardModelOverride.current ?? (spec ? piEngineForSpec(spec) : undefined),
				signal: live.controller.signal,
				onUsage: (usage, model) => {
					live.run = { ...live.run, usage: accumulateJobUsage(live.run.usage, model, piUsageToStep(usage)) };
					emit("activity-changed", {});
				},
			});
			await settle({ status: "done", drafts: cards.length }, cards);
		} catch (err) {
			const stopped = (err as Error)?.name === "AbortError";
			if (!stopped) console.error("[cards] generation failed:", err instanceof Error ? err.message : err);
			await settle(stopped ? { status: "stopped" } : { status: "failed", error: err instanceof Error ? err.message : "The cards could not be made." }).catch((failure) => console.error("[cards] run not saved:", failure));
		}
	})();
	return live.run;
}

export const anyCardRunLive = (): boolean => registry().size > 0;
export const cardRunIdle = async (): Promise<void> => { await Promise.all([...registry().values()].map((live) => live.done)); };

export function abortCardRun(id: string): boolean {
	const live = registry().get(id);
	if (!live) return false;
	live.controller.abort();
	return true;
}

/** The dock's rows. Cost is computed here, at read time. */
export function cardRunFeed() {
	return [...registry().values()].map(({ run }) => ({ id: run.id, title: run.label, startedAt: Date.parse(run.createdAt) || 0, costUsd: jobCost({ usage: run.usage }), model: run.usage?.model, steps: run.usage?.steps }));
}

/** Recent runs, newest first. A "running" one with nothing behind it died with a restart. */
export function cardRunRows(runs: readonly CardRun[]) {
	const live = registry();
	return [...runs].reverse().map((saved) => {
		const run = live.get(saved.id)?.run ?? saved;
		return { ...run, status: run.status === "running" && !live.has(run.id) ? "interrupted" as const : run.status, costUsd: jobCost({ usage: run.usage }) };
	});
}
