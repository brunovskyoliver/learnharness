"use client";

/** The Library's "Full text" mode (feature 019). Loaded on demand. Loading, empty,
 *  failed and not-yet-searched each say so; a file that wasn't searched is named,
 *  so an empty result is never silent. */
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { docCountText, DOC_STATE_LABEL, docStatusText, folderPathLabel, KIND_LABEL, type DocSearchResult, type LibraryFolder, type LibraryKind } from "@/src/core";
import { docHitPlace, DocSnippetText } from "./doc-snippet.tsx";
import { LibraryChoice } from "./library-menu.tsx";
import { usePagePane } from "./page-pane-api.ts";
import { useDocumentSearch } from "./use-document-search.ts";


function hitMeta(hit: DocSearchResult): string {
	const parts = [KIND_LABEL[hit.kind]];
	const place = docHitPlace(hit.jump);
	if (place) parts.push(place);
	if (hit.location) parts.push(hit.location);
	if (hit.archived) parts.push("Archived");
	if (hit.tags.length) parts.push(hit.tags.join(", "));
	if (hit.state !== "indexed") parts.push(hit.reason ?? DOC_STATE_LABEL[hit.state]);
	return parts.join(" · ");
}

export function DocumentSearchPanel({ query, kind, tag, folders, narrowed = null }: { query: string; kind: LibraryKind | null; tag: string | null; folders: readonly LibraryFolder[]; /** The Library view open, which a text search doesn't narrow to. */ narrowed?: string | null }) {
	const [folderId, setFolderId] = useState("");
	const [hideArchived, setHideArchived] = useState(false);
	const [showWhich, setShowWhich] = useState(false);
	const [reindexFailed, setReindexFailed] = useState(false);
	const search = useDocumentSearch({ query, kind, tag, folderId: folderId || null, hideArchived });
	const workspace = useWorkspace();
	const pane = usePagePane();
	const { response, phase } = search;
	const open = (hit: DocSearchResult) => {
		const item = { id: hit.itemId, name: hit.name, kind: hit.kind, size: hit.size };
		if (workspace) workspace.openItem(item, hit.jump ?? undefined);
		else pane?.open({ ...item, ...(hit.jump ? { jump: { ...hit.jump, nonce: Date.now() } } : {}) });
	};
	const reindex = async () => {
		setReindexFailed(false);
		try {
			const res = await fetch("/api/library/search/reindex", { method: "POST" });
			if (!res.ok) throw new Error(String(res.status));
			search.retry();
		} catch {
			setReindexFailed(true);
		}
	};
	const status = response?.status;
	const notSearched = status?.notSearched ?? [];
	const live = search.tooShort ? `Type at least ${search.minChars} characters.`
		: phase === "searching" && !response ? "Searching…"
		: phase === "failed" ? "The search could not be run."
		: response ? docCountText(response.results.length, response.total)
		: "";
	return (
		<section aria-label="Search results" className="flex flex-col gap-3" data-testid="doc-search">
			<div className="flex flex-wrap items-center gap-2">
				<LibraryChoice label="Folder" name="Filter by folder" testId="doc-search-folder" value={folderId || "anywhere"} onChange={(next) => setFolderId(next === "anywhere" ? "" : next)} options={[{ value: "anywhere", label: "Anywhere" }, ...folders.map((folder) => ({ value: folder.id, label: [folderPathLabel(folder.parentId, folders), folder.name].filter(Boolean).join(" / ") }))]} />
				<label className="flex min-h-9 items-center gap-1.5 text-sm text-graphite pointer-coarse:min-h-11">
					<input type="checkbox" className="size-4 accent-ink pointer-coarse:size-6" checked={hideArchived} onChange={(event) => setHideArchived(event.target.checked)} data-testid="doc-search-hide-archived" />
					Hide archived
				</label>
			</div>
			{narrowed && <p className="text-sm text-faint">Searching the whole Library, not only {narrowed}.</p>}
			<p role="status" aria-live="polite" className="text-sm text-graphite empty:hidden" data-testid="doc-search-count">{live}</p>
			{phase === "failed" && <button type="button" className="prompt-secondary self-start" onClick={search.retry}>Try again</button>}
			{phase === "searching" && !response && (
				<div role="status" aria-label="Searching your Library" className="flex flex-col gap-1">
					<Skeleton className="h-[72px] w-full rounded-lg" />
					<Skeleton className="h-[72px] w-full rounded-lg" />
				</div>
			)}
			{!query.trim() && <p className="text-graphite">Search inside your pages, text files and PDFs.</p>}
			{response && response.results.length > 0 && (
				<ul className="flex flex-col gap-1" data-testid="doc-search-results">
					{response.results.map((hit) => (
						<li key={hit.id} className="rounded-lg bg-shelf" data-testid="doc-search-result">
							<button type="button" aria-label={`Open ${hit.name}${docHitPlace(hit.jump) ? `, ${docHitPlace(hit.jump)}` : ""}`} onClick={() => open(hit)} className="flex w-full min-w-0 flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-shelf pointer-coarse:min-h-11">
								<span className="text-md font-medium text-ink [overflow-wrap:anywhere]">{hit.name}</span>
								{hit.snippet && <DocSnippetText snippet={hit.snippet} className="text-sm text-graphite [overflow-wrap:anywhere]" />}
								<span className="text-sm text-faint [overflow-wrap:anywhere]" data-testid="doc-search-meta">{hitMeta(hit)}</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{status && (
				<div className="flex flex-col gap-1 text-sm text-faint" data-testid="doc-search-status">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<p className="min-w-0 [overflow-wrap:anywhere]">{docStatusText(status.counts)}</p>
						{status.building && <p data-testid="doc-search-building">Reading {status.building.done} of {status.building.total}…</p>}
						{notSearched.length > 0 && <button type="button" className="prompt-secondary" aria-expanded={showWhich} onClick={() => setShowWhich((on) => !on)} data-testid="doc-search-which">{showWhich ? "Hide which" : "Show which"}</button>}
						<button type="button" className="prompt-secondary" disabled={Boolean(status.building)} onClick={() => void reindex()} data-testid="doc-search-reindex">Reindex</button>
					</div>
					{reindexFailed && <p role="alert" className="text-red">The reindex could not be started. Your search still works.</p>}
					{showWhich && (
						<ul className="flex flex-col gap-0.5" data-testid="doc-search-not-searched">
							{notSearched.map((row) => <li key={row.id} className="[overflow-wrap:anywhere]"><span className="text-graphite">{row.name}</span> · {row.reason ?? DOC_STATE_LABEL[row.state]}</li>)}
						</ul>
					)}
				</div>
			)}
		</section>
	);
}
