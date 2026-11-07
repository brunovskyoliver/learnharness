"use client";

/** The learner's decision on a held page edit (feature 023): what would change, then
 *  Accept, Reject or Edit first. The page and its draft stay as they are until Accept,
 *  which says what it compared. A page that moved on refuses, and both his text and
 *  the proposal stay; the proposed text can still be copied out. */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { LibraryItem, PageProposalReview } from "@/src/core";
import { compareTexts } from "./page-blocks.ts";
import { ChangeRows } from "./page-history.tsx";

const PageEditor = dynamic(() => import("./page-editor.tsx").then((m) => m.PageEditor), { ssr: false });

const url = (id: string) => `/api/library/page-proposals/${encodeURIComponent(id)}`;
const EDIT_SAVE_MS = 600;
type EditSave = "saved" | "saving" | "failed";
const CHANGED_TEXT = "This page changed after you opened this. The comparison now shows what accepting would do.";

/** Why Accept isn't offered, in his words. Pure for render tests. */
export function proposalBlockedText(review: PageProposalReview): string | null {
	const { proposal, current } = review;
	if (proposal.status === "accepted") return "You already accepted this change.";
	if (proposal.status === "rejected") return "You already rejected this change.";
	if (!current) return "That page is no longer in your Library, so this change can't be applied.";
	if (current.moved) return "This page has a newer version than the one the tutor changed, so this can't be accepted. Your page and this proposal are both kept.";
	if (current.merged === null) return "You changed the same text since, so this can't be accepted. Your page and this proposal are both kept.";
	return null;
}

