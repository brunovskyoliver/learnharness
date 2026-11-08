"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { KIND_LABEL, type LibraryTrashEntry } from "@/src/core";

function metaOf(entry: LibraryTrashEntry): string {
	const date = new Date(entry.trashedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
	const count = entry.items.length + entry.folders.length - 1;
	const kind = entry.kind === "folder" ? `Folder · ${count} ${count === 1 ? "item" : "items"} inside` : KIND_LABEL[entry.kind];
	return `${kind} · Moved to the trash ${date}`;
}

const LANDING_MS = 2000;

/** Trash keeps everything until the learner deletes it for good. `landing`
 *  (feature 027, `/library?view=trash&entry=ID`): that entry is scrolled into
 *  view, holds the shelf for 2s and its Restore takes focus. */
export function LibraryTrash({ entries, failed, failure, onRetry, onRestore, onPurge, landing = null }: {
	entries: LibraryTrashEntry[] | null;
	failed: boolean;
	failure: string | null;
	onRetry: () => void;
	onRestore: (entry: LibraryTrashEntry) => void;
	onPurge: (entry: LibraryTrashEntry) => void;
	landing?: string | null;
}) {
	const list = useRef<HTMLUListElement>(null);
	const [flash, setFlash] = useState<string | null>(null);
	const landed = useRef<string | null>(null);
	const found = landing !== null && (entries?.some((entry) => entry.id === landing) ?? false);
	useEffect(() => {
		if (!landing) { landed.current = null; return; }
		if (!found || landed.current === landing) return;
		landed.current = landing;
		const row = list.current?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(landing)}"]`);
		row?.scrollIntoView({ block: "center" });
		row?.querySelector<HTMLElement>("[data-trash-restore]")?.focus({ preventScroll: true });
		setFlash(landing);
	}, [landing, found]);
	useEffect(() => {
		if (!flash) return;
		const timer = window.setTimeout(() => setFlash(null), LANDING_MS);
		return () => window.clearTimeout(timer);
	}, [flash]);
	if (entries === null) {
		return failed ? (
			<div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-md text-ink">
				<p>Your trash could not be loaded.</p>
				<button type="button" onClick={onRetry} className="lh-text-action">Try again</button>
			</div>
		) : <div role="status" aria-label="Loading your trash"><Skeleton className="h-[60px] w-full rounded-lg" /></div>;
	}
	if (entries.length === 0) return <p className="text-md text-faint">The trash is empty.</p>;
	return (
		<>
			{failure && <p role="alert" className="text-sm text-red">{failure}</p>}
			<ul ref={list} className="flex flex-col" data-testid="library-trash-list">
				{entries.map((entry) => (
					<li key={entry.id} data-testid="library-trash-row" data-entry-id={entry.id} data-landing={flash === entry.id || undefined} className={`lh-row flex flex-wrap items-center gap-x-5 gap-y-1 py-2.5 pl-3 pr-3 ${flash === entry.id ? "lh-jump-flash" : ""}`}>
						<span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
							<span className="lh-row-name">{entry.name}</span>
							<span className="lh-row-meta" suppressHydrationWarning>{metaOf(entry)}</span>
						</span>
						<button type="button" className="lh-text-action" data-trash-restore="" aria-label={`Restore ${entry.name}`} onClick={() => onRestore(entry)}>Restore</button>
						<button type="button" className="lh-text-action" data-danger="" aria-label={`Delete ${entry.name} for good`} onClick={() => onPurge(entry)}>Delete for good</button>
					</li>
				))}
			</ul>
		</>
	);
}
