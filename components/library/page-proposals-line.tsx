"use client";

/** Edits the tutor is holding for the learner (feature 023): beside an open page, those
 *  on it; in the Library, all of them, since a held edit can outlive the session it
 *  came from. Empty renders nothing, a failed read says so, and the dialog loads when
 *  one is opened. */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { cn } from "@/lib/utils";
import type { LibraryItem, PageProposalRow } from "@/src/core";

const Dialog = dynamic(() => import("./page-proposal-dialog.tsx").then((m) => m.PageProposalDialog), { ssr: false });

export function PageProposalsLine({ pageId, exceptPageId, className, beforeAccept, whileAccepting, onAccepted }: {
	pageId?: string;
	/** The page open beside the list has its own line, which saves his typing first. */
	exceptPageId?: string;
	className?: string;
	beforeAccept?: () => Promise<boolean>;
	whileAccepting?: <T>(run: () => Promise<T>, accepted: (result: T) => boolean) => Promise<T>;
	onAccepted?: (item: LibraryItem) => void;
}) {
	const [rows, setRows] = useState<PageProposalRow[]>([]);
	const [failed, setFailed] = useState(false);
	const [open, setOpen] = useState<string | null>(null);
	const opener = useRef<HTMLElement | null>(null);
	/** Back to Review, or to the page if that row went with the decision. */
	const closed = () => {
		setOpen(null);
		void refresh().then(() => requestAnimationFrame(() => {
			const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('[data-testid="page-editor"]');
			target?.focus();
		}));
	};
	const refresh = useCallback(async () => {
		try {
			const query = pageId ? `?page=${encodeURIComponent(pageId)}` : "";
			const response = await fetch(`/api/library/page-proposals${query}`, { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			setRows((await response.json() as { proposals: PageProposalRow[] }).proposals);
			setFailed(false);
		} catch {
			setFailed(true);
		}
	}, [pageId]);
	useEffect(() => { void refresh(); }, [refresh]);
	useServerEvent("library-changed", () => { void refresh(); });
	useServerResync(() => { void refresh(); });
	const shown = exceptPageId ? rows.filter((row) => row.pageId !== exceptPageId) : rows;
	if (shown.length === 0 && !failed && !open) return null;
	return (
		<section aria-label="Changes the tutor proposed" className={cn("flex flex-col gap-1", className)} data-testid="page-proposals">
			{failed && shown.length === 0 && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-ink-2"><p>Proposed changes could not be loaded.</p><button type="button" className="prompt-secondary" onClick={() => void refresh()}>Try again</button></div>}
			{shown.map((row) => (
				<div key={row.id} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-card px-3 py-2 text-sm" data-testid="page-proposal-row">
					<span className="min-w-0 flex-[1_1_12rem] [overflow-wrap:anywhere]">{pageId ? <span className="text-foreground">The tutor proposed a change.</span> : <span className="text-foreground">{row.name}</span>} <span className="text-muted-foreground">{pageId ? "Nothing changed yet." : "· Change proposed by the tutor, waiting for you"}</span></span>
					<button type="button" className="prompt-secondary" aria-label={`Review the change proposed for ${row.name}`} data-testid="page-proposal-open" onClick={(event) => { opener.current = event.currentTarget; setOpen(row.id); }}>Review</button>
				</div>
			))}
			{open && (
				<Dialog
					proposalId={open}
					onClose={closed}
					beforeAccept={beforeAccept}
					whileAccepting={whileAccepting}
					onAccepted={(item) => onAccepted?.(item)}
				/>
			)}
		</section>
	);
}
