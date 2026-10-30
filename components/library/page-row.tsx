"use client";

import { ChevronRight, LoaderCircleIcon } from "lucide-react";
import { usePagePane } from "@/components/library/page-pane-context";
import { SessionDetails } from "@/components/session-state";
import { pageRowHeadline, toolActivityLabel, type ArtifactPartProps, type PageRowDetails } from "@/src/core";

const ACTION = "text-foreground underline decoration-foreground/40 underline-offset-[3px] hover:decoration-foreground pointer-coarse:min-h-11";
const OUTCOMES = ["created", "revised", "stale", "failed", "read"];

function detailsOf(output: unknown): PageRowDetails | null {
	const d = output as { outcome?: unknown } | null | undefined;
	return typeof d === "object" && d !== null && OUTCOMES.includes(String(d.outcome)) ? d as PageRowDetails : null;
}

/** A failure the row shows, rather than the model's retry on a bad call. */
export function isShownPageFailure(part: { type: string; state?: string; errorText?: unknown }): boolean {
	return ["tool-page_create", "tool-page_revise", "tool-library_read"].includes(part.type) && part.state === "output-error" && !String(part.errorText ?? "").startsWith("Invalid tool input");
}

/** The math-check skeleton on the reading edge, no amber. While running, only the
 *  spinner and activity label show; a page's text is never shown from the input. */
export function PageRow({ part }: ArtifactPartProps) {
	const p = part as { type: string; state: string; toolCallId: string; output?: unknown; errorText?: string };
	const tool = p.type.replace(/^tool-/, "");
	const pane = usePagePane();
	const errored = p.state === "output-error";
	if (p.state !== "output-available" && !errored) {
		return (
			<div role="status" data-testid="page-row-running" className="lh-reading my-1 flex items-center gap-2 text-sm text-muted-foreground">
				<LoaderCircleIcon className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
				{toolActivityLabel(tool)}
			</div>
		);
	}
	const d = errored ? null : detailsOf(p.output);
	const reason = errored ? p.errorText : d && "reason" in d ? d.reason : undefined;
	const bad = !d || d.outcome === "failed" || d.outcome === "stale";
	const target = d && "itemId" in d && d.itemId ? { id: d.itemId, name: "name" in d ? d.name : "", kind: d.outcome === "read" ? d.kind : "page", size: d.outcome === "read" ? d.size : 0 } : null;
	const opensHere = !!target && target.name !== "" && !!pane && (target.kind !== "pdf" && target.kind !== "image" && target.kind !== "other");
	const open = (history: boolean) => pane?.open({ id: target!.id, name: target!.name, kind: target!.kind as "page", size: target!.size, ...(history ? { history: true } : {}) });
	return (
		<SessionDetails stateKey={`tool/${p.toolCallId}`} data-testid="page-row" data-tool={tool} className="group lh-reading my-1">
			<summary className="flex cursor-pointer select-none list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
				<span className={`font-medium [overflow-wrap:anywhere] ${bad ? "text-destructive" : ""}`}>{pageRowHeadline(tool, d)}</span>
				<ChevronRight className="size-3 shrink-0 opacity-50 transition-transform group-open:rotate-90" aria-hidden="true" />
			</summary>
			<div className="mt-2 flex flex-col gap-2 rounded-[10px] bg-card p-3 text-sm">
				{reason && <p className="text-destructive">{reason}</p>}
				{d && "savedLearnerVersion" in d && d.savedLearnerVersion !== undefined && <p className="text-ink-2">Saved your edits first as version {d.savedLearnerVersion}</p>}
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
