/**
 * Notebook runs (feature 024, research R4): every model call Notebook makes
 * is a server-side run in a tenant-scoped registry. Leaving the view
 * detaches; only Stop (the activity abort route, kind "notebook") cancels.
 * Each run shows in the activity feed with its cost, computed at read time.
 *
 * Write-ahead: his message is in the companion before a reply or chat run
 * starts, and the AI's answer is written as a "streaming" message first and
 * completed (or marked stopped/failed with what arrived) when the run
 * settles. An automatic read writes nothing until its result is in hand and
 * not aborted, so a read stopped by typing leaves no trace. A quote the
 * model returns must occur verbatim in the text it was given, else the read
 * ends silent.
 *
 * Clients follow a run over SSE (notebookRunStreamResponse): buffered events
 * first, so a late subscriber misses nothing, then live ones. Runs stay in
 * memory 10 minutes after they end, for late subscribers.
 */
import { nanoid } from "nanoid";
import type { Usage } from "@earendil-works/pi-ai";
import { tenantScoped } from "../../config.ts";
import { piEngineForSpec, type PiEngine } from "../agent/models.ts";
import {
	fauxNotebookEngine, notebookFauxEnabled, notebookModelOverride, runNotebookRead, runNotebookThink, runNotebookVisualize,
	streamNotebookChat, streamNotebookReply, type NotebookContext,
} from "../agent/subagents/notebook.ts";
import { accumulateJobUsage, piUsageToStep, type JobUsage } from "../core/contracts.ts";
import { emit } from "../core/events.ts";
import { PAGE_MAX_BYTES } from "../core/library.ts";
import {
	anchorForSpan, assignSide, isNotebookId, messageTextProblem, NOTEBOOK_LIMIT_TEXT, NOTEBOOK_LIMITS, parseThreadAnchor, quoteOccurs, replyCount, textHash, utf8Bytes,
	type NoteChatMessage, type NoteCompanion, type NotebookRunKind, type NotebookRunStatus, type NotebookThread, type ThreadAnchor, type ThreadMessage, type ThreadOrigin, type ThreadPlacement,
} from "../core/notebook.ts";
import type { Sketch } from "../core/notebook-sketch.ts";
import { modelsNotConfigured, providerKeyMissing, resolveReviewer } from "../core/settings.ts";
import { resolveRoleSpec } from "../core/settings-resolution.ts";
import { NotebookReadOnlyError, type CompanionChange } from "../store/notebook.ts";
import { providerKeyPresent } from "./keys.ts";
import { jobCost } from "./pricing.ts";
import { effectiveSettings, stores } from "./stores.ts";

export interface NotebookRun {
	id: string;
	pageId: string;
	kind: NotebookRunKind;
	threadId?: string;
	messageId?: string;
	status: NotebookRunStatus;
	startedAt: string;
	endedAt?: string;
	usage?: JobUsage;
	error?: string;
	auto: boolean;
}

export type NotebookRunEvent =
	| { event: "phase"; data: { phase: "reading" | "writing" | "drawing"; anchor?: string } }
	| { event: "delta"; data: { messageId: string; text: string } }
	| { event: "done"; data: { status: "done" | "silent"; threadId?: string; messageId?: string } }
	| { event: "failed"; data: { error: string; detail?: string } }
	| { event: "stopped"; data: Record<string, never> };

interface Live {
	run: NotebookRun;
	pageName: string;
	controller: AbortController;
	events: NotebookRunEvent[];
	listeners: Set<(event: NotebookRunEvent) => void>;
	done: Promise<void>;
}

/** How long an ended run stays for late subscribers. */
export const NOTEBOOK_RUN_KEEP_MS = 10 * 60_000;

const registry = () => tenantScoped("__lhNotebookRuns", () => new Map<string, Live>());

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// ─── the gate ────────────────────────────────────────────────────────────────

/** The refusal, read fresh (api.md: 503 with reason "models" or "key"). A
 *  refusal persists nothing and starts nothing. */
