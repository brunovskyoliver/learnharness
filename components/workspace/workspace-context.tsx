"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { usePagePane } from "./pane-context";
import { SessionAccountContext } from "@/components/session-state";
import { SessionStateStore, WORKSPACE_STATE_ID } from "@/components/session-state-store";
import { useSessionList, useSessionListDemand } from "@/components/session-list";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { chatIdOfPath, closeTab, itemTab, itemTabId, kbdEventForAction, openTab, parseTabs, reconcileItemTabs, reconcileSessionTabs, selectedTabId, sessionTab, sessionTabId, tabRef, UNTITLED_SESSION, type LibraryItem, type LibraryKind, type WorkspaceTab } from "@/src/core";

const DESKTOP_QUERY = "(min-width: 768px)";

/** A Library item, by whichever door it comes through. */
export type OpenableItem = { id: string; name: string; kind: LibraryKind; size: number };

export interface WorkspaceApi {
	tabs: WorkspaceTab[];
	/** The one selected tab. */
	selectedId: string | null;
	/** Everything on screen, the selected tab included. */
	shownIds: readonly string[];
	/** A tab's route is loading. */
	pendingId: string | null;
	activate: (tab: WorkspaceTab) => void;
	close: (id: string) => void;
	openItem: (item: OpenableItem) => void;
	/** This route can show the right pane. */
	paneRoute: boolean;
	/** Something is in the pane, rather than nothing or the context view. */
	occupied: boolean;
	setDemoOpen: (open: boolean) => void;
	/** Hidden on wide screens; the page or demo stays mounted. */
	paneCollapsed: boolean;
	contextOpen: boolean;
	closeContext: () => void;
	expandPane: () => void;
	toggleRightPane: () => void;
	rightPaneVisible: boolean;
	libraryOpen: boolean;
	toggleLibrary: () => void;
	expandedFolders: ReadonlySet<string>;
	toggleFolder: (id: string, open?: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

/** Null outside the app shell (render tests, previews). */
export function useWorkspace() {
	return useContext(WorkspaceContext);
}

export const NEW_TAB_ITEM_KINDS: readonly LibraryKind[] = ["pdf", "image"];

/** PDF and images open in a browser tab, and anything else the pane can't show
 *  downloads: the Library row's three doors, for callers without an anchor. */
function openOutsidePane(item: OpenableItem) {
	const newTab = NEW_TAB_ITEM_KINDS.includes(item.kind);
	const anchor = document.createElement("a");
	anchor.href = `/api/library/items/${encodeURIComponent(item.id)}/content${newTab ? "" : "?download=1"}`;
	if (newTab) { anchor.target = "_blank"; anchor.rel = "noreferrer"; }
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	void fetch(`/api/library/items/${encodeURIComponent(item.id)}/opened`, { method: "POST" }).catch(() => {});
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const account = useContext(SessionAccountContext);
	const store = useMemo(() => new SessionStateStore(account ?? "signed-out", WORKSPACE_STATE_ID, () => (account && typeof window !== "undefined" ? window.localStorage : undefined)), [account]);
	const router = useRouter();
	const pathname = usePathname();
	const pane = usePagePane();
	const { chats } = useSessionList();
	const chatId = chatIdOfPath(pathname);
	const paneRoute = chatId !== null || pathname === "/library";
	const paneItemId = pane?.item?.id ?? null;

	const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
	const [restored, setRestored] = useState(false);
	const [last, setLast] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [routing, startRouting] = useTransition();
	const [paneCollapsed, setPaneCollapsed] = useState(false);
	const [contextOpen, setContextOpen] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const [expanded, setExpanded] = useState<string[]>([]);
	const [demoOpen, setDemoOpen] = useState(false);

	// Saved state arrives after hydration, so server and first client render agree.
	useEffect(() => {
		setTabs(parseTabs(store.get("tabs")));
		setPaneCollapsed(store.get("paneCollapsed") === true);
		setContextOpen(store.get("contextOpen") === true);
		setLibraryOpen(store.get("libraryOpen") === true);
		const saved = store.get("expandedFolders");
		setExpanded(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
		setRestored(true);
		// The reserved band has done its job; the strip now answers for itself.
		document.getElementById("lh-tabs-bootstrap")?.remove();
		const flush = () => store.flush();
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", flush);
			flush();
		};
	}, [store]);
	useEffect(() => { if (restored) store.set("tabs", tabs); }, [restored, store, tabs]);

	const routeTabId = chatId === null ? null : sessionTabId(chatId);
	const paneTabId = paneItemId === null ? null : itemTabId(paneItemId);
	const keep = useRef<string[]>([]);
	keep.current = [routeTabId, paneTabId].filter((id): id is string => id !== null);

	// Visiting a session or opening an item is what opens its tab.
	const listed = chatId === null ? undefined : chats?.find((chat) => chat.id === chatId);
	useEffect(() => {
		if (!restored || chatId === null) return;
		setTabs((current) => {
			const existing = current.find((tab) => tab.id === sessionTabId(chatId));
			if (existing && !listed) return current;
			return openTab(current, sessionTab(chatId, listed?.title ?? UNTITLED_SESSION, listed?.kind === "practice" ? "practice" : "teach"), keep.current);
		});
		setLast(sessionTabId(chatId));
	}, [restored, chatId, listed?.title, listed?.kind]);
	// A session not listed yet still needs its title, even with the sidebar closed.
	useSessionListDemand(restored && chatId !== null && !listed);

	const paneItem = pane?.item ?? null;
	useEffect(() => {
		if (!restored || !paneItem) return;
		setTabs((current) => openTab(current, itemTab(paneItem), keep.current));
	}, [restored, paneItem]);
	const openCount = pane?.openCount ?? 0;
	useEffect(() => {
		if (openCount === 0 || paneItemId === null) return;
		setLast(itemTabId(paneItemId));
		setPaneCollapsed(false);
		store.set("paneCollapsed", false);
	}, [openCount]);

	// Titles follow the list; a deleted session's tab goes.
	useEffect(() => {
		if (!restored || !chats) return;
		setTabs((current) => reconcileSessionTabs(current, chats, chatId));
	}, [restored, chats, chatId]);

	// The same for items. Only fetched while an item tab exists.
	const hasItemTabs = tabs.some((tab) => tab.kind === "item");
	const paneItemRef = useRef(paneItemId);
	paneItemRef.current = paneItemId;
	const syncItems = useCallback(async () => {
		try {
			const response = await fetch("/api/library", { cache: "no-store" });
			if (!response.ok) return; // A failed check keeps every tab.
			const body = await response.json() as { items: LibraryItem[] };
			setTabs((current) => reconcileItemTabs(current, body.items, paneItemRef.current));
		} catch { /* A failed check keeps every tab. */ }
	}, []);
	useEffect(() => { if (restored && hasItemTabs) void syncItems(); }, [restored, hasItemTabs, syncItems]);
	useServerEvent("library-changed", () => { if (hasItemTabs) void syncItems(); });
	useServerResync(() => { if (hasItemTabs) void syncItems(); });

	useEffect(() => { if (!routing) setPendingId(null); }, [routing]);

	const navigate = useCallback((href: string, tabId: string | null) => {
		setPendingId(tabId);
		startRouting(() => router.push(href));
	}, [router]);

	const expandPane = useCallback(() => {
		setPaneCollapsed(false);
		store.set("paneCollapsed", false);
	}, [store]);

	const openItem = useCallback((item: OpenableItem) => {
		const readable = item.kind !== "pdf" && item.kind !== "image" && item.kind !== "other";
		if (!readable) { openOutsidePane(item); return; }
		if (paneItemId === item.id) { setLast(itemTabId(item.id)); expandPane(); }
		else pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size });
		// The pane follows the learner; Home and new drafts have no room for it.
		if (!paneRoute) navigate("/library", itemTabId(item.id));
	}, [pane, paneItemId, paneRoute, navigate, expandPane]);

