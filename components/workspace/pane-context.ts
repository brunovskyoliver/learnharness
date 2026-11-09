"use client";

import { createLiveContext } from "@/components/live-context";
import type { DocJump, LibraryKind } from "@/src/core";

/** What the pane has open. Small and free of the editor, so it can sit in the
 *  layout; the pane itself loads on the first open (research R14). The @ menu
 *  uses this file alone, which keeps the pane out of its chunk. */
export interface PaneItem {
	id: string;
	name: string;
	kind: LibraryKind;
	size: number;
	/** A file mirrored from a linked repo: the repo's display address (feature 026). */
	repo?: string;
	/** Open on its version list, from a transcript row. */
	history?: boolean;
	/** Where to land: a search hit or a citation (features 019-020). Not saved. */
	jump?: DocJump;
}

export interface PagePaneApi {
	item: PaneItem | null;
	/** The page saved from last time has been read. Until then `item` being null means nothing. */
	restored: boolean;
	/** Bumps on every explicit open: the most recent open wins over a demo. */
	openCount: number;
	open: (item: PaneItem) => void;
	close: () => void;
	/** The open item was renamed, or changed size. */
	update: (item: PaneItem) => void;
}

/** A live context (feature 024): its value never changes identity, so a pane
 *  restore above the page's Suspense boundary can't discard the streamed page. */
export const PagePaneContext = createLiveContext<PagePaneApi | null>(null);

/** Null outside the app shell (render tests, previews). */
export function usePagePane() {
	return PagePaneContext.useValue();
}
