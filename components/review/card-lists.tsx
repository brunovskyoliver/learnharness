"use client";

import { useRef, useState } from "react";
import { LibraryMoreButton } from "@/components/library/library-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { teaserPlain } from "@/components/teaser";
import type { CardRow, DraftRow } from "@/src/core";
import { cardFetch, failed } from "./card-api.ts";
import { CardText } from "./card-text.tsx";

export interface CardRunRow { id: string; label: string; status: "running" | "done" | "failed" | "stopped" | "interrupted"; error?: string; truncated: boolean; drafts: number; costUsd: number | null; usage?: { steps: number }; updatedAt: string }
export interface CardListData { cards: CardRow[]; drafts: DraftRow[]; runs: CardRunRow[] }

const PHASE: Record<NonNullable<CardRow["phase"]>, string> = { new: "New", learning: "Learning", review: "In review", relearning: "Relearning" };

export function cardMeta(row: CardRow, now = new Date()): string {
	const parts: string[] = [];
	if (row.suspended) parts.push("Suspended");
	else if (row.phase) parts.push(PHASE[row.phase]);
	if (!row.suspended && row.due) {
		const due = new Date(row.due);
		parts.push(due <= now ? "due" : `due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
	}
	return parts.join(" · ");
}

function RowLinks({ row }: { row: CardRow }) {
	if (!row.source && row.concepts.length === 0) return null;
	return (
		<>
			{row.source && <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]" data-testid="card-row-source">{row.source.label}{row.source.gone ? " · this source is gone" : ""}</span>}
			{row.concepts.length > 0 && <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]" data-testid="card-row-concepts">{row.concepts.map((concept) => `${concept.name}${concept.weak ? " · weak" : ""}`).join(", ")}</span>}
		</>
	);
}

export function ListStates({ data, failure, onRetry, label, children }: { data: CardListData | null; failure: boolean; onRetry: () => void; label: string; children: (data: CardListData) => React.ReactNode }) {
	if (data === null) {
		return failure
			? <div role="status" className="flex flex-wrap items-center gap-2 text-ink-2"><p>Your flashcards could not be loaded.</p><button type="button" className="prompt-secondary" onClick={onRetry}>Try again</button></div>
			: <div role="status" aria-label={label} className="flex flex-col gap-1"><Skeleton className="h-[62px] w-full rounded-[10px]" /><Skeleton className="h-[62px] w-full rounded-[10px]" /></div>;
	}
	return <>{failure && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-ink-2"><p>Your flashcards could not be refreshed.</p><button type="button" className="prompt-secondary" onClick={onRetry}>Try again</button></div>}{children(data)}</>;
}

/** Every kept card, front only: the back stays behind Edit. */
export function AllCards({ cards, onEdit, onHistory, onChanged, onFailure }: { cards: CardRow[]; onEdit: (id: string) => void; onHistory: (id: string) => void; onChanged: (message: string) => void; onFailure: (text: string) => void }) {
	const [query, setQuery] = useState("");
	const [weakOnly, setWeakOnly] = useState(false);
	const live = cards.filter((card) => !card.deletedAt);
	const hasWeak = live.some((card) => card.concepts.some((concept) => concept.weak));
	const needle = query.trim().toLowerCase();
	const shown = live.filter((card) => (!needle || card.front.toLowerCase().includes(needle)) && (!weakOnly || card.concepts.some((concept) => concept.weak)));
	if (live.length === 0) return <p className="text-ink-2" data-testid="cards-empty">No flashcards yet.</p>;
	const suspend = async (card: CardRow) => {
		const result = await cardFetch(`/api/cards/${encodeURIComponent(card.id)}`, { method: "PATCH", body: { suspended: !card.suspended } });
		if (failed(result)) onFailure(result.failure); else onChanged(card.suspended ? "Card back in the schedule." : "Card suspended.");
	};
	const remove = async (card: CardRow) => {
		const result = await cardFetch(`/api/cards/${encodeURIComponent(card.id)}`, { method: "DELETE" });
		if (failed(result)) onFailure(result.failure); else onChanged("Card moved to Deleted.");
	};
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<input aria-label="Search your cards" name="card-search" data-testid="cards-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your cards" autoComplete="off" className="h-10 min-w-0 flex-1 rounded-md border border-[var(--edge)] bg-background px-3 text-base text-foreground placeholder:text-muted-foreground pointer-coarse:h-11" />
				{hasWeak && <button type="button" aria-pressed={weakOnly} data-testid="cards-weak" className={`prompt-secondary ${weakOnly ? "bg-accent text-foreground" : ""}`} onClick={() => setWeakOnly((on) => !on)}>Only weak ideas</button>}
			</div>
			{shown.length === 0 ? <p role="status" className="text-ink-2">Nothing matched</p> : (
				<ul className="flex flex-col gap-1" data-testid="cards-list">
					{shown.map((card) => (
						<li key={card.id} data-testid="card-row" className="flex items-start gap-2 rounded-[10px] bg-card py-2 pl-3 pr-1">
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="text-base text-foreground [overflow-wrap:anywhere]">{teaserPlain(card.front)}</span>
								<span className="text-sm text-muted-foreground" suppressHydrationWarning data-testid="card-row-meta">{cardMeta(card)}</span>
								<RowLinks row={card} />
							</div>
							<LibraryMoreButton name={teaserPlain(card.front).slice(0, 60)} actions={[
								{ label: "Edit", onSelect: () => onEdit(card.id) },
								{ label: "History", onSelect: () => onHistory(card.id) },
								{ label: card.suspended ? "Unsuspend" : "Suspend", onSelect: () => void suspend(card) },
								{ label: "Delete", destructive: true, onSelect: () => void remove(card) },
							]} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function DeletedCards({ cards, onDeleteForGood, onChanged, onFailure }: { cards: CardRow[]; onDeleteForGood: (id: string) => void; onChanged: (message: string) => void; onFailure: (text: string) => void }) {
	const deleted = cards.filter((card) => card.deletedAt);
	if (deleted.length === 0) return <p className="text-ink-2" data-testid="deleted-empty">No deleted cards.</p>;
	const restore = async (id: string) => {
		const result = await cardFetch(`/api/cards/${encodeURIComponent(id)}`, { method: "PATCH", body: { restore: true } });
		if (failed(result)) onFailure(result.failure); else onChanged("Card restored.");
	};
	return (
		<ul className="flex flex-col gap-1" data-testid="deleted-list">
			{deleted.map((card) => (
				<li key={card.id} data-testid="deleted-row" className="flex flex-wrap items-center gap-2 rounded-[10px] bg-card px-3 py-2">
					<span className="min-w-0 flex-1 text-base text-foreground [overflow-wrap:anywhere]">{teaserPlain(card.front)}</span>
					<button type="button" className="prompt-secondary" data-testid="deleted-restore" aria-label={`Restore ${teaserPlain(card.front).slice(0, 60)}`} onClick={() => void restore(card.id)}>Restore</button>
					<button type="button" className="prompt-secondary text-destructive" data-testid="deleted-for-good" aria-label={`Delete for good ${teaserPlain(card.front).slice(0, 60)}`} onClick={() => onDeleteForGood(card.id)}>Delete for good</button>
				</li>
			))}
		</ul>
	);
}

const usd = (value: number) => (value < 0.01 ? "under $0.01" : `$${value.toFixed(2)}`);
/** Cost at read time. An unpriced run says so, and never reads as free. */
export const runCost = (run: Pick<CardRunRow, "costUsd" | "usage">) => (run.usage && run.usage.steps > 0 ? (run.costUsd === null ? "cost unknown" : usd(run.costUsd)) : null);

export function runLine(run: CardRunRow): string {
	const made = run.drafts === 1 ? "1 draft" : `${run.drafts} drafts`;
	const cost = runCost(run);
	const tail = cost ? ` · ${cost}` : "";
	const cut = run.truncated ? " · only the first part was read" : "";
	switch (run.status) {
		case "running": return `Making drafts from ${run.label}…${tail}${cut}`;
		case "done": return (run.drafts === 0 ? `${run.label} gave no cards` : `${made} from ${run.label}`) + tail + cut;
		case "failed": return `${run.label} failed: ${run.error ?? "the cards could not be made"}${tail}`;
		case "stopped": return `${run.label} stopped${tail}`;
		case "interrupted": return `${run.label} was interrupted when the app restarted`;
	}
}

/** Drafts join nothing until each is kept. A likely duplicate says so and offers
 *  Keep both or Skip, and never goes on its own. */
export function DraftList({ drafts, runs, onEdit, onChanged, onFailure }: { drafts: DraftRow[]; runs: CardRunRow[]; onEdit: (id: string) => void; onChanged: (message: string) => void; onFailure: (text: string) => void }) {
	const [busy, setBusy] = useState<string | null>(null);
	const live = useRef(true);
	const act = async (id: string, run: () => Promise<unknown>, message: string) => {
		setBusy(id);
		const result = await run();
		if (live.current) setBusy(null);
		if (failed(result)) onFailure(result.failure); else onChanged(message);
	};
	const keep = (id: string, keepBoth: boolean) => void act(id, () => cardFetch(`/api/cards/${encodeURIComponent(id)}/accept`, { method: "POST", body: keepBoth ? { keepBoth: true } : {} }), "Card kept. It's in your queue.");
	const skip = (id: string) => void act(id, () => cardFetch(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" }), "Draft skipped.");
	const stop = (id: string) => void act(id, () => cardFetch("/api/activity/abort", { method: "POST", body: { kind: "cards", id } }), "Stopping…");
	return (
		<div className="flex flex-col gap-3">
			{runs.length > 0 && (
				<ul className="flex flex-col gap-1 text-sm text-ink-2" data-testid="draft-runs" aria-live="polite">
					{runs.slice(0, 3).map((run) => (
						<li key={run.id} className="flex flex-wrap items-center gap-2" data-status={run.status}>
							<span className={`min-w-0 [overflow-wrap:anywhere] ${run.status === "failed" ? "text-destructive" : ""}`}>{runLine(run)}</span>
							{run.status === "running" && <button type="button" className="prompt-secondary" data-testid="draft-stop" onClick={() => stop(run.id)}>Stop</button>}
						</li>
					))}
				</ul>
			)}
			{drafts.length === 0 ? <p className="text-ink-2" data-testid="drafts-empty">No drafts waiting. Make flashcards from a note, a PDF passage or a lesson, and they wait here for you to read.</p> : (
				<ul className="flex flex-col gap-1" data-testid="drafts-list">
					{drafts.map((draft) => (
						<li key={draft.id} data-testid="draft-row" className="flex flex-col gap-2 rounded-[10px] bg-card p-3">
							<CardText text={draft.front} />
							<CardText text={draft.back} className="text-ink-2" />
							<div className="flex flex-col gap-0.5"><RowLinks row={draft} /></div>
							{draft.duplicates.length > 0 && (
								<p role="note" data-testid="draft-duplicate" className="text-sm text-ink-2 [overflow-wrap:anywhere]">{draft.duplicates.length === 1 ? "You already have a card with this front" : `You already have ${draft.duplicates.length} cards with this front`}: {teaserPlain(draft.duplicates[0]!.front)}</p>
							)}
							<div className="flex flex-wrap gap-1">
								<button type="button" className="prompt-secondary bg-accent text-foreground" data-testid="draft-keep" disabled={busy === draft.id} onClick={() => keep(draft.id, draft.duplicates.length > 0)}>{draft.duplicates.length > 0 ? "Keep both" : "Keep"}</button>
								<button type="button" className="prompt-secondary" data-testid="draft-edit" onClick={() => onEdit(draft.id)}>Edit</button>
								<button type="button" className="prompt-secondary" data-testid="draft-skip" disabled={busy === draft.id} onClick={() => skip(draft.id)}>Skip</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
