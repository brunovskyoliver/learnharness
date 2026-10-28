"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname } from "next/navigation";
import type { ChatListItem } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { createSidebarRefresh } from "@/components/sidebar-refresh";

/**
 * The session list (feature 002): one `/api/chats` snapshot shared by the
 * sidebar and Home's "Waiting for you" list, so Home adds no request and
 * answering a check updates both. Lifted out of SessionsSidebar unchanged:
 * the seed, the coalesced refresh, same-tab instants and server events.
 *
 * Readers declare demand with useSessionListDemand; the list refetches on
 * navigation only while someone reads it (the sidebar while open, Home's
 * list while mounted) — one fetch however many readers there are.
 */
interface SessionListValue {
	/** null until the first load (or seed) lands. */
	chats: ChatListItem[] | null;
	/** The last refresh failed; `chats` keeps the seed or last good snapshot. */
	loadError: boolean;
	refresh: () => Promise<void>;
	setChats: Dispatch<SetStateAction<ChatListItem[] | null>>;
	setDemand: Dispatch<SetStateAction<number>>;
}

const SessionListContext = createContext<SessionListValue | null>(null);

export function useSessionList(): Omit<SessionListValue, "setDemand"> {
	const value = useContext(SessionListContext);
	if (!value) throw new Error("useSessionList outside SessionListProvider");
	return value;
}

/** Keep the list fresh across navigation while `active`. */
export function useSessionListDemand(active: boolean) {
	const value = useContext(SessionListContext);
	const setDemand = value?.setDemand;
	useEffect(() => {
		if (!active || !setDemand) return;
		setDemand((n) => n + 1);
		return () => setDemand((n) => n - 1);
	}, [active, setDemand]);
}

/** Reuse rows when a refresh has no field changes. */
export function reconcileChatSnapshot(previous: ChatListItem[] | null, next: ChatListItem[]): ChatListItem[] {
	if (!previous) return next;
	const byId = new Map(previous.map((chat) => [chat.id, chat]));
	const reconciled = next.map((chat) => {
		const old = byId.get(chat.id);
		return old && JSON.stringify(old) === JSON.stringify(chat) ? old : chat;
	});
	return previous.length === reconciled.length && reconciled.every((chat, i) => chat === previous[i]) ? previous : reconciled;
}

export function SessionListProvider({ initialChats, children }: { initialChats?: ChatListItem[]; children: React.ReactNode }) {
	const [chats, setChats] = useState<ChatListItem[] | null>(() => initialChats ?? null);
	const [loadError, setLoadError] = useState(false);
	const [demand, setDemand] = useState(0);
	const pathname = usePathname();

	const refresh = useMemo(() => createSidebarRefresh(async () => {
		try {
			const res = await fetch("/api/chats", { cache: "no-store" });
			if (!res.ok) throw new Error("Could not load sessions");
			const d = (await res.json()) as { chats: ChatListItem[] };
			if (!Array.isArray(d.chats)) throw new Error("Invalid sessions response");
			setChats((previous) => reconcileChatSnapshot(previous, d.chats));
			setLoadError(false);
		} catch {
			// A failed refresh retains the seed or last successful snapshot.
			setLoadError(true);
		}
	}), []);

	/* Instant rename propagation (2026-09-17): the chat header's rename
	   commits dispatch lh:chat-renamed; patch the snapshot in place instead
	   of waiting for a refetch. */
	useEffect(() => {
		const onRenamed = (e: Event) => {
			const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
			setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, title } : c)) : prev));
		};
		window.addEventListener("lh:chat-renamed", onRenamed);
		return () => window.removeEventListener("lh:chat-renamed", onRenamed);
	}, []);

	/* INSTANT TURN-STATE (owner, sidebar round 2026-10-02): the open
	   session broadcasts lh:turn-state the instant its turn starts
	   (submitted — the optimistic machine's own flip) and at settle —
	   busy mirrors the server's own definition (isTurnRunning), so the
	   patch is exact: spinner up the moment the action happens, cleared
	   and refetched once at settle (title/order move with turns). The
	   events channel is the backstop for everything only the server
	   knows: other windows, wake turns in unopened sessions. A start on
	   a chat not yet in the snapshot (a brand-new session) = one
	   immediate refresh instead of a patch. */
	const chatsRef = useRef(chats);
	chatsRef.current = chats;
	useEffect(() => {
		const onTurnState = (e: Event) => {
			const { id, running } = (e as CustomEvent<{ id: string; running: boolean }>).detail;
			if (running) {
				if (chatsRef.current?.some((c) => c.id === id)) {
					setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, busy: true } : c)) : prev));
				} else {
					void refresh(); // the brand-new session: it isn't in the snapshot yet
				}
				return;
			}
			setChats((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, busy: false } : c)) : prev));
			void refresh(); // settle: the server snapshot is now truthful — land it now
		};
		window.addEventListener("lh:turn-state", onTurnState);
		return () => window.removeEventListener("lh:turn-state", onTurnState);
	}, [refresh]);

	/* PUSH (architecture S6, 2026-10-02): no poll — list truth arrives as
	   events: chats-changed (create/rename/delete — the list-SHAPE
	   writes), and turn-started/turn-settled for EVERY chat (unfiltered:
	   any chat's turn flips busy/order/phase in this list). Announced
	   fetches ride the 250ms trailing debounce (the S4/S5 law); resync
	   (reconnect / dev-restart) is immediate. lh:turn-state +
	   lh:chat-renamed stay for same-tab INSTANTS — local beats any
	   round-trip. */
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	const eventDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const scheduleEventRefresh = () => {
		if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current);
		eventDebounceRef.current = setTimeout(() => {
			eventDebounceRef.current = undefined;
			void refreshRef.current();
		}, 250);
	};
	useServerEvent("chats-changed", scheduleEventRefresh);
	useServerEvent("turn-started", scheduleEventRefresh);
	useServerEvent("turn-settled", scheduleEventRefresh);
	useServerEvent("compaction-changed", scheduleEventRefresh);
	useServerResync(() => void refreshRef.current());
	useEffect(
		() => () => {
			if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current);
		},
		[],
	);

	// Opening a reader + navigation refetch; while read, the events channel
	// owns freshness (S6) — no interval, nothing standing.
	const wanted = demand > 0;
	useEffect(() => {
		if (!wanted) return;
		void refresh();
	}, [wanted, pathname, refresh]);

	const value = useMemo(() => ({ chats, loadError, refresh, setChats, setDemand }), [chats, loadError, refresh]);
	return <SessionListContext.Provider value={value}>{children}</SessionListContext.Provider>;
}
