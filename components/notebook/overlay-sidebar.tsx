"use client";

/**
 * Notebook's overlay sidebar (feature 024, visual-reference §18,
 * ui-contract "Overlay sidebar"): a 288px shelf over the page, which moves
 * aside and fades. Find or start a note, New note, the Library's pages
 * and folders, New folder, the account and save state, and the footer
 * actions. A Radix Dialog: focus is trapped while open and returns to the
 * menu button; Escape, ✕ and a click on the page close it, and so does
 * the pointer leaving it after a hover-open.
 */
import { ChevronRightIcon, FileTextIcon, FolderIcon, FolderPlusIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { switchInterface } from "@/components/interface-switch";
import { notebookHref, type LibraryFolder, type LibraryItem } from "@/src/core";
import { createFolder, createNote } from "./nb-actions";
import { keyLabel, saveStateLine, useNotebook } from "./nb-shared";
import { CloseGlyph, Wordmark } from "./chrome";

/** Live pages, newest first. */
export function notePages(items: readonly LibraryItem[]): LibraryItem[] {
	return items.filter((item) => item.kind === "page" && !item.archivedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Pages whose name holds the query, case-insensitively; the exact name first. */
export function findNotes(items: readonly LibraryItem[], query: string): LibraryItem[] {
	const q = query.trim().toLowerCase();
	if (!q) return notePages(items);
	const found = notePages(items).filter((item) => item.name.toLowerCase().includes(q));
	return found.sort((a, b) => Number(b.name.toLowerCase() === q) - Number(a.name.toLowerCase() === q));
}

export interface SidebarBodyProps {
	items: readonly LibraryItem[] | null;
	folders: readonly LibraryFolder[];
	failed: boolean;
	currentId: string;
	query: string;
	mac: boolean;
	account: string | null;
	saveLine: string;
	error: string | null;
	onQuery: (query: string) => void;
	onSubmitQuery: () => void;
	onOpen: (id: string) => void;
	onNewNote: () => void;
	onNewFolder: () => void;
	onSwitchToStudy: () => void;
	onClose: () => void;
	searchRef?: RefObject<HTMLInputElement | null>;
}

function NoteRow({ item, current, onOpen }: { item: LibraryItem; current: boolean; onOpen: (id: string) => void }) {
	return (
		<li>
			<button type="button" className="nb-side-row nb-side-note" aria-current={current ? "page" : undefined} data-testid="nb-side-note" onClick={() => onOpen(item.id)}>
				<FileTextIcon className="nb-side-icon" aria-hidden="true" />
				<span className="nb-side-name">{item.name}</span>
			</button>
		</li>
	);
}

function FolderRow({ folder, folders, pages, currentId, onOpen }: { folder: LibraryFolder; folders: readonly LibraryFolder[]; pages: readonly LibraryItem[]; currentId: string; onOpen: (id: string) => void }) {
	const holds = (id: string): boolean => pages.some((p) => p.id === currentId && p.folderId === id) || folders.some((f) => f.parentId === id && holds(f.id));
	const [open, setOpen] = useState(() => holds(folder.id));
	const children = folders.filter((f) => f.parentId === folder.id && !f.archivedAt);
	const notes = pages.filter((p) => p.folderId === folder.id);
	return (
		<li>
			<button type="button" className="nb-side-row nb-side-folder" aria-expanded={open} data-testid="nb-side-folder" onClick={() => setOpen((o) => !o)}>
				<ChevronRightIcon className="nb-side-icon nb-side-chevron" aria-hidden="true" />
				<FolderIcon className="nb-side-icon" aria-hidden="true" />
				<span className="nb-side-name">{folder.name}</span>
			</button>
			{open && (children.length > 0 || notes.length > 0) && (
				<ul className="nb-side-list nb-side-nested" aria-label={folder.name}>
					{children.map((child) => <FolderRow key={child.id} folder={child} folders={folders} pages={pages} currentId={currentId} onOpen={onOpen} />)}
					{notes.map((item) => <NoteRow key={item.id} item={item} current={item.id === currentId} onOpen={onOpen} />)}
				</ul>
			)}
		</li>
	);
}

/** The sidebar's contents, without the dialog around them (render tests use this). */
export function SidebarBody({ items, folders, failed, currentId, query, mac, account, saveLine, error, onQuery, onSubmitQuery, onOpen, onNewNote, onNewFolder, onSwitchToStudy, onClose, searchRef }: SidebarBodyProps) {
	const pages = useMemo(() => (items ? notePages(items) : []), [items]);
	const searching = query.trim().length > 0;
	const found = useMemo(() => (items && searching ? findNotes(items, query) : []), [items, query, searching]);
	const known = new Set(folders.filter((f) => !f.archivedAt).map((f) => f.id));
	const topFolders = folders.filter((f) => !f.archivedAt && (f.parentId === null || !known.has(f.parentId))).sort((a, b) => a.name.localeCompare(b.name));
	const loose = pages.filter((p) => !p.folderId || !known.has(p.folderId));
	return (
		<>
			<div className="nb-side-head">
				<button type="button" className="nb-menu-button" aria-label="Close notes" data-testid="nb-sidebar-close" onClick={onClose}>
					<CloseGlyph />
				</button>
				<Wordmark noteId={currentId} />
			</div>
			<div className="nb-side-scroll">
				<label className="nb-side-row nb-side-search">
					<SearchIcon className="nb-side-icon" aria-hidden="true" />
					<input
						ref={searchRef}
						type="search"
						value={query}
						placeholder="Find or start a note"
						aria-label="Find or start a note"
						autoComplete="off"
						spellCheck={false}
						data-testid="nb-side-search"
						onChange={(event) => onQuery(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmitQuery(); }
						}}
					/>
					<kbd className="nb-side-kbd">{keyLabel("mod+k", mac)}</kbd>
				</label>
				<button type="button" className="nb-side-row nb-side-action" data-testid="nb-new-note" onClick={onNewNote}>
					<PlusIcon className="nb-side-icon" aria-hidden="true" />
					<span>New note</span>
				</button>

				{failed && !items && <p role="status" className="nb-side-status">Your Library could not be loaded.</p>}
				{searching ? (
					<ul className="nb-side-list" aria-label="Matching notes" data-testid="nb-side-results">
						{found.map((item) => <NoteRow key={item.id} item={item} current={item.id === currentId} onOpen={onOpen} />)}
					</ul>
				) : (
					<ul className="nb-side-list" aria-label="Notes" data-testid="nb-side-notes">
						{topFolders.map((folder) => <FolderRow key={folder.id} folder={folder} folders={folders} pages={pages} currentId={currentId} onOpen={onOpen} />)}
						{loose.map((item) => <NoteRow key={item.id} item={item} current={item.id === currentId} onOpen={onOpen} />)}
					</ul>
				)}
				<button type="button" className="nb-side-row nb-side-action nb-side-faint" data-testid="nb-new-folder" onClick={onNewFolder}>
					<FolderPlusIcon className="nb-side-icon" aria-hidden="true" />
					<span>New folder</span>
				</button>
				{error && <p role="alert" className="nb-side-status">{error}</p>}
			</div>
			<div className="nb-side-foot">
				{account && <p className="nb-side-account" data-testid="nb-side-account">{account}</p>}
				<p className="nb-side-saved" role="status" aria-live="polite" data-testid="nb-save-state">{saveLine}</p>
				<ul className="nb-side-actions" aria-label="Notebook">
					<li>
						<button type="button" className="nb-side-row nb-side-footer-action" data-testid="nb-switch-to-study" onClick={onSwitchToStudy}>
							<span>Switch to Study</span>
							<kbd className="nb-side-kbd">{keyLabel("mod+shift+o", mac)}</kbd>
						</button>
					</li>
				</ul>
			</div>
		</>
	);
}

export function OverlaySidebar({ returnFocus }: { returnFocus: RefObject<HTMLButtonElement | null> }) {
	const nb = useNotebook();
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [error, setError] = useState<string | null>(null);
	const search = useRef<HTMLInputElement>(null);
	const before = useRef<Element | null>(null);
	const open = nb.sidebar !== null;
	const hover = nb.sidebar?.via === "hover";

	// Mod+K while open moves to the search too.
	const wantsSearch = nb.sidebar?.search ?? false;
	useEffect(() => {
		if (wantsSearch) search.current?.focus();
	}, [wantsSearch, nb.sidebar]);

	const go = (id: string) => {
		nb.closeSidebar();
		setQuery("");
		if (id !== nb.noteId) router.push(notebookHref(id));
	};
	const startNote = async (name?: string) => {
		setError(null);
		const made = await createNote(name);
		if ("error" in made) { setError(made.error); return; }
		void nb.refreshLibrary();
		go(made.ok.id);
	};
	const submitQuery = () => {
		const wanted = query.trim();
		if (!wanted) return;
		const first = nb.library ? findNotes(nb.library.items, wanted)[0] : undefined;
		if (first) go(first.id);
		else void startNote(wanted);
	};

	return (
		<Dialog.Root open={open} onOpenChange={(next) => { if (!next) nb.closeSidebar(); }}>
			<Dialog.Portal container={nb.root ?? undefined}>
				<Dialog.Overlay className="nb-side-dim" data-testid="nb-sidebar-dim" />
				<Dialog.Content
					className="nb-sidebar"
					data-testid="nb-sidebar"
					aria-describedby={undefined}
					onOpenAutoFocus={(event) => {
						before.current = document.activeElement;
						if (nb.sidebar?.search) { event.preventDefault(); search.current?.focus(); }
						else if (hover) { event.preventDefault(); (event.currentTarget as HTMLElement | null)?.focus(); }
					}}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						const back = before.current;
						if (back instanceof HTMLElement && back.isConnected && back !== document.body && !back.closest(".nb-sidebar")) back.focus();
						else returnFocus.current?.focus();
					}}
					// Escape in a search with words clears it first; the next one closes.
					onEscapeKeyDown={(event) => {
						if (query && document.activeElement === search.current) { event.preventDefault(); setQuery(""); }
					}}
					// A hover-open closes when the pointer leaves, until he clicks or types inside.
					onPointerLeave={(event) => { if (hover && event.pointerType === "mouse") nb.closeSidebar(); }}
					onPointerDown={() => { if (hover) nb.openSidebar("click"); }}
					onKeyDown={(event) => { if (hover && event.key !== "Escape") nb.openSidebar("click"); }}
				>
					<Dialog.Title className="sr-only">Notes</Dialog.Title>
					<SidebarBody
						items={nb.library?.items ?? null}
						folders={nb.library?.folders ?? []}
						failed={nb.libraryFailed}
						currentId={nb.noteId}
						query={query}
						mac={nb.mac}
						account={nb.account}
						saveLine={saveStateLine(nb.saveStatus)}
						error={error}
						onQuery={setQuery}
						onSubmitQuery={submitQuery}
						onOpen={go}
						onNewNote={() => void startNote()}
						onNewFolder={async () => {
							setError(null);
							const made = await createFolder();
							if ("error" in made) setError(made.error);
							else void nb.refreshLibrary();
						}}
						onSwitchToStudy={() => {
							nb.closeSidebar();
							void switchInterface("study", (href) => router.push(href));
						}}
						onClose={nb.closeSidebar}
						searchRef={search}
					/>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
