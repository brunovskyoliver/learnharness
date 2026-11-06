"use client";

/**
 * Notebook's Library writes (feature 024): a new note, a new folder, a
 * renamed note. Each steps past a taken name the way the Library does
 * (the server's `suggestedName`, "Name (2)").
 */
import type { LibraryFolder, LibraryItem } from "@/src/core";
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

/** A new empty page called `name` (or "Untitled note"). */
export function createNote(name = UNTITLED_NOTE, folderId?: string | null): Promise<Outcome<LibraryItem>> {
	const wanted = name.trim() || UNTITLED_NOTE;
	return stepping(
		(n) => post("/api/library/pages", { name: n, content: "", ...(folderId ? { folderId } : {}) }),
		wanted,
		(body) => (body as { item?: LibraryItem }).item,
		"The note could not be created.",
	);
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
		return { error: body.error ?? "That didn't come through." };
	} catch {
		return { error: "That didn't come through." };
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
		return response.ok && body.message ? { ok: { id: body.message.id } } : { error: body.error ?? "That didn't come through." };
	} catch {
		return { error: "That didn't come through." };
	}
}

/** Starts the AI's answer in a thread (after his Write back, or Try again). */
export async function startReply(pageId: string, threadId: string, text: string): Promise<StartReadOutcome> {
	try {
		const response = await post(`/api/notebook/${encodeURIComponent(pageId)}/runs`, { kind: "reply", text, threadId });
		const body = (await response.json().catch(() => ({}))) as { run?: { id: string }; reason?: "models" | "key"; provider?: string; error?: string };
		if (response.status === 202 && body.run) return { ok: { id: body.run.id } };
		if (response.status === 503 && (body.reason === "models" || body.reason === "key")) return { refused: { reason: body.reason, ...(body.provider ? { provider: body.provider } : {}) } };
		return { error: body.error ?? "That didn't come through." };
	} catch {
		return { error: "That didn't come through." };
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
