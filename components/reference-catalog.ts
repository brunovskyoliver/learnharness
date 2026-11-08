"use client";

/**
 * What a reference's item is now (feature 027, research R8): live, in the
 * trash, deleted for good, removed from its repo (feature 026), or unknown when
 * the Library could not be read. One shared, short-lived read of the live list
 * (the TTL the reference rows used), refreshed on `library-changed`; ids it
 * lacks are looked up once per TTL in the Trash entries.
 *
 * Outside components/library on purpose: the transcript loads this, the
 * composer never does (tests/startup-module-graph.test.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { useNotifyHub } from "@/components/server-events";
import type { ChipState, LibraryFolder, LibraryItem, LibraryKind, LibraryTombstone, LibraryTrashEntry } from "@/src/core";

export const CATALOG_TTL_MS = 30_000;

export interface LiveLibrary {
	items: LibraryItem[];
	folders: LibraryFolder[];
	byId: Map<string, LibraryItem>;
	/** Files removed from a linked repo (feature 026), by id: the paths a sent
	 *  message may name them by. */
	removed: Map<string, readonly string[]>;
	/** What a tutor reply's `@name` is recognised against (US3): the live items,
	 *  then each name the server still resolves to a tombstone (in the Trash,
	 *  deleted for good, or a removed file's paths). */
	entries: (LibraryItem | LibraryTombstone)[];
}

type ListBody = { items: LibraryItem[]; folders?: LibraryFolder[]; gone?: { id: string; name: string; kind: LibraryKind }[]; removed?: { id: string; kind?: LibraryKind; names: string[] }[] };

export interface ItemStatus {
	state: ChipState;
	/** Live: the item as it is now. */
	item?: LibraryItem;
	/** Trashed: the entry that holds it. */
	trashEntryId?: string;
	/** Removed from its repo: the paths it was named by. */
	paths?: readonly string[];
}

/** What a caller knows of the reference: the id, and whether it came from a repo (026's `fromRepo`). */
export interface CatalogQuery { itemId: string; fromRepo?: boolean }

interface Cached<T> { at: number; value: Promise<T | null> }
let live: Cached<LiveLibrary> | null = null;
let trash: Cached<LibraryTrashEntry[]> | null = null;
const listeners = new Set<() => void>();

const fresh = (cached: Cached<unknown> | null) => cached !== null && Date.now() - cached.at <= CATALOG_TTL_MS;

async function readJson<T>(url: string): Promise<T | null> {
	try {
		const response = await fetch(url, { cache: "no-store" });
		return response.ok ? (await response.json()) as T : null;
	} catch {
		// A failed read is `unknown`, never `deleted` (constitution IV).
		return null;
	}
}

/** The live list, shared by every caller within the TTL. Null when it can't be read. */
export function liveLibrary(): Promise<LiveLibrary | null> {
	if (!live || !fresh(live)) {
		live = {
			at: Date.now(),
			value: readJson<ListBody>("/api/library").then((body) => body && {
				items: body.items,
				folders: body.folders ?? [],
				byId: new Map(body.items.map((item) => [item.id, item])),
				removed: new Map((body.removed ?? []).map((entry) => [entry.id, entry.names])),
				entries: [
					...body.items,
					...(body.gone ?? []).map(({ id, name, kind }): LibraryTombstone => ({ id, name, kind, deletedAt: "" })),
					...(body.removed ?? []).flatMap(({ id, kind, names }) => names.map((name): LibraryTombstone => ({ id, name, kind: kind ?? "text", deletedAt: "" }))),
				],
			}),
		};
	}
	return live.value;
}

function trashEntries(): Promise<LibraryTrashEntry[] | null> {
	if (!trash || !fresh(trash)) trash = { at: Date.now(), value: readJson<{ entries: LibraryTrashEntry[] }>("/api/library/trash").then((body) => body?.entries ?? null) };
	return trash.value;
}

