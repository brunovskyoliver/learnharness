"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckSquareIcon, FilePlusIcon, FolderPlusIcon, LayoutGridIcon, ListIcon, SearchIcon, UploadIcon, XIcon } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { folderPathLabel, folderTrail, KIND_LABEL, liveFolderId, MAX_FILE_BYTES, type LibraryFolder, type LibraryItem, type LibraryKind, type LibraryMarks, type LibraryTrashEntry } from "@/src/core";
import { DeleteItemDialog, DESTRUCTIVE_BUTTON } from "./delete-item-dialog.tsx";
import { FolderNameDialog, MoveDialog, sendLibraryChange } from "./folder-dialogs.tsx";
import { FolderBreadcrumbs, folderHref, FolderRow } from "./folder-row.tsx";
import { allTags, DRAG_TYPE, parseTags, parseView, runBulk, selectEntries, SORT_LABELS, VIEW_LABELS, type EntryKey, type LibraryLayout, type LibrarySort, type LibraryViewName } from "./library-filter.ts";
import type { LibraryMenuAction } from "./library-menu.tsx";
import { LibraryRow } from "./library-row.tsx";
import { LibraryTrash } from "./library-trash.tsx";
import { createBlankPage, PagePaneSlot, usePagePane } from "./page-pane-context.tsx";
import { runUploadQueue, sendFile } from "./upload.ts";

