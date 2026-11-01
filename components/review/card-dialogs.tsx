"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_CONCEPTS_MAX, CARD_RATING_LABEL, type CardHistoryRow } from "@/src/core";
import { cardFetch, failed } from "./card-api.ts";
import { useCardDraftStore, type CardDraft } from "./card-draft.ts";
import { CardText } from "./card-text.tsx";

interface ConceptHit { id: string; name: string; statement: string; weak: boolean }
const FIELD = "w-full resize-y rounded-md border border-[var(--edge)] bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground";

export type EditorTarget = { mode: "new"; source?: unknown; sourceLabel?: string | null } | { mode: "edit"; id: string };

/** The one way a card is written or edited. Escape closes the duplicate warning
 *  first, then the dialog, and either way the text stays in the draft. */
export function CardEditorDialog({ target, onClose, onSaved }: { target: EditorTarget | null; onClose: () => void; onSaved: (message: string) => void }) {
	const drafts = useCardDraftStore();
	const key = target?.mode === "edit" ? target.id : "new";
	const [loaded, setLoaded] = useState(false);
	const [loadFailure, setLoadFailure] = useState<string | null>(null);
	const [draft, setDraftState] = useState<CardDraft>({ front: "", back: "", conceptIds: [] });
	const [saved, setSaved] = useState<CardDraft | null>(null);
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [duplicates, setDuplicates] = useState<{ id: string; front: string }[] | null>(null);
	const [preview, setPreview] = useState(false);
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<ConceptHit[] | null>(null);
	const [hitsFailed, setHitsFailed] = useState(false);
	const frontId = useId(), backId = useId(), ideasId = useId();
	const frontField = useRef<HTMLTextAreaElement>(null);
	const backField = useRef<HTMLTextAreaElement>(null);

	const setDraft = (next: CardDraft) => {
		setDraftState(next);
		drafts.write(key, next);
	};

	useEffect(() => {
		if (!target) return;
		setLoaded(false); setLoadFailure(null); setFailure(null); setDuplicates(null); setPreview(false); setQuery(""); setHits(null); setBusy(false);
		drafts.writeOpen(key);
		const kept = drafts.read(key);
		if (target.mode === "new") {
			setSaved(null);
			setDraftState(kept ?? { front: "", back: "", conceptIds: [], ...(target.source ? { source: target.source, sourceLabel: target.sourceLabel ?? null } : {}) });
			setLoaded(true);
			return;
		}
		let live = true;
		void cardFetch<{ front: string; back: string; concepts: { id: string; name: string }[]; source: { label: string } | null }>(`/api/cards/${encodeURIComponent(target.id)}`).then((card) => {
			if (!live) return;
			if (failed(card)) { setLoadFailure(card.failure); setLoaded(true); return; }
			const stored: CardDraft = { front: card.front, back: card.back, conceptIds: card.concepts.map(({ id, name }) => ({ id, name })), sourceLabel: card.source?.label ?? null };
			setSaved(stored);
			setDraftState(kept ?? stored);
			setLoaded(true);
		});
		return () => { live = false; };
		// A new target opens a new editor; the store is a stable view of localStorage.
	}, [target]);

	useEffect(() => {
		if (!target) return;
		let live = true;
		const timer = window.setTimeout(() => {
			void cardFetch<{ concepts: ConceptHit[] }>(`/api/cards/concepts?q=${encodeURIComponent(query.trim())}`).then((body) => {
				if (!live) return;
				setHitsFailed(failed(body));
				if (!failed(body)) setHits(body.concepts);
			});
		}, query ? 200 : 0);
		return () => { live = false; window.clearTimeout(timer); };
	}, [target, query]);

	const dirty = target?.mode === "edit" ? saved !== null && (draft.front !== saved.front || draft.back !== saved.back || draft.conceptIds.map((c) => c.id).join() !== saved.conceptIds.map((c) => c.id).join()) : Boolean(draft.front.trim() || draft.back.trim());
	
	const close = () => { drafts.writeOpen(null); onClose(); };
	const discard = () => { drafts.clear(key); drafts.writeOpen(null); onClose(); };

	const save = async (keepBoth = false) => {
		if (!target || busy) return;
		if (!draft.front.trim() || !draft.back.trim()) {
			setFailure(draft.front.trim() ? "Write the back too." : "Write the front first.");
			(draft.front.trim() ? backField : frontField).current?.focus();
			return;
		}
		setBusy(true); setFailure(null);
		const body = { front: draft.front, back: draft.back, conceptIds: draft.conceptIds.map((concept) => concept.id), ...(keepBoth ? { keepBoth: true } : {}), ...(target.mode === "new" && draft.source ? { source: draft.source } : {}) };
		const result = target.mode === "new"
			? await cardFetch<{ card: { id: string } }>("/api/cards", { method: "POST", body })
			: await cardFetch<{ ok: true }>(`/api/cards/${encodeURIComponent(target.id)}`, { method: "PATCH", body });
		setBusy(false);
		if (failed(result)) {
			if (result.code === "duplicate") setDuplicates(result.body.duplicates as { id: string; front: string }[]);
			else setFailure(result.failure);
			return;
		}
		drafts.clear(key); drafts.writeOpen(null);
		onSaved(target.mode === "new" ? "Card added." : "Card saved.");
	};

	const concepts = useMemo(() => new Set(draft.conceptIds.map((concept) => concept.id)), [draft.conceptIds]);
	const titled = target?.mode === "edit" ? "Edit card" : "New card";
	return (
		<Dialog open={target !== null} onOpenChange={(open) => { if (!open) close(); }}>
			<DialogContent
				showCloseButton={false}
				data-testid="card-editor"
				className="flex max-h-[min(92dvh,48rem)] flex-col gap-3 overflow-y-auto overscroll-contain rounded-[10px] border-0 bg-popover p-4 sm:max-w-xl"
				onEscapeKeyDown={(event) => { if (duplicates) { event.preventDefault(); setDuplicates(null); } }}
				onOpenAutoFocus={(event) => { event.preventDefault(); frontField.current?.focus(); }}
			>
				<DialogTitle className="font-title text-xl font-medium">{titled}</DialogTitle>
				<DialogDescription className="text-sm text-muted-foreground">Markdown and math work on both sides, as $x^2$.</DialogDescription>
				{!loaded ? <div role="status" aria-label="Loading the card" className="flex flex-col gap-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
					: loadFailure ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><p>{loadFailure}</p><button type="button" className="prompt-secondary" onClick={close}>Close</button></div>
					: (
					<>
						<label htmlFor={frontId} className="text-sm font-medium text-ink-2">Front</label>
						<textarea ref={frontField} id={frontId} name="card-front" data-testid="card-front" rows={3} maxLength={20_000} value={draft.front} placeholder="A question with one answer…" onChange={(event) => { setDraft({ ...draft, front: event.target.value }); setDuplicates(null); }} className={FIELD} />
						<label htmlFor={backId} className="text-sm font-medium text-ink-2">Back</label>
						<textarea ref={backField} id={backId} name="card-back" data-testid="card-back" rows={4} maxLength={20_000} value={draft.back} placeholder="The answer…" onChange={(event) => setDraft({ ...draft, back: event.target.value })} className={FIELD} />
						{preview && (
							<div data-testid="card-preview" className="flex flex-col gap-2 rounded-[10px] bg-card p-3">
								<CardText text={draft.front || "Nothing on the front yet."} />
								<CardText text={draft.back || "Nothing on the back yet."} className="text-ink-2" />
							</div>
						)}
						{draft.sourceLabel && <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="card-source-line">From {draft.sourceLabel}</p>}

						<label htmlFor={ideasId} className="text-sm font-medium text-ink-2">Ideas from your graph</label>
						{draft.conceptIds.length > 0 && (
							<ul className="flex flex-wrap gap-1" data-testid="card-concepts">
								{draft.conceptIds.map((concept) => (
									<li key={concept.id} className="flex items-center gap-1 rounded-md bg-card pl-2 text-sm text-foreground">
										<span className="[overflow-wrap:anywhere]">{concept.name}</span>
										<button type="button" aria-label={`Remove ${concept.name}`} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground pointer-coarse:size-11" onClick={() => setDraft({ ...draft, conceptIds: draft.conceptIds.filter((other) => other.id !== concept.id) })}><XIcon className="size-3.5" aria-hidden="true" /></button>
									</li>
								))}
							</ul>
						)}
						<input id={ideasId} name="card-idea-search" data-testid="card-concept-search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Search your ideas…" className={`${FIELD} resize-none`} />
						{hitsFailed && <p role="status" className="text-sm text-ink-2">Your ideas could not be searched.</p>}
						{hits && hits.length > 0 && (
							<ul className="flex max-h-40 flex-col gap-px overflow-y-auto" data-testid="card-concept-hits">
								{hits.map((hit) => (
									<li key={hit.id}>
										<button type="button" disabled={concepts.has(hit.id) || draft.conceptIds.length >= CARD_CONCEPTS_MAX} className="flex min-h-9 w-full flex-col rounded-md px-2 py-1 text-left text-sm text-foreground hover:bg-card disabled:cursor-default disabled:text-muted-foreground pointer-coarse:min-h-11" onClick={() => setDraft({ ...draft, conceptIds: [...draft.conceptIds, { id: hit.id, name: hit.name }] })}>
											<span className="[overflow-wrap:anywhere]">{hit.name}{hit.weak ? " · weak" : ""}</span>
											<span className="line-clamp-2 text-muted-foreground">{hit.statement}</span>
										</button>
									</li>
								))}
							</ul>
						)}
						{hits?.length === 0 && query.trim() && <p role="status" className="text-sm text-muted-foreground">Nothing matched</p>}

						{duplicates && (
							<div role="alert" data-testid="card-duplicate" className="flex flex-col gap-2 rounded-[10px] bg-card p-3 text-base">
								<p>{duplicates.length === 1 ? "You already have a card with this front." : `You already have ${duplicates.length} cards with this front.`}</p>
								{duplicates.slice(0, 3).map((other) => <p key={other.id} className="text-sm text-ink-2 [overflow-wrap:anywhere]">{other.front}</p>)}
								<div className="flex flex-wrap gap-2">
									<button type="button" data-testid="card-keep-both" className="prompt-secondary bg-accent text-foreground" disabled={busy} onClick={() => void save(true)}>Keep both</button>
									<button type="button" data-testid="card-skip" className="prompt-secondary" onClick={discard}>Skip</button>
								</div>
							</div>
						)}
						{failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
						<div className="flex flex-wrap items-center justify-end gap-2">
							{dirty && <button type="button" data-testid="card-discard" className="prompt-secondary mr-auto" onClick={discard}>Discard draft</button>}
							<button type="button" aria-pressed={preview} data-testid="card-preview-toggle" className="prompt-secondary" onClick={() => setPreview((open) => !open)}>Preview</button>
							<button type="button" className="prompt-secondary" onClick={close}>Close</button>
							<button type="button" data-testid="card-save" className="prompt-primary" disabled={busy || duplicates !== null} onClick={() => void save()}>{busy ? "Saving…" : "Save card"}</button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** A card's reviews, newest first. Undone ones stay, marked. */
export function CardHistoryDialog({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
	const [rows, setRows] = useState<CardHistoryRow[] | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	useEffect(() => {
		if (!cardId) return;
		setRows(null); setFailure(null);
		void cardFetch<{ history: CardHistoryRow[] }>(`/api/cards/${encodeURIComponent(cardId)}/history`).then((body) => {
			if (failed(body)) setFailure(body.failure); else setRows(body.history);
		});
	}, [cardId]);
	return (
		<Dialog open={cardId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent data-testid="card-history" aria-describedby={undefined} className="flex max-h-[min(80dvh,32rem)] flex-col gap-3 overflow-y-auto overscroll-contain rounded-[10px] border-0 bg-popover p-4 sm:max-w-md">
				<DialogTitle className="font-title text-xl font-medium">Review history</DialogTitle>
				{failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
				{!failure && rows === null && <div role="status" aria-label="Loading history"><Skeleton className="h-16 w-full" /></div>}
				{rows?.length === 0 && <p className="text-ink-2">Not reviewed yet.</p>}
				{rows && rows.length > 0 && (
					<ul className="flex flex-col gap-1 text-base">
						{rows.map((row) => (
							<li key={row.id} data-testid="card-history-row" className="flex flex-wrap items-baseline justify-between gap-x-3">
								<span className={row.undone ? "text-muted-foreground line-through" : "text-foreground"}>{CARD_RATING_LABEL[row.rating]}{row.undone ? "" : ` · back in ${row.interval}`}</span>
								<span className="text-sm text-muted-foreground" suppressHydrationWarning>{row.undone ? "Undone · " : ""}{new Date(row.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
							</li>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Only this confirms: moving to Deleted can be undone, and this can't. */
export function DeleteForGoodDialog({ cardId, onClose, onDone }: { cardId: string | null; onClose: () => void; onDone: () => void }) {
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	useEffect(() => { setBusy(false); setFailure(null); }, [cardId]);
	const confirm = async () => {
		if (!cardId) return;
		setBusy(true);
		const result = await cardFetch(`/api/cards/${encodeURIComponent(cardId)}?forGood=1`, { method: "DELETE" });
		setBusy(false);
		if (failed(result) && result.status !== 404) { setFailure(result.failure); return; }
		onDone();
	};
	return (
		<Dialog open={cardId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent showCloseButton={false} data-testid="card-delete-dialog" className="flex flex-col gap-3 rounded-[10px] border-0 bg-popover p-4 sm:max-w-md">
				<DialogTitle className="font-title text-xl font-medium">Delete this card for good?</DialogTitle>
				<DialogDescription className="text-base text-ink-2">This can&apos;t be undone.</DialogDescription>
				{failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
				<div className="flex justify-end gap-2">
					<button type="button" className="prompt-secondary" onClick={onClose}>Cancel</button>
					<button type="button" data-testid="card-delete-confirm" className="prompt-secondary text-destructive" disabled={busy} onClick={() => void confirm()}>{busy ? "Deleting…" : "Delete for good"}</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
