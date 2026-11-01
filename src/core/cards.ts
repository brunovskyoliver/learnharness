/**
 * Flashcards (feature 021): the record, its source reference, duplicate
 * comparison and what the browser may hold. Pure and browser-safe.
 *
 * SCHEDULING IS NOT EVIDENCE. A card's schedule says when to look again. It
 * never says what the learner understands, so nothing here touches a graph
 * ledger, and nothing in a ledger touches a schedule.
 *
 * THE BACK STAYS ON THE SERVER UNTIL THE LEARNER ASKS (constitution II).
 * `CardRow` and `QueueFace` are allowlists that hold no back. So does the face's
 * lack of source and ideas: a quote or an idea's name can give the answer away.
 */
import { citationHref } from "./document-anchors.ts";
import { foldText } from "./document-search.ts";
import { sourceHref } from "./note-sources.ts";

export const CARDS_VERSION = 1;
export const CARD_TEXT_MAX = 20_000;
export const CARD_CONCEPTS_MAX = 8;

export const CARD_RATINGS = ["again", "hard", "good", "easy"] as const;
export type CardRating = (typeof CARD_RATINGS)[number];
export const CARD_RATING_LABEL: Record<CardRating, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

export type CardPhase = "new" | "learning" | "review" | "relearning";

/** The scheduler's state as stored: JSON, with no type from the library. */
export interface CardSchedule {
	due: string;
	stability: number;
	difficulty: number;
	scheduledDays: number;
	learningSteps: number;
	reps: number;
	lapses: number;
	phase: CardPhase;
	lastReview: string | null;
}

/** The forms features 017 and 020 already use, with the name as it was then. */
export type CardSource =
	| { type: "item"; itemId: string; name: string; page?: number; block?: number }
	| { type: "citation"; itemId: string; name: string; page: number; quote: string }
	| { type: "message"; chatId: string; messageId: string | null; title: string };

export interface Card {
	id: string;
	front: string;
	back: string;
	source: CardSource | null;
	conceptIds: string[];
	/** Drafts wait for the learner and have no schedule. */
	status: "draft" | "active";
	schedule: CardSchedule | null;
	suspended: boolean;
	/** sha-256 of the normalized front. */
	contentHash: string;
	/** The newest review standing, so a second tab can't rate on a stale view. */
	lastReviewId: string | null;
	/** The generation this draft came from. */
	runId?: string;
	createdAt: string;
	updatedAt: string;
	/** Moved to Deleted: out of the queue, recoverable. */
	deletedAt?: string;
}

export interface CardRun {
	id: string;
	label: string;
	status: "running" | "done" | "failed" | "stopped" | "interrupted";
	error?: string;
	/** Part of the source was left out, for length. */
	truncated: boolean;
	drafts: number;
	usage?: import("./contracts/jobs.ts").JobUsage;
	createdAt: string;
	updatedAt: string;
}

export interface CardsFile { version: number; cards: Card[]; runs: CardRun[] }

export interface ReviewLine {
	v: 1;
	type: "review";
	id: string;
	cardId: string;
	rating: CardRating;
	at: string;
	before: CardSchedule;
	after: CardSchedule;
}
export interface UndoLine { v: 1; type: "undo"; id: string; reviewId: string; cardId: string; at: string }
export type CardLogLine = ReviewLine | UndoLine;

/** What the two write steps agree on after a crash between them: the log is
 *  written first, so it wins. Each card's standing review is the last one not
 *  undone, and a card whose reviews were all undone goes back to the first state. */
export function reconcileCards(cards: readonly Card[], log: readonly CardLogLine[]): Card[] {
	const stacks = new Map<string, ReviewLine[]>();
	const firstBefore = new Map<string, CardSchedule>();
	for (const line of log) {
		const stack = stacks.get(line.cardId) ?? [];
		stacks.set(line.cardId, stack);
		if (line.type === "review") {
			if (!firstBefore.has(line.cardId)) firstBefore.set(line.cardId, line.before);
			stack.push(line);
		} else {
			const at = stack.findLastIndex((review) => review.id === line.reviewId);
			if (at !== -1) stack.splice(at, 1);
		}
	}
	return cards.map((card) => {
		if (!stacks.has(card.id) || card.status !== "active") return card;
		const top = stacks.get(card.id)!.at(-1);
		if ((top?.id ?? null) === card.lastReviewId) return card;
		return { ...card, lastReviewId: top?.id ?? null, schedule: top?.after ?? firstBefore.get(card.id) ?? card.schedule };
	});
}

// ─── duplicates ──────────────────────────────────────────────────────────────

/** What two fronts are compared by: case, accents, spacing, emphasis marks and
 *  surrounding punctuation don't count. Formulas keep their symbols, so `$x_1$`
 *  and `$x1$` stay different. Deterministic, so never a model's judgement. */
