/** What the Library shows (features 012-013): pure, so every view, sort and
 *  filter is tested without a browser. */
import { liveFolderId, nameKey, type LibraryFolder, type LibraryItem, type LibraryKind } from "@/src/core";

export type LibraryViewName = "all" | "favorites" | "recent" | "archive" | "trash";
export type LibrarySort = "name" | "updated" | "created" | "size" | "kind";
export type LibraryLayout = "list" | "grid";

export const VIEW_LABELS: Record<LibraryViewName, string> = { all: "All", favorites: "Favorites", recent: "Recent", archive: "Archive", trash: "Trash" };
export const SORT_LABELS: Record<LibrarySort, string> = { name: "Name", updated: "Last changed", created: "Date added", size: "Size", kind: "Type" };

export interface LibraryQuery {
	view: LibraryViewName;
	folderId: string | null;
	search: string;
	tag: string | null;
	kind: LibraryKind | null;
	sort: LibrarySort;
	descending: boolean;
	recentIds: readonly string[];
}

export const parseView = (raw: string | null): LibraryViewName => (raw && Object.hasOwn(VIEW_LABELS, raw) ? raw as LibraryViewName : "all");

const compareItems = (sort: LibrarySort) => (a: LibraryItem, b: LibraryItem): number => {
	switch (sort) {
		case "updated": return a.updatedAt.localeCompare(b.updatedAt);
		case "created": return a.createdAt.localeCompare(b.createdAt);
		case "size": return a.size - b.size;
		case "kind": return a.kind.localeCompare(b.kind);
		default: return a.name.localeCompare(b.name);
	}
};

/** Pinned first, always; the direction only applies inside each group. */
function ordered<T extends { pinned?: boolean }>(list: readonly T[], compare: (a: T, b: T) => number, descending: boolean): T[] {
	return [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (descending ? compare(b, a) : compare(a, b)));
}

/** The folders and items one view shows. A search or tag covers the whole
 *  Library; otherwise "all" and "archive" stay on one level. */
export function selectEntries(items: readonly LibraryItem[], folders: readonly LibraryFolder[], q: LibraryQuery): { folders: LibraryFolder[]; items: LibraryItem[] } {
	if (q.view === "trash") return { folders: [], items: [] };
	if (q.view === "recent") {
		const recent = q.recentIds.flatMap((id) => items.find((item) => item.id === id) ?? []);
		return { folders: [], items: recent.filter((i) => matches(i, q)) };
	}
	const key = nameKey(q.search.trim());
	const wide = Boolean(key || q.tag || q.kind || q.view === "favorites");
	const hiddenUnder = archivedSubtree(folders);
	const inScope = (archivedAt: string | undefined, home: string | null | undefined, ownId?: string) => {
		const archived = Boolean(archivedAt) || Boolean(home && hiddenUnder.has(home)) || Boolean(ownId && hiddenUnder.has(ownId));
		if (q.view === "archive" ? !wide && !q.folderId ? !archivedAt : !archived : archived) return false;
		return wide || liveFolderId(home, folders) === q.folderId;
	};
	const shownItems = items.filter((i) => inScope(i.archivedAt, i.folderId) && matches(i, q) && (q.view !== "favorites" || i.favorite));
	const shownFolders = q.tag || q.kind ? [] : folders.filter((f) => inScope(f.archivedAt, f.parentId, f.id) && (!key || nameKey(f.name).includes(key)) && (q.view !== "favorites" || f.favorite));
	return {
		folders: ordered(shownFolders, (a, b) => a.name.localeCompare(b.name), q.sort === "name" && q.descending),
		items: ordered(shownItems, compareItems(q.sort), q.descending),
	};
}

function matches(item: LibraryItem, q: LibraryQuery): boolean {
	const key = nameKey(q.search.trim());
	if (key && !nameKey(item.name).includes(key)) return false;
	if (q.kind && item.kind !== q.kind) return false;
	if (q.tag && !item.tags?.some((tag) => nameKey(tag) === nameKey(q.tag!))) return false;
	return true;
}

/** Every folder that is archived or sits under an archived one. */
function archivedSubtree(folders: readonly LibraryFolder[]): Set<string> {
	const under = new Set(folders.filter((f) => f.archivedAt).map((f) => f.id));
	for (let grew = true; grew;) {
		grew = false;
		for (const folder of folders) {
			if (folder.parentId && under.has(folder.parentId) && !under.has(folder.id)) {
				under.add(folder.id);
				grew = true;
			}
		}
	}
	return under;
}

export const allTags = (items: readonly LibraryItem[]): string[] => {
	const tags = new Map<string, string>();
	for (const item of items) for (const tag of item.tags ?? []) if (!tags.has(nameKey(tag))) tags.set(nameKey(tag), tag);
	return [...tags.values()].sort((a, b) => a.localeCompare(b));
};
export const parseTags = (raw: string): string[] => raw.split(",").map((tag) => tag.trim()).filter(Boolean);

/** Selection keys, so items and folders share one set. */
export type EntryKey = `item:${string}` | `folder:${string}`;
export const DRAG_TYPE = "application/x-lh-library";

/** Runs a change over a selection one by one, and says exactly what failed. */
export async function runBulk<T>(targets: readonly T[], act: (target: T) => Promise<string | null>, nameOf: (target: T) => string): Promise<{ done: number; failed: { name: string; reason: string }[] }> {
	const failed: { name: string; reason: string }[] = [];
	let done = 0;
	for (const target of targets) {
		const reason = await act(target);
		if (reason) failed.push({ name: nameOf(target), reason });
		else done++;
	}
	return { done, failed };
}