export function notebookModelRefusal(): { body: Record<string, unknown>; status: 503 } | null {
	if (notebookModelOverride.current || notebookFauxEnabled()) return null;
	const spec = resolveRoleSpec("notebook", stores.settingsStore.readSettings());
	if (!spec) return { body: { ...modelsNotConfigured(["strong"]), reason: "models" }, status: 503 };
	if (!providerKeyPresent(spec.provider)) return { body: { ...providerKeyMissing(spec.provider, ["strong"]), reason: "key" }, status: 503 };
	return null;
}

function engineFor(kind: NotebookRunKind, note: string, passage: string | undefined, auto: boolean): PiEngine | undefined {
	if (notebookModelOverride.current) return notebookModelOverride.current;
	if (notebookFauxEnabled()) return fauxNotebookEngine(kind, note, passage);
	const spec = resolveRoleSpec("notebook", stores.settingsStore.readSettings());
	// Automatic reads are background work; explicit actions are his.
	return spec ? piEngineForSpec(spec, auto) : undefined;
}

// ─── context ─────────────────────────────────────────────────────────────────

function contextFor(companion: NoteCompanion, note: string): NotebookContext {
	const settings = effectiveSettings();
	const reviewer = resolveReviewer(settings.notebook.reviewers, companion.reviewerId);
	return {
		note,
		instruction: companion.instruction,
		reviewer: reviewer ? { name: reviewer.name, instructions: reviewer.instructions } : null,
		threads: companion.threads.filter((t) => t.status !== "dismissed").slice(-40).map((t) => ({
			quote: t.anchor.quote.slice(0, 200),
			first: (t.messages[0]?.text ?? "").slice(0, 300),
			status: t.status,
			replies: replyCount(t),
		})),
	};
}

/** The text a run reads: the client's when it is within the page limit,
 *  else the saved draft or head. */
function noteText(clientText: unknown, saved: string): string {
	return typeof clientText === "string" && utf8Bytes(clientText) <= PAGE_MAX_BYTES ? clientText : saved;
}

const layoutNow = () => effectiveSettings().notebook.layout;

// ─── run bodies (api.md) ─────────────────────────────────────────────────────

type RunBody =
	| { kind: "read"; text: unknown; auto: boolean }
	| { kind: "think" | "visualize"; text: unknown; anchor: ThreadAnchor }
	| { kind: "reply"; text: unknown; threadId: string }
	| { kind: "chat"; text: unknown; message: string }
	/** "Try again" on the chat's last answer (failed, stopped, or left streaming with no run): replaces it. */
	| { kind: "chat"; text: unknown; retry: true };

export function parseRunBody(raw: unknown): { ok: true; body: RunBody } | { ok: false; error: string } {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "The body must be an object." };
	const body = raw as Record<string, unknown>;
	if (body.text !== undefined && typeof body.text !== "string") return { ok: false, error: "text must be the note's text." };
	switch (body.kind) {
		case "read":
			if (body.auto !== undefined && typeof body.auto !== "boolean") return { ok: false, error: "auto must be true or false." };
			return { ok: true, body: { kind: "read", text: body.text, auto: body.auto !== false } };
		case "think":
		case "visualize": {
			const anchor = parseThreadAnchor(body.anchor);
			if (!anchor) return { ok: false, error: "anchor must hold the passage's quote, prefix and suffix." };
			return { ok: true, body: { kind: body.kind, text: body.text, anchor } };
		}
		case "reply":
			if (!isNotebookId(body.threadId)) return { ok: false, error: "threadId must name a thread." };
			return { ok: true, body: { kind: "reply", text: body.text, threadId: body.threadId } };
		case "chat": {
			if (body.retry === true && body.message === undefined) return { ok: true, body: { kind: "chat", text: body.text, retry: true } };
			const problem = messageTextProblem(body.message);
			if (problem) return { ok: false, error: problem.error };
			return { ok: true, body: { kind: "chat", text: body.text, message: body.message as string } };
		}
		default:
			return { ok: false, error: 'kind must be "read", "think", "visualize", "reply" or "chat".' };
	}
}

// ─── the registry ────────────────────────────────────────────────────────────

function push(live: Live, event: NotebookRunEvent) {
	live.events.push(event);
	for (const listener of live.listeners) listener(event);
}

