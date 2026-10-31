"use client";

import type { LibraryItem } from "@/src/core";

export { PagePaneContext, usePagePane } from "@/components/workspace/pane-context";
export type { PagePaneApi, PaneItem } from "@/components/workspace/pane-context";

const NEW_PAGE_NAME = "Untitled page";

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