	const activate = useCallback((tab: WorkspaceTab) => {
		if (tab.kind === "item") {
			openItem({ id: tabRef(tab), name: tab.title, kind: tab.itemKind ?? "markdown", size: tab.size ?? 0 });
			return;
		}
		setLast(tab.id);
		if (tab.id !== routeTabId) navigate(`/chat/${encodeURIComponent(tabRef(tab))}`, tab.id);
	}, [openItem, navigate, routeTabId]);

	const close = useCallback((id: string) => {
		const { tabs: next, neighbour } = closeTab(tabs, id);
		setTabs(next);
		if (id === paneTabId) pane?.close();
		// Closing a session detaches the view; a running turn carries on.
		if (id === routeTabId) navigate(neighbour ? `/chat/${encodeURIComponent(tabRef(neighbour))}` : "/", neighbour?.id ?? null);
	}, [tabs, paneTabId, routeTabId, pane, navigate]);

	const occupied = paneItemId !== null || demoOpen;
	const closeContext = useCallback(() => { setContextOpen(false); store.set("contextOpen", false); }, [store]);
	const toggleRightPane = useCallback(() => {
		if (!window.matchMedia(DESKTOP_QUERY).matches) return; // Phones use a full-screen layer.
		if (occupied) {
			const next = !paneCollapsed;
			if (next) {
				// Focus must not vanish with the pane.
				const within = document.activeElement?.closest("[data-workspace-pane]");
				if (within) document.querySelector<HTMLElement>('[data-testid="right-pane-toggle"]')?.focus();
			}
			setPaneCollapsed(next);
			store.set("paneCollapsed", next);
			return;
		}
		if (!paneRoute) return;
		const next = !contextOpen;
		setContextOpen(next);
		store.set("contextOpen", next);
	}, [occupied, paneCollapsed, paneRoute, contextOpen, store]);
	useEffect(() => {
		const event = kbdEventForAction("toggle-right-pane");
		window.addEventListener(event, toggleRightPane);
		return () => window.removeEventListener(event, toggleRightPane);
	}, [toggleRightPane]);

