"use client";

import type { LibraryItem } from "@/src/core";

export { PagePaneContext, usePagePane } from "@/components/workspace/pane-context";
export type { PagePaneApi, PaneItem } from "@/components/workspace/pane-context";

const NEW_PAGE_NAME = "Untitled page";

/** The palette asks the transcript for what is selected (feature 017). */
export const SAVE_PASSAGE_EVENT = "lh:save-passage";

/** "Turn this lesson into study notes": a new page, by an explicit click, with no model call. */
export async function createStudyNotes(chatId: string): Promise<{ item: LibraryItem } | { error: string }> {
	try {
		const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/study-notes`, { method: "POST" });
		const body = await response.json().catch(() => ({})) as { item?: LibraryItem; error?: string };
		if (!response.ok || !body.item) return { error: body.error ?? "The study notes could not be made." };
		return { item: body.item };
	} catch {
		return { error: "The study notes could not be made. Check your connection and try again." };
	}
}

/** A new empty page, stepping past a taken name. Null with the reason on failure. */
export async function createBlankPage(folderId?: string | null): Promise<{ item: LibraryItem } | { error: string }> {
	const send = (name: string) => fetch("/api/library/pages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, content: "", ...(folderId ? { folderId } : {}) }),
	});
	try {
		let response = await send(NEW_PAGE_NAME);
		if (response.status === 409) {
			const body = await response.json() as { suggestedName?: string };
			if (body.suggestedName) response = await send(body.suggestedName);
		}
		if (!response.ok) {
			const body = await response.json().catch(() => ({})) as { error?: string };
			return { error: body.error ?? "The page could not be created." };
		}
		return { item: ((await response.json()) as { item: LibraryItem }).item };
	} catch {
		return { error: "The page could not be created. Check your connection and try again." };
	}
}
