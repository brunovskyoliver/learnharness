"use client";

import Link from "next/link";
import { FolderIcon, PencilIcon, PinIcon, StarIcon, Trash2Icon } from "lucide-react";
import type { LibraryFolder } from "@/src/core";
import { DRAG_TYPE, type EntryKey } from "./library-filter.ts";
import { LibraryEntryMenu, LibraryMoreButton, LibrarySelectBox, moreButton, type LibraryMenuAction } from "./library-menu.tsx";

export const folderHref = (id: string | null) => (id ? `/library?folder=${encodeURIComponent(id)}` : "/library");

export function FolderRow({ folder, count, location, actions = [], selection, dropTarget, onDragStartEntry, onRename, onDelete }: {
	folder: LibraryFolder;
	count: number;
	/** The folder's path, shown while searching the whole Library. */
	location?: string;
	onRename: (folder: LibraryFolder, opener: HTMLElement) => void;
	actions?: readonly LibraryMenuAction[];
	selection?: { selected: boolean; toggle: () => void };
	/** Receives dragged Library entries. */
	dropTarget?: { over: boolean; onOver: (over: boolean) => void; onDrop: (event: React.DragEvent) => void };
	onDragStartEntry?: (key: EntryKey, event: React.DragEvent) => void;
	onDelete: (folder: LibraryFolder, opener: HTMLElement) => void;
}) {
	const menuActions: LibraryMenuAction[] = actions.length === 0 ? [] : [
		{ label: "Rename", onSelect: () => onRename(folder, document.body) },
		...actions,
		{ label: "Move to the trash", destructive: true, onSelect: () => onDelete(folder, moreButton(`More actions for ${folder.name}`)) },
	];
	const meta = [`Folder · ${count} ${count === 1 ? "item" : "items"}`, folder.archivedAt ? "Archived" : "", location].filter(Boolean).join(" · ");
	return (
		<LibraryEntryMenu actions={menuActions}>
		<li
			className="lh-row"
			data-selected={selection?.selected ? "" : undefined}
			data-drop={dropTarget?.over ? "" : undefined}
			data-testid="library-folder-row"
			draggable={Boolean(onDragStartEntry)}
			onDragStart={(event) => onDragStartEntry?.(`folder:${folder.id}`, event)}
			onDragOver={(event) => {
				if (!dropTarget || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
				event.preventDefault();
				dropTarget.onOver(true);
			}}
			onDragLeave={() => dropTarget?.onOver(false)}
			onDrop={(event) => {
				if (!dropTarget || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
				event.preventDefault();
				dropTarget.onOver(false);
				dropTarget.onDrop(event);
			}}
		>
			<div className="flex items-center gap-0.5 pr-2">
				{selection && <LibrarySelectBox label={`Select folder ${folder.name}`} checked={selection.selected} onChange={selection.toggle} />}
				<Link href={folderHref(folder.id)} aria-label={`Open folder ${folder.name}`} className="lh-row-open lh-row-folder">
					<FolderIcon className="size-[15px] shrink-0 text-faint" aria-hidden="true" />
					<span className="flex min-w-0 flex-col gap-0.5">
						<span className="lh-row-name flex items-start gap-1.5">
							{folder.pinned && <PinIcon className="mt-[3px] size-3.5 shrink-0 text-graphite" role="img" aria-label="Pinned" />}
							{folder.favorite && <StarIcon className="mt-[3px] size-3.5 shrink-0 text-graphite" role="img" aria-label="Favorite" />}
							<span className="min-w-0">{folder.name}</span>
						</span>
						<span className="lh-row-meta">{meta}</span>
					</span>
				</Link>
				<button type="button" aria-label={`Rename folder ${folder.name}`} className="lh-tool max-sm:hidden" onClick={(event) => onRename(folder, event.currentTarget)}><PencilIcon aria-hidden="true" /></button>
				<button type="button" aria-label={`Delete folder ${folder.name}`} className="lh-tool" onClick={(event) => onDelete(folder, event.currentTarget)}><Trash2Icon aria-hidden="true" /></button>
				{menuActions.length > 0 && <LibraryMoreButton name={folder.name} actions={menuActions} />}
			</div>
		</li>
		</LibraryEntryMenu>
	);
}

/** The path to the open folder. The last crumb is the current page. */
export function FolderBreadcrumbs({ trail }: { trail: readonly LibraryFolder[] }) {
	if (trail.length === 0) return null;
	return (
		<nav aria-label="Folder path" data-testid="library-breadcrumbs">
			<ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-faint">
				<li><Link href={folderHref(null)} className="rounded-md underline-offset-2 hover:text-ink hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Library</Link></li>
				{trail.map((folder, index) => (
					<li key={folder.id} className="flex min-w-0 items-center gap-1.5">
						<span aria-hidden="true" className="text-faint">/</span>
						{index === trail.length - 1
							? <span aria-current="page" className="text-ink [overflow-wrap:anywhere]">{folder.name}</span>
							: <Link href={folderHref(folder.id)} className="rounded-md underline-offset-2 [overflow-wrap:anywhere] hover:text-ink hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">{folder.name}</Link>}
					</li>
				))}
			</ol>
		</nav>
	);
}