function settle(live: Live, status: NotebookRunStatus, error?: string) {
	live.run = { ...live.run, status, endedAt: new Date().toISOString(), ...(error ? { error } : {}) };
	const map = registry();
	const timer = setTimeout(() => { if (map.get(live.run.id) === live) map.delete(live.run.id); }, NOTEBOOK_RUN_KEEP_MS);
	timer.unref?.();
	emit("activity-changed", {});
}

const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";
const partialOf = (err: unknown) => (typeof (err as { partial?: unknown })?.partial === "string" ? (err as { partial: string }).partial : "");

/** Writes to the companion and announces it; a refusal comes back as a string. */
async function change<R>(pageId: string, fn: (companion: NoteCompanion) => CompanionChange<R>): Promise<R | { refused: string; status: number }> {
	const outcome = await stores.notebookStore.update(pageId, fn);
	if ("refused" in outcome) return outcome;
	emit("notebook-changed", { pageId });
	return outcome.result;
}
const refused = (value: unknown): value is { refused: string; status: number } => typeof value === "object" && value !== null && "refused" in value;

/** Adds an AI thread on a verified span of the text. */
function addAiThread(pageId: string, run: NotebookRun, input: { note: string; anchor: ThreadAnchor; origin: ThreadOrigin; placement: ThreadPlacement; text: string; sketch?: Sketch; reviewerId?: string }) {
	return change<{ thread: NotebookThread; message: ThreadMessage }>(pageId, (companion) => {
		if (companion.threads.length >= NOTEBOOK_LIMITS.threads) return { refused: NOTEBOOK_LIMIT_TEXT.threads, status: 409 };
		const now = new Date().toISOString();
		const message: ThreadMessage = { id: `msg_${nanoid()}`, author: "ai", text: input.text, at: now, runId: run.id, ...(input.sketch ? { sketch: input.sketch } : {}), ...(input.reviewerId ? { reviewerId: input.reviewerId } : {}) };
		const thread: NotebookThread = {
			id: `thr_${nanoid()}`,
			anchor: input.anchor,
			placement: input.placement,
			side: assignSide(companion.threads, layoutNow(), input.anchor.block),
			status: "open",
			origin: input.origin,
			createdAt: now,
			updatedAt: now,
			messages: [message],
		};
		companion.threads.push(thread);
		if (run.kind === "read") companion.readCursor = { textHash: textHash(input.note), at: now };
		return { companion, result: { thread, message } };
	});
}

const reviewerOf = (companion: NoteCompanion) => {
	const settings = effectiveSettings();
	return resolveReviewer(settings.notebook.reviewers, companion.reviewerId)?.id;
};

/** An AI answer "Try again" may replace: it failed, or it still says
 *  streaming but no run is writing it (the server restarted mid-answer).
 *  In the note chat a stopped answer can be tried again too. */
function retryable(message: ThreadMessage | NoteChatMessage, stopped = false): boolean {
	if (message.state === "failed" || (stopped && message.state === "stopped")) return true;
	if (message.state !== "streaming") return false;
	const live = message.runId ? registry().get(message.runId) : undefined;
	return !live || live.run.status !== "running";
}

export type StartRunResult = { status: 202; run: Pick<NotebookRun, "id" | "kind" | "status"> } | { status: number; body: Record<string, unknown> };

