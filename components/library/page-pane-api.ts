"use client";

import { createContext, useContext } from "react";
import type { LibraryItem, LibraryKind } from "@/src/core";

/** What the pane has open. Small and free of the editor, so it can sit in the
 *  layout; the pane itself loads on the first open (research R14). The @ menu
 *  uses this file alone, which keeps the pane out of its chunk. */
export interface PaneItem {
	id: string;
	name: string;
	kind: LibraryKind;
	size: number;
	/** Open on its version list, from a transcript row. */
	history?: boolean;
}

export interface PagePaneApi {
	item: PaneItem | null;
	/** Bumps on every explicit open: the most recent open wins over a demo. */
	openCount: number;
	open: (item: PaneItem) => void;
	close: () => void;
	/** The open item was renamed, or changed size. */
	update: (item: PaneItem) => void;
}

export const PagePaneContext = createContext<PagePaneApi | null>(null);

/** Null outside the app shell (render tests, previews). */
export function usePagePane() {
	return useContext(PagePaneContext);
}

const NEW_PAGE_NAME = "Untitled page";

/** A new empty page, stepping past a taken name. Null with the reason on failure. */
export async function createBlankPage(): Promise<{ item: LibraryItem } | { error: string }> {
	const send = (name: string) => fetch("/api/library/pages", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, content: "" }),
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
