"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SessionAccountContext } from "@/components/session-state";
import { SessionStateStore } from "@/components/session-state-store";
import type { LibraryKind } from "@/src/core";

/** What the pane has open. Small and free of the editor, so it can sit in the
 *  layout; the pane itself loads on the first open (research R14). */
export interface PaneItem { id: string; name: string; kind: LibraryKind; size: number }

export interface PagePaneApi {
	item: PaneItem | null;
	/** Bumps on every explicit open: the most recent open wins over a demo. */
	openCount: number;
	open: (item: PaneItem) => void;
	close: () => void;
	/** The open item was renamed, or changed size. */
	update: (item: PaneItem) => void;
}

const PagePaneContext = createContext<PagePaneApi | null>(null);

/** Null outside the app shell (render tests, previews). */
export function usePagePane() {
	return useContext(PagePaneContext);
}

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

const NEW_PAGE_NAME = "Untitled page";

/** A new empty page, stepping past a taken name. Null with the reason on failure. */
export async function createBlankPage(): Promise<{ item: PaneItem } | { error: string }> {
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
		return { item: ((await response.json()) as { item: PaneItem }).item };
	} catch {
		return { error: "The page could not be created. Check your connection and try again." };
	}
}
