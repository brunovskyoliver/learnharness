/**
 * Workspace tabs and the sidebar's folder tree (feature 014). Pure, so the
 * strip's rules are testable without a browser. A tab only names something
 * open: it holds no learner text, so dropping one never loses anything.
 * Drafts, reading positions and page text stay with their existing owners.
 */
import type { LibraryFolder, LibraryItem, LibraryKind } from "./library.ts";

export type WorkspaceTabKind = "lesson" | "practice" | "item";

export interface WorkspaceTab {
	/** `chat:{id}` or `item:{id}`. */
	id: string;
	kind: WorkspaceTabKind;
	title: string;
	/** Item tabs only: what the pane needs to reopen it. */
	itemKind?: LibraryKind;
	size?: number;
}

/** The oldest tab not on screen makes room past this many. */
export const MAX_WORKSPACE_TABS = 12;
/** A session whose title has not reached the list yet. */
export const UNTITLED_SESSION = "Session";

export const sessionTabId = (chatId: string) => `chat:${chatId}`;
export const itemTabId = (itemId: string) => `item:${itemId}`;
/** The session or item id a tab points at. */
export const tabRef = (tab: Pick<WorkspaceTab, "id">) => tab.id.slice(tab.id.indexOf(":") + 1);

export function sessionTab(chatId: string, title: string, kind: "teach" | "practice"): WorkspaceTab {
	return { id: sessionTabId(chatId), kind: kind === "practice" ? "practice" : "lesson", title };
}

export function itemTab(item: { id: string; name: string; kind: LibraryKind; size: number }): WorkspaceTab {
	return { id: itemTabId(item.id), kind: "item", title: item.name, itemKind: item.kind, size: item.size };
}

/** The session a path shows, or null: Home, the Library and new drafts have none. */
export function chatIdOfPath(pathname: string): string | null {
	const match = /^\/chat\/([^/]+)\/?$/.exec(pathname);
	if (!match || match[1] === "new") return null;
	try { return decodeURIComponent(match[1]!); } catch { return null; }
}

/** Adds or retitles in place, so a tab keeps its position. `keep` lists tabs on
 *  screen, which are never the one evicted. */
export function openTab(tabs: readonly WorkspaceTab[], tab: WorkspaceTab, keep: readonly string[] = []): WorkspaceTab[] {
	const at = tabs.findIndex((t) => t.id === tab.id);
	if (at !== -1) {
		const old = tabs[at]!;
		if (old.title === tab.title && old.kind === tab.kind && old.itemKind === tab.itemKind && old.size === tab.size) return tabs as WorkspaceTab[];
		return tabs.map((t, i) => (i === at ? tab : t));
	}
	const next = [...tabs, tab];
	while (next.length > MAX_WORKSPACE_TABS) {
		const victim = next.findIndex((t) => t.id !== tab.id && !keep.includes(t.id));
		if (victim === -1) break;
		next.splice(victim, 1);
	}
	return next;
}

/** Removes a tab. `neighbour` is the nearest remaining session: where the view
 *  goes when the session on screen is the one closed. */
export function closeTab(tabs: readonly WorkspaceTab[], id: string): { tabs: WorkspaceTab[]; neighbour: WorkspaceTab | null; focus: WorkspaceTab | null } {
	const at = tabs.findIndex((t) => t.id === id);
	if (at === -1) return { tabs: [...tabs], neighbour: null, focus: null };
	const next = tabs.filter((t) => t.id !== id);
	const isSession = (t: WorkspaceTab) => t.kind !== "item";
	const neighbour = next.slice(at).find(isSession) ?? next.slice(0, at).reverse().find(isSession) ?? null;
	return { tabs: next, neighbour, focus: next[at] ?? next[at - 1] ?? null };
}

/** Saved tabs read defensively: storage is browser-owned and may be damaged. */
export function parseTabs(raw: unknown): WorkspaceTab[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const tabs: WorkspaceTab[] = [];
	for (const entry of raw) {
		const tab = entry as Partial<WorkspaceTab> | null;
		if (!tab || typeof tab.id !== "string" || typeof tab.title !== "string" || seen.has(tab.id)) continue;
		const sessionShaped = tab.id.startsWith("chat:") && (tab.kind === "lesson" || tab.kind === "practice");
		const itemShaped = tab.id.startsWith("item:") && tab.kind === "item" && typeof tab.itemKind === "string";
		if ((!sessionShaped && !itemShaped) || tab.id.indexOf(":") === tab.id.length - 1) continue;
		seen.add(tab.id);
		tabs.push(itemShaped
			? { id: tab.id, kind: "item", title: tab.title, itemKind: tab.itemKind, size: typeof tab.size === "number" ? tab.size : 0 }
			: { id: tab.id, kind: tab.kind as WorkspaceTabKind, title: tab.title });
	}
	return tabs.slice(-MAX_WORKSPACE_TABS);
}

