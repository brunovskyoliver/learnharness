"use client";

import dynamic from "next/dynamic";
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SessionAccountContext } from "@/components/session-state";
import { SessionStateStore } from "@/components/session-state-store";
import type { LibraryKind } from "@/src/core";
import { PagePaneContext, usePagePane, type PaneItem } from "./page-pane-api.ts";

export { createBlankPage, usePagePane } from "./page-pane-api.ts";
export type { PagePaneApi, PaneItem } from "./page-pane-api.ts";

const STATE_KEY = "open";

export function PagePaneProvider({ children }: { children: ReactNode }) {
	const account = useContext(SessionAccountContext);
	// Not one chat's state: the open page follows the learner between routes.
	const store = useMemo(() => new SessionStateStore(account ?? "signed-out", "__page-pane", () => (account && typeof window !== "undefined" ? window.localStorage : undefined)), [account]);
	const [item, setItem] = useState<PaneItem | null>(null);
	const [openCount, setOpenCount] = useState(0);
	useEffect(() => {
		const saved = store.get(STATE_KEY) as PaneItem | null | undefined;
		if (saved && typeof saved.id === "string") setItem(saved);
		const flush = () => store.flush();
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	}, [store]);
	const remember = useCallback((next: PaneItem | null) => {
		setItem(next);
		store.set(STATE_KEY, next);
	}, [store]);
	const open = useCallback((next: PaneItem) => {
		remember(next);
		setOpenCount((n) => n + 1);
	}, [remember]);
	const close = useCallback(() => remember(null), [remember]);
	const value = useMemo(() => ({ item, openCount, open, close, update: remember }), [item, openCount, open, close, remember]);
	return <PagePaneContext.Provider value={value}>{children}</PagePaneContext.Provider>;
}

const PagePane = dynamic(() => import("./page-pane.tsx").then((m) => m.PagePane), { ssr: false });

/** Where a route shows the pane: beside the transcript or the Library list.
 *  Renders nothing, and loads nothing, until something is open. */
export function PagePaneSlot() {
	const pane = usePagePane();
	if (!pane?.item) return null;
	return <PagePane key={pane.item.id} item={pane.item} pane={pane} />;
}

/** The kinds the pane shows. PDF and images open in a new tab; `other` downloads. */
export const opensInPane = (kind: LibraryKind) => kind !== "pdf" && kind !== "image" && kind !== "other";
