"use client";

/** The open page's links (feature 016): the catalog they resolve against, kept
 *  fresh, with a stable bridge the editor's node views read. A failed refresh
 *  keeps the last good catalog. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerEvent, useServerResync } from "@/components/server-events";
import type { LibraryItem, LibraryTombstone } from "@/src/core";
import { isTombstone } from "@/src/core";
import { resolveWikiTarget, wikiTable, type WikiResolution, type WikiTable } from "@/src/core";
import type { WikiBridge } from "./page-note-views.ts";

interface SourceRow { chatId: string; messageId: string | null; title: string | null; gone: boolean; href: string }
interface WikiCatalog { entries: (LibraryItem | LibraryTombstone)[]; pins: Record<string, string>; sources: SourceRow[] }

export function useNoteLinks(pageId: string, onFollow: (target: string, resolution: WikiResolution | null) => void) {
	const [catalog, setCatalog] = useState<WikiCatalog | null>(null);
	const [failed, setFailed] = useState(false);
	const listeners = useRef(new Set<() => void>());
	const current = useRef<{ table: WikiTable; pins: Record<string, string> } | null>(null);
	const follow = useRef(onFollow);
	follow.current = onFollow;
	const request = useRef(0);
	const refresh = useCallback(async () => {
		const id = ++request.current;
		try {
			const response = await fetch(`/api/library/wiki?page=${encodeURIComponent(pageId)}`, { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = await response.json() as WikiCatalog;
			if (id !== request.current) return;
			current.current = { table: wikiTable(body.entries), pins: body.pins };
			setCatalog(body);
			setFailed(false);
			for (const listener of listeners.current) listener();
		} catch {
			if (id === request.current) setFailed(true);
		}
	}, [pageId]);
	useEffect(() => { void refresh(); }, [refresh]);
	useServerEvent("library-changed", () => { void refresh(); });
	useServerResync(() => { void refresh(); });

	const bridge = useMemo<WikiBridge>(() => {
		const resolve = (target: string) => (current.current ? resolveWikiTarget(target, current.current.table, current.current.pins) : null);
		return {
			resolve,
			subscribe: (listener) => { listeners.current.add(listener); return () => listeners.current.delete(listener); },
			follow: (target) => follow.current(target, resolve(target)),
		};
	}, []);

	const items = useMemo(() => (catalog?.entries ?? []).filter((entry): entry is LibraryItem => !isTombstone(entry) && !entry.archivedAt && entry.id !== pageId), [catalog, pageId]);
	const goneSessions = useMemo(() => new Set((catalog?.sources ?? []).filter((row) => row.gone).map((row) => row.chatId)), [catalog]);
	const status = catalog ? (items.length === 0 ? "Your Library has no other pages yet." : null) : failed ? "Your Library could not be loaded." : "Loading your Library…";
	const wikiMenu = useCallback(() => ({ items, status }), [items, status]);
	return { bridge, wikiMenu, goneSessions };
}

/** Same session: a native hash change, which the transcript's navigator hears.
 *  Elsewhere: a route change, which lands on the hash on arrival. */
export function jumpToSource(href: string, push: (href: string) => void) {
	const [path, hash] = href.split("#");
	if (path === window.location.pathname && hash) {
		if (window.location.hash === `#${hash}`) window.dispatchEvent(new HashChangeEvent("hashchange"));
		else window.location.hash = hash;
		return;
	}
	push(href);
}
