"use client";

import { useRef, useState } from "react";
import { PencilIcon, PinIcon, StarIcon, Trash2Icon } from "lucide-react";
import { formatBytes, KIND_LABEL, type LibraryItem } from "@/src/core";
import type { EntryKey } from "./library-filter.ts";
import { LibraryEntryMenu, LibraryMoreButton, LibrarySelectBox, moreButton, type LibraryMenuAction } from "./library-menu.tsx";
import { opensInPane, usePagePane } from "./page-pane-context.tsx";

const OPEN = "lh-row-open";
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
export function LibraryRow({ item, location, repo, onRenamed, actions = [], grid = false, selection, onDragStartEntry, onDelete }: {
	item: LibraryItem;
	/** A mirrored file's repo, "github.com/oliver/notes" (feature 026). */
	repo?: string;
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
	// Feature 026: a file from a linked repo is read-only in content and place; the view gives its marks.
	const mirrored = item.mirror !== undefined;
	const menuActions: LibraryMenuAction[] = actions.length === 0 ? [] : mirrored ? [
		{ label: "Open", onSelect: () => openItem() },
		...actions,
		{ label: "Download", onSelect: () => { window.location.assign(contentUrl(item.id, true)); } },
	] : [
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
			<span className="lh-row-name flex items-start gap-1.5">
				{item.pinned && <PinIcon className="mt-[3px] size-3.5 shrink-0 text-graphite" role="img" aria-label="Pinned" />}
				{item.favorite && <StarIcon className="mt-[3px] size-3.5 shrink-0 text-graphite" role="img" aria-label="Favorite" />}
				<span className="min-w-0">{item.name}</span>
			</span>
			<span className="lh-row-meta" suppressHydrationWarning>{metaLine(item)}{location ? ` · ${location}` : ""}</span>
		</>
	);
	const newTab = item.kind === "image";
	const readable = opensInPane(item.kind);
	/** What clicking the row does, for the menu's "Open" too. */
	function openItem() {
		if (newTab) { window.open(contentUrl(item.id), "_blank", "noreferrer"); opened(); }
		else if (readable) pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size, ...(repo ? { repo } : {}) });
		else { window.location.assign(contentUrl(item.id, true)); opened(); }
	}

	return (
		<LibraryEntryMenu actions={menuActions}>
		<li
			className="lh-row"
			data-selected={selection?.selected ? "" : undefined}
			data-testid="library-row"
			draggable={Boolean(onDragStartEntry) && !renaming && !mirrored}
			onDragStart={(event) => { if (!mirrored) onDragStartEntry?.(`item:${item.id}`, event); }}
		>
			<div className={`flex items-center gap-0.5 pr-2 ${grid ? "h-full" : ""}`}>
				{selection && <LibrarySelectBox label={`Select ${item.name}`} checked={selection.selected} onChange={selection.toggle} />}
				{renaming ? (
					<div className="nb-reply-line flex min-w-0 flex-1 flex-col gap-1 px-3 py-2">
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
							className="lh-line-field font-medium"
						/>
						{renameError && <p role="alert" className="text-sm text-red">{renameError}</p>}
					</div>
				) : newTab ? (
					<a href={contentUrl(item.id)} target="_blank" rel="noreferrer" aria-label={`Open ${item.name}`} className={OPEN} onClick={opened}>{body}</a>
				) : readable ? (
					<button type="button" aria-label={`Open ${item.name}`} className={OPEN} onClick={() => { pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size, ...(repo ? { repo } : {}) }); }}>{body}</button>
				) : (
					<a href={contentUrl(item.id, true)} aria-label={`Open ${item.name}`} className={OPEN} onClick={opened}>{body}</a>
				)}
				{!renaming && !grid && !mirrored && (
					<>
						<button
							ref={renameButton}
							type="button"
							aria-label={`Rename ${item.name}`}
							className="lh-tool max-sm:hidden"
							onClick={() => {
								discard.current = false;
								setRenaming(true);
							}}
						>
							<PencilIcon aria-hidden="true" />
						</button>
						<button
							type="button"
							aria-label={`Delete ${item.name}`}
							className="lh-tool"
							onClick={(event) => onDelete(item, event.currentTarget)}
						>
							<Trash2Icon aria-hidden="true" />
						</button>
					</>
				)}
				{!renaming && menuActions.length > 0 && <LibraryMoreButton name={item.name} actions={menuActions} />}
			</div>
		</li>
		</LibraryEntryMenu>
	);
}
