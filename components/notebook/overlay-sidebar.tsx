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
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { switchInterface } from "@/components/interface-switch";
import { navigateTo } from "@/components/paper/navigate";
import { OverlaySidebarShell, SidebarBody as PaperSidebarBody, SidebarFooterRow as FooterRow, SidebarHead } from "@/components/paper/overlay-sidebar";
import { notebookHref, type LibraryFolder, type LibraryItem } from "@/src/core";
import { createFolder, createNote, flashcardsHref } from "./nb-actions";
import { keyLabel, saveStateLine, useNotebook } from "./nb-shared";
import { Wordmark } from "./chrome";

export { ariaKeys } from "@/components/paper/overlay-sidebar";

/** Hosted only, on demand: the Clerk SDK stays out of local mode. */
const SignOutRow = dynamic(() => import("./sign-out-row"), { ssr: false });

/** The footer's actions (ui-contract "Overlay sidebar" table), in order. */
export interface FooterActions {
	onCopy: () => void;
	onExport: () => void;
	onTogglePlain: () => void;
	onSettings: () => void;
	onReviewers: () => void;
	onFlashcards: () => void;
	onLinks: () => void;
	onSwitchToStudy: () => void;
}

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
	onClose: () => void;
	/** Open threads per page id (the dot after a note's name). */
	openThreads?: Readonly<Record<string, number>>;
	/** Just my words is on (its row shows it). */
	plain?: boolean;
	/** Hosted mode: Sign out ends the footer. */
	hosted?: boolean;
	actions: FooterActions;
	searchRef?: RefObject<HTMLInputElement | null>;
}

const threadsLine = (n: number) => (n === 1 ? ", 1 open thread" : `, ${n} open threads`);

function NoteRow({ item, current, open, onOpen }: { item: LibraryItem; current: boolean; open: number; onOpen: (id: string) => void }) {
	return (
		<li>
			{/* A link, so Cmd/Ctrl-click and middle-click open the note in a new tab; a plain click stays in place. */}
			<a
				href={notebookHref(item.id)}
				className="nb-side-row nb-side-note"
				aria-current={current ? "page" : undefined}
				data-testid="nb-side-note"
				onClick={(event) => {
					if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
					event.preventDefault();
					onOpen(item.id);
				}}
			>
				<FileTextIcon className="nb-side-icon" aria-hidden="true" />
				<span className="nb-side-name">{item.name}</span>
				{open > 0 && (
					<>
						<span className="nb-side-dot" aria-hidden="true" data-testid="nb-side-dot" />
						<span className="nb-sr-only">{threadsLine(open)}</span>
					</>
				)}
			</a>
		</li>
	);
}

function FolderRow({ folder, folders, pages, currentId, openThreads, onOpen }: { folder: LibraryFolder; folders: readonly LibraryFolder[]; pages: readonly LibraryItem[]; currentId: string; openThreads: Readonly<Record<string, number>>; onOpen: (id: string) => void }) {
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
					{children.map((child) => <FolderRow key={child.id} folder={child} folders={folders} pages={pages} currentId={currentId} openThreads={openThreads} onOpen={onOpen} />)}
					{notes.map((item) => <NoteRow key={item.id} item={item} current={item.id === currentId} open={openThreads[item.id] ?? 0} onOpen={onOpen} />)}
				</ul>
			)}
		</li>
	);
}

/** The sidebar's contents, without the dialog around them (render tests use this). */
const NO_THREADS: Readonly<Record<string, number>> = {};

