"use client";

import { createContext, useContext } from "react";
import type { DocJump, LibraryKind } from "@/src/core";

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

export const PagePaneContext = createContext<PagePaneApi | null>(null);

/** Null outside the app shell (render tests, previews). */
export function usePagePane() {
	return useContext(PagePaneContext);
}
