"use client";

/** The learner's decision on a proposal (feature 022): the comparison, then Approve,
 *  Reject or Edit first. Nothing changes the diagram but Approve, and it says what it
 *  compared, so a diagram that moved since refuses and the comparison refreshes. */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { diagramToSvg, diffDiagrams, parseDiagram, type DiagramDoc, type DiagramProposal, type LibraryItem } from "@/src/core";
import { proposalUrl } from "./diagram-api.ts";
import { DiagramDiffView } from "./diagram-diff.tsx";
import { svgDataUrl } from "./diagram-export.ts";

const DiagramEditor = dynamic(() => import("./diagram-editor.tsx").then((m) => m.DiagramEditor), { ssr: false });

interface Loaded {
	proposal: DiagramProposal;
	current: { content: string; expected: { head: number; rev: number }; name: string } | null;
	targetGone?: boolean;
	refused?: { code: string; message: string };
}

const EDIT_SAVE_MS = 600;
type EditSave = "saved" | "saving" | "failed";

export function DiagramProposalDialog({ proposalId, onClose, onApproved, beforeApprove }: {
	proposalId: string;
	onClose: () => void;
	onApproved: (item: LibraryItem) => void;
	/** Lets an open editor save first, so the approval can't cross its typing. */
	beforeApprove?: () => Promise<void>;
}) {
	const [data, setData] = useState<Loaded | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [line, setLine] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [clash, setClash] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);
	const [editSave, setEditSave] = useState<EditSave>("saved");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pending = useRef<DiagramDoc | null>(null);

	const load = useCallback(async () => {
		setFailure(null);
		try {
			const response = await fetch(proposalUrl(proposalId), { cache: "no-store" });
			const body = await response.json() as Loaded & { error?: string };
			if (!response.ok) { setFailure(body.error ?? "This proposal could not be loaded."); return null; }
			setData(body);
			return body;
		} catch {
			setFailure("This proposal could not be loaded. Check your connection and try again.");
			return null;
		}
	}, [proposalId]);
	useEffect(() => { void load(); }, [load]);

	const flushEdit = useCallback(async (): Promise<boolean> => {
		if (timer.current) { clearTimeout(timer.current); timer.current = null; }
		const doc = pending.current;
		if (!doc) return true;
		pending.current = null;
		setEditSave("saving");
		try {
			const response = await fetch(proposalUrl(proposalId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc }) });
			if (!response.ok) throw new Error(String(response.status));
			setEditSave("saved");
			return true;
		} catch {
			pending.current = doc;
			setEditSave("failed");
			return false;
		}
	}, [proposalId]);
	useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

	const reject = async () => {
		setBusy(true);
		try {
			const response = await fetch(`${proposalUrl(proposalId)}/reject`, { method: "POST" });
			if (!response.ok && response.status !== 404) throw new Error(String(response.status));
			onClose();
		} catch {
			setLine("The proposal could not be rejected. Nothing changed. Try again.");
		}
		setBusy(false);
	};

	const approve = async (name?: string) => {
		setBusy(true);
		setLine(null);
		setClash(null);
		try {
			if (!await flushEdit()) { setLine("Your edits to the proposal could not be saved, so it was not approved."); return; }
			const comparedAgainst = data?.current?.content;
			await beforeApprove?.();
			const fresh = data?.proposal.diagramId ? await load() : data;
			if (!fresh) return;
			// Typing the comparison didn't include, or another tab: show it before changing anything.
			if (data?.proposal.diagramId && comparedAgainst !== fresh.current?.content) {
				setLine("This diagram changed after you opened this. The comparison now shows what approving would do.");
				return;
			}
			const response = await fetch(`${proposalUrl(proposalId)}/approve`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...(fresh.current ? { expected: fresh.current.expected } : {}), ...(name ? { name } : {}) }),
			});
			const body = await response.json().catch(() => ({})) as { item?: LibraryItem; error?: string; code?: string; suggestedName?: string };
			if (response.ok && body.item) { onApproved(body.item); onClose(); return; }
			if (body.code === "stale") {
				await load();
				setLine("This diagram changed after you opened this. The comparison now shows what approving would do.");
			} else if (body.code === "name_taken" && body.suggestedName) setClash(body.suggestedName);
			else setLine(body.error ?? "The proposal could not be approved. Nothing changed.");
		} catch {
			setLine("The proposal could not be approved. Nothing changed. Check your connection and try again.");
		} finally {
			setBusy(false);
		}
	};

	const current = data?.current ? parseDiagram(data.current.content) : null;
	const currentDoc = current?.ok ? current.doc : null;
	const name = data?.proposal.name ?? "";
	const decided = data && data.proposal.status !== "pending";
	const blocked = decided ? (data.proposal.status === "approved" ? "This proposal was already approved." : "This proposal was already rejected.") : data?.targetGone ? "That diagram is no longer in your Library, so this proposal can't be applied." : data?.refused?.message ?? null;

	return (
		<Dialog open onOpenChange={(open) => { if (!open) { void flushEdit(); onClose(); } }}>
			<DialogContent
				className={editing ? "flex h-dvh max-h-dvh w-screen max-w-none translate-x-[-50%] flex-col gap-2 rounded-none border-0 bg-paper p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:max-w-none" : "flex max-h-[90dvh] flex-col gap-3 overflow-y-auto rounded-xl border-0 bg-paper shadow-lift sm:max-w-xl"}
				showCloseButton={!editing}
				data-testid="diagram-proposal-dialog"
				onEscapeKeyDown={(event) => {
					// Escape takes the field or the tool first, then Edit first, then the dialog.
					const active = document.activeElement;
					if (editing && (active?.closest("input, textarea, select") || active?.closest("[data-diagram-layer]"))) { event.preventDefault(); return; }
					if (editing) { event.preventDefault(); void flushEdit().then(() => load()); setEditing(false); }
				}}
			>
				{failure && !data ? (
					<>
						<DialogTitle className="text-md font-semibold">This proposal could not be loaded</DialogTitle>
						<DialogDescription className="text-sm text-graphite">{failure}</DialogDescription>
						<div className="flex gap-2"><button type="button" className="prompt-secondary" onClick={() => void load()}>Try again</button><button type="button" className="prompt-secondary" onClick={onClose}>Close</button></div>
					</>
				) : !data ? (
					<>
						<DialogTitle className="sr-only">Loading the proposal</DialogTitle>
						<DialogDescription className="sr-only">One moment.</DialogDescription>
						<div role="status" aria-label="Loading the proposal" className="flex flex-col gap-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-32 w-full rounded-lg" /></div>
					</>
				) : editing ? (
					<>
						<div className="flex flex-wrap items-center gap-2 pe-1">
							<div className="min-w-0 flex-[1_1_12rem]">
								<DialogTitle className="truncate text-md font-medium">Editing the proposal: {name}</DialogTitle>
								<DialogDescription className="text-sm text-faint" data-testid="diagram-proposal-edit-state">
									{editSave === "saving" ? "Saving…" : editSave === "failed" ? "Not saved." : "Your edits stay in the proposal until you approve."}
								</DialogDescription>
							</div>
							<button type="button" className="prompt-secondary" data-testid="diagram-proposal-edit-done" onClick={() => { void flushEdit().then(() => load()); setEditing(false); }}>Back to comparison</button>
							<button type="button" className="prompt-primary" disabled={busy} data-testid="diagram-proposal-approve-edited" onClick={() => void approve()}>Approve</button>
						</div>
						{line && <p role="alert" className="text-sm text-red">{line}</p>}
						<DiagramEditor
							doc={data.proposal.doc}
							resetKey={proposalId}
							name={name}
							onChange={(doc) => {
								pending.current = doc;
								setEditSave("saving");
								if (timer.current) clearTimeout(timer.current);
								timer.current = setTimeout(() => void flushEdit(), EDIT_SAVE_MS);
							}}
						/>
					</>
				) : (
					<>
						<DialogTitle className="pe-6 text-md font-semibold [overflow-wrap:anywhere]">{data.proposal.diagramId ? `Proposed changes to ${name}` : `Proposed diagram: ${name}`}</DialogTitle>
						<DialogDescription className="whitespace-pre-wrap text-sm text-graphite [overflow-wrap:anywhere]" data-testid="diagram-proposal-summary">{data.proposal.summary}</DialogDescription>
						<p className="text-sm text-faint">Nothing has changed. {data.proposal.diagramId ? "This diagram stays as it is unless you approve." : "No diagram exists unless you approve."}{data.proposal.edited ? " You edited this proposal." : ""}</p>
						{/* An image can't run anything, and the SVG's text is escaped. */}
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={svgDataUrl(diagramToSvg(data.proposal.doc, name))} alt={`Preview of the proposal for ${name}`} className="max-h-64 w-full rounded-md object-contain" data-testid="diagram-proposal-preview" />
						{blocked ? <p role="status" className="text-sm text-graphite" data-testid="diagram-proposal-blocked">{blocked}</p> : <DiagramDiffView diff={diffDiagrams(currentDoc, data.proposal.doc)} />}
						{line && <p role="alert" className="text-sm text-red" data-testid="diagram-proposal-line">{line}</p>}
						{clash && (
							<div role="status" className="flex flex-wrap items-center gap-2 text-sm text-graphite">
								<p>{name} is already in your Library.</p>
								<button type="button" className="prompt-secondary" data-testid="diagram-proposal-keep-both" onClick={() => void approve(clash)}>Keep both as {clash}</button>
							</div>
						)}
						{!blocked && (
							<div className="flex flex-wrap justify-end gap-2">
								<button type="button" className="prompt-secondary" disabled={busy} data-testid="diagram-proposal-reject" onClick={() => void reject()}>Reject</button>
								<button type="button" className="prompt-secondary" disabled={busy} data-testid="diagram-proposal-edit" onClick={() => setEditing(true)}>Edit first</button>
								<button type="button" className="prompt-primary" disabled={busy} data-testid="diagram-proposal-approve" onClick={() => void approve()}>{busy ? "Approving…" : "Approve"}</button>
							</div>
						)}
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
