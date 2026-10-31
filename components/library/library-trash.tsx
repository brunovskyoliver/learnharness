"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KIND_LABEL, type LibraryTrashEntry } from "@/src/core";
import { DESTRUCTIVE_BUTTON } from "./delete-item-dialog.tsx";

const RAISED_2 = "bg-accent text-foreground hover:bg-[color-mix(in_srgb,var(--accent)_80%,var(--foreground))] pointer-coarse:h-11";

function metaOf(entry: LibraryTrashEntry): string {
	const date = new Date(entry.trashedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
	const count = entry.items.length + entry.folders.length - 1;
	const kind = entry.kind === "folder" ? `Folder · ${count} ${count === 1 ? "item" : "items"} inside` : KIND_LABEL[entry.kind];
	return `${kind} · Moved to the trash ${date}`;
}

/** Trash keeps everything until the learner deletes it for good. */
export function LibraryTrash({ entries, failed, failure, onRetry, onRestore, onPurge }: {
	entries: LibraryTrashEntry[] | null;
	failed: boolean;
	failure: string | null;
	onRetry: () => void;
	onRestore: (entry: LibraryTrashEntry) => void;
	onPurge: (entry: LibraryTrashEntry) => void;
}) {
	if (entries === null) {
		return failed ? (
			<div role="status" className="flex flex-wrap items-center gap-2 text-ink-2">
				<p>Your trash could not be loaded.</p>
				<button type="button" onClick={onRetry} className="prompt-secondary">Try again</button>
			</div>
		) : <div role="status" aria-label="Loading your trash"><Skeleton className="h-[62px] w-full rounded-[10px]" /></div>;
	}
	if (entries.length === 0) return <p className="text-ink-2">The trash is empty.</p>;
	return (
		<>
			{failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
			<ul className="flex flex-col gap-1" data-testid="library-trash-list">
				{entries.map((entry) => (
					<li key={entry.id} data-testid="library-trash-row" className="flex flex-wrap items-center gap-2 rounded-[10px] bg-card px-3 py-2.5">
						<span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
							<span className="text-base font-medium text-foreground [overflow-wrap:anywhere]">{entry.name}</span>
							<span className="text-sm text-muted-foreground" suppressHydrationWarning>{metaOf(entry)}</span>
						</span>
						<Button type="button" className={RAISED_2} aria-label={`Restore ${entry.name}`} onClick={() => onRestore(entry)}>Restore</Button>
						<Button type="button" variant="ghost" className={`${DESTRUCTIVE_BUTTON} pointer-coarse:h-11`} aria-label={`Delete ${entry.name} for good`} onClick={() => onPurge(entry)}>Delete for good</Button>
					</li>
				))}
			</ul>
		</>
	);
}
