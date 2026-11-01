"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpenIcon, ChevronDownIcon, ChevronRightIcon, DumbbellIcon, FolderIcon, LibraryIcon, RepeatIcon } from "lucide-react";
import { Suspense, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { folderTreeRows, type FolderTreeRow, type LibraryFolder } from "@/src/core";
import { useLibrarySnapshot } from "./library-snapshot";
import { useWorkspace } from "./workspace-context";

const ROW = "flex h-9 items-center gap-2 rounded-md px-2.5 text-base transition-colors hover:bg-accent pointer-coarse:h-11";
const folderHref = (id: string) => `/library?folder=${encodeURIComponent(id)}`;

/** The tree's rows, pure for render tests. One stop, the current folder or the
 *  first; arrows follow the WAI-ARIA tree pattern. */
export function FolderTreeView({ rows, currentId, onToggle, onNavigate }: { rows: readonly FolderTreeRow[]; currentId: string | null; onToggle: (id: string, open?: boolean) => void; onNavigate?: () => void }) {
	const stop = rows.some((row) => row.folder.id === currentId) ? currentId : rows[0]?.folder.id;
	return (
		<ul role="tree" aria-label="Library folders" data-testid="sidebar-folder-tree" className="flex max-h-[30dvh] flex-col gap-px overflow-y-auto">
			{rows.map((row) => (
				<li key={row.folder.id} role="none" className="flex items-stretch" style={{ paddingInlineStart: `${row.depth * 0.75}rem` }}>
					{row.hasChildren ? (
						<button
							type="button"
							tabIndex={-1}
							aria-label={`${row.expanded ? "Hide" : "Show"} folders in ${row.folder.name}`}
							onClick={() => onToggle(row.folder.id)}
							className="flex w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent pointer-coarse:w-11"
						>
							{row.expanded ? <ChevronDownIcon className="size-3.5" aria-hidden="true" /> : <ChevronRightIcon className="size-3.5" aria-hidden="true" />}
						</button>
					) : <span className="w-6 shrink-0 pointer-coarse:w-11" aria-hidden="true" />}
					<Link
						href={folderHref(row.folder.id)}
						role="treeitem"
						aria-level={row.depth}
						aria-expanded={row.hasChildren ? row.expanded : undefined}
						aria-current={row.folder.id === currentId ? "page" : undefined}
						aria-selected={row.folder.id === currentId}
						tabIndex={row.folder.id === stop ? 0 : -1}
						data-nav-entry=""
						data-folder-id={row.folder.id}
						data-testid="sidebar-folder"
						onClick={onNavigate}
						className={cn("flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent pointer-coarse:min-h-11", row.folder.id === currentId ? "bg-accent text-foreground" : "text-ink-2")}
					>
						<FolderIcon className="ui-icon shrink-0 text-muted-foreground" aria-hidden="true" />
						<span className="min-w-0 break-words">{row.folder.name}</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

/** Tree states: loading, failed and empty stay distinct. A failed refresh keeps the list. */
function LibraryFolders({ onNavigate, currentId }: { onNavigate?: () => void; currentId: string | null }) {
	const workspace = useWorkspace();
	const { items, folders, failed, retry } = useLibrarySnapshot(true);
	const expanded = workspace?.expandedFolders;
	const rows = useMemo(() => withOpenPath(folders, currentId, expanded), [folders, currentId, expanded]);
	if (failed) {
		return (
			<div role="status" className="px-2.5 py-1 text-sm text-muted-foreground">
				<p>Folders could not be loaded.</p>
				<button type="button" className="prompt-secondary mt-1" onClick={retry}>Try again</button>
			</div>
		);
	}
	if (items === null) {
		return <div role="status" aria-label="Loading folders" className="flex flex-col gap-1 px-2.5 py-1"><Skeleton className="h-6 w-4/5" /><Skeleton className="h-6 w-3/5" /></div>;
	}
	if (rows.length === 0) return <p className="px-2.5 py-1 text-sm text-muted-foreground">No folders yet.</p>;
	return <FolderTreeView rows={rows} currentId={currentId} onToggle={workspace?.toggleFolder ?? (() => {})} onNavigate={onNavigate} />;
}

/** The current folder is always visible, whatever was left collapsed. */
function withOpenPath(folders: readonly LibraryFolder[], currentId: string | null, expanded?: ReadonlySet<string>): FolderTreeRow[] {
	const open = new Set(expanded);
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const seen = new Set<string>();
	for (let at = currentId === null ? undefined : byId.get(currentId)?.parentId; at && !seen.has(at); at = byId.get(at)?.parentId) {
		seen.add(at);
		open.add(at);
	}
	return folderTreeRows(folders, open);
}

function CurrentFolder({ children }: { children: (currentId: string | null) => React.ReactNode }) {
	const params = useSearchParams();
	return children(params.get("folder"));
}

/** Arrow walk over the whole block, so one Tab stop reaches every entry. */
function onNavKeyDown(event: React.KeyboardEvent<HTMLElement>, onToggle: (id: string, open?: boolean) => void, library: { open: boolean; toggle: () => void }) {
	if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
	const entries = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-nav-entry]")];
	const current = (event.target as HTMLElement).closest<HTMLElement>("[data-nav-entry]");
	if (!current) return;
	const at = entries.indexOf(current);
	const go = (index: number) => {
		event.preventDefault();
		event.stopPropagation();
		entries[index]?.focus();
	};
	if (event.key === "ArrowDown") return go(Math.min(at + 1, entries.length - 1));
	if (event.key === "ArrowUp") return go(Math.max(at - 1, 0));
	if (event.key === "Home") return go(0);
	if (event.key === "End") return go(entries.length - 1);
	// Claimed: a session's document-level Enter would otherwise take it for the composer.
	if (event.key === "Enter" || (event.key === " " && current.tagName === "BUTTON")) {
		event.preventDefault();
		event.stopPropagation();
		current.click();
		return;
	}
	// The Library row is the tree's root: right opens it, left closes it.
	if (current.dataset.testid === "sidebar-library" && ((event.key === "ArrowRight" && !library.open) || (event.key === "ArrowLeft" && library.open))) {
		event.preventDefault();
		event.stopPropagation();
		library.toggle();
		return;
	}
	const folderId = current.dataset.folderId;
	if (!folderId || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;
	event.preventDefault();
	event.stopPropagation();
	const expandedState = current.getAttribute("aria-expanded");
	if (event.key === "ArrowRight") {
		if (expandedState === "false") onToggle(folderId, true);
		else if (expandedState === "true") entries[at + 1]?.focus();
	} else if (expandedState === "true") {
		onToggle(folderId, false);
	} else {
		// To the parent: the nearest earlier row at a shallower level.
		const level = Number(current.getAttribute("aria-level"));
		for (let i = at - 1; i >= 0; i--) {
			if (Number(entries[i]!.getAttribute("aria-level")) < level) { entries[i]!.focus(); return; }
		}
	}
}

/** Unified navigation (feature 014): lessons and practice narrow the session list
 *  below, and the Library opens its folder tree. */
export function SidebarNav({ pathname, kindFilter, onKindFilter, lessonCount, practiceCount, onNavigate }: {
	pathname: string;
	kindFilter: "teach" | "all" | "practice";
	onKindFilter: (filter: "teach" | "all" | "practice") => void;
	lessonCount: number | null;
	practiceCount: number | null;
	onNavigate: () => void;
}) {
	const workspace = useWorkspace();
	const toggle = (kind: "teach" | "practice") => onKindFilter(kindFilter === kind ? "all" : kind);
	const libraryOpen = workspace?.libraryOpen ?? false;
	const entryClass = (active: boolean) => cn(ROW, active ? "bg-accent text-foreground" : "text-ink-2");
	return (
		<nav aria-label="Workspace" data-testid="sidebar-nav" data-sidebar-nav="" className="flex shrink-0 flex-col gap-px px-2 pb-1" onKeyDownCapture={(event) => onNavKeyDown(event, workspace?.toggleFolder ?? (() => {}), { open: libraryOpen, toggle: workspace?.toggleLibrary ?? (() => {}) })}>
			<button type="button" data-nav-entry="" data-testid="sidebar-lessons" aria-pressed={kindFilter === "teach"} onClick={() => toggle("teach")} className={cn(entryClass(kindFilter === "teach"), "w-full text-left")}>
				<BookOpenIcon className="size-[15px] shrink-0" aria-hidden="true" />
				<span className="min-w-0 flex-1">Lessons</span>
				{lessonCount !== null && <span className="text-sm tabular-nums text-muted-foreground">{lessonCount}</span>}
			</button>
			<button type="button" data-nav-entry="" data-testid="sidebar-practice" aria-pressed={kindFilter === "practice"} onClick={() => toggle("practice")} className={cn(entryClass(kindFilter === "practice"), "w-full text-left")}>
				<DumbbellIcon className="size-[15px] shrink-0" aria-hidden="true" />
				<span className="min-w-0 flex-1">Practice</span>
				{practiceCount !== null && <span className="text-sm tabular-nums text-muted-foreground">{practiceCount}</span>}
			</button>
			<div className="flex items-stretch gap-px">
				<Link
					href="/library"
					data-nav-entry=""
					data-testid="sidebar-library"
					aria-current={pathname === "/library" ? "page" : undefined}
					onClick={onNavigate}
					className={cn(entryClass(pathname === "/library"), "min-w-0 flex-1")}
				>
					<LibraryIcon className="size-[15px] shrink-0" aria-hidden="true" />
					Library
				</Link>
				<button
					type="button"
					aria-expanded={libraryOpen}
					aria-label={libraryOpen ? "Hide Library folders" : "Show Library folders"}
					data-testid="sidebar-library-toggle"
					onClick={workspace?.toggleLibrary}
					className="flex w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:w-11"
				>
					{libraryOpen ? <ChevronDownIcon className="size-3.5" aria-hidden="true" /> : <ChevronRightIcon className="size-3.5" aria-hidden="true" />}
				</button>
			</div>
			{libraryOpen && (
				<Suspense fallback={null}>
					<CurrentFolder>{(currentId) => <LibraryFolders currentId={pathname === "/library" ? currentId : null} onNavigate={onNavigate} />}</CurrentFolder>
				</Suspense>
			)}
			<Link href="/review" data-nav-entry="" data-testid="sidebar-review" aria-current={pathname === "/review" ? "page" : undefined} onClick={onNavigate} className={entryClass(pathname === "/review")}>
				<RepeatIcon className="size-[15px] shrink-0" aria-hidden="true" />
				Review
			</Link>
		</nav>
	);
}