/** Starts a run for a page (POST /api/notebook/:pageId/runs). */
export async function startNotebookRun(pageId: string, raw: unknown): Promise<StartRunResult> {
	if (!isNotebookId(pageId)) return { status: 400, body: { error: "That page id is not valid." } };
	const parsed = parseRunBody(raw);
	if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
	const body = parsed.body;
	const page = await stores.libraryStore.readPage(pageId);
	if (!page) return { status: 404, body: { error: "That note is no longer in your Library." } };
	const current = await stores.notebookStore.read(pageId);
	if (current.readOnly) return { status: 409, body: { error: new NotebookReadOnlyError().message, code: "future-version" } };
	const gate = notebookModelRefusal();
	if (gate) return gate;

	const note = noteText(body.text, page.draft?.content ?? page.head.content);
	const auto = body.kind === "read" ? body.auto : false;
	const run: NotebookRun = { id: `nbr_${nanoid()}`, pageId, kind: body.kind, status: "running", startedAt: new Date().toISOString(), auto };

	// Write-ahead (constitution III): his words land before the run starts,
	// with the AI's answer as a streaming placeholder.
	if (body.kind === "reply") {
		const placed = await change<{ threadId: string; messageId: string }>(pageId, (companion) => {
			const thread = companion.threads.find((t) => t.id === body.threadId);
			if (!thread) return { refused: "That thread is no longer on this note.", status: 404 };
			// "Try again" after a failed answer (or one whose run is gone) replaces that answer;
			// his message before it stays.
			const last = thread.messages.at(-1);
			if (last?.author === "ai" && retryable(last)) thread.messages.pop();
			else if (last?.author === "ai" && last.state === "streaming") return { refused: "It is already writing back.", status: 409 };
			if (thread.messages.at(-1)?.author !== "user") return { refused: "There is nothing to reply to yet.", status: 409 };
			if (thread.messages.length >= NOTEBOOK_LIMITS.messagesPerThread) return { refused: NOTEBOOK_LIMIT_TEXT.messages, status: 409 };
			const message: ThreadMessage = { id: `msg_${nanoid()}`, author: "ai", text: "", at: new Date().toISOString(), runId: run.id, state: "streaming", ...(reviewerOf(companion) ? { reviewerId: reviewerOf(companion) } : {}) };
			thread.messages.push(message);
			thread.updatedAt = message.at;
			return { companion, result: { threadId: thread.id, messageId: message.id } };
		});
		if (refused(placed)) return { status: placed.status, body: { error: placed.refused } };
		run.threadId = placed.threadId;
		run.messageId = placed.messageId;
	}
	if (body.kind === "chat") {
		const placed = await change<{ messageId: string }>(pageId, (companion) => {
			const last = companion.chat.at(-1);
			if (last?.author === "ai" && last.state === "streaming" && !retryable(last)) return { refused: "It is already writing back.", status: 409 };
			const at = new Date().toISOString();
			if ("retry" in body) {
				if (last?.author !== "ai" || !retryable(last, true)) return { refused: "There is nothing to try again.", status: 409 };
				companion.chat.pop();
				if (companion.chat.at(-1)?.author !== "user") return { refused: "There is nothing to reply to yet.", status: 409 };
			} else {
				if (companion.chat.length + 2 > NOTEBOOK_LIMITS.chat) return { refused: NOTEBOOK_LIMIT_TEXT.chat, status: 409 };
				companion.chat.push({ id: `msg_${nanoid()}`, author: "user", text: body.message, at });
			}
			const answer: NoteChatMessage = { id: `msg_${nanoid()}`, author: "ai", text: "", at, runId: run.id, state: "streaming" };
			companion.chat.push(answer);
			return { companion, result: { messageId: answer.id } };
		});
		if (refused(placed)) return { status: placed.status, body: { error: placed.refused } };
		run.messageId = placed.messageId;
	}

	// A second automatic read on the same page replaces the first.
	if (body.kind === "read" && auto) {
		for (const other of registry().values()) {
			if (other.run.pageId === pageId && other.run.kind === "read" && other.run.auto && other.run.status === "running") other.controller.abort();
		}
	}

	const live: Live = { run, pageName: page.item.name, controller: new AbortController(), events: [], listeners: new Set(), done: Promise.resolve() };
	registry().set(run.id, live);
	emit("activity-changed", {});
	live.done = execute(live, body, note).catch((err) => console.error("[notebook] run crashed:", err));
	return { status: 202, run: { id: run.id, kind: run.kind, status: run.status } };
}

