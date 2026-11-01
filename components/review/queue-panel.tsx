"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerEvent } from "@/components/server-events";
import { cn } from "@/lib/utils";
import { CARD_RATING_LABEL, CARD_RATINGS, intervalText, type CardFocus, type CardRating, type CardReveal, type ReviewQueue } from "@/src/core";
import { cardFetch, failed, queueQuery } from "./card-api.ts";
import { CardText } from "./card-text.tsx";

const FOCUS_LABEL: Record<CardFocus, string> = { all: "All due", "weak-first": "Weak ideas first", "weak-only": "Only weak ideas" };
const FOCUS_KEY = "lh:review-focus";
const PILL = "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent pointer-coarse:h-11";

function readFocus(): CardFocus {
	try {
		const raw = localStorage.getItem(FOCUS_KEY);
		return raw === "weak-first" || raw === "weak-only" ? raw : "all";
	} catch { return "all"; }
}

export const dueLine = (queue: Pick<ReviewQueue, "due">) => (queue.due === 1 ? "1 card due" : `${queue.due} cards due`);

/** The states of an empty queue, each its own sentence. */
export function QueueEmpty({ queue, focus, now, onNew, onShowAll }: { queue: ReviewQueue; focus: CardFocus; now: Date; onNew: () => void; onShowAll: () => void }) {
	if (queue.total === 0) {
		return (
			<div data-testid="queue-empty" className="flex flex-col items-start gap-3">
				<p className="text-ink-2">No flashcards yet. Write one, or make some from a note, a PDF passage or a lesson.</p>
				<button type="button" className="prompt-primary" onClick={onNew} data-testid="queue-empty-new">New card</button>
			</div>
		);
	}
	if (focus === "weak-only" && queue.due > 0) {
		return (
			<div data-testid="queue-no-weak" className="flex flex-col items-start gap-3">
				<p className="text-ink-2">None of the {queue.due} due {queue.due === 1 ? "card links" : "cards link"} to a weak idea.</p>
				<button type="button" className="prompt-secondary" onClick={onShowAll}>Show all due</button>
			</div>
		);
	}
	const next = queue.nextDueAt ? intervalText(now.toISOString(), queue.nextDueAt) : null;
	return (
		<div data-testid="queue-done" className="flex flex-col gap-1">
			<p className="text-lg">All done for now.</p>
			{queue.laterToday > 0 && <p className="text-ink-2">{queue.laterToday === 1 ? "1 card comes" : `${queue.laterToday} cards come`} back later today{next ? `, the next in ${next}` : ""}.</p>}
			{queue.laterToday === 0 && next && <p className="text-ink-2">The next card is due in {next}.</p>}
		</div>
	);
}

/** One rating: its name, the gap it would set, and its key. */
export function RatingButtons({ reveal, disabled, onRate }: { reveal: CardReveal; disabled: boolean; onRate: (rating: CardRating) => void }) {
	return (
		<div role="group" aria-label="How well did you recall it?" data-testid="queue-ratings" className="grid grid-cols-2 gap-1 sm:grid-cols-4">
			{reveal.previews.map((preview, index) => (
				<button
					key={preview.rating}
					type="button"
					disabled={disabled}
					data-testid={`queue-rate-${preview.rating}`}
					aria-keyshortcuts={String(index + 1)}
					aria-label={`${preview.label}, back in ${preview.interval}`}
					onClick={() => onRate(preview.rating)}
					className="flex min-h-14 flex-col items-center justify-center rounded-md bg-accent px-2 py-1 text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_80%,var(--foreground))] disabled:cursor-default disabled:text-muted-foreground"
				>
					<span className="text-base font-medium">{preview.label}</span>
					<span className="text-sm text-ink-2 tabular-nums">{preview.interval}<span className="ml-1.5 font-mono text-xs text-muted-foreground max-sm:hidden" aria-hidden="true">{index + 1}</span></span>
				</button>
			))}
		</div>
	);
}

