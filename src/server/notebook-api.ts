/**
 * Notebook's HTTP handlers (feature 024, contracts/api.md). Routes wrap
 * these in withTenant. Unknown pages, threads and runs are 404, invalid
 * bodies 400, limits and newer-version companions 409, no model or key 503.
 */
import { nanoid } from "nanoid";
import { isRefusal, LibraryCatalogError } from "../core/library.ts";
import { emit } from "../core/events.ts";
import {
	applyCompanionPatch, assignSide, isNotebookId, messageTextProblem, NOTEBOOK_LIMIT_TEXT, NOTEBOOK_LIMITS, parseCompanionPatch, parseThreadAnchor,
	THREAD_STATUSES, type NoteCompanion, type NotebookThread, type ThreadMessage, type ThreadStatus,
} from "../core/notebook.ts";
import { effectiveSettings, stores } from "./stores.ts";
import { NotebookReadOnlyError, type CompanionChange } from "../store/notebook.ts";
import { notebookRunStreamResponse, startNotebookRun } from "./notebook.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const noPage = () => json({ error: "That note is no longer in your Library." }, 404);
const badId = () => json({ error: "That id is not valid." }, 400);

async function body(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

async function guarded(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (err) {
		if (err instanceof NotebookReadOnlyError) return json({ error: err.message, code: "future-version" }, 409);
		if (!(err instanceof LibraryCatalogError)) throw err;
		console.error("[notebook]", err.message);
		return json({ error: "Your Library could not be loaded.", code: "catalog" }, 500);
	}
}

const livePage = async (pageId: string) => (await stores.libraryStore.readPage(pageId)) !== null;
async function liveOrTrashedPage(pageId: string): Promise<boolean> {
	if (await livePage(pageId)) return true;
	return (await stores.libraryStore.listTrash()).some((entry) => entry.items.some((item) => item.id === pageId && item.kind === "page"));
}

async function write<R>(pageId: string, fn: (companion: NoteCompanion) => CompanionChange<R>): Promise<{ result: R } | Response> {
	const outcome = await stores.notebookStore.update(pageId, fn);
	if ("refused" in outcome) return json({ error: outcome.refused }, outcome.status);
	emit("notebook-changed", { pageId });
	return { result: outcome.result };
}

/** GET /api/notebook/:pageId */
export function notebookReadResponse(pageId: string): Promise<Response> {
	return guarded(async () => {
		if (!isNotebookId(pageId)) return badId();
		if (!(await liveOrTrashedPage(pageId))) return noPage();
		const read = await stores.notebookStore.read(pageId);
		const startMode = effectiveSettings().notebook.startMode;
		return json({ companion: read.companion, effective: { mode: read.companion.mode ?? startMode }, readOnly: read.readOnly, setAside: read.setAside });
	});
}

/** GET /api/notebook/summary: { openThreads: { [pageId]: count } } for live pages with open threads (the sidebar's dots). */
export function notebookSummaryResponse(): Promise<Response> {
	return guarded(async () => {
		const counts = await stores.notebookStore.openThreadCounts();
		const live = new Set((await stores.libraryStore.list()).filter((item) => item.kind === "page" && !item.archivedAt).map((item) => item.id));
		const openThreads: Record<string, number> = {};
		for (const [pageId, count] of Object.entries(counts)) if (live.has(pageId)) openThreads[pageId] = count;
		return json({ openThreads });
	});
}

/** PATCH /api/notebook/:pageId { mode?, stampMode?, instruction?, reviewerId? } */
export function notebookPatchResponse(request: Request, pageId: string): Promise<Response> {
	return guarded(async () => {
		if (!isNotebookId(pageId)) return badId();
		const parsed = parseCompanionPatch(await body(request));
		if (!parsed.ok) return json({ error: parsed.error }, 400);
		if (!(await livePage(pageId))) return noPage();
		const done = await write(pageId, (companion) => {
			const next = applyCompanionPatch(companion, parsed.patch);
			return { companion: next, result: next };
		});
		return done instanceof Response ? done : json({ companion: done.result });
	});
}

/** POST /api/notebook/:pageId/threads { anchor, origin: "ask", text } */
export function notebookThreadCreateResponse(request: Request, pageId: string): Promise<Response> {
	return guarded(async () => {
		if (!isNotebookId(pageId)) return badId();
		const raw = (await body(request)) as Record<string, unknown> | undefined;
		const anchor = parseThreadAnchor(raw?.anchor);
		if (!anchor) return json({ error: "anchor must hold the passage's quote, prefix and suffix." }, 400);
		if (raw?.origin !== "ask") return json({ error: 'origin must be "ask".' }, 400);
		const problem = messageTextProblem(raw.text);
		if (problem) return json({ error: problem.error }, problem.status);
		if (!(await livePage(pageId))) return noPage();
		const layout = effectiveSettings().notebook.layout;
		const done = await write(pageId, (companion) => {
			if (companion.threads.length >= NOTEBOOK_LIMITS.threads) return { refused: NOTEBOOK_LIMIT_TEXT.threads, status: 409 };
			const now = new Date().toISOString();
			const thread: NotebookThread = {
				id: `thr_${nanoid()}`, anchor, placement: "margin", side: assignSide(companion.threads, layout, anchor.block), status: "open", origin: "ask",
				createdAt: now, updatedAt: now, messages: [{ id: `msg_${nanoid()}`, author: "user", text: raw.text as string, at: now }],
			};
			companion.threads.push(thread);
			return { companion, result: thread };
		});
		return done instanceof Response ? done : json({ thread: done.result }, 201);
	});
}

/** PATCH /api/notebook/:pageId/threads/:threadId { status }. "open" is the Undo
 *  of a resolve or dismiss (ui-contract.md, 6 s Undo). */
export function notebookThreadPatchResponse(request: Request, pageId: string, threadId: string): Promise<Response> {
	return guarded(async () => {
		if (!isNotebookId(pageId) || !isNotebookId(threadId)) return badId();
		const raw = (await body(request)) as Record<string, unknown> | undefined;
		const status = raw?.status;
		if (typeof status !== "string" || !(THREAD_STATUSES as readonly string[]).includes(status)) return json({ error: 'status must be "resolved", "dismissed" or "open".' }, 400);
		if (!(await livePage(pageId))) return noPage();
		const done = await write(pageId, (companion) => {
			const thread = companion.threads.find((t) => t.id === threadId);
			if (!thread) return { refused: "That thread is no longer on this note.", status: 404 };
			thread.status = status as ThreadStatus;
			thread.updatedAt = new Date().toISOString();
			return { companion, result: thread };
		});
		return done instanceof Response ? done : json({ thread: done.result });
	});
}

/** POST /api/notebook/:pageId/threads/:threadId/messages { text } */
export function notebookMessageCreateResponse(request: Request, pageId: string, threadId: string): Promise<Response> {
	return guarded(async () => {
		if (!isNotebookId(pageId) || !isNotebookId(threadId)) return badId();
		const raw = (await body(request)) as Record<string, unknown> | undefined;
		const problem = messageTextProblem(raw?.text);
		if (problem) return json({ error: problem.error }, problem.status);
		if (!(await livePage(pageId))) return noPage();
		const done = await write(pageId, (companion) => {
			const thread = companion.threads.find((t) => t.id === threadId);
			if (!thread) return { refused: "That thread is no longer on this note.", status: 404 };
			if (thread.messages.length >= NOTEBOOK_LIMITS.messagesPerThread) return { refused: NOTEBOOK_LIMIT_TEXT.messages, status: 409 };
			const message: ThreadMessage = { id: `msg_${nanoid()}`, author: "user", text: raw!.text as string, at: new Date().toISOString() };
			thread.messages.push(message);
			thread.updatedAt = message.at;
			return { companion, result: message };
		});
		return done instanceof Response ? done : json({ message: done.result }, 201);
	});
}

/** POST /api/notebook/:pageId/runs */
export function notebookRunStartResponse(request: Request, pageId: string): Promise<Response> {
	return guarded(async () => {
		const result = await startNotebookRun(pageId, await body(request));
		return "run" in result ? json({ run: result.run }, 202) : json(result.body, result.status);
	});
}

/** GET /api/notebook/runs/:runId/stream */
export const notebookRunEventsResponse = (runId: string): Response => notebookRunStreamResponse(runId);

/** The note the Notebook route opens (ui-contract.md "Mode switch"): the
 *  requested page; with none, the last note if it is still a live page,
 *  else the newest page, else a new page "Untitled note". */
export async function resolveNotebookNote(requested: string | undefined): Promise<{ note: { id: string; name: string } } | { redirectTo: string } | { missing: true }> {
	if (requested !== undefined) {
		if (!isNotebookId(requested)) return { missing: true };
		const page = await stores.libraryStore.readPage(requested);
		return page ? { note: { id: page.item.id, name: page.item.name } } : { missing: true };
	}
	const to = (id: string) => ({ redirectTo: `/notebook/${encodeURIComponent(id)}` });
	const last = effectiveSettings().notebook.lastNoteId;
	if (last && isNotebookId(last) && (await stores.libraryStore.readPage(last))) return to(last);
	const pages = (await stores.libraryStore.list()).filter((item) => item.kind === "page" && !item.archivedAt);
	pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	if (pages[0]) return to(pages[0].id);
	let made = await stores.libraryStore.createPage(UNTITLED_NOTE, "", { author: "learner" });
	if (isRefusal(made) && made.suggestedName) made = await stores.libraryStore.createPage(made.suggestedName, "", { author: "learner" });
	if (isRefusal(made)) throw new Error(`[notebook] could not create a note: ${made.message}`);
	// "New notes start in" applies to new notes only: the note keeps the mode it starts with.
	const startMode = effectiveSettings().notebook.startMode;
	await stores.notebookStore.update(made.item.id, (companion) => ({ companion: { ...companion, mode: companion.mode ?? startMode }, result: null }));
	return to(made.item.id);
}

/**
 * POST /api/notebook/open → `{ href }`: where bare /notebook leads (the same
 * resolution, a new "Untitled note" included). The Study → Notebook switch
 * asks first and goes straight there: a page redirect on a client
 * navigation renders a blank page while Next follows it (feature 028).
 */
export function notebookOpenResponse(): Promise<Response> {
	return guarded(async () => {
		const resolved = await resolveNotebookNote(undefined);
		return json({ href: "redirectTo" in resolved ? resolved.redirectTo : null });
	});
}

/** The name a new note gets (research R2). */
export const UNTITLED_NOTE = "Untitled note";