async function execute(live: Live, body: RunBody, note: string): Promise<void> {
	const { run } = live;
	const pageId = run.pageId;
	const signal = live.controller.signal;
	const onUsage = (usage: Usage, model: string) => {
		live.run = { ...live.run, usage: accumulateJobUsage(live.run.usage, model, piUsageToStep(usage)) };
		emit("activity-changed", {});
	};
	const companion = (await stores.notebookStore.read(pageId)).companion;
	const context = contextFor(companion, note);
	const reviewerId = reviewerOf(companion);
	const passage = body.kind === "think" || body.kind === "visualize" ? body.anchor.quote : undefined;
	const engine = engineFor(run.kind, note, passage, run.auto);
	try {
		if (body.kind === "read") {
			push(live, { event: "phase", data: { phase: "reading" } });
			const result = await runNotebookRead({ context, engine, signal, onUsage });
			if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
			const at = result.action === "silent" ? -1 : note.indexOf(result.quote);
			if (result.action === "silent" || !quoteOccurs(note, result.quote) || at < 0) {
				await change(pageId, (c) => ({ companion: { ...c, readCursor: { textHash: textHash(note), at: new Date().toISOString() } }, result: null }));
				push(live, { event: "done", data: { status: "silent" } });
				settle(live, "silent");
				return;
			}
			const anchor = anchorForSpan(note, at, at + result.quote.length);
			push(live, { event: "phase", data: { phase: "writing", anchor: anchor.quote } });
			await land(live, { note, anchor, origin: "read", placement: result.action, text: result.text, sketch: result.sketch, reviewerId });
			return;
		}
		if (body.kind === "think" || body.kind === "visualize") {
			push(live, { event: "phase", data: { phase: body.kind === "visualize" ? "drawing" : "reading", anchor: body.anchor.quote } });
			if (body.kind === "think") {
				const result = await runNotebookThink({ context, engine, signal, onUsage, passage: body.anchor.quote });
				if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
				push(live, { event: "phase", data: { phase: "writing", anchor: body.anchor.quote } });
				await land(live, { note, anchor: body.anchor, origin: "think", placement: result.placement, text: result.text, sketch: result.sketch, reviewerId });
			} else {
				const result = await runNotebookVisualize({ context, engine, signal, onUsage, passage: body.anchor.quote });
				if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
				await land(live, { note, anchor: body.anchor, origin: "visualize", placement: "inline", text: result.text ?? "", sketch: result.sketch, reviewerId });
			}
			return;
		}
		await streamAnswer(live, body as Extract<RunBody, { kind: "reply" | "chat" }>, context, engine, onUsage);
	} catch (err) {
		if (isAbort(err) || signal.aborted) {
			push(live, { event: "stopped", data: {} });
			settle(live, "stopped");
			return;
		}
		const detail = err instanceof Error ? err.message : String(err);
		console.error(`[notebook] ${run.kind} run failed:`, detail);
		push(live, { event: "failed", data: { error: "That didn’t come through.", detail } });
		settle(live, "failed", detail);
	}
}