/** The links on the answer side: only once it's shown. */
export function RevealMeta({ reveal }: { reveal: CardReveal }) {
	if (!reveal.source && reveal.concepts.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 text-sm text-muted-foreground" data-testid="queue-reveal-meta">
			{reveal.source && (
				<p className="[overflow-wrap:anywhere]" data-testid="queue-source">
					{reveal.source.gone ? <span>{reveal.source.label} · this source is gone</span> : <a href={reveal.source.href} className="text-ink-2 underline decoration-[color-mix(in_srgb,var(--ink-2)_40%,transparent)] underline-offset-2 hover:text-foreground">{reveal.source.label}</a>}
				</p>
			)}
			{reveal.concepts.length > 0 && <p className="[overflow-wrap:anywhere]" data-testid="queue-concepts">{reveal.concepts.map((concept) => `${concept.name}${concept.weak ? " · weak" : ""}`).join(", ")}</p>}
		</div>
	);
}

const typingTarget = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable=true], [role=dialog], [data-lh-menu]"));
const interactiveTarget = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("button, a, [role=button]"));

/**
 * The queue: front, Show answer, then four ratings. Every step asks the server, so
 * the browser never holds a back it hasn't asked for, and a reload lands on whichever
 * card is next. `busyLayer` stops the keys while a dialog of the parent's is open.
 */
