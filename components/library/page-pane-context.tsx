"use client";

import dynamic from "next/dynamic";
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { SessionAccountContext } from "@/components/session-state";
import { SessionStateStore } from "@/components/session-state-store";
import type { LibraryKind } from "@/src/core";
import { PagePaneContext, usePagePane, type PaneItem } from "./page-pane-api.ts";
import { preloadPdf } from "./pdf-preload.ts";

export { createBlankPage, usePagePane } from "./page-pane-api.ts";
export type { PagePaneApi, PaneItem } from "./page-pane-api.ts";

const STATE_KEY = "open";

export function PagePaneProvider({ children }: { children: ReactNode }) {
	const account = useContext(SessionAccountContext);
	// Not one chat's state: the open page follows the learner between routes.
	const store = useMemo(() => new SessionStateStore(account ?? "signed-out", "__page-pane", () => (account && typeof window !== "undefined" ? window.localStorage : undefined)), [account]);
	const [item, setItem] = useState<PaneItem | null>(null);
	const [restored, setRestored] = useState(false);
	const [openCount, setOpenCount] = useState(0);
	useEffect(() => {
		const saved = store.get(STATE_KEY) as PaneItem | null | undefined;
		if (saved && typeof saved.id === "string") setItem(saved);
		setRestored(true);
		const flush = () => store.flush();
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	}, [store]);
	const remember = useCallback((next: PaneItem | null) => {
		setItem(next);
		if (next) {
			const { jump: _jump, ...kept } = next;
			store.set(STATE_KEY, kept);
		} else store.set(STATE_KEY, null);
	}, [store]);
	const open = useCallback((next: PaneItem) => {
		remember(next);
		setOpenCount((n) => n + 1);
		void fetch(`/api/library/items/${next.id}/opened`, { method: "POST" }).catch(() => {});
	}, [remember]);
	const close = useCallback(() => remember(null), [remember]);
	// A PDF's first chunk, pdf.js and its worker start as it opens, beside the pane's
	// and the reader's own code (feature 024). A layout effect, so it runs before the
	// reader's passive effect takes them, even when that code is already here.
	const pdfId = item?.kind === "pdf" ? item.id : null;
	useLayoutEffect(() => { if (pdfId) preloadPdf(pdfId); }, [pdfId]);
	const value = useMemo(() => ({ item, restored, openCount, open, close, update: remember }), [item, restored, openCount, open, close, remember]);
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

/** The kinds the pane shows. Images open in a new tab; `other` downloads. */
export const opensInPane = (kind: LibraryKind) => kind !== "image" && kind !== "other";
