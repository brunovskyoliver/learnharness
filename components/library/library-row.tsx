"use client";

import { useRef, useState } from "react";
import { PencilIcon, PinIcon, StarIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, KIND_LABEL, type LibraryItem } from "@/src/core";
import type { EntryKey } from "./library-filter.ts";
import { LibraryEntryMenu, LibraryMoreButton, LibrarySelectBox, moreButton, type LibraryMenuAction } from "./library-menu.tsx";
import { opensInPane, usePagePane } from "./page-pane-context.tsx";

const ACTION = "size-9 text-faint pointer-coarse:size-11";
const OPEN = "flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-shelf";
const contentUrl = (id: string, download = false) => `/api/library/items/${id}/content${download ? "?download=1" : ""}`;

function metaLine(item: LibraryItem): string {
	const date = new Date(item.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
	const parts = [KIND_LABEL[item.kind], formatBytes(item.size), date];
	if (item.origin.type === "agent") parts.push("Made by the agent");
	if (item.textState === "none" || item.textState === "failed") parts.push("No text could be read");
	if (item.archivedAt) parts.push("Archived");
	if (item.tags?.length) parts.push(item.tags.join(", "));
	return parts.join(" · ");
}

/** One Library item. Every action's accessible name includes the item's name. */
export function LibraryRow({ item, location, onRenamed, actions = [], grid = false, selection, onDragStartEntry, onDelete }: {
	item: LibraryItem;
	/** The item's folder path, shown while searching the whole Library. */
	location?: string;
	onRenamed: () => void;
	/** Everything else this row can do, for its ⋯ and right-click menus. */
	actions?: readonly LibraryMenuAction[];
	grid?: boolean;
	/** Present while selecting. */
	selection?: { selected: boolean; toggle: () => void };
	onDragStartEntry?: (key: EntryKey, event: React.DragEvent) => void;
	onDelete: (item: LibraryItem, opener: HTMLElement) => void;
}) {
	const [renaming, setRenaming] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);
	const pane = usePagePane();
	const renameButton = useRef<HTMLButtonElement>(null);
	const discard = useRef(false);
	const saving = useRef(false);

	const finish = () => {
		setRenaming(false);
		setRenameError(null);
		requestAnimationFrame(() => renameButton.current?.focus());
	};
	const commit = async (raw: string) => {
		const name = raw.trim();
		if (discard.current || saving.current) return;
		if (!name || name === item.name) return finish();
		saving.current = true;
		try {
			const response = await fetch(`/api/library/items/${item.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (response.ok) {
				finish();
				onRenamed();
			} else {
				const body = await response.json().catch(() => ({})) as { error?: string };
				setRenameError(body.error ?? `${item.name} could not be renamed.`);
			}
		} catch {
			setRenameError(`${item.name} could not be renamed. Check your connection and try again.`);
		}
		saving.current = false;
	};

	const opened = () => { void fetch(`/api/library/items/${item.id}/opened`, { method: "POST" }).catch(() => {}); };
	// The right-click and phone paths: the Rename icon hides on narrow screens.
	const menuActions: LibraryMenuAction[] = actions.length === 0 ? [] : [
		{ label: "Rename", onSelect: () => { discard.current = false; setRenaming(true); } },
		...actions,
		...(item.kind === "page" ? [{ label: "Make flashcards", onSelect: () => { window.location.assign(`/review?make=${encodeURIComponent(`page:${item.id}`)}`); } }] : []),
		...(item.kind === "pdf" ? [
			{ label: "Open in a new tab", onSelect: () => { window.open(contentUrl(item.id), "_blank", "noreferrer"); opened(); } },
			{ label: "Download", onSelect: () => { window.location.assign(contentUrl(item.id, true)); } },
		] : []),
		{ label: "Move to the trash", destructive: true, onSelect: () => onDelete(item, moreButton(`More actions for ${item.name}`)) },
	];
	const body = (
		<>
			<span className="flex items-start gap-1.5 text-md font-medium text-ink [overflow-wrap:anywhere]">
				{item.pinned && <PinIcon className="ui-icon mt-1 size-3.5 shrink-0 text-graphite" role="img" aria-label="Pinned" />}
				{item.favorite && <StarIcon className="ui-icon mt-1 size-3.5 shrink-0 text-graphite" role="img" aria-label="Favorite" />}
				<span className="min-w-0">{item.name}</span>
			</span>
			<span className="text-sm text-faint" suppressHydrationWarning>{metaLine(item)}{location ? ` · ${location}` : ""}</span>
		</>
	);
	const newTab = item.kind === "image";
	const readable = opensInPane(item.kind);

	return (
		<LibraryEntryMenu actions={menuActions}>
		<li
			className={`rounded-lg ${selection?.selected ? "bg-shelf" : "bg-shelf"}`}
			data-testid="library-row"
			draggable={Boolean(onDragStartEntry) && !renaming}
			onDragStart={(event) => onDragStartEntry?.(`item:${item.id}`, event)}
		>
			<div className={`flex items-center gap-1 pr-1.5 ${grid ? "h-full" : ""}`}>
				{selection && <LibrarySelectBox label={`Select ${item.name}`} checked={selection.selected} onChange={selection.toggle} />}
				{renaming ? (
					<div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2">
						<input
							autoFocus
							defaultValue={item.name}
							aria-label={`Rename ${item.name}`}
							autoComplete="off"
							spellCheck={false}
							aria-invalid={renameError ? true : undefined}
							data-testid="library-rename-input"
							onFocus={(event) => event.currentTarget.select()}
							onBlur={(event) => void commit(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void commit(event.currentTarget.value);
								} else if (event.key === "Escape") {
									event.preventDefault();
									event.stopPropagation();
									discard.current = true;
									finish();
								}
							}}
							className="h-9 w-full min-w-0 rounded-md border border-rule bg-transparent px-2 text-md text-ink pointer-coarse:h-11"
						/>
						{renameError && <p role="alert" className="text-sm text-red">{renameError}</p>}
					</div>
				) : newTab ? (
					<a href={contentUrl(item.id)} target="_blank" rel="noreferrer" aria-label={`Open ${item.name}`} className={OPEN} onClick={opened}>{body}</a>
				) : readable ? (
					<button type="button" aria-label={`Open ${item.name}`} className={OPEN} onClick={() => { pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size }); }}>{body}</button>
				) : (
					<a href={contentUrl(item.id, true)} aria-label={`Open ${item.name}`} className={OPEN} onClick={opened}>{body}</a>
				)}
				{!renaming && !grid && (
					<>
						<Button
							ref={renameButton}
							type="button"
							variant="ghost"
							size="icon"
							aria-label={`Rename ${item.name}`}
							className={`${ACTION} max-sm:hidden`}
							onClick={() => {
								discard.current = false;
								setRenaming(true);
							}}
						>
							<PencilIcon className="ui-icon" aria-hidden="true" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={`Delete ${item.name}`}
							className={ACTION}
							onClick={(event) => onDelete(item, event.currentTarget)}
						>
							<Trash2Icon className="ui-icon" aria-hidden="true" />
						</Button>
					</>
				)}
				{!renaming && menuActions.length > 0 && <LibraryMoreButton name={item.name} actions={menuActions} />}
			</div>
		</li>
		</LibraryEntryMenu>
	);
}
