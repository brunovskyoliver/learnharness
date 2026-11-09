"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckSquareIcon, FilePlusIcon, FolderGit2Icon, FolderPlusIcon, GitBranchIcon, InfoIcon, LayoutGridIcon, ListIcon, NetworkIcon, RefreshCwIcon, SearchIcon, UploadIcon, XIcon } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { LibraryContextSlot } from "@/components/workspace/context-slot";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { folderPathLabel, folderSubtree, folderTrail, inMirror, KIND_LABEL, liveFolderId, MAX_FILE_BYTES, parseLibraryHref, parseRepoAddress, type LibraryFolder, type LibraryItem, type LibraryKind, type LibraryMarks, type LibraryTrashEntry, type PendingLinkView, type RepoLinkView, type SyncFailure } from "@/src/core";
import { BlotGlyph } from "@/components/paper/blot";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { DeleteItemDialog, DESTRUCTIVE_BUTTON } from "./delete-item-dialog.tsx";
import { FolderNameDialog, MoveDialog, sendLibraryChange } from "./folder-dialogs.tsx";
import { FolderBreadcrumbs, folderHref, FolderRow } from "./folder-row.tsx";
import { allTags, DRAG_TYPE, parseTags, parseView, runBulk, selectEntries, SORT_LABELS, VIEW_LABELS, type EntryKey, type LibraryLayout, type LibrarySort, type LibraryViewName } from "./library-filter.ts";
import { LibraryChoice, moreButton, type LibraryMenuAction } from "./library-menu.tsx";
import { LibraryRow } from "./library-row.tsx";
import { LibraryTrash } from "./library-trash.tsx";
import type { LinkAnswer, LinkFields } from "./repo-link-dialog.tsx";
import type { TokenChange } from "./repo-details-dialog.tsx";
import { RepoStatusLine } from "./repo-status-line.tsx";
import { createBlankPage, PagePaneSlot, usePagePane } from "./page-pane-context.tsx";
import { runUploadQueue, sendFile } from "./upload.ts";
import { useReturnPoint } from "@/components/reference-return";
import { stampPendingMark } from "@/components/reference-return";

/** Any `/library?item=` address (feature 027): the item across the column. Loads with the first one. */
const LibraryFullView = dynamic(() => import("./library-full-view.tsx").then((m) => m.LibraryFullView), {
	ssr: false,
	loading: () => <div role="status" aria-label="Loading the item" className="px-4"><Skeleton className="h-5 w-2/3 rounded-md" /></div>,
});

/** Only loads once "Full text" is chosen: the search field itself stays small. */
import { DiagramProposalsLine } from "@/components/diagram/diagram-proposals-line.tsx";
import { RouteContent } from "@/components/paper/route-content";
import { inkOrder } from "@/components/paper/motion-arrival";
/** Page edits waiting for him (feature 023): loads after the list, so /library's first load stays as it was. */
// Loads only when a chip left a return point; the column's padding is set before it arrives.
const BackPill = dynamic(() => import("./back-pill.tsx").then((m) => m.BackPill), { ssr: false });
const PageProposalsLine = dynamic(() => import("./page-proposals-line.tsx").then((m) => m.PageProposalsLine), { ssr: false });
/** Loads on the click: the dialog and its form list aren't part of the Library's first load. */
/** Loads on the click, like New diagram (feature 026). */
const RepoLinkDialog = dynamic(() => import("./repo-link-dialog.tsx").then((m) => m.RepoLinkDialog), { ssr: false });
const RepoDetailsDialog = dynamic(() => import("./repo-details-dialog.tsx").then((m) => m.RepoDetailsDialog), { ssr: false });
const UnlinkDialog = dynamic(() => import("./repo-details-dialog.tsx").then((m) => m.UnlinkDialog), { ssr: false });
const NewDiagramDialog = dynamic(() => import("@/components/diagram/new-diagram-dialog.tsx").then((m) => m.NewDiagramDialog), { ssr: false });

const DocumentSearchPanel = dynamic(() => import("./document-search.tsx").then((m) => m.DocumentSearchPanel), {
	ssr: false,
	loading: () => <p role="status" className="text-sm text-faint">Loading search…</p>,
});

const LOAD_FAILED = "Your Library could not be loaded.";

const noop = () => {};

export interface LibraryBodyProps {
	/** null until the first successful load. */
	items: LibraryItem[] | null;
	/** Absent reads as none, so every item is at the top level. */
	folders?: LibraryFolder[];
	/** The open folder; null or absent is the top level. */
	folderId?: string | null;
	view?: LibraryViewName;
	tag?: string | null;
	kind?: LibraryKind | null;
	sort?: LibrarySort;
	descending?: boolean;
	recentIds?: readonly string[];
	layout?: LibraryLayout;
	selected?: ReadonlySet<EntryKey> | null;
	onToggle?: (key: EntryKey) => void;
	itemActions?: (item: LibraryItem) => LibraryMenuAction[];
	folderActions?: (folder: LibraryFolder) => LibraryMenuAction[];
	onDragStartEntry?: (key: EntryKey, event: DragEvent) => void;
	onDropOnFolder?: (folderId: string, event: DragEvent) => void;
	onRenameFolder?: (folder: LibraryFolder, opener: HTMLElement) => void;
	onDeleteFolder?: (folder: LibraryFolder, opener: HTMLElement) => void;
	loadFailed: boolean;
	refreshFailed: boolean;
	query: string;
	onRetry: () => void;
	onChanged: () => void;
	onDelete: (item: LibraryItem, opener: HTMLElement) => void;
	/** Repo links (feature 026): a mirrored file's row knows its repo. */
	links?: readonly RepoLinkView[];
	/** First links still pulling, shown in their target folder. */
	pending?: readonly PendingLinkView[];
	/** First links that failed while their dialog was closed. */
	linkFailures?: readonly LinkFailure[];
	onDismissLinkFailure?: (id: string) => void;
}

/** "Couldn't link {display} · {sentence}" on the spot a pending row held (ui-contract.md). */
export interface LinkFailure { id: string; display: string; sentence: string; parentId: string | null }

/** A first link still pulling: the folder's name and the status, never openable. */
function PendingLinkRow({ pending }: { pending: PendingLinkView }) {
	return (
		<li className="lh-row" data-testid="library-pending-link">
			<div className="lh-row-open lh-row-folder" aria-disabled="true">
				<FolderGit2Icon className="size-[15px] shrink-0 text-faint" aria-hidden="true" />
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className="lh-row-name min-w-0">{pending.folderName}</span>
					<span role="status" className="lh-row-meta flex items-center gap-1.5">
						<span className="nb-ink-wait" aria-hidden="true"><BlotGlyph className="nb-ink-wait-blot" size={11} /></span>
						Syncing for the first time…
					</span>
				</span>
			</div>
		</li>
	);
}