export function SidebarBody({ items, folders, failed, currentId, query, mac, account, saveLine, error, onQuery, onSubmitQuery, onOpen, onNewNote, onNewFolder, onClose, openThreads = NO_THREADS, plain = false, hosted = false, actions, searchRef }: SidebarBodyProps) {
	const pages = useMemo(() => (items ? notePages(items) : []), [items]);
	const searching = query.trim().length > 0;
	const found = useMemo(() => (items && searching ? findNotes(items, query) : []), [items, query, searching]);
	const known = new Set(folders.filter((f) => !f.archivedAt).map((f) => f.id));
	const topFolders = folders.filter((f) => !f.archivedAt && (f.parentId === null || !known.has(f.parentId))).sort((a, b) => a.name.localeCompare(b.name));
	const loose = pages.filter((p) => !p.folderId || !known.has(p.folderId));
	return (
		<PaperSidebarBody
			head={<SidebarHead closeLabel="Close notes" onClose={onClose} wordmark={<Wordmark noteId={currentId} />} />}
			search={
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
			}
			actions={
				<button type="button" className="nb-side-row nb-side-action" data-testid="nb-new-note" onClick={onNewNote}>
					<PlusIcon className="nb-side-icon" aria-hidden="true" />
					<span>New note</span>
				</button>
			}
			footer={
				<>
					{account && <p className="nb-side-account" data-testid="nb-side-account">{account}</p>}
					<p className="nb-side-saved" role="status" aria-live="polite" data-testid="nb-save-state">{saveLine}</p>
					<ul className="nb-side-actions" aria-label="Notebook">
						<FooterRow label="Copy this note" binding="mod+shift+c" mac={mac} testId="nb-side-copy" onClick={actions.onCopy} />
						<FooterRow label="Export this note" binding="mod+shift+e" mac={mac} testId="nb-side-export" onClick={actions.onExport} />
						<FooterRow label="Just my words" binding="mod+shift+h" mac={mac} testId="nb-side-plain" pressed={plain} onClick={actions.onTogglePlain} />
						<FooterRow label="Settings" binding="mod+," mac={mac} testId="nb-side-settings" onClick={actions.onSettings} />
						<FooterRow label="Reviewers" mac={mac} testId="nb-side-reviewers" onClick={actions.onReviewers} />
						<FooterRow label="Make flashcards" mac={mac} testId="nb-side-flashcards" onClick={actions.onFlashcards} />
						<FooterRow label="Links" mac={mac} testId="nb-side-links" onClick={actions.onLinks} />
						<FooterRow label="Switch to Study" binding="mod+shift+o" mac={mac} testId="nb-switch-to-study" onClick={actions.onSwitchToStudy} />
						{hosted && <li><SignOutRow className="nb-side-row nb-side-footer-action" /></li>}
					</ul>
				</>
			}
		>
			{failed && !items && <p role="status" className="nb-side-status">Your Library could not be loaded.</p>}
			{searching ? (
				<ul className="nb-side-list" aria-label="Matching notes" data-testid="nb-side-results">
					{found.map((item) => <NoteRow key={item.id} item={item} current={item.id === currentId} open={openThreads[item.id] ?? 0} onOpen={onOpen} />)}
				</ul>
			) : (
				<ul className="nb-side-list" aria-label="Notes" data-testid="nb-side-notes">
					{topFolders.map((folder) => <FolderRow key={folder.id} folder={folder} folders={folders} pages={pages} currentId={currentId} openThreads={openThreads} onOpen={onOpen} />)}
					{loose.map((item) => <NoteRow key={item.id} item={item} current={item.id === currentId} open={openThreads[item.id] ?? 0} onOpen={onOpen} />)}
				</ul>
			)}
			<button type="button" className="nb-side-row nb-side-action nb-side-faint" data-testid="nb-new-folder" onClick={onNewFolder}>
				<FolderPlusIcon className="nb-side-icon" aria-hidden="true" />
				<span>New folder</span>
			</button>
			{error && <p role="alert" className="nb-side-status">{error}</p>}
		</PaperSidebarBody>
	);
}

export function OverlaySidebar({ returnFocus }: { returnFocus: RefObject<HTMLButtonElement | null> }) {
	const nb = useNotebook();
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [error, setError] = useState<string | null>(null);
	const search = useRef<HTMLInputElement>(null);
	const open = nb.sidebar !== null;
	// The dots: which notes have open threads, read each time the sidebar opens.
	const [openThreads, setOpenThreads] = useState<Readonly<Record<string, number>>>({});
	useEffect(() => {
		if (!open) return;
		let live = true;
		fetch("/api/notebook/summary", { cache: "no-store" })
			.then((response) => (response.ok ? response.json() : null))
			.then((body: { openThreads?: Record<string, number> } | null) => { if (live && body?.openThreads) setOpenThreads(body.openThreads); })
			.catch(() => { /* no dots; the notes still open */ });
		return () => { live = false; };
	}, [open]);

	const go = (id: string) => {
		nb.closeSidebar();
		setQuery("");
		if (id !== nb.noteId) router.push(notebookHref(id));
	};
	const startNote = async (name?: string) => {
		setError(null);
		const made = await createNote(name, null, nb.startMode);
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
		<OverlaySidebarShell
			state={nb.sidebar}
			onClose={nb.closeSidebar}
			onPromote={() => nb.openSidebar("click")}
			title="Notes"
			returnFocus={() => returnFocus.current}
			searchRef={search}
			query={query}
			onClearQuery={() => setQuery("")}
			container={nb.root}
		>
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
						openThreads={openThreads}
						plain={nb.plain}
						hosted={nb.hosted}
						actions={{
							onCopy: nb.copyNote,
							onExport: () => { nb.closeSidebar(); nb.openExport(); },
							onTogglePlain: nb.togglePlain,
							onSettings: () => nb.openSettings("customize"),
							onReviewers: () => nb.openSettings("reviewers"),
							onFlashcards: () => {
								nb.closeSidebar();
								if (nb.noteCommands.current) nb.noteCommands.current.makeFlashcards();
								else router.push(flashcardsHref(nb.noteId));
							},
							onLinks: nb.openLinks,
							onSwitchToStudy: () => {
								nb.closeSidebar();
								void switchInterface("study", (href) => navigateTo(router, href, "mode"));
							},
						}}
						onClose={nb.closeSidebar}
						searchRef={search}
					/>
		</OverlaySidebarShell>
	);
}
