"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, KIND_LABEL, PAGE_MAX_BYTES, type LibraryItem } from "@/src/core";

const ACTION = "size-9 text-muted-foreground pointer-coarse:size-11";
const OPEN = "flex min-w-0 flex-1 flex-col gap-0.5 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-accent";
const contentUrl = (id: string, download = false) => `/api/library/items/${id}/content${download ? "?download=1" : ""}`;

function metaLine(item: LibraryItem): string {
	const date = new Date(item.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
	const parts = [KIND_LABEL[item.kind], formatBytes(item.size), date];
	if (item.origin.type === "agent") parts.push("Made by the agent");
	if (item.textState === "none" || item.textState === "failed") parts.push("No text could be read");
	return parts.join(" · ");
}

/** The read-only view for text kinds. Moves into the page pane in T059. */
function ReadOnlyView({ item }: { item: LibraryItem }) {
	const [text, setText] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const tooLong = item.size > PAGE_MAX_BYTES;
	const load = useCallback(async () => {
		setFailed(false);
		try {
			const response = await fetch(contentUrl(item.id), { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			setText(await response.text());
		} catch {
			setFailed(true);
		}
	}, [item.id]);
	useEffect(() => { if (!tooLong) void load(); }, [load, tooLong]);
	return (
		<div className="flex flex-col gap-2 px-3 pb-3" data-testid="library-read-only">
			<p className="text-sm text-muted-foreground">This is your original; it can&apos;t be edited here.</p>
			{tooLong ? (
				<p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
					Too long to preview
					<a href={contentUrl(item.id, true)} className="prompt-secondary">Download</a>
				</p>
			) : failed ? (
				<div role="status" className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
					<p>{item.name} could not be loaded.</p>
					<button type="button" className="prompt-secondary" onClick={() => void load()}>Try again</button>
				</div>
			) : text === null ? (
				<p role="status" className="text-sm text-muted-foreground">Loading…</p>
			) : (
				<pre
					// Keyboard users scroll it; the track stays hidden globally.
					tabIndex={0}
					aria-label={item.name}
					className={`max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md text-base [overflow-wrap:anywhere] ${item.kind === "code" || item.kind === "csv" ? "font-mono" : "font-ui"}`}
				>{text}</pre>
			)}
		</div>
	);
}

/** One Library item. Every action's accessible name includes the item's name. */
export function LibraryRow({ item, onRenamed, onDelete }: {
	item: LibraryItem;
	onRenamed: () => void;
	onDelete: (item: LibraryItem, opener: HTMLElement) => void;
}) {
	const [renaming, setRenaming] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
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

	const body = (
		<>
			<span className="text-base font-medium text-foreground [overflow-wrap:anywhere]">{item.name}</span>
			<span className="text-sm text-muted-foreground" suppressHydrationWarning>{metaLine(item)}</span>
		</>
	);
	const newTab = item.kind === "pdf" || item.kind === "image";
	const readable = item.kind !== "other" && !newTab;

	return (
		<li className="rounded-[10px] bg-card" data-testid="library-row">
			<div className="flex items-center gap-1 pr-1.5">
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
							className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-base text-foreground pointer-coarse:h-11"
						/>
						{renameError && <p role="alert" className="text-sm text-destructive">{renameError}</p>}
					</div>
				) : newTab ? (
					<a href={contentUrl(item.id)} target="_blank" rel="noreferrer" aria-label={`Open ${item.name}`} className={OPEN}>{body}</a>
				) : readable ? (
					<button type="button" aria-label={`Open ${item.name}`} aria-expanded={expanded} className={OPEN} onClick={() => setExpanded((open) => !open)}>{body}</button>
				) : (
					<a href={contentUrl(item.id, true)} aria-label={`Open ${item.name}`} className={OPEN}>{body}</a>
				)}
				{!renaming && (
					<>
						<Button
							ref={renameButton}
							type="button"
							variant="ghost"
							size="icon"
							aria-label={`Rename ${item.name}`}
							className={ACTION}
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
			</div>
			{expanded && readable && <ReadOnlyView key={item.updatedAt} item={item} />}
		</li>
	);
}
