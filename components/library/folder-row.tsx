"use client";

import Link from "next/link";
import { FolderIcon, FolderInputIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LibraryFolder } from "@/src/core";

const ACTION = "size-9 text-muted-foreground pointer-coarse:size-11";
export const folderHref = (id: string | null) => (id ? `/library?folder=${encodeURIComponent(id)}` : "/library");

export function FolderRow({ folder, count, location, onRename, onMove, onDelete }: {
	folder: LibraryFolder;
	count: number;
	/** The folder's path, shown while searching the whole Library. */
	location?: string;
	onRename: (folder: LibraryFolder, opener: HTMLElement) => void;
	onMove: (folder: LibraryFolder, opener: HTMLElement) => void;
	onDelete: (folder: LibraryFolder, opener: HTMLElement) => void;
}) {
	const meta = [`Folder · ${count} ${count === 1 ? "item" : "items"}`, location].filter(Boolean).join(" · ");
	return (
		<li className="rounded-[10px] bg-card" data-testid="library-folder-row">
			<div className="flex items-center gap-1 pr-1.5">
				<Link href={folderHref(folder.id)} aria-label={`Open folder ${folder.name}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-accent">
					<FolderIcon className="ui-icon shrink-0 text-muted-foreground" aria-hidden="true" />
					<span className="flex min-w-0 flex-col gap-0.5">
						<span className="text-base font-medium text-foreground [overflow-wrap:anywhere]">{folder.name}</span>
						<span className="text-sm text-muted-foreground">{meta}</span>
					</span>
				</Link>
				<Button type="button" variant="ghost" size="icon" aria-label={`Rename folder ${folder.name}`} className={ACTION} onClick={(event) => onRename(folder, event.currentTarget)}><PencilIcon className="ui-icon" aria-hidden="true" /></Button>
				<Button type="button" variant="ghost" size="icon" aria-label={`Move folder ${folder.name}`} className={ACTION} onClick={(event) => onMove(folder, event.currentTarget)}><FolderInputIcon className="ui-icon" aria-hidden="true" /></Button>
				<Button type="button" variant="ghost" size="icon" aria-label={`Delete folder ${folder.name}`} className={ACTION} onClick={(event) => onDelete(folder, event.currentTarget)}><Trash2Icon className="ui-icon" aria-hidden="true" /></Button>
			</div>
		</li>
	);
}

/** The path to the open folder. The last crumb is the current page. */
export function FolderBreadcrumbs({ trail }: { trail: readonly LibraryFolder[] }) {
	if (trail.length === 0) return null;
	return (
		<nav aria-label="Folder path" data-testid="library-breadcrumbs">
			<ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-ink-2">
				<li><Link href={folderHref(null)} className="rounded-md underline-offset-2 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">Library</Link></li>
				{trail.map((folder, index) => (
					<li key={folder.id} className="flex min-w-0 items-center gap-1.5">
						<span aria-hidden="true" className="text-muted-foreground">/</span>
						{index === trail.length - 1
							? <span aria-current="page" className="text-foreground [overflow-wrap:anywhere]">{folder.name}</span>
							: <Link href={folderHref(folder.id)} className="rounded-md underline-offset-2 [overflow-wrap:anywhere] hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">{folder.name}</Link>}
					</li>
				))}
			</ol>
		</nav>
	);
}