export function QueuePanel({ refreshKey, busyLayer, onDrafts, onEdit, onHistory, onNew }: { refreshKey: number; busyLayer: boolean; onDrafts: (count: number) => void; onEdit: (id: string) => void; onHistory: (id: string) => void; onNew: () => void }) {
	const [focus, setFocusState] = useState<CardFocus>("all");
	const [queue, setQueue] = useState<ReviewQueue | null>(null);
	const [loadFailed, setLoadFailed] = useState(false);
	const [reveal, setReveal] = useState<CardReveal | null>(null);
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<{ text: string; retry?: () => void } | null>(null);
	const [announce, setAnnounce] = useState("");
	const [note, setNote] = useState<string | null>(null);
	const [lastRemoved, setLastRemoved] = useState<{ id: string; kind: "suspended" | "deleted" } | null>(null);
	const showAnswer = useRef<HTMLButtonElement>(null);
	const answerRegion = useRef<HTMLDivElement>(null);
	const sequence = useRef(0);
	const revealRef = useRef(reveal);
	revealRef.current = reveal;
	const now = useRef(new Date());

	const load = useCallback(async (nextFocus: CardFocus) => {
		const ticket = ++sequence.current;
		const body = await cardFetch<{ queue: ReviewQueue; drafts: number }>(`/api/cards/queue?${queueQuery(nextFocus)}`);
		if (ticket !== sequence.current) return;
		if (failed(body)) { setLoadFailed(true); return; }
		setLoadFailed(false);
		now.current = new Date();
		setQueue(body.queue);
		onDrafts(body.drafts);
	}, []);

	useEffect(() => {
		const saved = readFocus();
		setFocusState(saved);
		void load(saved);
	}, [load]);
	useEffect(() => { if (refreshKey > 0) { setReveal(null); void load(focus); } /* a dialog changed something */ }, [refreshKey]);
	// Another tab or a generation. A shown answer stays until it's rated.
	useServerEvent("cards-changed", () => { if (!revealRef.current) void load(focus); });

	const setFocus = (next: CardFocus) => {
		setFocusState(next);
		setReveal(null);
		try { localStorage.setItem(FOCUS_KEY, next); } catch { /* per browser only */ }
		void load(next);
	};

	const card = queue?.card ?? null;
	const cardId = card?.id;
	// A new card or a shown answer takes focus, so keyboard review never loses its place.
	useEffect(() => { if (cardId && !reveal) showAnswer.current?.focus({ preventScroll: true }); }, [cardId, reveal]);
	useEffect(() => { if (reveal) answerRegion.current?.focus({ preventScroll: true }); }, [reveal]);

	const doReveal = useCallback(async () => {
		if (!cardId || busy || revealRef.current) return;
		setBusy(true); setFailure(null); setNote(null);
		const body = await cardFetch<CardReveal>(`/api/cards/${encodeURIComponent(cardId)}/reveal`, { method: "POST" });
		setBusy(false);
		if (failed(body)) {
			if (body.status === 404) { void load(focus); return; }
			setFailure({ text: "The answer could not be loaded.", retry: () => void doReveal() });
			return;
		}
		setAnnounce("Answer shown. Rate it with keys 1 to 4.");
		setReveal(body);
	}, [cardId, busy, focus]);

	const rate = useCallback(async (rating: CardRating) => {
		if (!card || !revealRef.current || busy) return;
		setBusy(true); setFailure(null);
		const body = await cardFetch<{ reviewId: string; interval: string; queue: ReviewQueue }>(`/api/cards/${encodeURIComponent(card.id)}/review?${queueQuery(focus)}`, { method: "POST", body: { rating, base: card.lastReviewId } });
		setBusy(false);
		if (failed(body)) {
			if (body.code === "stale" || body.status === 404) { setNote("This card was already rated elsewhere."); setReveal(null); void load(focus); return; }
			setFailure({ text: "Your rating wasn't saved.", retry: () => void rate(rating) });
			return;
		}
		sequence.current++;
		now.current = new Date();
		setReveal(null);
		setQueue(body.queue);
		setLastRemoved(null);
		const line = `${CARD_RATING_LABEL[rating]}, back in ${body.interval}.`;
		setNote(line);
		setAnnounce(`${line} ${dueLine(body.queue)}.`);
	}, [card, busy, focus]);

	const undo = useCallback(async () => {
		const reviewId = queue?.undo?.reviewId;
		if (!reviewId || busy) return;
		setBusy(true); setFailure(null);
		const body = await cardFetch<{ queue: ReviewQueue }>(`/api/cards/undo?${queueQuery(focus)}`, { method: "POST", body: { reviewId } });
		setBusy(false);
		if (failed(body)) { setFailure({ text: body.code === "stale" ? "Only a card's last rating can be undone." : "Your rating could not be undone." }); void load(focus); return; }
		sequence.current++;
		setReveal(null);
		setQueue(body.queue);
		setNote("Last rating undone.");
		setAnnounce(`Last rating undone. ${dueLine(body.queue)}.`);
	}, [queue, busy, focus]);

	const remove = async (kind: "suspended" | "deleted") => {
		if (!card || busy) return;
		setBusy(true); setFailure(null);
		const id = card.id;
		const result = kind === "suspended"
			? await cardFetch(`/api/cards/${encodeURIComponent(id)}`, { method: "PATCH", body: { suspended: true } })
			: await cardFetch(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
		setBusy(false);
		if (failed(result)) { setFailure({ text: kind === "suspended" ? "The card could not be suspended." : "The card could not be deleted." }); return; }
		setReveal(null);
		setLastRemoved({ id, kind });
		const line = kind === "suspended" ? "Card suspended." : "Card moved to Deleted.";
		setNote(line);
		setAnnounce(line);
		void load(focus);
	};

	const putBack = async () => {
		if (!lastRemoved || busy) return;
		setBusy(true);
		const result = await cardFetch(`/api/cards/${encodeURIComponent(lastRemoved.id)}`, { method: "PATCH", body: lastRemoved.kind === "suspended" ? { suspended: false } : { restore: true } });
		setBusy(false);
		if (failed(result)) { setFailure({ text: "That could not be put back." }); return; }
		setLastRemoved(null);
		setNote("Card put back.");
		setAnnounce("Card put back.");
		void load(focus);
	};

	useEffect(() => {
		if (busyLayer) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typingTarget(event.target) || document.querySelector("[role=dialog], [data-lh-menu]")) return;
			if (event.key === " ") {
				// A focused control's Space is its own.
				if (interactiveTarget(event.target) || revealRef.current || !cardId) return;
				event.preventDefault();
				void doReveal();
				return;
			}
			if (event.key === "u" || event.key === "U") { if (queue?.undo) { event.preventDefault(); void undo(); } return; }
			const at = ["1", "2", "3", "4"].indexOf(event.key);
			if (at !== -1 && revealRef.current) { event.preventDefault(); void rate(CARD_RATINGS[at]!); }
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [busyLayer, cardId, doReveal, rate, undo, queue?.undo]);

	const failureLine = failure && (
		<div role="alert" data-testid="queue-failure" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
			<p>{failure.text}</p>
			{failure.retry && <button type="button" className="prompt-secondary" onClick={failure.retry}>Try again</button>}
		</div>
	);

	if (queue === null) {
		return loadFailed
			? <div role="status" data-testid="queue-failed" className="flex flex-wrap items-center gap-2 text-ink-2"><p>Your flashcards could not be loaded.</p><button type="button" className="prompt-secondary" onClick={() => void load(focus)}>Try again</button></div>
			: <div role="status" aria-label="Loading your flashcards" data-testid="queue-loading" className="flex flex-col gap-2"><Skeleton className="h-40 w-full rounded-[10px]" /></div>;
	}

	return (
		<section aria-label="Review queue" className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p data-testid="queue-count" className="text-sm font-medium text-muted-foreground">{dueLine(queue)}{queue.weakDue > 0 ? ` · ${queue.weakDue} on weak ideas` : ""}</p>
				{queue.total > 0 && (
					<div role="group" aria-label="What to show" className="flex flex-wrap gap-1" data-testid="queue-focus">
						{(Object.keys(FOCUS_LABEL) as CardFocus[]).map((name) => (
							<button key={name} type="button" aria-pressed={focus === name} data-testid={`queue-focus-${name}`} onClick={() => setFocus(name)} className={cn(PILL, focus === name ? "bg-accent text-foreground" : "text-ink-2")}>{FOCUS_LABEL[name]}</button>
						))}
					</div>
				)}
			</div>
			<p role="status" aria-live="polite" data-testid="queue-live" className="sr-only">{announce}</p>
			{loadFailed && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-ink-2"><p>Your flashcards could not be refreshed.</p><button type="button" className="prompt-secondary" onClick={() => void load(focus)}>Try again</button></div>}

			{card ? (
				<article data-testid="queue-card" data-card-id={card.id} className="flex flex-col gap-3 rounded-[10px] bg-card p-4">
					<div data-testid="queue-front"><CardText text={card.front} /></div>
					{reveal ? (
						<>
							<div ref={answerRegion} tabIndex={-1} role="region" aria-label="Answer" data-testid="queue-back" className="rounded-md"><CardText text={reveal.back} className="text-ink-2" /></div>
							<RevealMeta reveal={reveal} />
							<RatingButtons reveal={reveal} disabled={busy} onRate={(rating) => void rate(rating)} />
						</>
					) : (
						<button ref={showAnswer} type="button" data-testid="queue-reveal" className="prompt-primary self-start" disabled={busy} aria-keyshortcuts="Space" onClick={() => void doReveal()}>
							{busy ? "Loading…" : "Show answer"}
						</button>
					)}
					{failureLine}
					<div className="flex flex-wrap gap-1" data-testid="queue-card-actions">
						{reveal && <button type="button" className="prompt-secondary" data-testid="queue-edit" onClick={() => onEdit(card.id)}>Edit</button>}
						<button type="button" className="prompt-secondary" data-testid="queue-history" onClick={() => onHistory(card.id)}>History</button>
						<button type="button" className="prompt-secondary" data-testid="queue-suspend" disabled={busy} onClick={() => void remove("suspended")}>Suspend</button>
						<button type="button" className="prompt-secondary" data-testid="queue-delete" disabled={busy} onClick={() => void remove("deleted")}>Delete</button>
					</div>
				</article>
			) : (
				<>
					<QueueEmpty queue={queue} focus={focus} now={now.current} onNew={onNew} onShowAll={() => setFocus("all")} />
					{failureLine}
				</>
			)}

			{(note || queue.undo || lastRemoved) && (
				<div className="flex flex-wrap items-center gap-2 text-sm text-ink-2" data-testid="queue-note">
					{note && <p>{note}</p>}
					{lastRemoved ? <button type="button" className="prompt-secondary" data-testid="queue-put-back" disabled={busy} onClick={() => void putBack()}>Undo</button>
						: queue.undo && <button type="button" className="prompt-secondary" data-testid="queue-undo" disabled={busy} aria-keyshortcuts="U" onClick={() => void undo()}>Undo last rating</button>}
				</div>
			)}
		</section>
	);
}
