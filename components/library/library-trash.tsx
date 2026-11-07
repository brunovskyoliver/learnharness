"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { KIND_LABEL, type LibraryTrashEntry } from "@/src/core";

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
			<ul className="flex flex-col" data-testid="library-trash-list">
				{entries.map((entry) => (
					<li key={entry.id} data-testid="library-trash-row" className="lh-row flex flex-wrap items-center gap-x-5 gap-y-1 py-2.5 pl-3 pr-3">
						<span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
							<span className="lh-row-name">{entry.name}</span>
							<span className="lh-row-meta" suppressHydrationWarning>{metaOf(entry)}</span>
						</span>
						<button type="button" className="lh-text-action" aria-label={`Restore ${entry.name}`} onClick={() => onRestore(entry)}>Restore</button>
						<button type="button" className="lh-text-action" data-danger="" aria-label={`Delete ${entry.name} for good`} onClick={() => onPurge(entry)}>Delete for good</button>
					</li>
				))}
			</ul>
		</>
	);
}
