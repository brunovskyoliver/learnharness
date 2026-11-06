"use client";

/**
 * Notebook's reads (feature 024): the Library list behind the sidebar and
 * the title, and one note's companion (mode, reviewer, later threads).
 * Notify-then-fetch: server events say what changed, these refetch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { applyCompanionPatch, type CompanionPatch, type LibraryFolder, type LibraryItem, type NoteCompanion, type NoteMode } from "@/src/core";

export interface LibraryList { items: LibraryItem[]; folders: LibraryFolder[] }

/** Live pages and folders; null until the first read. `failed` keeps the last list. */
export function useLibraryList(): { list: LibraryList | null; failed: boolean; refresh: () => Promise<void> } {
	const [list, setList] = useState<LibraryList | null>(null);
	const [failed, setFailed] = useState(false);
	const request = useRef(0);
	const refresh = useCallback(async () => {
		const id = ++request.current;
		try {
			const response = await fetch("/api/library", { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = (await response.json()) as { items?: LibraryItem[]; folders?: LibraryFolder[] };
			if (id !== request.current) return;
			setList({ items: body.items ?? [], folders: body.folders ?? [] });
			setFailed(false);
		} catch {
			if (id === request.current) setFailed(true);
		}
	}, []);
	useEffect(() => { void refresh(); }, [refresh]);
	useServerEvent("library-changed", () => { void refresh(); });
	useServerResync(() => { void refresh(); });
	return { list, failed, refresh };
}

export interface CompanionView {
	companion: NoteCompanion | null;
	/** The note's mode, the settings' start mode until the companion says otherwise. */
	mode: NoteMode;
	patch: (patch: CompanionPatch) => Promise<boolean>;
	/** Reads the companion again (after a thread write). */
	reload: () => void;
}

/** GET/PATCH /api/notebook/:pageId, refetched on `notebook-changed` for this page. */
export function useCompanion(pageId: string, startMode: NoteMode): CompanionView {
	const [companion, setCompanion] = useState<NoteCompanion | null>(null);
	const [effective, setEffective] = useState<NoteMode | null>(null);
	const request = useRef(0);
	const load = useCallback(async () => {
		const id = ++request.current;
		try {
			const response = await fetch(`/api/notebook/${encodeURIComponent(pageId)}`, { cache: "no-store" });
			if (!response.ok) return;
			const body = (await response.json()) as { companion: NoteCompanion; effective?: { mode?: NoteMode } };
			if (id !== request.current) return;
			setCompanion(body.companion);
			setEffective(body.effective?.mode ?? null);
		} catch {
			/* the toolbar keeps the start mode until the next event */
		}
	}, [pageId]);
	useEffect(() => { void load(); }, [load]);
	useServerEvent("notebook-changed", (event) => { if (event.pageId === pageId) void load(); });
	useServerResync(() => { void load(); });

	const patch = useCallback(async (change: CompanionPatch) => {
		++request.current; // a read in flight must not undo the change shown below
		setCompanion((current) => (current ? applyCompanionPatch(current, change) : current));
		if (change.mode !== undefined) setEffective(change.mode);
		try {
			const response = await fetch(`/api/notebook/${encodeURIComponent(pageId)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(change),
			});
			if (!response.ok) {
				void load();
				return false;
			}
			const body = (await response.json()) as { companion: NoteCompanion };
			setCompanion(body.companion);
			return true;
		} catch {
			void load();
			return false;
		}
	}, [pageId, load]);

	const reload = useCallback(() => { void load(); }, [load]);
	return { companion, mode: companion?.mode ?? effective ?? startMode, patch, reload };
}