const RAISED_2 = "bg-accent text-foreground hover:bg-[color-mix(in_srgb,var(--accent)_80%,var(--foreground))] pointer-coarse:h-11";
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
export function LibraryBody({ items, folders = [], folderId = null, view = "all", tag = null, kind = null, sort = "name", descending = false, recentIds = [], layout = "list", selected = null, onToggle = noop, itemActions, folderActions, onDragStartEntry, onDropOnFolder, onRenameFolder = noop, onDeleteFolder = noop, loadFailed, refreshFailed, query, onRetry, onChanged, onDelete }: LibraryBodyProps) {
	const [overFolder, setOverFolder] = useState<string | null>(null);
	const failedLine = (
		<div role="status" className="flex flex-wrap items-center gap-2 text-ink-2">
			<p>{LOAD_FAILED}</p>
			<button type="button" onClick={onRetry} className="prompt-secondary">Try again</button>
		</div>
	);
	if (items === null) {
		return loadFailed ? failedLine : (
			<div role="status" aria-label="Loading your Library" className="flex flex-col gap-1">
				<Skeleton className="h-[62px] w-full rounded-[10px]" />
				<Skeleton className="h-[62px] w-full rounded-[10px]" />
				<Skeleton className="h-[62px] w-full rounded-[10px]" />
			</div>
		);
	}
	const shown = selectEntries(items, folders, { view, folderId, search: query, tag, kind, sort, descending, recentIds });
	const filtering = Boolean(query.trim() || tag || kind);
	const wide = filtering || view === "favorites" || view === "recent";
	const countIn = (id: string) => folders.filter((f) => f.parentId === id).length + items.filter((i) => i.folderId === id).length;
	// A search covers the whole Library, and says where each match lives.
	const whereIs = (id: string | null | undefined) => (wide ? folderPathLabel(id, folders) || "Library" : undefined);
	const nothing = shown.items.length === 0 && shown.folders.length === 0;
	return (
		<>
			{refreshFailed && failedLine}
			{filtering && nothing ? (
				<p role="status" className="text-ink-2">Nothing matched</p>
			) : nothing ? (
				<p className="text-ink-2">{folderId ? "This folder is empty." : EMPTY[view]}</p>
			) : (
				<ul className={layout === "grid" ? "grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-1"} data-testid="library-list">
					{shown.folders.map((folder) => (
						<FolderRow
							key={folder.id}
							folder={folder}
							count={countIn(folder.id)}
							location={whereIs(folder.parentId)}
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
type LibraryPrefs = { layout: LibraryLayout; sort: LibrarySort; descending: boolean };
const DEFAULT_PREFS: LibraryPrefs = { layout: "list", sort: "name", descending: false };
const CONTROL = "h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground pointer-coarse:h-11";
const PILL = "inline-flex min-h-9 items-center rounded-md px-2.5 text-sm transition-colors hover:bg-accent pointer-coarse:min-h-11";

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
			const body = await response.json() as { items: LibraryItem[]; folders: LibraryFolder[]; recentIds: string[]; limits: { maxFileBytes: number } };
			if (id !== request.current) return;
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
	// Known only once loaded: a missing folder says so instead of showing the top level.
	const folderMissing = openFolderId !== null && items !== null && !folders.some((folder) => folder.id === openFolderId);
	const folderId = openFolderId !== null && !folderMissing ? openFolderId : null;
	const trail = folderTrail(folderId, folders);
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
	/** Sentence for what failed, or null. The rest of the batch still happened. */
	const bulkOutcome = (outcome: { done: number; failed: { name: string; reason: string }[] }) =>
		outcome.failed.length === 0 ? null : outcome.failed.map((f) => `${f.name}: ${f.reason}`).join(" ");
	const moveMany = async (targets: readonly EntryKey[], target: string | null) => {
		const outcome = await runBulk(targets, (key) => moveOne(key, target), nameOfKey);
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
	const itemActions = (item: LibraryItem): LibraryMenuAction[] => [
		{ label: item.favorite ? "Remove from favorites" : "Add to favorites", onSelect: () => void markItem(item, { favorite: !item.favorite }) },
		{ label: item.pinned ? "Unpin" : "Pin to top", onSelect: () => void markItem(item, { pinned: !item.pinned }) },
		{ label: "Tags…", onSelect: () => setTagging(item) },
		{ label: "Move to…", testId: "library-action-move", onSelect: () => openMove([`item:${item.id}`], item.name, liveFolderId(item.folderId, folders)) },
		{ label: item.archivedAt ? "Unarchive" : "Archive", onSelect: () => void markItem(item, { archived: !item.archivedAt }) },
	];
	const folderActions = (folder: LibraryFolder): LibraryMenuAction[] => [
		{ label: folder.favorite ? "Remove from favorites" : "Add to favorites", onSelect: () => void markFolder(folder, { favorite: !folder.favorite }) },
		{ label: folder.pinned ? "Unpin" : "Pin to top", onSelect: () => void markFolder(folder, { pinned: !folder.pinned }) },
		{ label: "Move to…", testId: "library-action-move", onSelect: () => openMove([`folder:${folder.id}`], folder.name, liveFolderId(folder.parentId, folders)) },
		{ label: folder.archivedAt ? "Unarchive" : "Archive", onSelect: () => void markFolder(folder, { archived: !folder.archivedAt }) },
	];
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
		if (openItem && listed && (listed.name !== openItem.name || listed.size !== openItem.size)) pane?.update({ id: listed.id, name: listed.name, kind: listed.kind, size: listed.size });
	}, [listed, openItem, pane]);
	const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

	return (
		<div className="session-workspace-layout flex h-dvh flex-col md:flex-row">
		<div
			className={`flex min-h-0 min-w-0 flex-1 flex-col ${dragging ? "outline-2 -outline-offset-4 outline-border" : ""}`}
			data-testid="library-view"
			onDragOver={(event) => {
				if (!hasFiles(event)) return;
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
			<TopBar />
			<div data-testid="library-scroll" className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-[52rem] flex-col gap-4 px-4 pb-12 pt-3 sm:pt-11">
					<div onDragOver={(event) => { if (trail.length > 0 && event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); setOverTop(true); } }} onDragLeave={() => setOverTop(false)} onDrop={(event) => { setOverTop(false); if (event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); void dropOn(trail.at(-2)?.id ?? null, event); } }} className={overTop ? "rounded-md bg-accent" : undefined}>
						<FolderBreadcrumbs trail={trail} />
					</div>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h1 className="font-title text-2xl font-medium leading-[1.2] tracking-[-0.3px] [overflow-wrap:anywhere]">{trail.at(-1)?.name ?? (view === "all" ? "Library" : VIEW_LABELS[view])}</h1>
						<div className="flex flex-wrap gap-2">
							<Button type="button" className={RAISED_2} aria-pressed={selected !== null} onClick={() => setSelected(selected ? null : new Set())} data-testid="library-select-mode">
								<CheckSquareIcon className="ui-icon" aria-hidden="true" />
								{selected ? "Done" : "Select"}
							</Button>
							<Button ref={newFolderButton} type="button" className={RAISED_2} onClick={() => setNaming({ folder: null })} data-testid="library-new-folder">
								<FolderPlusIcon className="ui-icon" aria-hidden="true" />
								New folder
							</Button>
							<Button ref={uploadButton} type="button" className={RAISED_2} onClick={() => picker.current?.click()} data-testid="library-upload">
								<UploadIcon className="ui-icon" aria-hidden="true" />
								Upload
							</Button>
							<Button type="button" className={RAISED_2} disabled={creating} onClick={() => void newPage()} data-testid="library-new-page">
								<FilePlusIcon className="ui-icon" aria-hidden="true" />
								New page
							</Button>
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
					<label className="flex h-9 items-center gap-2 rounded-md bg-card px-2.5 text-muted-foreground transition-colors focus-within:bg-accent pointer-coarse:h-11">
						<SearchIcon className="ui-icon shrink-0" aria-hidden="true" />
						<input
							type="search"
							value={query}
							placeholder="Search your Library"
							aria-label="Search your Library"
							data-testid="library-search"
							onChange={(event) => setQuery(event.target.value)}
							autoComplete="off"
							spellCheck={false}
							className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground"
						/>
					</label>
					<nav aria-label="Library views" className="flex flex-wrap gap-1" data-testid="library-views">
						{(Object.keys(VIEW_LABELS) as LibraryViewName[]).map((name) => (
							<Link key={name} href={viewHref(name)} aria-current={view === name ? "page" : undefined} className={`${PILL} ${view === name ? "bg-accent text-foreground" : "text-ink-2"}`}>{VIEW_LABELS[name]}</Link>
						))}
					</nav>
					{view !== "trash" && (
						<div className="flex flex-wrap items-center gap-2" data-testid="library-filters">
							<label className="flex items-center gap-1.5 text-sm text-ink-2">Sort
								<select aria-label="Sort by" className={CONTROL} value={prefs.sort} onChange={(event) => updatePrefs({ sort: event.target.value as LibrarySort })}>
									{(Object.keys(SORT_LABELS) as LibrarySort[]).map((name) => <option key={name} value={name}>{SORT_LABELS[name]}</option>)}
								</select>
							</label>
							<button type="button" className={`${PILL} text-ink-2`} onClick={() => updatePrefs({ descending: !prefs.descending })} aria-label={prefs.descending ? "Sorted descending" : "Sorted ascending"}>{prefs.descending ? "Descending" : "Ascending"}</button>
							<label className="flex items-center gap-1.5 text-sm text-ink-2">Type
								<select aria-label="Filter by type" className={CONTROL} value={kind ?? ""} onChange={(event) => setKind((event.target.value || null) as LibraryKind | null)}>
									<option value="">All</option>
									{(Object.keys(KIND_LABEL) as LibraryKind[]).map((name) => <option key={name} value={name}>{KIND_LABEL[name]}</option>)}
								</select>
							</label>
							<div className="ml-auto flex gap-1">
								<Button type="button" variant="ghost" size="icon" aria-label="List view" aria-pressed={prefs.layout === "list"} className={`size-9 pointer-coarse:size-11 ${prefs.layout === "list" ? "bg-accent" : "text-muted-foreground"}`} onClick={() => updatePrefs({ layout: "list" })}><ListIcon className="ui-icon" aria-hidden="true" /></Button>
								<Button type="button" variant="ghost" size="icon" aria-label="Grid view" aria-pressed={prefs.layout === "grid"} className={`size-9 pointer-coarse:size-11 ${prefs.layout === "grid" ? "bg-accent" : "text-muted-foreground"}`} onClick={() => updatePrefs({ layout: "grid" })} data-testid="library-grid"><LayoutGridIcon className="ui-icon" aria-hidden="true" /></Button>
							</div>
						</div>
					)}
					{view !== "trash" && allTags(items ?? []).length > 0 && (
						<nav aria-label="Filter by tag" className="flex flex-wrap gap-1" data-testid="library-tags">
							{allTags(items ?? []).map((name) => (
								<Link key={name} href={viewHref(view, tag === name ? null : name)} aria-current={tag === name ? "true" : undefined} className={`${PILL} ${tag === name ? "bg-accent text-foreground" : "text-ink-2"}`}>{name}</Link>
							))}
						</nav>
					)}
					{selected && (
						<div role="toolbar" aria-label="Selected items" className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-[10px] bg-accent px-3 py-2" data-testid="library-bulk">
							<span role="status" className="mr-auto text-sm text-foreground">{selected.size} selected</span>
							<Button type="button" variant="ghost" className="pointer-coarse:h-11" disabled={selected.size === 0} onClick={() => openMove(selectedKeys, `${selected.size} selected`, null)} data-testid="library-bulk-move">Move to…</Button>
							<Button type="button" variant="ghost" className="pointer-coarse:h-11" disabled={selected.size === 0} onClick={() => void bulkMark({ favorite: true })}>Favorite</Button>
							<Button type="button" variant="ghost" className="pointer-coarse:h-11" disabled={selectedItems.length === 0} onClick={() => setBulkTagging(true)}>Tags…</Button>
							<Button type="button" variant="ghost" className="pointer-coarse:h-11" disabled={selected.size === 0} onClick={() => void bulkMark({ archived: true })}>Archive</Button>
							<Button type="button" variant="ghost" className={`${DESTRUCTIVE_BUTTON} pointer-coarse:h-11`} disabled={selected.size === 0} onClick={async () => finishBulk(await runBulk(selectedKeys, trashKey, nameOfKey))} data-testid="library-bulk-trash">Move to the trash</Button>
						</div>
					)}
					{inFlight && (
						<div className="flex items-center justify-between gap-3 rounded-[10px] bg-card px-3 py-2.5" data-testid="library-upload-row">
							<span className="min-w-0 text-base [overflow-wrap:anywhere]">{inFlight.name}</span>
							<span
								role="progressbar"
								aria-label={`Uploading ${inFlight.name}`}
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={inFlight.percent}
								className="shrink-0 text-sm tabular-nums text-muted-foreground"
							>
								{inFlight.percent}%
							</span>
						</div>
					)}
					{refusals.map((refusal) => (
						<div key={refusal.id} role="alert" className="flex items-center justify-between gap-2 rounded-[10px] bg-card py-1.5 pl-3 pr-1.5" data-testid="library-refusal">
							<p className="min-w-0 text-sm [overflow-wrap:anywhere]">
								<span className="font-medium text-foreground">{refusal.name}</span>
								<span className="text-destructive"> · {refusal.message}</span>
							</p>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={`Dismiss ${refusal.name}`}
								className="size-9 pointer-coarse:size-11"
								onClick={() => setRefusals((list) => list.filter((entry) => entry.id !== refusal.id))}
							>
								<XIcon className="ui-icon" aria-hidden="true" />
							</Button>
						</div>
					))}
					{folderMissing && (
						<div role="status" className="flex flex-wrap items-center gap-2 text-ink-2" data-testid="library-folder-missing">
							<p>That folder is no longer in your Library.</p>
							<Link href={folderHref(null)} className="prompt-secondary">Back to Library</Link>
						</div>
					)}
					{view === "trash" ? (
						<LibraryTrash entries={trash} failed={trashFailed} failure={trashFailure} onRetry={() => void refreshTrash()} onRestore={(entry) => void restoreEntry(entry)} onPurge={setPurging} />
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
							onDeleteFolder={(folder, button) => { opener.current = button; setFolderFailure(null); setDeletingFolder(folder); }}
							loadFailed={loadFailed}
							refreshFailed={refreshFailed}
							query={query}
							onRetry={retry}
							onChanged={() => void refresh()}
							onDelete={(item, button) => {
								opener.current = button;
								setDeleting(item);
							}}
						/>
					)}
				</div>
			</div>
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
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-purge-dialog" className="gap-3 rounded-[10px] border-0 bg-card sm:max-w-md">
					<DialogTitle className="text-base font-semibold [overflow-wrap:anywhere]">Delete {purging?.name} for good?</DialogTitle>
					<p className="text-sm text-muted-foreground">This can't be undone. Page versions go too.</p>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" className="pointer-coarse:h-11" onClick={() => setPurging(null)}>Cancel</Button>
						<Button type="button" variant="ghost" className={`${DESTRUCTIVE_BUTTON} pointer-coarse:h-11`} onClick={() => void purgeEntry()} data-testid="library-purge-confirm">Delete for good</Button>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={deletingFolder !== null} onOpenChange={(open) => { if (!open) setDeletingFolder(null); }}>
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-folder-delete-dialog" className="gap-3 rounded-[10px] border-0 bg-card sm:max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); returnFolderFocus(); }}>
					<DialogTitle className="text-base font-semibold [overflow-wrap:anywhere]">Move {deletingFolder?.name} to the trash?</DialogTitle>
					<p className="text-sm text-muted-foreground">Everything inside goes with it, and comes back together from Trash.</p>
					{folderFailure && <p role="alert" className="text-sm text-destructive">{folderFailure}</p>}
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" className="pointer-coarse:h-11" onClick={() => setDeletingFolder(null)}>Cancel</Button>
						<Button type="button" variant="ghost" className={`${DESTRUCTIVE_BUTTON} pointer-coarse:h-11`} onClick={() => void confirmFolderDelete()} data-testid="library-folder-delete-confirm">Move to the trash</Button>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog open={clash !== null} onOpenChange={(open) => { if (!open) answerClash(false); }}>
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-clash-dialog" className="gap-4 rounded-[10px] border-0 bg-card sm:max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); uploadButton.current?.focus(); }}>
					<DialogTitle className="text-base font-semibold [overflow-wrap:anywhere]">{clash?.name} is already in your Library.</DialogTitle>
					<div className="flex flex-wrap justify-end gap-2">
						<Button type="button" variant="ghost" className="pointer-coarse:h-11" onClick={() => answerClash(false)} data-testid="library-clash-cancel">Cancel</Button>
						<Button type="button" className={`${RAISED_2} h-auto min-h-9 max-w-full whitespace-normal text-left [overflow-wrap:anywhere]`} onClick={() => answerClash(true)} data-testid="library-clash-keep">
							Keep both as {clash?.suggestedName}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
		<PagePaneSlot />
		</div>
	);
}
