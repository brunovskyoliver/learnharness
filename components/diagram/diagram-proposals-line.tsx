"use client";

/** Proposals for diagrams that don't exist yet have no diagram to wait on, so they
 *  wait here (feature 022). Small and fetched on the Library only; the dialog loads
 *  when one is opened. Empty renders nothing, and a failed read says so. */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePagePane } from "@/components/library/page-pane-api.ts";
import { useServerEvent } from "@/components/server-events";
import { useWorkspace } from "@/components/workspace/workspace-context";
import type { DiagramProposal, LibraryItem } from "@/src/core";

const ProposalDialog = dynamic(() => import("./diagram-proposal-dialog.tsx").then((m) => m.DiagramProposalDialog), { ssr: false });

export function DiagramProposalsLine() {
	const [rows, setRows] = useState<Omit<DiagramProposal, "doc">[]>([]);
	const [failed, setFailed] = useState(false);
	const [open, setOpen] = useState<string | null>(null);
	const opener = useRef<HTMLElement | null>(null);
	const pane = usePagePane();
	const workspace = useWorkspace();
	const refresh = useCallback(async () => {
		try {
			const response = await fetch("/api/library/diagram-proposals", { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			setRows((await response.json() as { proposals: Omit<DiagramProposal, "doc">[] }).proposals);
			setFailed(false);
		} catch {
			setFailed(true);
		}
	}, []);
	useEffect(() => { void refresh(); }, [refresh]);
	useServerEvent("library-changed", () => { void refresh(); });
	if (rows.length === 0 && !failed && !open) return null;
	return (
		<section aria-label="Proposed diagrams" className="flex flex-col gap-1" data-testid="diagram-proposals">
			{failed && rows.length === 0 && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-ink-2"><p>Proposed diagrams could not be loaded.</p><button type="button" className="prompt-secondary" onClick={() => void refresh()}>Try again</button></div>}
			{rows.map((row) => (
				<div key={row.id} className="flex flex-wrap items-center gap-2 rounded-[10px] bg-card px-3 py-2 text-sm" data-testid="diagram-proposal-row">
					<span className="min-w-0 flex-[1_1_12rem] [overflow-wrap:anywhere]"><span className="text-foreground">{row.name}</span> <span className="text-muted-foreground">· Proposed by the tutor, waiting for you</span></span>
					<button type="button" className="prompt-secondary" aria-label={`Review the proposal for ${row.name}`} data-testid="diagram-proposal-open" onClick={(event) => { opener.current = event.currentTarget; setOpen(row.id); }}>Review</button>
				</div>
			))}
			{open && (
				<ProposalDialog
					proposalId={open}
					onClose={() => { setOpen(null); void refresh().then(() => requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); })); }}
					onApproved={(item: LibraryItem) => {
						if (workspace) workspace.openItem(item);
						else pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size });
					}}
				/>
			)}
		</section>
	);
}
