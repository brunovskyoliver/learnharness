"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FilePlusIcon, FolderPlusIcon, SearchIcon, UploadIcon, XIcon } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { folderPathLabel, folderTrail, liveFolderId, MAX_FILE_BYTES, nameKey, type LibraryFolder, type LibraryItem } from "@/src/core";
import { DeleteItemDialog, DESTRUCTIVE_BUTTON } from "./delete-item-dialog.tsx";
import { FolderNameDialog, MoveDialog, sendLibraryChange } from "./folder-dialogs.tsx";
import { FolderBreadcrumbs, folderHref, FolderRow } from "./folder-row.tsx";
import { LibraryRow } from "./library-row.tsx";
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
	onRenameFolder?: (folder: LibraryFolder, opener: HTMLElement) => void;
	onMoveFolder?: (folder: LibraryFolder, opener: HTMLElement) => void;
	onDeleteFolder?: (folder: LibraryFolder, opener: HTMLElement) => void;
	onMoveItem?: (item: LibraryItem, opener: HTMLElement) => void;
	loadFailed: boolean;
	refreshFailed: boolean;
	query: string;
	onRetry: () => void;
	onChanged: () => void;
	onDelete: (item: LibraryItem, opener: HTMLElement) => void;
}

/** The list's states, pure for SSR tests. Loading, empty and failed stay
 *  distinct, and a failed refresh keeps the list. */
export function LibraryBody({ items, folders = [], folderId = null, onRenameFolder = noop, onMoveFolder = noop, onDeleteFolder = noop, onMoveItem, loadFailed, refreshFailed, query, onRetry, onChanged, onDelete }: LibraryBodyProps) {
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
	// A search covers the whole Library, and says where each match lives.
	const key = nameKey(query.trim());
	const inFolder = (id: string | null | undefined) => liveFolderId(id, folders) === folderId;
	const shown = key ? items.filter((item) => nameKey(item.name).includes(key)) : items.filter((item) => inFolder(item.folderId));
	const shownFolders = key ? folders.filter((folder) => nameKey(folder.name).includes(key)) : folders.filter((folder) => inFolder(folder.parentId));
	const countIn = (id: string) => folders.filter((f) => f.parentId === id).length + items.filter((i) => i.folderId === id).length;
	const whereIs = (id: string | null | undefined) => (key ? folderPathLabel(id, folders) || "Library" : undefined);
	const nothing = shown.length === 0 && shownFolders.length === 0;
	return (
		<>
			{refreshFailed && failedLine}
			{key && nothing ? (
				<p role="status" className="text-ink-2">Nothing matched</p>
			) : nothing ? (
				<p className="text-ink-2">{folderId ? "This folder is empty." : "Nothing here yet. Upload a document or start a page."}</p>
			) : (
				<ul className="flex flex-col gap-1" data-testid="library-list">
					{shownFolders.map((folder) => <FolderRow key={folder.id} folder={folder} count={countIn(folder.id)} location={whereIs(folder.parentId)} onRename={onRenameFolder} onMove={onMoveFolder} onDelete={onDeleteFolder} />)}
					{shown.map((item) => <LibraryRow key={item.id} item={item} location={whereIs(item.folderId)} onRenamed={onChanged} onMove={onMoveItem} onDelete={onDelete} />)}
				</ul>
			)}
		</>
	);
}

interface Clash { name: string; suggestedName: string; answer: (keepBoth: boolean) => void }

/** The full Library view: upload, list, search, rename, open and delete. */
export function LibraryView() {
	const pane = usePagePane();
	const [creating, setCreating] = useState(false);
	const [items, setItems] = useState<LibraryItem[] | null>(null);
	const [folders, setFolders] = useState<LibraryFolder[]>([]);
	const [naming, setNaming] = useState<{ folder: LibraryFolder | null } | null>(null);
	const [moving, setMoving] = useState<{ item?: LibraryItem; folder?: LibraryFolder } | null>(null);
	const [deletingFolder, setDeletingFolder] = useState<LibraryFolder | null>(null);
	const [folderFailure, setFolderFailure] = useState<string | null>(null);
	const newFolderButton = useRef<HTMLButtonElement>(null);
	const openFolderId = useSearchParams().get("folder");
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
			const body = await response.json() as { items: LibraryItem[]; folders: LibraryFolder[]; limits: { maxFileBytes: number } };
			if (id !== request.current) return;
			maxFileBytes.current = body.limits.maxFileBytes;
			loaded.current = true;
			setItems(body.items);
			setFolders(body.folders);
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
	useEffect(() => { void refresh(); }, [refresh]);
	useServerEvent("library-changed", () => void refresh());
	useServerResync(() => void refresh());
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
	const submitMove = async (target: string | null) => finishChange(
		moving?.folder
			? await sendLibraryChange(`/api/library/folders/${moving.folder.id}`, "PATCH", { parentId: target })
			: await sendLibraryChange(`/api/library/items/${moving?.item?.id}`, "PATCH", { folderId: target }),
		() => setMoving(null),
	);
	const confirmFolderDelete = async () => {
		if (!deletingFolder) return;
		const refused = await sendLibraryChange(`/api/library/folders/${deletingFolder.id}`, "DELETE");
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
					<FolderBreadcrumbs trail={trail} />
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h1 className="font-title text-2xl font-medium leading-[1.2] tracking-[-0.3px] [overflow-wrap:anywhere]">{trail.at(-1)?.name ?? "Library"}</h1>
						<div className="flex flex-wrap gap-2">
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
					<LibraryBody
						items={items}
						folders={folders}
						folderId={folderId}
						onRenameFolder={(folder, button) => { opener.current = button; setNaming({ folder }); }}
						onMoveFolder={(folder, button) => { opener.current = button; setMoving({ folder }); }}
						onDeleteFolder={(folder, button) => { opener.current = button; setFolderFailure(null); setDeletingFolder(folder); }}
						onMoveItem={(item, button) => { opener.current = button; setMoving({ item }); }}
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
				name={moving ? (moving.folder?.name ?? moving.item?.name ?? "") : null}
				folders={folders}
				moving={moving?.folder ? { folderId: moving.folder.id } : null}
				current={moving?.folder ? liveFolderId(moving.folder.parentId, folders) : liveFolderId(moving?.item?.folderId, folders)}
				onClose={() => setMoving(null)}
				onMove={submitMove}
				returnFocus={returnFolderFocus}
			/>
			<Dialog open={deletingFolder !== null} onOpenChange={(open) => { if (!open) setDeletingFolder(null); }}>
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-folder-delete-dialog" className="gap-3 rounded-[10px] border-0 bg-card sm:max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); returnFolderFocus(); }}>
					<DialogTitle className="text-base font-semibold [overflow-wrap:anywhere]">Delete {deletingFolder?.name}?</DialogTitle>
					{folderFailure && <p role="alert" className="text-sm text-destructive">{folderFailure}</p>}
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" className="pointer-coarse:h-11" onClick={() => setDeletingFolder(null)}>Cancel</Button>
						<Button type="button" variant="ghost" className={`${DESTRUCTIVE_BUTTON} pointer-coarse:h-11`} onClick={() => void confirmFolderDelete()} data-testid="library-folder-delete-confirm">Delete</Button>
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
