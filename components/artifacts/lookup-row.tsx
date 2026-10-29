"use client";

import { ChevronRight } from "lucide-react";
import { SessionDetails } from "@/components/session-state";
import { ToolCallCard } from "@/components/artifacts/tool-call-card";
import { lookupFailureHeadline, lookupHeadline, type ArtifactPartProps, type HubLookup, type LookupDetails, type PaperRead, type PaperSearch, type TokenizeDetails } from "@/src/core";

const LINK_CLASS = "text-foreground underline decoration-foreground/40 underline-offset-[3px] hover:decoration-foreground";

function detailsOf(tool: string, output: unknown): LookupDetails | null {
	if (!output || typeof output !== "object") return null;
	const d = output as Record<string, unknown>;
	if (tool === "tokenize" && ["o200k", "cl100k", "gpt2"].includes(String(d.encoding)) && typeof d.count === "number" && Array.isArray(d.tokens)) return output as TokenizeDetails;
	if (tool === "hub_model" && d.kind === "model" && typeof d.repo === "string" && typeof d.url === "string" && Array.isArray(d.fields)) return output as HubLookup;
	if (tool === "hub_search" && d.kind === "search" && typeof d.query === "string" && Array.isArray(d.results)) return output as HubLookup;
	if (tool === "paper_search" && ["arxiv", "semantic-scholar"].includes(String(d.source)) && typeof d.query === "string" && Array.isArray(d.results)) return output as PaperSearch;
	if (tool === "paper_read" && typeof d.title === "string" && d.paper && typeof d.paper === "object" && typeof (d.paper as { url?: unknown }).url === "string" && Array.isArray(d.pages)) return output as PaperRead;
	return null;
}

function Row({ label, children, mono = true }: { label: string; children: React.ReactNode; mono?: boolean }) {
	return <div><div className="mb-1 font-medium text-muted-foreground">{label}</div><div className={mono ? "whitespace-pre-wrap break-all font-mono text-xs leading-relaxed" : ""}>{children}</div></div>;
}

/** Invalid arguments remain the existing model retry; unavailable sources get an honest failure row. */
export function isShownLookupFailure(part: { type: string; state?: string; errorText?: unknown }): boolean {
	return (lookupFailureHeadline(part.type.replace(/^tool-/, "")) !== null || part.type === "tool-tokenize") && part.state === "output-error" && !String(part.errorText ?? "").startsWith("Invalid tool input");
}

export function LookupRow({ part }: ArtifactPartProps) {
	const p = part as { type: string; state: string; toolCallId: string; input?: unknown; output?: unknown; errorText?: string };
	const tool = p.type.replace(/^tool-/, "");
	const failed = p.state === "output-error";
	const d = failed ? null : detailsOf(tool, p.output);
	const failureHeadline = lookupFailureHeadline(tool);
	if ((!d && !failed) || (failed && !failureHeadline)) return <ToolCallCard part={part} />;
	return (
		<SessionDetails stateKey={`tool/${p.toolCallId}`} data-testid="lookup-row" data-tool={tool} className="group lh-reading my-1">
			<summary className="flex cursor-pointer select-none list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
				<span className={`font-medium ${failed ? "text-destructive" : ""}`}>{failed ? failureHeadline : lookupHeadline(d!)}</span>
				<ChevronRight className="size-3 shrink-0 opacity-50 transition-transform group-open:rotate-90" aria-hidden="true" />
			</summary>
			<div className="mt-2 space-y-2 rounded-xl border bg-card p-3 text-sm">
				{failed && typeof p.errorText === "string" && <Row label="Error" mono={false}><span className="text-destructive">{p.errorText}</span></Row>}
				{d && "encoding" in d && <>
					{p.input != null && <div><div className="mb-1 font-medium text-muted-foreground">Input</div><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">{JSON.stringify(p.input, null, 2)}</pre></div>}
					<div><div className="mb-1 font-medium text-muted-foreground">Output</div><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">{JSON.stringify(p.output, null, 2)}</pre></div>
				</>}
				{d && "kind" in d && d.kind === "model" && <>
					<Row label="Model">{d.repo}</Row>
					<div className="grid grid-cols-2 gap-2">{d.fields.map(field => <Row key={field.key} label={field.label}>{`${field.key} ${field.value}`}</Row>)}</div>
					<a className={LINK_CLASS} href={d.url} target="_blank" rel="noreferrer" aria-label={`Open on Hugging Face · ${d.repo}`}>Open on Hugging Face</a>
				</>}
				{d && "kind" in d && d.kind === "search" && d.results.map((result, index) => <div key={`${result.id}/${index}`}>
					<a className={LINK_CLASS} href={result.url} target="_blank" rel="noreferrer" aria-label={`${result.title ?? result.id} · Hugging Face`}>{result.title ?? result.id}</a>
					{(result.task || result.downloads !== undefined) && <p className="text-muted-foreground">{[result.task, result.downloads].filter(value => value !== undefined && value !== "").join(" · ")}</p>}
				</div>)}
				{d && "source" in d && d.results.map((result, index) => <div key={`${result.url}/${index}`}>
					<a className={`${LINK_CLASS} text-[15px]`} href={result.url} target="_blank" rel="noreferrer" aria-label={`${result.title} · ${d.source === "arxiv" ? "arXiv" : "Semantic Scholar"}`}>{result.title}</a>
					<p className="text-muted-foreground">{[`${result.authors.slice(0, 3).join(", ")}${result.authors.length > 3 ? " et al." : ""}`, result.year, result.arxivId ? `arXiv ${result.arxivId}` : result.s2Id, result.pdfUrl ? "Open-access PDF" : "No open-access PDF"].filter(value => value !== undefined && value !== "").join(" · ")}</p>
				</div>)}
				{d && "pages" in d && <>
					<div className="flex flex-wrap gap-2">{d.pages.map(page => <a key={page} className={LINK_CLASS} href={`${d.paper.url.replace(/#.*$/, "")}#page=${page}`} target="_blank" rel="noreferrer" aria-label={`${d.title} · p. ${page}`}>p. {page}</a>)}</div>
					<p className="text-muted-foreground">{d.pagesUsedThisTurn} of 10 pages this turn</p>
				</>}
				{d && "ms" in d && <p className="text-muted-foreground">Took {(d.ms / 1000).toFixed(1)} s</p>}
			</div>
		</SessionDetails>
	);
}