	const toggleLibrary = useCallback(() => {
		setLibraryOpen((open) => { store.set("libraryOpen", !open); return !open; });
	}, [store]);
	const toggleFolder = useCallback((id: string, open?: boolean) => {
		setExpanded((current) => {
			const isOpen = current.includes(id);
			const want = open ?? !isOpen;
			if (want === isOpen) return current;
			const next = want ? [...current, id] : current.filter((other) => other !== id);
			store.set("expandedFolders", next);
			return next;
		});
	}, [store]);

	const shownIds = useMemo(() => [routeTabId, paneTabId].filter((id): id is string => id !== null), [routeTabId, paneTabId]);
	const expandedFolders = useMemo(() => new Set(expanded), [expanded]);
	const selectedId = selectedTabId(tabs, [routeTabId, paneTabId], last);
	const rightPaneVisible = occupied ? !paneCollapsed : paneRoute && contextOpen;

	const value = useMemo<WorkspaceApi>(() => ({
		tabs, selectedId, shownIds, pendingId, activate, close, openItem, paneRoute, occupied, setDemoOpen, paneCollapsed, contextOpen, closeContext, expandPane, toggleRightPane, rightPaneVisible, libraryOpen, toggleLibrary, expandedFolders, toggleFolder,
	}), [tabs, selectedId, shownIds, pendingId, activate, close, openItem, paneRoute, occupied, paneCollapsed, contextOpen, closeContext, expandPane, toggleRightPane, rightPaneVisible, libraryOpen, toggleLibrary, expandedFolders, toggleFolder]);
	return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
