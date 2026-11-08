"use client";

/**
 * The Library's full view (feature 027, research R9, ui-contract §4): any
 * `/library?item=ID[&page=N][&quote=Q]` address shows that item across the
 * content column, with the pane's own surfaces (page editor, PDF reader,
 * diagram, read-only view) in their `full` presentation, an image view and a
 * line for files nothing can show. It holds its own small `PagePaneApi`, never
 * the shared pane, so the right pane, its tabs and the lesson stay as they
 * were (FR-017).
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DownloadIcon } from "lucide-react";
import { formatBytes, KIND_LABEL, libraryHref, type LibraryHref, type LibraryItem } from "@/src/core";
import { PaneFullContext } from "@/components/workspace-pane";
import { isOwnPassageEntry } from "@/components/reference-return";
import { EditorLoading, PagePane, PaneHeader } from "./page-pane.tsx";
import type { PagePaneApi, PaneItem } from "./page-pane-context.tsx";
import { folderHref } from "./folder-row.tsx";

const contentUrl = (id: string, download = false) => `/api/library/items/${encodeURIComponent(id)}/content${download ? "?download=1" : ""}`;

export const ITEM_MISSING = "That document is no longer in your Library, so the citation can't be checked.";

function paneItemOf(item: LibraryItem, address: LibraryHref, citation: boolean, nonce: number): PaneItem {
	const jump = address.page !== undefined || address.quote ? { page: address.page, quote: address.quote, citation, nonce } : undefined;
	return { id: item.id, name: item.name, kind: item.kind, size: item.size, ...(jump ? { jump } : {}) };
}

/** An image fit to the column, its name as the alt text. */
function ImageView({ item, onLibrary }: { item: PaneItem; onLibrary: () => void }) {
	return (
		<section aria-label={item.name} className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="full-view-image">
			<PaneHeader phone={false} closeLabel={`Close ${item.name}`} onClose={onLibrary} name={<span className="min-w-0 truncate text-md font-medium text-ink">{item.name}</span>} />
			<div className="px-4 pb-6">
				{/* eslint-disable-next-line @next/next/no-img-element -- the Library's own file, any size */}
				<img src={contentUrl(item.id)} alt={item.name} className="mx-auto block h-auto max-w-full rounded-md" />
			</div>
		</section>
	);
}

/** A file nothing here can show: what it is, and Download. */
function OtherView({ item, onLibrary }: { item: PaneItem; onLibrary: () => void }) {
	return (
		<section aria-label={item.name} className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="full-view-other">
			<PaneHeader phone={false} closeLabel={`Close ${item.name}`} onClose={onLibrary} name={<span className="min-w-0 truncate text-md font-medium text-ink">{item.name}</span>} />
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-6 text-md text-graphite">
				<p>{KIND_LABEL[item.kind]} · {formatBytes(item.size)}</p>
				<a href={contentUrl(item.id, true)} className="lh-text-action inline-flex items-center gap-1.5" data-testid="full-view-download">
					<DownloadIcon className="size-[15px]" aria-hidden="true" />
					Download
				</a>
			</div>
		</section>
	);
}

/** The item at `address`, or the Library's own states while it can't be shown. */
export function LibraryFullView({ address, items, loadFailed, onRetry, onChanged }: {
	address: LibraryHref;
	/** Null until the Library list has loaded. */
	items: LibraryItem[] | null;
	loadFailed: boolean;
	onRetry: () => void;
	/** A rename or a change here: the list refreshes. */
	onChanged: () => void;
}) {
	const router = useRouter();
	const listed = items?.find((entry) => entry.id === address.itemId) ?? null;
	// His own passage (a chip in his message) or a citation (any other address).
	const [own, setOwn] = useState<boolean | null>(null);
	useEffect(() => { setOwn(isOwnPassageEntry(window.history.state)); }, []);
	const [current, setCurrent] = useState<PaneItem | null>(null);
	useEffect(() => {
		if (!listed || own === null) return;
		setCurrent((before) => {
			if (!before || before.id !== listed.id) return paneItemOf(listed, address, !own, Date.now());
			return before.name === listed.name && before.size === listed.size ? before : { ...before, name: listed.name, size: listed.size };
		});
	}, [listed, own, address]);

	const pane = useMemo<PagePaneApi>(() => ({
		item: current,
		restored: true,
		openCount: 1,
		open: (next) => router.push(libraryHref({ itemId: next.id })),
		close: () => router.push(folderHref(listed?.folderId ?? null)),
		update: (next) => { setCurrent(next); onChanged(); },
	}), [current, router, listed?.folderId, onChanged]);
	const full = useMemo(() => ({ onLibrary: pane.close }), [pane]);

	if (items === null) {
		return loadFailed ? (
			<div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 text-md text-ink" data-testid="library-full-view">
				<p>Your Library could not be loaded.</p>
				<button type="button" onClick={onRetry} className="lh-text-action">Try again</button>
			</div>
		) : <div data-testid="library-full-view"><EditorLoading /></div>;
	}
	if (!listed) return <p role="status" className="px-4 text-md text-graphite" data-testid="library-citation-missing">{ITEM_MISSING}</p>;
	if (!current) return <div data-testid="library-full-view"><EditorLoading /></div>;
	return (
		<PaneFullContext.Provider value={full}>
			<div className="flex min-h-0 flex-1 flex-col" data-testid="library-full-view" data-item-id={current.id}>
				{current.kind === "image" ? <ImageView item={current} onLibrary={pane.close} />
					: current.kind === "other" ? <OtherView item={current} onLibrary={pane.close} />
					: <PagePane key={current.id} item={current} pane={pane} full />}
			</div>
		</PaneFullContext.Provider>
	);
}