export function PageProposalDialog({ proposalId, onClose, onAccepted, onRejected, beforeAccept, whileAccepting }: {
	proposalId: string;
	onClose: () => void;
	onAccepted: (item: LibraryItem, versions: { version: number; savedLearnerVersion?: number }) => void;
	/** He turned it down, so whoever shows the row can say so. */
	onRejected?: () => void;
	/** An open page gets his typing to the server first. False: it couldn't, so nothing is accepted. */
	beforeAccept?: () => Promise<boolean>;
	whileAccepting?: <T>(run: () => Promise<T>, accepted: (result: T) => boolean) => Promise<T>;
}) {
	const [data, setData] = useState<PageProposalReview | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [line, setLine] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editSave, setEditSave] = useState<EditSave>("saved");
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pending = useRef<string | null>(null);

	const load = useCallback(async () => {
		setFailure(null);
		try {
			const response = await fetch(url(proposalId), { cache: "no-store" });
			const body = await response.json() as PageProposalReview & { error?: string };
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
		const text = pending.current;
		if (text === null) return true;
		pending.current = null;
		setEditSave("saving");
		try {
			const response = await fetch(url(proposalId), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
			if (!response.ok) throw new Error(String(response.status));
			setEditSave("saved");
			return true;
		} catch {
			pending.current = text;
			setEditSave("failed");
			return false;
		}
	}, [proposalId]);
	useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

	const leaveEditing = () => { void flushEdit().then(() => load()); setEditing(false); };

	const reject = async () => {
		setBusy(true);
		try {
			const response = await fetch(`${url(proposalId)}/reject`, { method: "POST" });
			if (!response.ok && response.status !== 404 && response.status !== 409) throw new Error(String(response.status));
			onRejected?.();
			onClose();
		} catch {
			setLine("The proposal could not be rejected. Nothing changed. Try again.");
		}
		setBusy(false);
	};

	const accept = async () => {
		setBusy(true);
		setLine(null);
		try {
			if (!await flushEdit()) { setLine("Your edits to the proposal could not be saved, so it was not accepted."); return; }
			const comparedAgainst = data?.current?.text;
			if (beforeAccept && !await beforeAccept()) { setLine("Your text could not be saved first, so this was not accepted. Nothing changed."); return; }
			const fresh = await load();
			if (!fresh) return;
			if (!fresh.current || comparedAgainst !== fresh.current.text) { setLine(CHANGED_TEXT); return; }
			const expected = fresh.current.expected;
			const run = async () => {
				const response = await fetch(`${url(proposalId)}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected }) });
				return { ok: response.ok, body: await response.json().catch(() => ({})) as { item?: LibraryItem; version?: { n: number }; savedLearnerVersion?: number; error?: string; code?: string } };
			};
			const result = await (whileAccepting ? whileAccepting(run, (r) => r.ok) : run());
			if (result.ok && result.body.item) { onAccepted(result.body.item, { version: result.body.version?.n ?? 0, ...(result.body.savedLearnerVersion ? { savedLearnerVersion: result.body.savedLearnerVersion } : {}) }); onClose(); return; }
			if (["stale", "moved", "overlap"].includes(result.body.code ?? "")) {
				await load();
				if (result.body.code === "stale") setLine(CHANGED_TEXT);
			} else setLine(result.body.error ?? "The change could not be accepted. Nothing changed.");
		} catch {
			setLine("The change could not be accepted. Nothing changed. Check your connection and try again.");
		} finally {
			setBusy(false);
		}
	};

	const blocked = data ? proposalBlockedText(data) : null;
	const name = data?.current?.name ?? data?.proposal.name ?? "";
	const rows = data?.current?.merged != null ? compareTexts(data.current.text, data.current.merged) : null;
	const copyable = data && blocked && data.proposal.status === "pending";

	return (
		<Dialog open onOpenChange={(open) => { if (!open) { void flushEdit(); onClose(); } }}>
			<DialogContent
				className={editing ? "flex h-dvh max-h-dvh w-screen max-w-none translate-x-[-50%] flex-col gap-2 rounded-none border-0 bg-paper p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:max-w-none" : "flex max-h-[90dvh] flex-col gap-3 overflow-y-auto overscroll-contain rounded-xl border-0 bg-paper shadow-lift sm:max-w-xl"}
				showCloseButton={!editing}
				data-testid="page-proposal-dialog"
				onEscapeKeyDown={(event) => {
					if (!editing) return;
					// Innermost first: the editor's own lists, then Edit first, then the dialog.
					event.preventDefault();
					if (document.querySelector('[data-testid="page-slash-menu"]')) return;
					leaveEditing();
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
								<DialogDescription className="text-sm text-faint" data-testid="page-proposal-edit-state">
									{editSave === "saving" ? "Saving…" : editSave === "failed" ? "Not saved." : "Your edits stay in the proposal until you accept."}
								</DialogDescription>
							</div>
							<button type="button" className="prompt-secondary" data-testid="page-proposal-edit-done" onClick={leaveEditing}>Back to comparison</button>
							<button type="button" className="prompt-primary" disabled={busy} data-testid="page-proposal-accept-edited" onClick={() => void accept()}>Accept</button>
						</div>
						{line && <p role="alert" className="text-sm text-red">{line}</p>}
						<div className="flex min-h-0 flex-1 flex-col">
							<PageEditor
								value={data.proposal.text}
								ariaLabel={`Proposed text for ${name}`}
								onChange={(text) => {
									pending.current = text;
									setEditSave("saving");
									if (timer.current) clearTimeout(timer.current);
									timer.current = setTimeout(() => void flushEdit(), EDIT_SAVE_MS);
								}}
							/>
						</div>
					</>
				) : (
					<>
						<DialogTitle className="pe-6 text-md font-semibold [overflow-wrap:anywhere]">Proposed change to {name}</DialogTitle>
						<DialogDescription className="text-sm text-graphite">Nothing has changed. This page stays as it is unless you accept.{data.proposal.edited ? " You edited this proposal." : ""}</DialogDescription>
						{blocked ? <p role="status" className="text-sm text-graphite" data-testid="page-proposal-blocked">{blocked}</p> : rows === null ? <p className="text-sm text-graphite">Too long to compare here. Use Edit first to read it.</p> : <div data-testid="page-proposal-diff"><ChangeRows rows={rows} /></div>}
						{line && <p role="alert" className="text-sm text-red" data-testid="page-proposal-line">{line}</p>}
						<div className="flex flex-wrap justify-end gap-2">
							{copyable && <button type="button" className="prompt-secondary" data-testid="page-proposal-copy" onClick={() => void navigator.clipboard.writeText(data.proposal.text).then(() => setCopied(true), () => setLine("The text could not be copied. Your browser refused."))}>{copied ? "Copied" : "Copy the proposed text"}</button>}
							{data.proposal.status === "pending" && <button type="button" className="prompt-secondary" disabled={busy} data-testid="page-proposal-reject" onClick={() => void reject()}>Reject</button>}
							{!blocked && <button type="button" className="prompt-secondary" disabled={busy} data-testid="page-proposal-edit" onClick={() => { setEditing(true); setEditSave("saved"); }}>Edit first</button>}
							{!blocked && <button type="button" className="prompt-primary" disabled={busy} data-testid="page-proposal-accept" onClick={() => void accept()}>{busy ? "Accepting…" : "Accept"}</button>}
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
