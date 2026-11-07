"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ChevronRight, LoaderCircleIcon } from "lucide-react";
import { usePagePane } from "@/components/library/page-pane-context";
import { SessionDetails } from "@/components/session-state";
import { pageRowHeadline, toolActivityLabel, type ArtifactPartProps, type PageRowDetails } from "@/src/core";

/** Arrives on the first Review, so a transcript carries none of it (feature 022). */
const DiagramProposalDialog = dynamic(() => import("@/components/diagram/diagram-proposal-dialog.tsx").then((m) => m.DiagramProposalDialog), { ssr: false });
const PageProposalDialog = dynamic(() => import("./page-proposal-dialog.tsx").then((m) => m.PageProposalDialog), { ssr: false });

const ACTION = "text-ink underline decoration-ink/40 underline-offset-[3px] hover:decoration-ink pointer-coarse:min-h-11";
const OUTCOMES = ["created", "revised", "stale", "failed", "read", "proposed"];

function detailsOf(output: unknown): PageRowDetails | null {
	const d = output as { outcome?: unknown } | null | undefined;
	return typeof d === "object" && d !== null && OUTCOMES.includes(String(d.outcome)) ? d as PageRowDetails : null;
}

/** A failure the row shows, rather than the model's retry on a bad call. */
export function isShownPageFailure(part: { type: string; state?: string; errorText?: unknown }): boolean {
	return ["tool-page_create", "tool-page_revise", "tool-library_read", "tool-diagram_propose"].includes(part.type) && part.state === "output-error" && !String(part.errorText ?? "").startsWith("Invalid tool input");
}

/** The math-check skeleton on the reading edge, no amber. While running, only the
 *  spinner and activity label show; a page's text is never shown from the input. */
export function PageRow({ part }: ArtifactPartProps) {
	const p = part as { type: string; state: string; toolCallId: string; output?: unknown; errorText?: string };
	const tool = p.type.replace(/^tool-/, "");
	const pane = usePagePane();
	const [reviewing, setReviewing] = useState(false);
	const errored = p.state === "output-error";
	if (p.state !== "output-available" && !errored) {
		return (
			<div role="status" data-testid="page-row-running" className="lh-reading lh-quiet-line my-1">
				<LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
				{toolActivityLabel(tool)}
			</div>
		);
	}
	const d = errored ? null : detailsOf(p.output);
	const reason = errored ? p.errorText : d && "reason" in d ? d.reason : undefined;
	const bad = !d || d.outcome === "failed" || d.outcome === "stale";
	const proposal = d?.outcome === "proposed" ? d : null;
	const target = d && !proposal && "itemId" in d && d.itemId ? { id: d.itemId, name: "name" in d ? d.name : "", kind: d.outcome === "read" ? d.kind : "page", size: d.outcome === "read" ? d.size : 0 } : null;
	const opensHere = !!target && target.name !== "" && !!pane && (target.kind !== "pdf" && target.kind !== "image" && target.kind !== "other");
	const open = (history: boolean) => pane?.open({ id: target!.id, name: target!.name, kind: target!.kind as "page", size: target!.size, ...(history ? { history: true } : {}) });
	return (
		<SessionDetails stateKey={`tool/${p.toolCallId}`} initialOpen={!!proposal} data-testid="page-row" data-tool={tool} className="group lh-reading my-1">
			<summary className="lh-quiet-summary">
				<span className={`font-medium [overflow-wrap:anywhere] ${bad ? "text-red" : ""}`}>{pageRowHeadline(tool, d)}</span>
				<ChevronRight className="lh-quiet-chevron" aria-hidden="true" />
			</summary>
			<div className="lh-quiet-panel flex flex-col gap-2">
				{reason && <p className="text-red">{reason}</p>}
				{proposal && (
					<div className="flex flex-wrap gap-3">
						<button type="button" className={ACTION} aria-label={`Review the proposal for ${proposal.name}`} data-testid={proposal.target === "page" ? "page-row-review" : "diagram-row-review"} onClick={() => setReviewing(true)}>Review</button>
					</div>
				)}
				{proposal && reviewing && proposal.target === "page" && (
					<PageProposalDialog
						proposalId={proposal.proposalId}
						onClose={() => setReviewing(false)}
						onAccepted={(item) => pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size })}
					/>
				)}
				{proposal && reviewing && proposal.target !== "page" && (
					<DiagramProposalDialog
						proposalId={proposal.proposalId}
						onClose={() => setReviewing(false)}
						onApproved={(item) => pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size })}
					/>
				)}
				{d && "savedLearnerVersion" in d && d.savedLearnerVersion !== undefined && <p className="text-graphite">Saved your edits first as version {d.savedLearnerVersion}</p>}
				{opensHere && (
					<div className="flex flex-wrap gap-3">
						<button type="button" className={ACTION} aria-label={`Open ${target!.name}`} onClick={() => open(false)}>Open</button>
						{target!.kind === "page" && <button type="button" className={ACTION} aria-label={`History of ${target!.name}`} onClick={() => open(true)}>History</button>}
					</div>
				)}
			</div>
		</SessionDetails>
	);
}
