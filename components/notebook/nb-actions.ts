"use client";

/**
 * Notebook's Library writes (feature 024): a new note, a new folder, a
 * renamed note. Each steps past a taken name the way the Library does
 * (the server's `suggestedName`, "Name (2)").
 */
import { CARD_PASSAGE_KEY, type CardPassageHandoff, type LibraryFolder, type LibraryItem, type NotebookThread, type NoteMode, type ThreadAnchor } from "@/src/core";
import { stampMode } from "./use-notebook-data";
import { UNTITLED_NOTE } from "./nb-shared";

type Outcome<T> = { ok: T } | { error: string };

async function stepping<T>(send: (name: string) => Promise<Response>, name: string, pick: (body: unknown) => T | undefined, fallback: string): Promise<Outcome<T>> {
	try {
		let response = await send(name);
		if (response.status === 409) {
			const body = (await response.json().catch(() => ({}))) as { suggestedName?: string };
			if (body.suggestedName) response = await send(body.suggestedName);
		}
		const body = (await response.json().catch(() => ({}))) as { error?: string };
		const value = response.ok ? pick(body) : undefined;
		return value ? { ok: value } : { error: body.error ?? fallback };
	} catch {
		return { error: `${fallback} Check your connection and try again.` };
	}
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** A new empty page called `name` (or "Untitled note"), in the mode new notes start in when one is given. */
export async function createNote(name = UNTITLED_NOTE, folderId?: string | null, startMode?: NoteMode): Promise<Outcome<LibraryItem>> {
	const wanted = name.trim() || UNTITLED_NOTE;
	const made = await stepping(
		(n) => post("/api/library/pages", { name: n, content: "", ...(folderId ? { folderId } : {}) }),
		wanted,
		(body) => (body as { item?: LibraryItem }).item,
		"The note could not be created.",
	);
	// "New notes start in" belongs to the note from now on; a failed stamp is made on its first open instead.
	if ("ok" in made && startMode) await stampMode(made.ok.id, startMode);
	return made;
}

export function createFolder(name = "New folder"): Promise<Outcome<LibraryFolder>> {
	return stepping((n) => post("/api/library/folders", { name: n, parentId: null }), name, (body) => (body as { folder?: LibraryFolder }).folder, "The folder could not be created.");
}

/** Renames the note's page; an empty name saves as "Untitled note". */
export function renameNote(id: string, name: string): Promise<Outcome<LibraryItem>> {
	const wanted = name.trim() || UNTITLED_NOTE;
	return stepping(
		(n) => fetch(`/api/library/items/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) }),
		wanted,
		(body) => (body as { item?: LibraryItem }).item,
		"The name could not be saved.",
	);
}

export type StartReadOutcome =
	| { ok: { id: string } }
	| { refused: { reason: "models" | "key"; provider?: string } }
	/** Nothing to say (a note that can't take notes, a page that is gone). */
	| { skipped: true }
	| { error: string };

/** POST an automatic read of the text he sees (api.md "Runs"). */
export async function startRead(pageId: string, text: string): Promise<StartReadOutcome> {
	try {
		const response = await post(`/api/notebook/${encodeURIComponent(pageId)}/runs`, { kind: "read", text, auto: true });
		const body = (await response.json().catch(() => ({}))) as { run?: { id: string }; reason?: "models" | "key"; provider?: string; error?: string };
		if (response.status === 202 && body.run) return { ok: { id: body.run.id } };
		if (response.status === 503 && (body.reason === "models" || body.reason === "key")) return { refused: { reason: body.reason, ...(body.provider ? { provider: body.provider } : {}) } };
		if (response.status === 404 || response.status === 409) return { skipped: true };
		return { error: body.error ?? "That didn’t come through." };
	} catch {
		return { error: "That didn’t come through." };
	}
}

/** Stop a run (the activity abort route, kind "notebook"). Leaving never stops one; only this. */
export async function stopRun(id: string): Promise<boolean> {
	try {
		const response = await post("/api/activity/abort", { kind: "notebook", id });
		return response.ok;
	} catch {
		return false;
	}
}

// ─── threads (api.md "Threads", "Runs") ──────────────────────────────────────

const base = (pageId: string, threadId: string) => `/api/notebook/${encodeURIComponent(pageId)}/threads/${encodeURIComponent(threadId)}`;

/** His Write back, written ahead of the reply run (constitution III). */
export async function postThreadMessage(pageId: string, threadId: string, text: string): Promise<{ ok: { id: string } } | { error: string }> {
	try {
		const response = await post(`${base(pageId, threadId)}/messages`, { text });
		const body = (await response.json().catch(() => ({}))) as { message?: { id: string }; error?: string };
		return response.ok && body.message ? { ok: { id: body.message.id } } : { error: body.error ?? "That didn’t come through." };
	} catch {
		return { error: "That didn’t come through." };
	}
}

/** Starts the AI's answer in a thread (after his Write back, or Try again). */
export async function startReply(pageId: string, threadId: string, text: string): Promise<StartReadOutcome> {
	try {
		const response = await post(`/api/notebook/${encodeURIComponent(pageId)}/runs`, { kind: "reply", text, threadId });
		const body = (await response.json().catch(() => ({}))) as { run?: { id: string }; reason?: "models" | "key"; provider?: string; error?: string };
		if (response.status === 202 && body.run) return { ok: { id: body.run.id } };
		if (response.status === 503 && (body.reason === "models" || body.reason === "key")) return { refused: { reason: body.reason, ...(body.provider ? { provider: body.provider } : {}) } };
		return { error: body.error ?? "That didn’t come through." };
	} catch {
		return { error: "That didn’t come through." };
	}
}

/** Resolve, dismiss, or "open" again (the Undo). */
export async function setThreadStatus(pageId: string, threadId: string, status: "open" | "resolved" | "dismissed"): Promise<boolean> {
	try {
		const response = await fetch(base(pageId, threadId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
		return response.ok;
	} catch {
		return false;
	}
}

// ─── the selection menu (US4) ───────────────────────────────────────────────

/** "Ask about this" once he sends: the thread with his question, written ahead of its reply run. */
export async function postAskThread(pageId: string, anchor: ThreadAnchor, text: string): Promise<{ ok: NotebookThread } | { error: string }> {
	try {
		const response = await post(`/api/notebook/${encodeURIComponent(pageId)}/threads`, { anchor, origin: "ask", text });
		const body = (await response.json().catch(() => ({}))) as { thread?: NotebookThread; error?: string };
		return response.ok && body.thread ? { ok: body.thread } : { error: body.error ?? "That didn’t come through." };
	} catch {
		return { error: "That didn’t come through." };
	}
}

/** "Think about this" or "Visualize" on a passage of the text he sees. */
export async function startPassageRun(pageId: string, kind: "think" | "visualize", text: string, anchor: ThreadAnchor): Promise<StartReadOutcome> {
	try {
		const response = await post(`/api/notebook/${encodeURIComponent(pageId)}/runs`, { kind, text, anchor });
		const body = (await response.json().catch(() => ({}))) as { run?: { id: string }; reason?: "models" | "key"; provider?: string; error?: string };
		if (response.status === 202 && body.run) return { ok: { id: body.run.id } };
		if (response.status === 503 && (body.reason === "models" || body.reason === "key")) return { refused: { reason: body.reason, ...(body.provider ? { provider: body.provider } : {}) } };
		return { error: body.error ?? "That didn’t come through." };
	} catch {
		return { error: "That didn’t come through." };
	}
}

/**
 * "Make flashcards" (feature 021's flow): Study's card drafting, which says
 * what would be sent and sends nothing until he chooses Generate drafts
 * there. From the footer the whole note (`/review?make=page:<id>`, feature
 * 023's door); from the selection menu only the passage, handed over in
 * this tab's sessionStorage as the PDF reader does (`/review?make=passage`).
 */
export const flashcardsHref = (pageId: string): string => `/review?make=${encodeURIComponent(`page:${pageId}`)}`;

/** Leaves the passage for the Make flashcards panel and gives its address (the whole note when the browser refuses storage). */
export function passageFlashcardsHref(pageId: string, text: string): string {
	try {
		const handoff: CardPassageHandoff = { itemId: pageId, text };
		sessionStorage.setItem(CARD_PASSAGE_KEY, JSON.stringify(handoff));
		return "/review?make=passage";
	} catch {
		return flashcardsHref(pageId);
	}
}

// ─── note chat (US6) ────────────────────────────────────────────────────────

/** His chat message (written ahead by the server) and the answer's run; or `retry`: Try again on the last answer. */
export async function startChat(pageId: string, text: string, send: { message: string } | { retry: true }): Promise<StartReadOutcome> {
	try {
		const response = await post(`/api/notebook/${encodeURIComponent(pageId)}/runs`, { kind: "chat", text, ...send });
		const body = (await response.json().catch(() => ({}))) as { run?: { id: string }; reason?: "models" | "key"; provider?: string; error?: string };
		if (response.status === 202 && body.run) return { ok: { id: body.run.id } };
		if (response.status === 503 && (body.reason === "models" || body.reason === "key")) return { refused: { reason: body.reason, ...(body.provider ? { provider: body.provider } : {}) } };
		return { error: body.error ?? "That didn’t come through." };
	} catch {
		return { error: "That didn’t come through." };
	}
}

// ─── Just my words, Copy this note, Export (US7) ─────────────────────────────

/** Per browser (FR-042): "on" hides every AI layer. */
export const JUST_MY_WORDS_KEY = "lh.nb.justMyWords";

function readKey(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}
function writeKey(key: string, value: string): void {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		/* private window or storage off: it holds for this page only */
	}
}

export const readJustMyWords = (): boolean => readKey(JUST_MY_WORDS_KEY) === "on";
export const writeJustMyWords = (on: boolean): void => writeKey(JUST_MY_WORDS_KEY, on ? "on" : "off");

/** Puts text on the clipboard; false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export { dispositionName, EXPORT_FORMAT_KEY, EXPORT_NOTES_KEY, exportNote, readExportChoice, writeExportChoice } from "@/components/paper/export";
