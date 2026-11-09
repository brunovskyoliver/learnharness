"use client";

import Link from "next/link";
import { routeLink } from "@/components/paper/navigate";
import { useSearchParams } from "next/navigation";
import { BookOpenIcon, ChevronRightIcon, DumbbellIcon, FolderIcon, LibraryIcon, RepeatIcon } from "lucide-react";
import { Suspense, useMemo } from "react";
import { useLeavingRows, useNewRows } from "@/components/paper/motion-arrival";
import { Skeleton } from "@/components/ui/skeleton";
import { folderTreeRows, type FolderTreeRow, type LibraryFolder } from "@/src/core";
import { useLibrarySnapshot } from "./library-snapshot";
import { useWorkspace } from "./workspace-context";

const folderHref = (id: string) => `/library?folder=${encodeURIComponent(id)}`;

/** The tree's rows, pure for render tests. One stop, the current folder or the
 *  first; arrows follow the WAI-ARIA tree pattern. */
export function FolderTreeView({ rows, currentId, onToggle, onNavigate }: { rows: readonly FolderTreeRow[]; currentId: string | null; onToggle: (id: string, open?: boolean) => void; onNavigate?: () => void }) {
	const stop = rows.some((row) => row.folder.id === currentId) ? currentId : rows[0]?.folder.id;
	// Row 16 (feature 028): a folder's children unfold as it opens and lift as it closes.
	const fresh = useNewRows(rows.map((row) => row.folder.id));
	const shown = useLeavingRows(rows.map((row) => (
				<li key={row.folder.id} role="none" className="flex items-stretch" data-lh-row={fresh.has(row.folder.id) ? "unfold" : undefined} style={{ paddingInlineStart: `${(row.depth - 1) * 14}px` }}>
					{row.hasChildren ? (
						<button
							type="button"
							tabIndex={-1}
							aria-label={`${row.expanded ? "Hide" : "Show"} folders in ${row.folder.name}`}
							onClick={() => onToggle(row.folder.id)}
							className="nb-side-expander"
						>
							<ChevronRightIcon className="nb-side-icon nb-side-chevron" data-open={row.expanded || undefined} aria-hidden="true" />
						</button>
					) : <span className="nb-side-expander" aria-hidden="true" />}
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
						{...routeLink()}
						className="nb-side-row nb-side-folder-link"
					>
						<FolderIcon className="nb-side-icon" aria-hidden="true" />
						<span className="nb-side-title">{row.folder.name}</span>
					</Link>
				</li>
			)));
	return (
		<ul role="tree" aria-label="Library folders" data-testid="sidebar-folder-tree" className="nb-side-list nb-side-tree">
			{shown}
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
			<div role="status" className="nb-side-status">
				<p>Folders could not be loaded.</p>
				<button type="button" className="nb-text-button" onClick={retry}>Try again</button>
			</div>
		);
	}
	if (items === null) {
		return <div role="status" aria-label="Loading folders" className="flex flex-col gap-2 py-1 pl-[21px] pr-[7px]"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div>;
	}
	if (rows.length === 0) return <p className="nb-side-status nb-side-indent">No folders yet.</p>;
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
	// Row 16: the Library's folders unfold under it as it opens and lift as it closes.
	const treeOpened = useNewRows(libraryOpen ? ["tree"] : []);
	const [libraryTree] = useLeavingRows(libraryOpen ? [
		<div key="tree" data-lh-row={treeOpened.has("tree") ? "unfold" : undefined}>
			<Suspense fallback={null}>
				<CurrentFolder>{(currentId) => <LibraryFolders currentId={pathname === "/library" ? currentId : null} onNavigate={onNavigate} />}</CurrentFolder>
			</Suspense>
		</div>,
	] : []);
	return (
		<nav aria-label="Workspace" data-testid="sidebar-nav" data-sidebar-nav="" className="nb-side-list nb-side-nav" onKeyDownCapture={(event) => onNavKeyDown(event, workspace?.toggleFolder ?? (() => {}), { open: libraryOpen, toggle: workspace?.toggleLibrary ?? (() => {}) })}>
			<button type="button" data-nav-entry="" data-testid="sidebar-lessons" aria-pressed={kindFilter === "teach"} onClick={() => toggle("teach")} className="nb-side-row">
				<BookOpenIcon className="nb-side-icon" aria-hidden="true" />
				<span className="min-w-0 flex-1">Lessons</span>
				{lessonCount !== null && <span className="nb-side-count">{lessonCount}</span>}
			</button>
			<button type="button" data-nav-entry="" data-testid="sidebar-practice" aria-pressed={kindFilter === "practice"} onClick={() => toggle("practice")} className="nb-side-row">
				<DumbbellIcon className="nb-side-icon" aria-hidden="true" />
				<span className="min-w-0 flex-1">Practice</span>
				{practiceCount !== null && <span className="nb-side-count">{practiceCount}</span>}
			</button>
			<div className="flex items-stretch gap-0.5">
				<Link
					href="/library"
					data-nav-entry=""
					data-testid="sidebar-library"
					aria-current={pathname === "/library" ? "page" : undefined}
					onClick={onNavigate}
					{...routeLink()}
					className="nb-side-row min-w-0 flex-1"
				>
					<LibraryIcon className="nb-side-icon" aria-hidden="true" />
					Library
				</Link>
				<button
					type="button"
					aria-expanded={libraryOpen}
					aria-label={libraryOpen ? "Hide Library folders" : "Show Library folders"}
					data-testid="sidebar-library-toggle"
					onClick={workspace?.toggleLibrary}
					className="nb-side-expander nb-side-expander-end"
				>
					<ChevronRightIcon className="nb-side-icon nb-side-chevron" data-open={libraryOpen || undefined} aria-hidden="true" />
				</button>
			</div>
			{libraryTree}
			<Link href="/review" data-nav-entry="" data-testid="sidebar-review" aria-current={pathname === "/review" ? "page" : undefined} onClick={onNavigate} {...routeLink()} className="nb-side-row">
				<RepeatIcon className="nb-side-icon" aria-hidden="true" />
				Review
			</Link>
		</nav>
	);
}