export function normalizeCardFront(front: string): string {
	const emphasis = front.replace(/\r\n?/g, "\n").normalize("NFKC").replace(/(\*\*|__|`)/g, "");
	return foldText(emphasis).replace(/^[\s\p{P}]+(?=[^\s\p{P}$\\])/u, "").replace(/[\s?.!:;,…]+$/u, "").trim();
}

/** The live cards with the same front. A deleted card doesn't count. */
export function findDuplicates<T extends Pick<Card, "id" | "contentHash" | "deletedAt">>(cards: readonly T[], contentHash: string, exceptId?: string): T[] {
	return cards.filter((card) => card.id !== exceptId && !card.deletedAt && card.contentHash === contentHash);
}

export const cardDuplicateMessage = (count: number) => (count === 1 ? "You already have a card with this front." : `You already have ${count} cards with this front.`);

// ─── source references ───────────────────────────────────────────────────────

export function cardSourceLabel(source: CardSource): string {
	if (source.type === "message") return `Lesson: ${source.title}`;
	const place = source.page !== undefined ? `, p. ${source.page}` : "";
	return `${source.type === "citation" ? "PDF: " : ""}${source.name}${place}`;
}

/** Where a source opens. The same addresses as a note's links. */
export function cardSourceHref(source: CardSource): string {
	if (source.type === "message") return sourceHref(source.chatId, source.messageId);
	if (source.type === "citation") return citationHref(source);
	return `/library?item=${encodeURIComponent(source.itemId)}${source.page !== undefined ? `&page=${source.page}` : ""}`;
}

// ─── the wire ────────────────────────────────────────────────────────────────

export interface CardSourceView { label: string; href: string; gone: boolean }
export interface CardConceptView { id: string; name: string; statement: string; weak: boolean; gone: boolean }

/** A card in a list: never its back. */
export interface CardRow {
	id: string;
	front: string;
	status: Card["status"];
	suspended: boolean;
	deletedAt?: string;
	phase: CardPhase | null;
	due: string | null;
	source: CardSourceView | null;
	concepts: CardConceptView[];
	createdAt: string;
	updatedAt: string;
}

/** A draft is for reading before it joins anything, so it has its back. */
export interface DraftRow extends CardRow { back: string; duplicates: { id: string; front: string }[] }

/** The front of the next card: the only thing the queue sends about it. */
export interface QueueFace { id: string; front: string; phase: CardPhase; weak: boolean; lastReviewId: string | null }

export interface ReviewQueue {
	card: QueueFace | null;
	/** Due now, this card included. */
	due: number;
	/** Of those, linked to a weak idea. */
	weakDue: number;
	/** Not due yet but due before the day ends. */
	laterToday: number;
	nextDueAt: string | null;
	dayEndsAt: string;
	/** Active, unsuspended and undeleted cards at all, due or not. */
	total: number;
	suspended: number;
	undo: { reviewId: string; cardId: string } | null;
}

export type CardFocus = "all" | "weak-first" | "weak-only";
export const CARD_FOCUSES: readonly CardFocus[] = ["all", "weak-first", "weak-only"];

export interface RatingPreview { rating: CardRating; label: string; interval: string; due: string }

/** What Show answer returns. */
export interface CardReveal {
	id: string;
	back: string;
	previews: RatingPreview[];
	source: CardSourceView | null;
	concepts: CardConceptView[];
}

export interface CardHistoryRow { id: string; rating: CardRating; at: string; interval: string; undone: boolean }

/** "<1 min", "10 min", "3 h", "1 day", "2.5 months": a learner's words for the gap. */
export function intervalText(fromIso: string, toIso: string): string {
	const minutes = (Date.parse(toIso) - Date.parse(fromIso)) / 60_000;
	if (minutes < 1) return "<1 min";
	if (minutes < 60) return `${Math.round(minutes)} min`;
	const hours = minutes / 60;
	if (hours < 24) return `${Math.round(hours)} h`;
	const days = hours / 24;
	if (days < 30.4) { const n = Math.round(days); return `${n} ${n === 1 ? "day" : "days"}`; }
	const short = (value: number) => String(Math.round(value * 10) / 10);
	if (days < 365) { const n = short(days / 30.4); return `${n} ${n === "1" ? "month" : "months"}`; }
	const n = short(days / 365);
	return `${n} ${n === "1" ? "year" : "years"}`;
}

/** Home's row: nothing from a card, only how many. */
export const dueRowText = (due: number) => `${due} due`;

/** A browser-side passage on its way to the Make flashcards panel. */
export const CARD_PASSAGE_KEY = "lh:card-passage";
export interface CardPassageHandoff { itemId: string; page: number; text: string }

/** What Make flashcards reads. */
export type CardGenerationSource =
	| { kind: "page"; itemId: string }
	| { kind: "passage"; itemId: string; page: number; text: string }
	| { kind: "lesson"; chatId: string };

export const CARD_GENERATION_MAX_CHARS = 30_000;
export const CARD_GENERATION_MAX_CARDS = 12;