/** A structured result lands as one AI thread, then the run is done. */
async function land(live: Live, input: Parameters<typeof addAiThread>[2]) {
	if (live.controller.signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
	const added = await addAiThread(live.run.pageId, live.run, input);
	if (refused(added)) throw new Error(added.refused);
	live.run = { ...live.run, threadId: added.thread.id, messageId: added.message.id };
	if (input.text) push(live, { event: "delta", data: { messageId: added.message.id, text: input.text } });
	push(live, { event: "done", data: { status: "done", threadId: added.thread.id, messageId: added.message.id } });
	settle(live, "done");
}

/** Reply and chat: stream deltas, then complete the placeholder message;
 *  a stop keeps what arrived and says "stopped", a failure says "failed". */
async function streamAnswer(live: Live, body: Extract<RunBody, { kind: "reply" | "chat" }>, context: NotebookContext, engine: PiEngine | undefined, onUsage: (usage: Usage, model: string) => void) {
	const { pageId, messageId, threadId } = live.run;
	const signal = live.controller.signal;
	const companion = (await stores.notebookStore.read(pageId)).companion;
	const thread = threadId ? companion.threads.find((t) => t.id === threadId) : undefined;
	const conversation = body.kind === "reply"
		? (thread?.messages ?? []).filter((m) => m.id !== messageId).map((m) => ({ author: m.author, text: m.text }))
		: companion.chat.filter((m) => m.id !== messageId).map((m) => ({ author: m.author, text: m.text }));
	const finish = (text: string, state?: "stopped" | "failed") => change(pageId, (c) => {
		const list: (ThreadMessage | NoteChatMessage)[] = body.kind === "reply" ? c.threads.find((t) => t.id === threadId)?.messages ?? [] : c.chat;
		const message = list.find((m) => m.id === messageId);
		if (!message) return { refused: "gone", status: 404 };
		message.text = text;
		if (state) message.state = state;
		else delete message.state;
		const owner = body.kind === "reply" ? c.threads.find((t) => t.id === threadId) : undefined;
		if (owner) owner.updatedAt = new Date().toISOString();
		return { companion: c, result: null };
	});
	push(live, { event: "phase", data: { phase: "writing", ...(thread ? { anchor: thread.anchor.quote } : {}) } });
	let partial = "";
	try {
		const input = { context, engine, signal, onUsage, conversation, onDelta: (text: string) => { partial += text; push(live, { event: "delta", data: { messageId: messageId!, text } }); } };
		const text = body.kind === "reply" ? await streamNotebookReply({ ...input, quote: thread?.anchor.quote ?? "" }) : await streamNotebookChat(input);
		await finish(text.trim() ? text : partial);
		push(live, { event: "done", data: { status: "done", ...(threadId ? { threadId } : {}), messageId: messageId! } });
		settle(live, "done");
	} catch (err) {
		const kept = partialOf(err) || partial;
		await finish(kept, isAbort(err) || signal.aborted ? "stopped" : "failed").catch((failure) => console.error("[notebook] answer not saved:", failure));
		throw err;
	}
}

// ─── abort, feed, stream ─────────────────────────────────────────────────────

/** Stop (the activity abort route). False when nothing is running under that id. */
export function abortNotebookRun(id: string): boolean {
	const live = registry().get(id);
	if (!live || live.run.status !== "running") return false;
	live.controller.abort();
	return true;
}

export const NOTEBOOK_KIND_WORD: Readonly<Record<NotebookRunKind, string>> = { read: "Reading", think: "Thinking", ask: "Thinking", reply: "Replying", visualize: "Drawing", chat: "Chat" };

/** The activity feed's running Notebook runs. Cost is computed here, at read time. */
export function notebookRunFeed() {
	return [...registry().values()].filter((live) => live.run.status === "running").map(({ run, pageName }) => ({
		id: run.id,
		pageId: run.pageId,
		pageName,
		kind: run.kind,
		auto: run.auto,
		startedAt: Date.parse(run.startedAt) || 0,
		costUsd: jobCost({ usage: run.usage }),
		model: run.usage?.model,
		steps: run.usage?.steps,
	}));
}

/** A run as the registry holds it (tests and the stream route). */
export const notebookRun = (id: string): NotebookRun | null => registry().get(id)?.run ?? null;
/** The events a run has buffered so far (tests; the stream route replays the same list). */
export const notebookRunEvents = (id: string): NotebookRunEvent[] => [...(registry().get(id)?.events ?? [])];
export const notebookRunIdle = async (): Promise<void> => { await Promise.all([...registry().values()].map((live) => live.done)); };

const TERMINAL = new Set(["done", "failed", "stopped"]);

/** GET /api/notebook/runs/:runId/stream: SSE (events-stream.ts wire format). */
export function notebookRunStreamResponse(runId: string): Response {
	if (!isNotebookId(runId)) return json({ error: "That run id is not valid." }, 400);
	const live = registry().get(runId);
	if (!live) return json({ error: "That run is not here any more." }, 404);
	const encoder = new TextEncoder();
	let teardown: (() => void) | undefined;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			let heartbeat: ReturnType<typeof setInterval> | undefined;
			const stop = () => {
				if (closed) return;
				closed = true;
				live.listeners.delete(listener);
				if (heartbeat) clearInterval(heartbeat);
				try { controller.close(); } catch { /* already closed */ }
			};
			const frame = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					stop();
				}
			};
			const send = (event: NotebookRunEvent) => {
				frame(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
				if (TERMINAL.has(event.event)) stop();
			};
			const listener = (event: NotebookRunEvent) => send(event);
			// Replay then attach, synchronously: nothing falls between.
			for (const event of live.events) send(event);
			if (closed) return;
			live.listeners.add(listener);
			heartbeat = setInterval(() => frame("event: ping\ndata: {}\n\n"), 25_000);
			teardown = stop;
		},
		cancel() {
			teardown?.();
		},
	});
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			"X-Accel-Buffering": "no",
		},
	});
}