const EMPTY: Record<LibraryViewName, string> = {
	all: "Nothing here yet. Upload a document or start a page.",
	favorites: "Nothing is marked as a favorite.",
	recent: "Nothing opened yet.",
	archive: "Nothing is archived.",
	trash: "The trash is empty.",
};

/** The list's states, pure for SSR tests. Loading, empty and failed stay
 *  distinct, and a failed refresh keeps the list. */
export function LibraryBody({ items, folders = [], folderId = null, view = "all", tag = null, kind = null, sort = "name", descending = false, recentIds = [], layout = "list", selected = null, onToggle = noop, itemActions, folderActions, onDragStartEntry, onDropOnFolder, onRenameFolder = noop, onDeleteFolder = noop, loadFailed, refreshFailed, query, onRetry, onChanged, onDelete, links = [], pending = [], linkFailures = [], onDismissLinkFailure = noop }: LibraryBodyProps) {
	const [overFolder, setOverFolder] = useState<string | null>(null);
	const failedLine = (
		<div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-md text-ink">
			<p>{LOAD_FAILED}</p>
			<button type="button" onClick={onRetry} className="lh-text-action">Try again</button>
		</div>
	);
	if (items === null) {
		return loadFailed ? failedLine : (
			<div role="status" aria-label="Loading your Library" className="flex flex-col gap-1">
				<Skeleton className="h-[60px] w-full rounded-lg" />
				<Skeleton className="h-[60px] w-full rounded-lg" />
				<Skeleton className="h-[60px] w-full rounded-lg" />
			</div>
		);
	}
	const shown = selectEntries(items, folders, { view, folderId, search: query, tag, kind, sort, descending, recentIds });
	const filtering = Boolean(query.trim() || tag || kind);
	const wide = filtering || view === "favorites" || view === "recent";
	const countIn = (id: string) => folders.filter((f) => f.parentId === id).length + items.filter((i) => i.folderId === id).length;
	// A search covers the whole Library, and says where each match lives.
	const whereIs = (id: string | null | undefined) => (wide ? folderPathLabel(id, folders) || "Library" : undefined);
	// Pending links and their failures sit in the folder they were linked into, outside filters.
	const here = (parentId: string | null) => !filtering && view === "all" && (parentId ?? null) === folderId;
	const pendingHere = pending.filter((p) => here(p.parentId));
	const failuresHere = linkFailures.filter((f) => here(f.parentId));
	const repoOf = (item: LibraryItem) => (item.mirror ? links.find((l) => l.id === item.mirror!.linkId)?.display : undefined);
	const nothing = shown.items.length === 0 && shown.folders.length === 0 && pendingHere.length === 0 && failuresHere.length === 0;
	return (
		<>
			{refreshFailed && failedLine}
			{filtering && nothing ? (
				<p role="status" className="text-md text-faint" {...inkOrder(4)}>Nothing matched</p>
			) : nothing ? (
				<p className="text-md text-faint" {...inkOrder(4)}>{folderId ? "This folder is empty." : EMPTY[view]}</p>
			) : (
				<ul className={layout === "grid" ? "lh-grid grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col"} data-testid="library-list" {...inkOrder(4)}>
					{failuresHere.map((failure) => (
						<li key={failure.id} role="alert" className="lh-line-card justify-between gap-3 py-1.5 pr-1.5" data-testid="library-link-failure">
							<p className="min-w-0 text-sm [overflow-wrap:anywhere]">
								<span className="font-medium text-ink">Couldn&apos;t link {failure.display}</span>
								<span className="text-red"> · {failure.sentence}</span>
							</p>
							<button type="button" className="lh-text-action shrink-0" onClick={() => onDismissLinkFailure(failure.id)}>Dismiss</button>
						</li>
					))}
					{pendingHere.map((p) => <PendingLinkRow key={p.requestId} pending={p} />)}
					{shown.folders.map((folder) => (
						<FolderRow
							key={folder.id}
							folder={folder}
							count={countIn(folder.id)}
							location={whereIs(folder.parentId)}
							repoLink={folder.mirror?.path === "" ? links.find((l) => l.folderId === folder.id) : undefined}
							actions={folderActions?.(folder)}
							selection={selected ? { selected: selected.has(`folder:${folder.id}`), toggle: () => onToggle(`folder:${folder.id}`) } : undefined}
							onDragStartEntry={onDragStartEntry}
							dropTarget={onDropOnFolder ? { over: overFolder === folder.id, onOver: (over) => setOverFolder(over ? folder.id : null), onDrop: (event) => onDropOnFolder(folder.id, event) } : undefined}
							onRename={onRenameFolder}
							onDelete={onDeleteFolder}
						/>
					))}
					{shown.items.map((item) => (
						<LibraryRow
							key={item.id}
							item={item}
							grid={layout === "grid"}
							location={whereIs(item.folderId)}
							repo={repoOf(item)}
							actions={itemActions?.(item)}
							selection={selected ? { selected: selected.has(`item:${item.id}`), toggle: () => onToggle(`item:${item.id}`) } : undefined}
							onDragStartEntry={onDragStartEntry}
							onRenamed={onChanged}
							onDelete={onDelete}
						/>
					))}
				</ul>
			)}
		</>
	);
}

const PREFS_KEY = "lh-library-view";
type LibrarySearchMode = "names" | "text";
type LibraryPrefs = { layout: LibraryLayout; sort: LibrarySort; descending: boolean; searchMode: LibrarySearchMode };
const DEFAULT_PREFS: LibraryPrefs = { layout: "list", sort: "name", descending: false, searchMode: "names" };
const PILL = "nb-set-pill";

function viewHref(view: LibraryViewName, tag?: string | null): string {
	const params = new URLSearchParams();
	if (view !== "all") params.set("view", view);
	if (tag) params.set("tag", tag);
	const text = params.toString();
	return text ? `/library?${text}` : "/library";
}

interface Clash { name: string; suggestedName: string; answer: (keepBoth: boolean) => void }