/** Drops both reads, so the next caller fetches again, and tells the hooks. */
export function invalidateCatalog(): void {
	live = null;
	trash = null;
	for (const listener of listeners) listener();
}

/** Each id's state. The Trash is read only for ids the live list lacks. */
export async function itemStatuses(queries: readonly CatalogQuery[]): Promise<Map<string, ItemStatus>> {
	const out = new Map<string, ItemStatus>();
	if (queries.length === 0) return out;
	const list = await liveLibrary();
	if (!list) {
		for (const { itemId } of queries) out.set(itemId, { state: "unknown" });
		return out;
	}
	const missing = queries.filter(({ itemId }) => !list.byId.has(itemId) && !list.removed.has(itemId));
	const entries = missing.length > 0 ? await trashEntries() : [];
	for (const { itemId, fromRepo } of queries) {
		const item = list.byId.get(itemId);
		if (item) { out.set(itemId, { state: "live", item }); continue; }
		// Mirrored items can't be trashed (026); gone, they read "Removed from the repo".
		const paths = list.removed.get(itemId);
		if (paths) { out.set(itemId, { state: "removed", paths }); continue; }
		if (!entries) { out.set(itemId, { state: "unknown" }); continue; }
		const entry = entries.find((each) => each.items.some((held) => held.id === itemId));
		out.set(itemId, entry ? { state: "trashed", trashEntryId: entry.id } : { state: fromRepo ? "removed" : "deleted" });
	}
	return out;
}

export interface ReferenceCatalog {
	/** Null until the first read settles. */
	statuses: Map<string, ItemStatus> | null;
	/** The folders of the live list (empty when it couldn't be read), for paths. */
	folders: LibraryFolder[];
}

/** Bumps when the Library changes (or the catalog is dropped), so hooks read again. */
function useCatalogGeneration(): number {
	const [generation, setGeneration] = useState(0);
	useEffect(() => {
		const bump = () => setGeneration((n) => n + 1);
		listeners.add(bump);
		return () => { listeners.delete(bump); };
	}, []);
	// Outside the app shell (render tests) there are no server events.
	const hub = useNotifyHub();
	useEffect(() => {
		if (!hub) return;
		const off = hub.subscribe("library-changed", invalidateCatalog);
		const offResync = hub.onResync(invalidateCatalog);
		return () => { off(); offResync(); };
	}, [hub]);
	return generation;
}

/** The states of `queries`, re-read when the Library changes. Fetches nothing for none. */
export function useReferenceCatalog(queries: readonly CatalogQuery[]): ReferenceCatalog {
	const key = queries.map((q) => `${q.itemId}${q.fromRepo ? "!" : ""}`).join("\n");
	const stable = useMemo((): CatalogQuery[] => (key ? key.split("\n").map((line) => (line.endsWith("!") ? { itemId: line.slice(0, -1), fromRepo: true } : { itemId: line })) : []), [key]);
	const [state, setState] = useState<ReferenceCatalog>({ statuses: null, folders: [] });
	const generation = useCatalogGeneration();
	useEffect(() => {
		if (stable.length === 0) return;
		let current = true;
		void Promise.all([itemStatuses(stable), liveLibrary()]).then(([statuses, list]) => {
			if (current) setState({ statuses, folders: list?.folders ?? [] });
		});
		return () => { current = false; };
	}, [stable, generation]);
	return state;
}

/** The live list, read only while `enabled` (a reply that names something):
 *  undefined until it settles, null when it can't be read. */
export function useLiveLibrary(enabled: boolean): LiveLibrary | null | undefined {
	const [list, setList] = useState<LiveLibrary | null | undefined>(undefined);
	const generation = useCatalogGeneration();
	useEffect(() => {
		if (!enabled) return;
		let current = true;
		void liveLibrary().then((value) => { if (current) setList(value); });
		return () => { current = false; };
	}, [enabled, generation]);
	return enabled ? list : undefined;
}