/** Titles follow the session list, and a deleted session's tab goes. The tab on
 *  screen stays: a brand-new session reaches the list after its route does. */
export function reconcileSessionTabs(tabs: WorkspaceTab[], chats: readonly { id: string; title: string; kind?: string }[], currentChatId: string | null): WorkspaceTab[] {
	const byId = new Map(chats.map((chat) => [chat.id, chat]));
	let changed = false;
	const next: WorkspaceTab[] = [];
	for (const tab of tabs) {
		if (tab.kind === "item") { next.push(tab); continue; }
		const ref = tabRef(tab);
		const chat = byId.get(ref);
		if (!chat) {
			if (ref === currentChatId) next.push(tab);
			else changed = true;
			continue;
		}
		const kind: WorkspaceTabKind = chat.kind === "practice" ? "practice" : "lesson";
		if (chat.title === tab.title && kind === tab.kind) next.push(tab);
		else { changed = true; next.push({ ...tab, title: chat.title, kind }); }
	}
	return changed ? next : tabs;
}

/** The same for items, against a loaded catalog. The item open in the pane stays,
 *  because the pane has its own words for a page deleted while open. */
export function reconcileItemTabs(tabs: WorkspaceTab[], items: readonly Pick<LibraryItem, "id" | "name" | "kind" | "size">[], openItemId: string | null): WorkspaceTab[] {
	const byId = new Map(items.map((item) => [item.id, item]));
	let changed = false;
	const next: WorkspaceTab[] = [];
	for (const tab of tabs) {
		if (tab.kind !== "item") { next.push(tab); continue; }
		const ref = tabRef(tab);
		const item = byId.get(ref);
		if (!item) {
			if (ref === openItemId) next.push(tab);
			else changed = true;
			continue;
		}
		if (item.name === tab.title && item.kind === tab.itemKind && item.size === tab.size) next.push(tab);
		else { changed = true; next.push(itemTab(item)); }
	}
	return changed ? next : tabs;
}

/** The one selected tab: the most recently activated of those on screen. */
export function selectedTabId(tabs: readonly WorkspaceTab[], onScreen: readonly (string | null)[], last: string | null): string | null {
	const shown = onScreen.filter((id): id is string => id !== null && tabs.some((t) => t.id === id));
	if (last && shown.includes(last)) return last;
	return shown[0] ?? null;
}

export interface FolderTreeRow {
	folder: LibraryFolder;
	depth: number;
	hasChildren: boolean;
	expanded: boolean;
}

/** The visible rows of the sidebar's tree, depth first and by name. Archived
 *  folders stay in the Archive view, as they do in the Library's own list. */
export function folderTreeRows(folders: readonly LibraryFolder[], expanded: ReadonlySet<string>): FolderTreeRow[] {
	const live = folders.filter((folder) => !folder.archivedAt);
	const ids = new Set(live.map((folder) => folder.id));
	const children = new Map<string | null, LibraryFolder[]>();
	for (const folder of live) {
		// A parent that is gone or archived reads as the top level.
		const parent = folder.parentId !== null && ids.has(folder.parentId) ? folder.parentId : null;
		children.set(parent, [...(children.get(parent) ?? []), folder]);
	}
	for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name));
	const rows: FolderTreeRow[] = [];
	const visit = (parent: string | null, depth: number, path: ReadonlySet<string>) => {
		for (const folder of children.get(parent) ?? []) {
			if (path.has(folder.id)) continue; // Never spin on a damaged catalog.
			const hasChildren = (children.get(folder.id)?.length ?? 0) > 0;
			const open = hasChildren && expanded.has(folder.id);
			rows.push({ folder, depth, hasChildren, expanded: open });
			if (open) visit(folder.id, depth + 1, new Set([...path, folder.id]));
		}
	};
	visit(null, 1, new Set());
	return rows;
}