/** The full Library view: upload, list, search, rename, open and delete. */
export function LibraryView() {
	const pane = usePagePane();
	const workspace = useWorkspace();
	const router = useRouter();
	const [creating, setCreating] = useState(false);
	const [items, setItems] = useState<LibraryItem[] | null>(null);
	const [folders, setFolders] = useState<LibraryFolder[]>([]);
	const [recentIds, setRecentIds] = useState<string[]>([]);
	const [naming, setNaming] = useState<{ folder: LibraryFolder | null } | null>(null);
	const [tagging, setTagging] = useState<LibraryItem | null>(null);
	const [moving, setMoving] = useState<{ targets: EntryKey[]; label: string; current: string | null } | null>(null);
	const [trash, setTrash] = useState<LibraryTrashEntry[] | null>(null);
	const [trashFailed, setTrashFailed] = useState(false);
	const [trashFailure, setTrashFailure] = useState<string | null>(null);
	const [purging, setPurging] = useState<LibraryTrashEntry | null>(null);
	const [selected, setSelected] = useState<Set<EntryKey> | null>(null);
	const [bulkTagging, setBulkTagging] = useState(false);
	const [kind, setKind] = useState<LibraryKind | null>(null);
	const [prefs, setPrefs] = useState<LibraryPrefs>(DEFAULT_PREFS);
	const [overTop, setOverTop] = useState(false);
	const [deletingFolder, setDeletingFolder] = useState<LibraryFolder | null>(null);
	const [folderFailure, setFolderFailure] = useState<string | null>(null);
	const newFolderButton = useRef<HTMLButtonElement>(null);
	// Repo links (feature 026).
	const { hosted } = useSettingsDialog();
	const [links, setLinks] = useState<RepoLinkView[]>([]);
	const [pendingLinks, setPendingLinks] = useState<PendingLinkView[]>([]);
	const [linkFailures, setLinkFailures] = useState<LinkFailure[]>([]);
	const [linkOpen, setLinkOpen] = useState(false);
	const linkOpenRef = useRef(false);
	const linkButton = useRef<HTMLButtonElement>(null);
	// Repo details and unlink (feature 026, US4): by link id, so they follow the live link.
	const [detailsId, setDetailsId] = useState<string | null>(null);
	const [unlinkId, setUnlinkId] = useState<string | null>(null);
	const detailsButton = useRef<HTMLButtonElement>(null);
	const linkOpener = useRef<HTMLElement | null>(null);
	const params = useSearchParams();
	const openFolderId = params.get("folder");
	const view = parseView(params.get("view"));
	const tag = params.get("tag");
	useEffect(() => {
		try {
			const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null") as Partial<LibraryPrefs> | null;
			if (saved) setPrefs({ ...DEFAULT_PREFS, ...saved });
		} catch { /* a damaged preference is no preference */ }
	}, []);
	const updatePrefs = (next: Partial<LibraryPrefs>) => {
		const merged = { ...prefs, ...next };
		setPrefs(merged);
		try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(merged)); } catch { /* still applies for this visit */ }
	};
	const [loadFailed, setLoadFailed] = useState(false);
	const [refreshFailed, setRefreshFailed] = useState(false);
	const [query, setQuery] = useState("");
	const [deleting, setDeleting] = useState<LibraryItem | null>(null);
	const [inFlight, setInFlight] = useState<{ name: string; percent: number } | null>(null);
	const [refusals, setRefusals] = useState<{ id: number; name: string; message: string }[]>([]);
	const [clash, setClash] = useState<Clash | null>(null);
	const [dragging, setDragging] = useState(false);
	const picker = useRef<HTMLInputElement>(null);
	const uploadButton = useRef<HTMLButtonElement>(null);
	const opener = useRef<HTMLElement | null>(null);
	const maxFileBytes = useRef(MAX_FILE_BYTES);
	const queue = useRef<Promise<void>>(Promise.resolve());
	const nextRefusal = useRef(0);
	const loaded = useRef(false);
	const request = useRef(0);

	const refresh = useCallback(async () => {
		const id = ++request.current;
		try {
			const response = await fetch("/api/library", { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = await response.json() as { items: LibraryItem[]; folders: LibraryFolder[]; recentIds: string[]; links?: RepoLinkView[]; limits: { maxFileBytes: number } };
			if (id !== request.current) return;
			setLinks(body.links ?? []);
			maxFileBytes.current = body.limits.maxFileBytes;
			loaded.current = true;
			setItems(body.items);
			setFolders(body.folders);
			setRecentIds(body.recentIds);
			setLoadFailed(false);
			setRefreshFailed(false);
		} catch {
			if (id !== request.current) return;
			if (loaded.current) setRefreshFailed(true);
			else setLoadFailed(true);
		}
	}, []);
	const retry = useCallback(() => {
		setLoadFailed(false);
		void refresh();
	}, [refresh]);
	const refreshTrash = useCallback(async () => {
		try {
			const response = await fetch("/api/library/trash", { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			setTrash(((await response.json()) as { entries: LibraryTrashEntry[] }).entries);
			setTrashFailed(false);
		} catch {
			setTrashFailed(true);
		}
	}, []);
	const refreshAll = useCallback(() => {
		void refresh();
		if (view === "trash") void refreshTrash();
	}, [refresh, refreshTrash, view]);
	useEffect(() => { refreshAll(); }, [refreshAll]);
	useServerEvent("library-changed", refreshAll);
	useServerResync(refreshAll);
	const refreshLinks = useCallback(async () => {
		try {
			const response = await fetch("/api/library/links", { cache: "no-store" });
			if (!response.ok) return;
			const body = await response.json() as { links: RepoLinkView[]; pending: PendingLinkView[] };
			setLinks(body.links);
			setPendingLinks(body.pending);
		} catch { /* the next event or reload tries again */ }
	}, []);
	useEffect(() => { void refreshLinks(); }, [refreshLinks]);
	useServerEvent("library-sync", () => void refreshLinks());
	useServerResync(() => void refreshLinks());
	// Known only once loaded: a missing folder says so instead of showing the top level.
	const folderMissing = openFolderId !== null && items !== null && !folders.some((folder) => folder.id === openFolderId);
	const folderId = openFolderId !== null && !folderMissing ? openFolderId : null;
	const trail = folderTrail(folderId, folders);
	// Inside a linked folder (feature 026): its status line and "Sync now".
	const openLink = folderId ? links.find((l) => l.folderId === folderId) : undefined;
	const linkSyncing = openLink ? openLink.sync.state === "syncing" || openLink.sync.state === "never" : false;
	const insideMirror = inMirror(folderId, folders);
	const syncNow = async (link: RepoLinkView) => {
		if (link.sync.state === "syncing") return;
		try {
			const response = await fetch(`/api/library/links/${encodeURIComponent(link.id)}/sync`, { method: "POST" });
			const body = await response.json().catch(() => ({})) as { link?: RepoLinkView };
			if (body.link) setLinks((list) => list.map((l) => (l.id === body.link!.id ? body.link! : l)));
		} catch { /* the status line stays as it was; the next event refetches */ }
		void refreshLinks();
	};
	const detailsLink = detailsId ? links.find((l) => l.id === detailsId) ?? null : null;
	const unlinkLink = unlinkId ? links.find((l) => l.id === unlinkId) ?? null : null;
	const linkedName = (link: RepoLinkView) => folders.find((f) => f.id === link.folderId)?.name ?? link.display;
	const openDetails = (link: RepoLinkView, from: HTMLElement | null) => {
		linkOpener.current = from;
		setDetailsId(link.id);
	};
	const openUnlink = (link: RepoLinkView, from: HTMLElement | null) => {
		// From the details dialog, focus goes back into it; otherwise to what opened it.
		if (!detailsId) linkOpener.current = from;
		setUnlinkId(link.id);
	};
	const sendToken = async (link: RepoLinkView, change: TokenChange) => {
		try {
			const response = await fetch(`/api/library/links/${encodeURIComponent(link.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
			const body = await response.json().catch(() => ({})) as { link?: RepoLinkView; error?: string };
			if (!response.ok || !body.link) return { ok: false as const, error: body.error ?? "That could not be done." };
			setLinks((list) => list.map((l) => (l.id === body.link!.id ? body.link! : l)));
			return { ok: true as const, link: body.link };
		} catch {
			return { ok: false as const, error: "That could not be done. Check your connection and try again." };
		}
	};
	/** DELETE the link after the confirm. Inside the folder, the view steps out to where it was. */
	const confirmUnlink = async (): Promise<string | null> => {
		if (!unlinkLink) return null;
		const linked = folders.find((f) => f.id === unlinkLink.folderId);
		const refused = await sendLibraryChange(`/api/library/links/${encodeURIComponent(unlinkLink.id)}`, "DELETE");
		if (refused) return refused;
		setUnlinkId(null);
		setDetailsId(null);
		if (linked && folderId && folderSubtree(linked.id, folders).has(folderId)) router.push(folderHref(liveFolderId(linked.parentId, folders)));
		void refresh();
		void refreshLinks();
		return null;
	};
	const openLinkDialog = (open: boolean) => {
		linkOpenRef.current = open;
		setLinkOpen(open);
	};
	/** POST the link; the first pull runs in the request. A failure after the dialog closed stays on the spot. */
	const submitLink = async (fields: LinkFields): Promise<LinkAnswer> => {
		const parentId = folderId;
		const parsed = parseRepoAddress(fields.url);
		const display = "display" in parsed ? parsed.display : fields.url.trim();
		const requestId = `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
		const sending = fetch("/api/library/links", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: fields.url.trim(), folderName: fields.folderName.trim(), token: fields.token.trim() || undefined, branch: fields.branch.trim() || undefined, parentId, requestId }),
		});
		// The pending row shows while the first pull runs.
		setTimeout(() => void refreshLinks(), 150);
		let answer: LinkAnswer;
		try {
			const response = await sending;
			const body = await response.json().catch(() => ({})) as { link?: RepoLinkView; folder?: LibraryFolder; code?: string; error?: string; suggestedName?: string; failure?: SyncFailure };
			answer = response.status === 201 && body.link && body.folder
				? { ok: true, link: body.link, folder: body.folder }
				: { ok: false, code: body.code ?? "server", error: body.error ?? "The repo couldn't be pulled.", ...(body.suggestedName ? { suggestedName: body.suggestedName } : {}), ...(body.failure ? { failure: body.failure } : {}) };
		} catch {
			answer = { ok: false, code: "network", error: "That could not be done. Check your connection and try again." };
		}
		void refreshLinks();
		if (answer.ok) {
			if (linkOpenRef.current) openLinkDialog(false);
			void refresh();
		} else if (!linkOpenRef.current) {
			const sentence = answer.failure?.message ?? answer.error;
			setLinkFailures((list) => [...list, { id: requestId, display, sentence, parentId }]);
		}
		return answer;
	};
	const returnFolderFocus = () => (opener.current?.isConnected ? opener.current : newFolderButton.current)?.focus();
	const finishChange = (refused: string | null, close: () => void) => {
		if (!refused) {
			close();
			void refresh();
		}
		return refused;
	};
	const submitName = async (name: string) => finishChange(
		naming?.folder
			? await sendLibraryChange(`/api/library/folders/${naming.folder.id}`, "PATCH", { name })
			: await sendLibraryChange("/api/library/folders", "POST", { name, parentId: folderId }),
		() => setNaming(null),
	);
	const moveOne = (key: EntryKey, target: string | null) => {
		const [type, id] = key.split(":") as ["item" | "folder", string];
		return type === "folder"
			? sendLibraryChange(`/api/library/folders/${id}`, "PATCH", { parentId: target })
			: sendLibraryChange(`/api/library/items/${id}`, "PATCH", { folderId: target });
	};
	const nameOfKey = (key: EntryKey) => {
		const id = key.slice(key.indexOf(":") + 1);
		return (key.startsWith("folder:") ? folders.find((f) => f.id === id)?.name : items?.find((i) => i.id === id)?.name) ?? id;
	};
	/** A mirrored file or mirror folder (feature 026): bulk moves and trashing refuse it by name. */
	const fromRepo = (key: EntryKey) => {
		const id = key.slice(key.indexOf(":") + 1);
		if (key.startsWith("item:")) return items?.find((i) => i.id === id)?.mirror !== undefined;
		const folder = folders.find((f) => f.id === id);
		return folder?.mirror !== undefined && folder.mirror.path !== "";
	};
	const FROM_REPO = "comes from the repo.";
	/** Sentence for what failed, or null. The rest of the batch still happened. */
	const bulkOutcome = (outcome: { done: number; failed: { name: string; reason: string }[] }) =>
		outcome.failed.length === 0 ? null : outcome.failed.map((f) => `${f.name}: ${f.reason}`).join(" ");
	const moveMany = async (targets: readonly EntryKey[], target: string | null) => {
		const outcome = await runBulk(targets, async (key) => (fromRepo(key) ? FROM_REPO : moveOne(key, target)), nameOfKey);
		void refresh();
		return bulkOutcome(outcome);
	};
	const submitMove = async (target: string | null) => {
		const refused = await moveMany(moving?.targets ?? [], target);
		if (!refused) {
			setMoving(null);
			setSelected(null);
		}
		return refused;
	};
	const reportFailure = (message: string | null) => {
		if (message) setRefusals((list) => [...list, { id: nextRefusal.current++, name: "Library", message }]);
	};
	const markItem = async (item: LibraryItem, marks: LibraryMarks) => {
		reportFailure(await sendLibraryChange(`/api/library/items/${item.id}`, "PATCH", { marks }));
		void refresh();
	};
	const markFolder = async (folder: LibraryFolder, marks: Omit<LibraryMarks, "tags">) => {
		reportFailure(await sendLibraryChange(`/api/library/folders/${folder.id}`, "PATCH", { marks }));
		void refresh();
	};
	const openMove = (targets: EntryKey[], label: string, current: string | null) => {
		opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setMoving({ targets, label, current });
	};
	const itemActions = (item: LibraryItem): LibraryMenuAction[] => item.mirror ? [
		// A file from a linked repo: marks only (Q5); the row adds Open and Download.
		{ label: item.favorite ? "Remove from favorites" : "Add to favorites", onSelect: () => void markItem(item, { favorite: !item.favorite }) },
		{ label: item.pinned ? "Unpin" : "Pin to top", onSelect: () => void markItem(item, { pinned: !item.pinned }) },
		{ label: "Tags…", onSelect: () => setTagging(item) },
		{ label: item.archivedAt ? "Unarchive" : "Archive", onSelect: () => void markItem(item, { archived: !item.archivedAt }) },
	] : [
		{ label: item.favorite ? "Remove from favorites" : "Add to favorites", onSelect: () => void markItem(item, { favorite: !item.favorite }) },
		{ label: item.pinned ? "Unpin" : "Pin to top", onSelect: () => void markItem(item, { pinned: !item.pinned }) },
		{ label: "Tags…", onSelect: () => setTagging(item) },
		{ label: "Move to…", testId: "library-action-move", onSelect: () => openMove([`item:${item.id}`], item.name, liveFolderId(item.folderId, folders)) },
		{ label: item.archivedAt ? "Unarchive" : "Archive", onSelect: () => void markItem(item, { archived: !item.archivedAt }) },
	];
	const folderMarks = (folder: LibraryFolder): LibraryMenuAction[] => [
		{ label: folder.favorite ? "Remove from favorites" : "Add to favorites", onSelect: () => void markFolder(folder, { favorite: !folder.favorite }) },
		{ label: folder.pinned ? "Unpin" : "Pin to top", onSelect: () => void markFolder(folder, { pinned: !folder.pinned }) },
	];
	const archiveFolder = (folder: LibraryFolder): LibraryMenuAction => ({ label: folder.archivedAt ? "Unarchive" : "Archive", onSelect: () => void markFolder(folder, { archived: !folder.archivedAt }) });
	const openFolder = (folder: LibraryFolder): LibraryMenuAction => ({ label: "Open folder", onSelect: () => router.push(folderHref(folder.id)) });
	const folderActions = (folder: LibraryFolder): LibraryMenuAction[] => {
		const moveFolder: LibraryMenuAction = { label: folder.mirror ? "Move folder" : "Move to…", testId: "library-action-move", onSelect: () => openMove([`folder:${folder.id}`], folder.name, liveFolderId(folder.parentId, folders)) };
		// Feature 026 (ui-contract.md Menus). A mirror folder: marks only.
		if (folder.mirror && folder.mirror.path !== "") return [openFolder(folder), ...folderMarks(folder), archiveFolder(folder)];
		if (folder.mirror) {
			const link = links.find((l) => l.folderId === folder.id);
			return [
				openFolder(folder),
				...(link ? [
					{ label: "Sync now", onSelect: () => void syncNow(link) },
					{ label: "Repo details…", testId: "library-action-repo-details", onSelect: () => openDetails(link, moreButton(`More actions for ${folder.name}`)) },
				] : []),
				{ label: "Rename folder", onSelect: () => { opener.current = moreButton(`More actions for ${folder.name}`); setNaming({ folder }); } },
				moveFolder,
				...folderMarks(folder),
				archiveFolder(folder),
			];
		}
		return [...folderMarks(folder), moveFolder, archiveFolder(folder)];
	};
	const trashKey = (key: EntryKey) => {
		const id = key.slice(key.indexOf(":") + 1);
		return sendLibraryChange("/api/library/trash", "POST", key.startsWith("folder:") ? { folderId: id } : { itemId: id });
	};
	const toggleSelected = (key: EntryKey) => setSelected((current) => {
		const next = new Set(current ?? []);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		return next;
	});
	const selectedKeys = [...(selected ?? [])];
	const selectedItems = selectedKeys.flatMap((key) => (key.startsWith("item:") ? items?.find((i) => `item:${i.id}` === key) ?? [] : []));
	const finishBulk = (outcome: { done: number; failed: { name: string; reason: string }[] }) => {
		reportFailure(bulkOutcome(outcome));
		if (outcome.failed.length === 0) setSelected(null);
		void refresh();
	};
	const bulkMark = async (marks: Omit<LibraryMarks, "tags">) => finishBulk(await runBulk(selectedKeys, (key) => {
		const id = key.slice(key.indexOf(":") + 1);
		return sendLibraryChange(key.startsWith("folder:") ? `/api/library/folders/${id}` : `/api/library/items/${id}`, "PATCH", { marks });
	}, nameOfKey));
	const startDrag = (key: EntryKey, event: DragEvent) => {
		const keys = selected?.has(key) ? selectedKeys : [key];
		event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(keys));
		event.dataTransfer.effectAllowed = "move";
	};
	const dropOn = async (target: string | null, event: DragEvent) => {
		let keys: EntryKey[] = [];
		try { keys = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as EntryKey[]; } catch { return; }
		const movable = keys.filter((key) => key !== `folder:${target}`);
		reportFailure(await moveMany(movable, target));
		setSelected(null);
	};
	const restoreEntry = async (entry: LibraryTrashEntry) => {
		const refused = await sendLibraryChange(`/api/library/trash/${entry.id}`, "POST");
		setTrashFailure(refused);
		refreshAll();
	};
	const purgeEntry = async () => {
		if (!purging) return;
		const refused = await sendLibraryChange(`/api/library/trash/${purging.id}`, "DELETE");
		setTrashFailure(refused);
		setPurging(null);
		refreshAll();
	};
	const confirmFolderDelete = async () => {
		if (!deletingFolder) return;
		const refused = await sendLibraryChange("/api/library/trash", "POST", { folderId: deletingFolder.id });
		setFolderFailure(refused);
		if (!refused) {
			setDeletingFolder(null);
			void refresh();
		}
	};

	const enqueue = (files: File[]) => {
		if (files.length === 0) return;
		queue.current = queue.current.then(() => runUploadQueue(files, {
			maxFileBytes: maxFileBytes.current,
			send: (file, name, onProgress) => sendFile(file, name, onProgress, folderId),
			askClash: (name, suggestedName) => new Promise((answer) => setClash({ name, suggestedName, answer })),
			onProgress: (name, percent) => setInFlight({ name, percent }),
			onRefused: (name, message) => setRefusals((list) => [...list, { id: nextRefusal.current++, name, message }]),
			onSettled: () => {
				setInFlight(null);
				void refresh();
			},
		}));
	};
	const answerClash = (keepBoth: boolean) => {
		clash?.answer(keepBoth);
		setClash(null);
	};
	const [newDiagram, setNewDiagram] = useState(false);
	const newDiagramButton = useRef<HTMLButtonElement>(null);
	const newPage = async () => {
		setCreating(true);
		const result = await createBlankPage(folderId);
		setCreating(false);
		if ("error" in result) {
			setRefusals((list) => [...list, { id: nextRefusal.current++, name: "New page", message: result.error }]);
			return;
		}
		pane?.open(result.item);
		void refresh();
	};
	// A rename in the list reaches the open pane's header.
	const openItem = pane?.item;
	const listed = openItem && items?.find((item) => item.id === openItem.id);
	useEffect(() => {
		if (openItem && listed && (listed.name !== openItem.name || listed.size !== openItem.size)) pane?.update({ id: listed.id, name: listed.name, kind: listed.kind, size: listed.size, ...(openItem.repo ? { repo: openItem.repo } : {}) });
	}, [listed, openItem, pane]);
	// Any `/library?item=` address (feature 027, FR-021) is the full view, and
	// the address stays: Back, Forward and a reload show it again.
	const search = params.toString();
	const address = useMemo(() => (search.includes("item=") ? parseLibraryHref(`/library?${search}`) : null), [search]);
	// A chip pushed this entry: mark it, so the Back pill knows the lesson is right behind it.
	useLayoutEffect(() => { stampPendingMark(); }, [search]);
	const returnPoint = useReturnPoint();
	const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

	return (
		<div className="session-workspace-layout flex h-dvh flex-col md:flex-row">
		<div
			className={`flex min-h-0 min-w-0 flex-1 flex-col ${dragging ? "outline-2 -outline-offset-4 outline-rule" : ""}`}
			data-testid="library-view"
			data-back-pill={returnPoint ? "" : undefined}
			onDragOver={(event) => {
				if (!hasFiles(event) || insideMirror) return;
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
			}}
			onDrop={(event) => {
				if (!hasFiles(event)) return;
				event.preventDefault();
				setDragging(false);
				enqueue([...event.dataTransfer.files]);
			}}
		>
			<TopBar tabs />
			{returnPoint && <BackPill point={returnPoint} />}
			{address ? (
				<RouteContent data-testid="library-scroll" className="mx-auto flex min-h-0 w-full max-w-[52rem] flex-1 flex-col pt-3 sm:pt-6">
					<LibraryFullView key={search} address={address} items={items} loadFailed={loadFailed} onRetry={retry} onChanged={() => void refresh()} />
				</RouteContent>
			) : (
			<div data-testid="library-scroll" className="min-h-0 flex-1 overflow-y-auto">
				{/* The content arrives in reading order (feature 028; the Library's 24ms steps, capped at 160ms): the trail and the heading together, so the heading ends inside the route's 300ms. */}
				<RouteContent stagger="library" className="mx-auto flex w-full max-w-[52rem] flex-col gap-4 px-4 pb-12 pt-3 sm:pt-11">
					<div {...inkOrder(0)} onDragOver={(event) => { if (trail.length > 0 && event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); setOverTop(true); } }} onDragLeave={() => setOverTop(false)} onDrop={(event) => { setOverTop(false); if (event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); void dropOn(trail.at(-2)?.id ?? null, event); } }} className={overTop ? "rounded-md bg-shelf" : undefined}>
						<FolderBreadcrumbs trail={trail} />
					</div>
					<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3" {...inkOrder(0)}>
						<div className="flex min-w-0 flex-col gap-1">
							<h1 className="tracking-title text-2xl font-medium leading-title text-ink [overflow-wrap:anywhere]">{trail.at(-1)?.name ?? (view === "all" ? "Library" : VIEW_LABELS[view])}</h1>
							{openLink && <RepoStatusLine link={openLink} onSyncNow={() => void syncNow(openLink)} />}
						</div>
						<div className="lh-tools -mx-1.5 gap-x-3">
							{openLink && (
								<button type="button" className="lh-tool" aria-disabled={linkSyncing || undefined} onClick={() => { if (!linkSyncing) void syncNow(openLink); }} data-testid="library-sync-now">
									<RefreshCwIcon aria-hidden="true" />
									{linkSyncing ? "Syncing…" : "Sync now"}
								</button>
							)}
							{openLink && (
								<button ref={detailsButton} type="button" className="lh-tool" onClick={(event) => openDetails(openLink, event.currentTarget)} data-testid="library-repo-details">
									<InfoIcon aria-hidden="true" />
									Repo details
								</button>
							)}
							<button type="button" className="lh-tool" aria-pressed={selected !== null} onClick={() => setSelected(selected ? null : new Set())} data-testid="library-select-mode">
								<CheckSquareIcon aria-hidden="true" />
								{selected ? "Done" : "Select"}
							</button>
							{/* Nothing is added inside a mirror (R11): the repo is its only source. */}
							{!insideMirror && (
								<>
									<button ref={newFolderButton} type="button" className="lh-tool" onClick={() => setNaming({ folder: null })} data-testid="library-new-folder">
										<FolderPlusIcon aria-hidden="true" />
										New folder
									</button>
									<button ref={linkButton} type="button" className="lh-tool" onClick={() => openLinkDialog(true)} data-testid="library-link-repo">
										<GitBranchIcon aria-hidden="true" />
										Link a repo
									</button>
									<button ref={uploadButton} type="button" className="lh-tool" onClick={() => picker.current?.click()} data-testid="library-upload">
										<UploadIcon aria-hidden="true" />
										Upload
									</button>
									<button type="button" className="lh-tool" disabled={creating} onClick={() => void newPage()} data-testid="library-new-page">
										<FilePlusIcon aria-hidden="true" />
										New page
									</button>
									<button ref={newDiagramButton} type="button" className="lh-tool" onClick={() => setNewDiagram(true)} data-testid="library-new-diagram">
										<NetworkIcon aria-hidden="true" />
										New diagram
									</button>
								</>
							)}
						</div>
						<input
							ref={picker}
							type="file"
							multiple
							hidden
							data-testid="library-file-input"
							onChange={(event) => {
								enqueue([...(event.target.files ?? [])]);
								event.target.value = "";
							}}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2" {...inkOrder(1)}>
					<label className="nb-reply-line flex h-9 min-w-[11rem] flex-[1_1_16rem] items-center gap-2 border-b border-edge text-faint pointer-coarse:h-11">
						<SearchIcon className="size-[15px] shrink-0" aria-hidden="true" />
						<input
							type="search"
							value={query}
							placeholder={prefs.searchMode === "text" ? "Search inside your notes and files…" : "Search your Library"}
							aria-label={prefs.searchMode === "text" ? "Search inside your notes and files" : "Search your Library"}
							data-testid="library-search"
							onChange={(event) => setQuery(event.target.value)}
							autoComplete="off"
							spellCheck={false}
							className="min-w-0 flex-1 bg-transparent text-md text-ink lh-bare-field placeholder:text-faint"
						/>
					</label>
					<div role="group" aria-label="What to search" className="nb-set-pills" data-testid="library-search-mode">
						{([["names", "Names"], ["text", "Full text"]] as const).map(([mode, label]) => (
							<button key={mode} type="button" aria-pressed={prefs.searchMode === mode} onClick={() => updatePrefs({ searchMode: mode })} data-testid={`library-search-mode-${mode}`} className={PILL}>{label}</button>
						))}
					</div>
					</div>
					{newDiagram && (
						<NewDiagramDialog
							folderId={folderId}
							onClose={() => setNewDiagram(false)}
							returnFocus={() => newDiagramButton.current?.focus()}
							onCreated={(item) => {
								setNewDiagram(false);
								pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size });
								void refresh();
							}}
						/>
					)}
					<DiagramProposalsLine />
					<PageProposalsLine exceptPageId={pane?.item?.id} onAccepted={(item) => { if (workspace) workspace.openItem(item); else pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size }); }} />
					<nav aria-label="Library views" className="nb-set-pills" data-testid="library-views" {...inkOrder(2)}>
						{(Object.keys(VIEW_LABELS) as LibraryViewName[]).map((name) => (
							<Link key={name} href={viewHref(name)} aria-current={view === name ? "page" : undefined} className={PILL}>{VIEW_LABELS[name]}</Link>
						))}
					</nav>
					{view !== "trash" && (
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="library-filters" {...inkOrder(3)}>
							{prefs.searchMode === "names" && (
								<>
									<LibraryChoice label="Sort" name="Sort by" testId="library-sort" value={prefs.sort} onChange={(sort) => updatePrefs({ sort })} options={(Object.keys(SORT_LABELS) as LibrarySort[]).map((name) => ({ value: name, label: SORT_LABELS[name] }))} />
									<button type="button" className="lh-tool -mx-1.5" onClick={() => updatePrefs({ descending: !prefs.descending })} aria-label={prefs.descending ? "Sorted descending" : "Sorted ascending"}>{prefs.descending ? "Descending" : "Ascending"}</button>
								</>
							)}
							<LibraryChoice<LibraryKind | "all"> label="Type" name="Filter by type" testId="library-kind" value={kind ?? "all"} onChange={(next) => setKind(next === "all" ? null : next)} options={[{ value: "all", label: "All" }, ...(Object.keys(KIND_LABEL) as LibraryKind[]).map((name) => ({ value: name, label: KIND_LABEL[name] }))]} />
							<div className={`-mr-1.5 ml-auto flex gap-0.5 ${prefs.searchMode === "text" ? "hidden" : ""}`}>
								<button type="button" aria-label="List view" aria-pressed={prefs.layout === "list"} className="lh-tool" onClick={() => updatePrefs({ layout: "list" })}><ListIcon aria-hidden="true" /></button>
								<button type="button" aria-label="Grid view" aria-pressed={prefs.layout === "grid"} className="lh-tool" onClick={() => updatePrefs({ layout: "grid" })} data-testid="library-grid"><LayoutGridIcon aria-hidden="true" /></button>
							</div>
						</div>
					)}
					{view !== "trash" && allTags(items ?? []).length > 0 && (
						<nav aria-label="Filter by tag" className="nb-set-pills" data-testid="library-tags">
							{allTags(items ?? []).map((name) => (
								<Link key={name} href={viewHref(view, tag === name ? null : name)} aria-current={tag === name ? "true" : undefined} className={PILL}>{name}</Link>
							))}
						</nav>
					)}
					{selected && (
						<div role="toolbar" aria-label="Selected items" className="sticky top-2 z-10 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-paper px-4 py-2 shadow-lift" data-testid="library-bulk">
							<span role="status" className="mr-auto text-sm font-medium text-ink">{selected.size} selected</span>
							<button type="button" className="lh-text-action" disabled={selected.size === 0} onClick={() => openMove(selectedKeys, `${selected.size} selected`, null)} data-testid="library-bulk-move">Move to…</button>
							<button type="button" className="lh-text-action" disabled={selected.size === 0} onClick={() => void bulkMark({ favorite: true })}>Favorite</button>
							<button type="button" className="lh-text-action" disabled={selectedItems.length === 0} onClick={() => setBulkTagging(true)}>Tags…</button>
							<button type="button" className="lh-text-action" disabled={selected.size === 0} onClick={() => void bulkMark({ archived: true })}>Archive</button>
							<button type="button" className="lh-text-action" data-danger="" disabled={selected.size === 0} onClick={async () => finishBulk(await runBulk(selectedKeys, async (key) => (fromRepo(key) ? FROM_REPO : trashKey(key)), nameOfKey))} data-testid="library-bulk-trash">Move to the trash</button>
						</div>
					)}
					{inFlight && (
						<div className="flex items-center justify-between gap-3 px-1 py-2" data-testid="library-upload-row">
							<span className="min-w-0 text-md text-ink [overflow-wrap:anywhere]">{inFlight.name}</span>
							<span
								role="progressbar"
								aria-label={`Uploading ${inFlight.name}`}
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={inFlight.percent}
								className="shrink-0 text-sm tabular-nums text-faint"
							>
								{inFlight.percent}%
							</span>
						</div>
					)}
					{refusals.map((refusal) => (
						<div key={refusal.id} role="alert" className="lh-line-card justify-between py-1.5 pr-1.5" data-testid="library-refusal">
							<p className="min-w-0 text-sm [overflow-wrap:anywhere]">
								<span className="font-medium text-ink">{refusal.name}</span>
								<span className="text-red"> · {refusal.message}</span>
							</p>
							<button
								type="button"
								aria-label={`Dismiss ${refusal.name}`}
								className="lh-tool"
								onClick={() => setRefusals((list) => list.filter((entry) => entry.id !== refusal.id))}
							>
								<XIcon aria-hidden="true" />
							</button>
						</div>
					))}
					{folderMissing && (
						<div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-md text-graphite" data-testid="library-folder-missing">
							<p>That folder is no longer in your Library.</p>
							<Link href={folderHref(null)} className="lh-text-action">Back to Library</Link>
						</div>
					)}
					{prefs.searchMode === "text" && view !== "trash" ? (
						<DocumentSearchPanel query={query} kind={kind} tag={tag} folders={folders} narrowed={view !== "all" ? VIEW_LABELS[view] : null} />
					) : view === "trash" ? (
						<LibraryTrash entries={trash} failed={trashFailed} failure={trashFailure} onRetry={() => void refreshTrash()} onRestore={(entry) => void restoreEntry(entry)} onPurge={setPurging} landing={params.get("entry")} />
					) : (
						<LibraryBody
							items={items}
							folders={folders}
							folderId={folderId}
							view={view}
							tag={tag}
							kind={kind}
							sort={prefs.sort}
							descending={prefs.descending}
							recentIds={recentIds}
							layout={prefs.layout}
							selected={selected}
							onToggle={toggleSelected}
							itemActions={itemActions}
							folderActions={folderActions}
							onDragStartEntry={startDrag}
							onDropOnFolder={(target, event) => void dropOn(target, event)}
							onRenameFolder={(folder, button) => { opener.current = button; setNaming({ folder }); }}
							onDeleteFolder={(folder, button) => {
								// A linked folder's "Delete folder" means unlink (Q5).
								const link = folder.mirror?.path === "" ? links.find((l) => l.folderId === folder.id) : undefined;
								if (link) return openUnlink(link, button);
								opener.current = button;
								setFolderFailure(null);
								setDeletingFolder(folder);
							}}
							loadFailed={loadFailed}
							refreshFailed={refreshFailed}
							query={query}
							onRetry={retry}
							onChanged={() => void refresh()}
							onDelete={(item, button) => {
								opener.current = button;
								setDeleting(item);
							}}
							links={links}
							pending={pendingLinks}
							linkFailures={linkFailures}
							onDismissLinkFailure={(id) => setLinkFailures((list) => list.filter((f) => f.id !== id))}
						/>
					)}
				</RouteContent>
			</div>
			)}
			<DeleteItemDialog
				item={deleting}
				onClose={() => setDeleting(null)}
				onDeleted={() => {
					if (pane?.item && pane.item.id === deleting?.id) pane.close();
					setDeleting(null);
					void refresh();
				}}
				returnFocus={() => (opener.current?.isConnected ? opener.current : uploadButton.current)?.focus()}
			/>
			{linkOpen && (
				<RepoLinkDialog
					open={linkOpen}
					location={trail.length > 0 ? `In ${trail.map((f) => f.name).join(" / ")}` : "In Library"}
					linkCount={links.length}
					hosted={hosted}
					onClose={() => openLinkDialog(false)}
					onSubmit={submitLink}
					returnFocus={() => (linkButton.current ?? newFolderButton.current)?.focus()}
				/>
			)}
			{detailsLink && (
				<RepoDetailsDialog
					link={detailsLink}
					folderName={linkedName(detailsLink)}
					onClose={() => setDetailsId(null)}
					onSyncNow={() => void syncNow(detailsLink)}
					onToken={(change) => sendToken(detailsLink, change)}
					onUnlink={() => openUnlink(detailsLink, null)}
					returnFocus={() => (linkOpener.current?.isConnected ? linkOpener.current : detailsButton.current ?? newFolderButton.current)?.focus()}
				/>
			)}
			{unlinkLink && (
				<UnlinkDialog
					target={{ folderName: linkedName(unlinkLink), files: items?.filter((i) => i.mirror?.linkId === unlinkLink.id).length ?? unlinkLink.sync.counts?.files ?? 0 }}
					onClose={() => setUnlinkId(null)}
					onConfirm={confirmUnlink}
					returnFocus={() => {
						// Cancelled over Repo details: back to its "Unlink…".
						if (detailsId) return document.querySelector<HTMLElement>('[data-testid="repo-details-unlink"]')?.focus();
						(linkOpener.current?.isConnected ? linkOpener.current : newFolderButton.current ?? linkButton.current)?.focus();
					}}
				/>
			)}
			<FolderNameDialog
				title={naming?.folder ? `Rename ${naming.folder.name}` : "New folder"}
				action={naming?.folder ? "Rename" : "Create"}
				initial={naming?.folder?.name ?? ""}
				open={naming !== null}
				onClose={() => setNaming(null)}
				onSubmit={submitName}
				returnFocus={returnFolderFocus}
			/>
			<MoveDialog
				name={moving?.label ?? null}
				folders={folders}
				moving={moving ? { folderIds: moving.targets.flatMap((key) => (key.startsWith("folder:") ? key.slice(7) : [])) } : null}
				current={moving?.current ?? null}
				onClose={() => setMoving(null)}
				onMove={submitMove}
				returnFocus={returnFolderFocus}
			/>
			<FolderNameDialog
				title={tagging ? `Tags for ${tagging.name}` : "Tags for the selected items"}
				label="Tags, separated by commas"
				action="Save"
				allowEmpty
				initial={tagging?.tags?.join(", ") ?? ""}
				open={tagging !== null || bulkTagging}
				onClose={() => { setTagging(null); setBulkTagging(false); }}
				onSubmit={async (raw) => {
					const tags = parseTags(raw);
					if (tagging) {
						const refused = await sendLibraryChange(`/api/library/items/${tagging.id}`, "PATCH", { marks: { tags } });
						if (!refused) { setTagging(null); void refresh(); }
						return refused;
					}
					// Adds to what each item has, so a bulk action never wipes tags.
					const outcome = await runBulk(selectedItems, (item) => sendLibraryChange(`/api/library/items/${item.id}`, "PATCH", { marks: { tags: [...(item.tags ?? []), ...tags] } }), (item) => item.name);
					const refused = bulkOutcome(outcome);
					if (!refused) { setBulkTagging(false); setSelected(null); void refresh(); }
					return refused;
				}}
				returnFocus={returnFolderFocus}
			/>
			<Dialog open={purging !== null} onOpenChange={(open) => { if (!open) setPurging(null); }}>
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-purge-dialog" className="gap-3 sm:max-w-md">
					<DialogTitle className="[overflow-wrap:anywhere]">Delete {purging?.name} for good?</DialogTitle>
					<p className="text-md text-graphite">This can't be undone. Page versions go too.</p>
					<div className="mt-2 flex items-center justify-end gap-5">
						<button type="button" className="lh-text-action" onClick={() => setPurging(null)}>Cancel</button>
						<button type="button" className={DESTRUCTIVE_BUTTON} onClick={() => void purgeEntry()} data-testid="library-purge-confirm">Delete for good</button>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={deletingFolder !== null} onOpenChange={(open) => { if (!open) setDeletingFolder(null); }}>
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-folder-delete-dialog" className="gap-3 sm:max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); returnFolderFocus(); }}>
					<DialogTitle className="[overflow-wrap:anywhere]">Move {deletingFolder?.name} to the trash?</DialogTitle>
					<p className="text-md text-graphite">Everything inside goes with it, and comes back together from Trash.</p>
					{folderFailure && <p role="alert" className="text-sm text-red">{folderFailure}</p>}
					<div className="mt-2 flex items-center justify-end gap-5">
						<button type="button" className="lh-text-action" onClick={() => setDeletingFolder(null)}>Cancel</button>
						<button type="button" className={DESTRUCTIVE_BUTTON} onClick={() => void confirmFolderDelete()} data-testid="library-folder-delete-confirm">Move to the trash</button>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={clash !== null} onOpenChange={(open) => { if (!open) answerClash(false); }}>
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-clash-dialog" className="gap-4 sm:max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); uploadButton.current?.focus(); }}>
					<DialogTitle className="[overflow-wrap:anywhere]">{clash?.name} is already in your Library.</DialogTitle>
					<div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
						<button type="button" className="lh-text-action" onClick={() => answerClash(false)} data-testid="library-clash-cancel">Cancel</button>
						<button type="button" className="nb-pill h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left [overflow-wrap:anywhere]" onClick={() => answerClash(true)} data-testid="library-clash-keep">
							Keep both as {clash?.suggestedName}
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
		<PagePaneSlot />
		<LibraryContextSlot items={items} folders={folders} folderId={folderId} recentIds={recentIds} failed={loadFailed} />
		</div>
	);
}
