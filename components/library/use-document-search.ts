"use client";

/** One search at a time, debounced, for the Library's panel and the palette
 *  (feature 019). A failed refresh keeps the last results. Loads only with them. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { DOC_QUERY_MIN_CHARS, parseDocQuery, type DocSearchResponse, type LibraryKind } from "@/src/core";

export interface DocSearchInput { query: string; kind?: LibraryKind | null; tag?: string | null; folderId?: string | null; hideArchived?: boolean; limit?: number }
export type DocSearchPhase = "idle" | "searching" | "done" | "failed";

const DEBOUNCE_MS = 220;

export function useDocumentSearch({ query, kind, tag, folderId, hideArchived, limit }: DocSearchInput, enabled = true) {
	const [response, setResponse] = useState<DocSearchResponse | null>(null);
	const [phase, setPhase] = useState<DocSearchPhase>("idle");
	const request = useRef(0);
	const usable = enabled && parseDocQuery(query) !== null;
	const url = (() => {
		const params = new URLSearchParams({ q: query });
		if (kind) params.set("kind", kind);
		if (tag) params.set("tag", tag);
		if (folderId) params.set("folder", folderId);
		if (hideArchived) params.set("archived", "hide");
		if (limit) params.set("limit", String(limit));
		return `/api/library/search?${params}`;
	})();
	const run = useCallback(async (target: string) => {
		const id = ++request.current;
		setPhase("searching");
		try {
			const res = await fetch(target, { cache: "no-store" });
			if (!res.ok) throw new Error(String(res.status));
			const body = await res.json() as DocSearchResponse;
			if (id !== request.current) return;
			setResponse(body);
			setPhase("done");
		} catch {
			if (id === request.current) setPhase("failed");
		}
	}, []);
	useEffect(() => {
		if (!usable) { request.current++; setPhase("idle"); setResponse(null); return; }
		const timer = window.setTimeout(() => void run(url), DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [usable, url, run]);
	const again = useCallback(() => { if (usable) void run(url); }, [usable, url, run]);
	useServerEvent("library-index-changed", again);
	useServerEvent("library-changed", again);
	useServerResync(again);
	return { response, phase, retry: again, tooShort: enabled && query.trim().length > 0 && !usable, minChars: DOC_QUERY_MIN_CHARS };
}
