/**
 * Flashcard handlers (feature 021). Routes wrap these in withTenant, and every path
 * is tenant-scoped, so another tenant's id is an unknown id: a 404. Each handler
 * takes its clock as an argument, which is how tests walk through days.
 *
 * WHAT NEVER HAPPENS HERE: no write to a graph ledger, and no read of evidence in
 * any function that computes a schedule. Weak ideas are worked out from the
 * sessions' graded record and only choose what to show first.
 *
 * Source and idea "gone" are worked out on read, so deleting a session or trashing a
 * document touches no card, and restoring a document brings its link back.
 */
import { CARD_CONCEPTS_MAX, CARD_FOCUSES, CARD_RATING_LABEL, CARD_RATINGS, CARD_TEXT_MAX, cardDuplicateMessage, cardSourceHref, cardSourceLabel, findDuplicates, intervalText, type Card, type CardConceptView, type CardFocus, type CardGenerationSource, type CardHistoryRow, type CardLogLine, type CardRating, type CardReveal, type CardRow, type CardSource, type CardSourceView, type DraftRow, type ReviewLine, type ReviewQueue } from "../core/cards.ts";
import { conceptEvidence, type ConceptEvidence } from "../core/card-evidence.ts";
import { inSchedule, isDueNow, learnerDay, orderQueue, validTimeZone } from "../core/card-schedule.ts";
import { emit } from "../core/events.ts";
import { getGraph } from "../core/graph.ts";
import { queryGraph, searchGraph } from "../core/graph-queries.ts";
import { LibraryCatalogError } from "../core/library.ts";
import type { GraphNode } from "../core/contracts/graph.ts";
import { tenantScoped } from "../../config.ts";
import { cardContentHash, cardStore, CardsFormatError } from "../store/cards.ts";
import { loadCardScheduler } from "./card-scheduler.ts";
import { anyCardRunLive, cardModelName, cardModelRefusal, cardRunRows, resolveCardSource, runCardGeneration } from "./card-generation.ts";
import { graphRevision } from "./graph.ts";
import { stores } from "./stores.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function guarded(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (err) {
		if (err instanceof CardsFormatError) {
			console.error("[cards]", err.message);
			return err.reason === "future"
				? json({ error: "Your flashcards were saved by a newer version of the app, so this one won't change them.", code: "cards_future" }, 409)
				: json({ error: "Your flashcards could not be read. Nothing was changed.", code: "cards_damaged" }, 500);
		}
		throw err;
	}
}

const cardGone = () => json({ error: "That card is no longer here." }, 404);
const changed = () => emit("cards-changed", {});

// ─── what a card links to, read fresh or from a cache keyed on what it reads ──

interface Links { nodes: Map<string, GraphNode>; evidence: Map<string, ConceptEvidence> }

function readLinks(): Links {
	const chats = stores.chatStore.listChats();
	const key = `${graphRevision()}|${chats.map((chat) => `${chat.id}:${chat.updatedAt}`).join(",")}`;
	const cache = tenantScoped("__lhCardLinks", () => ({ key: "", links: { nodes: new Map(), evidence: new Map() } as Links }));
	if (cache.key === key) return cache.links;
	const graph = queryGraph(getGraph(stores.graphStore));
	const records = chats.flatMap((chat) => { const record = stores.chatStore.getChat(chat.id); return record ? [{ id: record.id, messages: record.messages }] : []; });
	cache.links = { nodes: new Map(graph.nodes.map((node) => [node.id, node])), evidence: conceptEvidence(graph.nodes, records) };
	cache.key = key;
	return cache.links;
}

const NO_LINKS: Links = { nodes: new Map(), evidence: new Map() };
const linksFor = (cards: readonly Pick<Card, "conceptIds">[]): Links => (cards.some((card) => card.conceptIds.length > 0) ? readLinks() : NO_LINKS);

const isWeak = (card: Pick<Card, "conceptIds">, links: Links) => card.conceptIds.some((id) => links.evidence.get(id)?.weak);

function conceptViews(card: Pick<Card, "conceptIds">, links: Links): CardConceptView[] {
	return card.conceptIds.map((id) => {
		const node = links.nodes.get(id);
		return node
			? { id, name: node.name, statement: node.statement, weak: links.evidence.get(id)?.weak === true, gone: false }
			: { id, name: "An idea no longer in your graph", statement: "", weak: false, gone: true };
	});
}

/** Which sources still exist. If the Library can't be read, nothing reads as gone. */
async function sourceChecker(): Promise<(source: CardSource) => boolean> {
	const chats = new Set(stores.chatStore.listChats().map((chat) => chat.id));
	let items: Set<string> | null = null;
	try { items = new Set((await stores.libraryStore.list()).map((item) => item.id)); } catch (err) { if (!(err instanceof LibraryCatalogError)) throw err; }
	return (source) => (source.type === "message" ? !chats.has(source.chatId) : items !== null && !items.has(source.itemId));
}

const sourceView = (source: CardSource | null, isGone: (source: CardSource) => boolean): CardSourceView | null =>
	source ? { label: cardSourceLabel(source), href: cardSourceHref(source), gone: isGone(source) } : null;

function rowOf(card: Card, links: Links, isGone: (source: CardSource) => boolean): CardRow {
	return {
		id: card.id, front: card.front, status: card.status, suspended: card.suspended,
		...(card.deletedAt ? { deletedAt: card.deletedAt } : {}),
		phase: card.schedule?.phase ?? null, due: card.schedule?.due ?? null,
		source: sourceView(card.source, isGone), concepts: conceptViews(card, links),
		createdAt: card.createdAt, updatedAt: card.updatedAt,
	};
}

// ─── the queue ───────────────────────────────────────────────────────────────

function queueOf(cards: readonly Card[], log: readonly CardLogLine[], now: Date, zone: string, focus: CardFocus): ReviewQueue {
	const day = learnerDay(now, zone);
	const live = cards.filter(inSchedule);
	const due = live.filter((card) => isDueNow(card.schedule!, now, day.end));
	const links = linksFor(due);
	const weak = (card: Card) => isWeak(card, links);
	const ordered = orderQueue(due, focus, weak);
	const waiting = live.filter((card) => !isDueNow(card.schedule!, now, day.end));
	const first = ordered[0];
	const undone = new Set(log.flatMap((line) => (line.type === "undo" ? [line.reviewId] : [])));
	const last = log.findLast((line): line is ReviewLine => line.type === "review" && !undone.has(line.id));
	const lastCard = last && cards.find((card) => card.id === last.cardId);
	return {
		card: first ? { id: first.id, front: first.front, phase: first.schedule!.phase, weak: weak(first), lastReviewId: first.lastReviewId } : null,
		due: due.length,
		weakDue: due.filter(weak).length,
		laterToday: waiting.filter((card) => Date.parse(card.schedule!.due) < day.end.getTime()).length,
		nextDueAt: waiting.map((card) => card.schedule!.due).sort()[0] ?? null,
		dayEndsAt: day.end.toISOString(),
		total: live.length,
		suspended: cards.filter((card) => card.status === "active" && card.suspended && !card.deletedAt).length,
		// Today's last rating can be taken back, also after a reload.
		undo: last && lastCard?.lastReviewId === last.id && Date.parse(last.at) >= day.start.getTime() ? { reviewId: last.id, cardId: last.cardId } : null,
	};
}

const zoneOf = (value: string | null | undefined): string | null => {
	if (!value) return "UTC";
	return validTimeZone(value) ? value : null;
};
const focusOf = (value: string | null | undefined): CardFocus | null => {
	if (!value) return "all";
	return (CARD_FOCUSES as readonly string[]).includes(value) ? value as CardFocus : null;
};
const BAD_ZONE = () => json({ error: "That time zone isn't one this server knows." }, 400);
const BAD_FOCUS = () => json({ error: "That filter isn't one the queue has." }, 400);

export function cardQueueResponse(request: Request, now = new Date()): Promise<Response> {
	return guarded(async () => {
		const params = new URL(request.url).searchParams;
		const zone = zoneOf(params.get("tz"));
		if (!zone) return BAD_ZONE();
		const focus = focusOf(params.get("focus"));
		if (!focus) return BAD_FOCUS();
		const { file, log } = await cardStore.read();
		return json({ queue: queueOf(file.cards, log, now, zone, focus), drafts: file.cards.filter((card) => card.status === "draft" && !card.deletedAt).length });
	});
}

/** The back and predicted intervals, on the learner's asking. Source and ideas come
 *  now too, since either can give the answer away. */
export function cardRevealResponse(id: string, now = new Date()): Promise<Response> {
	return guarded(async () => {
		const { file } = await cardStore.read();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card || card.status !== "active" || !card.schedule || card.deletedAt) return cardGone();
		const scheduler = await loadCardScheduler();
		const preview = scheduler.preview(card.schedule, now);
		const at = now.toISOString();
		const reveal: CardReveal = {
			id: card.id, back: card.back,
			previews: CARD_RATINGS.map((rating) => ({ rating, label: CARD_RATING_LABEL[rating], interval: intervalText(at, preview[rating].due), due: preview[rating].due })),
			source: sourceView(card.source, await sourceChecker()),
			concepts: conceptViews(card, linksFor([card])),
		};
		return json(reveal);
	});
}

export function cardReviewResponse(request: Request, id: string, now = new Date()): Promise<Response> {
	return guarded(async () => {
		const params = new URL(request.url).searchParams;
		const zone = zoneOf(params.get("tz"));
		if (!zone) return BAD_ZONE();
		const focus = focusOf(params.get("focus"));
		if (!focus) return BAD_FOCUS();
		const body = await request.json().catch(() => null) as { rating?: unknown; base?: unknown } | null;
		if (!CARD_RATINGS.includes(body?.rating as CardRating) || (body?.base !== null && typeof body?.base !== "string")) return json({ error: "That rating could not be read." }, 400);
		const scheduler = await loadCardScheduler();
		const rating = body.rating as CardRating;
		const line = await cardStore.review(id, { base: body.base as string | null, rating, now, schedule: (current) => scheduler.apply(current, rating, now) });
		if (line === "missing") return cardGone();
		if (line === "suspended") return json({ error: "That card is suspended.", code: "suspended" }, 409);
		if (line === "stale") return json({ error: "This card was already rated elsewhere.", code: "stale" }, 409);
		changed();
		const { file, log } = await cardStore.read();
		return json({ reviewId: line.id, interval: intervalText(line.at, line.after.due), queue: queueOf(file.cards, log, now, zone, focus) });
	});
}

export function cardUndoResponse(request: Request, now = new Date()): Promise<Response> {
	return guarded(async () => {
		const params = new URL(request.url).searchParams;
		const zone = zoneOf(params.get("tz"));
		if (!zone) return BAD_ZONE();
		const focus = focusOf(params.get("focus"));
		if (!focus) return BAD_FOCUS();
		const body = await request.json().catch(() => null) as { reviewId?: unknown } | null;
		if (typeof body?.reviewId !== "string") return json({ error: "That review could not be read." }, 400);
		const outcome = await cardStore.undo(body.reviewId, now);
		if (outcome === "missing") return json({ error: "That review isn't in your history." }, 404);
		if (outcome === "stale") return json({ error: "Only a card's last rating can be undone.", code: "stale" }, 409);
		changed();
		const { file, log } = await cardStore.read();
		return json({ queue: queueOf(file.cards, log, now, zone, focus) });
	});
}

export function cardHistoryResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const { file, log } = await cardStore.read();
		if (!file.cards.some((card) => card.id === id)) return cardGone();
		const undone = new Set(log.flatMap((line) => (line.type === "undo" ? [line.reviewId] : [])));
		const rows: CardHistoryRow[] = log.filter((line): line is ReviewLine => line.type === "review" && line.cardId === id)
			.map((line) => ({ id: line.id, rating: line.rating, at: line.at, interval: intervalText(line.at, line.after.due), undone: undone.has(line.id) }));
		return json({ history: rows.reverse() });
	});
}

// ─── cards ───────────────────────────────────────────────────────────────────

function textField(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const text = value.replace(/\r\n?/g, "\n").trim();
	return text && text.length <= CARD_TEXT_MAX ? text : null;
}

/** A source the client names is checked, and its name comes from the server. */
async function parseSource(value: unknown): Promise<{ source: CardSource | null } | { error: string; status: number }> {
	if (value === null || value === undefined) return { source: null };
	const raw = value as { type?: unknown; itemId?: unknown; page?: unknown; block?: unknown; quote?: unknown; chatId?: unknown; messageId?: unknown };
	const page = Number.isInteger(raw.page) && (raw.page as number) >= 1 ? raw.page as number : undefined;
	if (raw.type === "message") {
		if (typeof raw.chatId !== "string") return { error: "That source could not be read.", status: 400 };
		const chat = stores.chatStore.getChat(raw.chatId);
		if (!chat) return { error: "That session is no longer here.", status: 404 };
		const messageId = typeof raw.messageId === "string" ? raw.messageId : null;
		if (messageId && !chat.messages.some((message) => message.id === messageId)) return { error: "That message is no longer in the session.", status: 404 };
		return { source: { type: "message", chatId: chat.id, messageId, title: chat.title } };
	}
	if ((raw.type !== "item" && raw.type !== "citation") || typeof raw.itemId !== "string") return { error: "That source could not be read.", status: 400 };
	const item = await stores.libraryStore.get(raw.itemId);
	if (!item) return { error: "That item is no longer in your Library.", status: 404 };
	if (raw.type === "citation") {
		if (page === undefined || typeof raw.quote !== "string") return { error: "That citation could not be read.", status: 400 };
		return { source: { type: "citation", itemId: item.id, name: item.name, page, quote: raw.quote.slice(0, 200) } };
	}
	return { source: { type: "item", itemId: item.id, name: item.name, ...(page !== undefined ? { page } : {}), ...(Number.isInteger(raw.block) && (raw.block as number) >= 0 ? { block: raw.block as number } : {}) } };
}

function parseConcepts(value: unknown, current: readonly string[] = []): string[] | null {
	if (value === undefined) return [...current];
	if (!Array.isArray(value) || value.length > CARD_CONCEPTS_MAX || !value.every((id) => typeof id === "string")) return null;
	// An id already linked may have left the graph since: it stays, and reads as gone.
	const nodes = readLinks().nodes;
	return value.every((id) => nodes.has(id) || current.includes(id)) ? [...new Set(value as string[])] : null;
}

const duplicateRefusal = (duplicates: readonly Card[]) => json({ error: cardDuplicateMessage(duplicates.length), code: "duplicate", duplicates: duplicates.map((card) => ({ id: card.id, front: card.front })) }, 409);
const BAD_TEXT = () => json({ error: `A card needs a front and a back, each at most ${CARD_TEXT_MAX} characters.` }, 400);
const BAD_CONCEPTS = () => json({ error: `A card links to at most ${CARD_CONCEPTS_MAX} ideas, each one in your graph.` }, 400);

/** The list: never an active card's back. A draft has its back, to be read before keeping. */
export function cardsListResponse(): Promise<Response> {
	return guarded(async () => {
		const { file } = await cardStore.read();
		const links = linksFor(file.cards);
		const isGone = await sourceChecker();
		const live = file.cards.filter((card) => !card.deletedAt);
		const drafts: DraftRow[] = live.filter((card) => card.status === "draft").map((card) => ({
			...rowOf(card, links, isGone), back: card.back,
			duplicates: findDuplicates(live, card.contentHash, card.id).map((other) => ({ id: other.id, front: other.front })),
		}));
		return json({
			cards: file.cards.filter((card) => card.status === "active").map((card) => rowOf(card, links, isGone)),
			drafts,
			runs: cardRunRows(file.runs).slice(0, 10),
		});
	});
}

/** A card by hand: no model at all. It joins the schedule at once. */
export function cardCreateResponse(request: Request, now = new Date()): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => null) as { front?: unknown; back?: unknown; source?: unknown; conceptIds?: unknown; keepBoth?: unknown } | null;
		const front = textField(body?.front), back = textField(body?.back);
		if (!front || !back) return BAD_TEXT();
		const source = await parseSource(body?.source);
		if ("error" in source) return json({ error: source.error }, source.status);
		const conceptIds = parseConcepts(body?.conceptIds);
		if (!conceptIds) return BAD_CONCEPTS();
		const { file } = await cardStore.read();
		const duplicates = findDuplicates(file.cards, cardContentHash(front));
		if (duplicates.length > 0 && body?.keepBoth !== true) return duplicateRefusal(duplicates);
		const scheduler = await loadCardScheduler();
		const [card] = await cardStore.add([{ front, back, source: source.source, conceptIds, status: "active", schedule: scheduler.initial(now) }], now);
		changed();
		return json({ card: { id: card!.id } }, 201);
	});
}

/** One card with its back, for editing, which is the learner asking to see it. */
export function cardGetResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const { file } = await cardStore.read();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card) return cardGone();
		return json({ ...rowOf(card, linksFor([card]), await sourceChecker()), back: card.back });
	});
}

export function cardPatchResponse(request: Request, id: string, now = new Date()): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => null) as { front?: unknown; back?: unknown; source?: unknown; conceptIds?: unknown; suspended?: unknown; restore?: unknown; keepBoth?: unknown } | null;
		if (!body) return json({ error: "That change could not be read." }, 400);
		const { file } = await cardStore.read();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card) return cardGone();
		if (body.restore === true) {
			await cardStore.setDeleted(id, false, now);
			changed();
			return json({ ok: true });
		}
		const front = body.front === undefined ? undefined : textField(body.front);
		const back = body.back === undefined ? undefined : textField(body.back);
		if (front === null || back === null) return BAD_TEXT();
		if (body.suspended !== undefined && typeof body.suspended !== "boolean") return json({ error: "That change could not be read." }, 400);
		const conceptIds = parseConcepts(body.conceptIds, card.conceptIds);
		if (!conceptIds) return BAD_CONCEPTS();
		const source = body.source === undefined ? { source: card.source } : await parseSource(body.source);
		if ("error" in source) return json({ error: source.error }, source.status);
		if (front !== undefined && cardContentHash(front) !== card.contentHash && body.keepBoth !== true) {
			const duplicates = findDuplicates(file.cards, cardContentHash(front), id);
			if (duplicates.length > 0) return duplicateRefusal(duplicates);
		}
		await cardStore.edit(id, {
			...(front !== undefined ? { front } : {}), ...(back !== undefined ? { back } : {}),
			source: source.source, conceptIds,
			...(body.suspended !== undefined ? { suspended: body.suspended as boolean } : {}),
		}, now);
		changed();
		return json({ ok: true });
	});
}

/** A kept draft joins the queue. Only this, one card at a time, puts a draft there. */
export function cardAcceptResponse(request: Request, id: string, now = new Date()): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => ({})) as { keepBoth?: unknown } | null;
		const { file } = await cardStore.read();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card || card.status !== "draft") return cardGone();
		const duplicates = findDuplicates(file.cards, card.contentHash, id);
		if (duplicates.length > 0 && body?.keepBoth !== true) return duplicateRefusal(duplicates);
		const scheduler = await loadCardScheduler();
		await cardStore.accept(id, scheduler.initial(now), now);
		changed();
		return json({ ok: true });
	});
}

/** A kept card goes to Deleted, and can be restored. Deleted, with forGood, or a
 *  draft the learner skipped, it goes. */
export function cardDeleteResponse(request: Request, id: string, now = new Date()): Promise<Response> {
	return guarded(async () => {
		const forGood = new URL(request.url).searchParams.get("forGood") === "1";
		const { file } = await cardStore.read();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card) return cardGone();
		if (forGood && !card.deletedAt && card.status !== "draft") return json({ error: "Move a card to Deleted before deleting it for good.", code: "not_deleted" }, 409);
		if (card.status === "draft" || forGood) await cardStore.purge(id);
		else await cardStore.setDeleted(id, true, now);
		changed();
		return json({ ok: true });
	});
}

/** Ideas to link, through the graph's own search. Read only. */
export function cardConceptsResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
		const links = readLinks();
		const nodes = q ? searchGraph({ nodes: [...links.nodes.values()], chains: [] }, q) : [...links.nodes.values()].filter((node) => links.evidence.get(node.id)?.weak);
		return json({ concepts: nodes.slice(0, 20).map((node) => ({ id: node.id, name: node.name, statement: node.statement, weak: links.evidence.get(node.id)?.weak === true })) });
	});
}

// ─── generation ──────────────────────────────────────────────────────────────

function parseGeneration(body: unknown): CardGenerationSource | null {
	const raw = (body ?? {}) as { kind?: unknown; itemId?: unknown; page?: unknown; text?: unknown; chatId?: unknown };
	if (raw.kind === "page" && typeof raw.itemId === "string") return { kind: "page", itemId: raw.itemId };
	if (raw.kind === "lesson" && typeof raw.chatId === "string") return { kind: "lesson", chatId: raw.chatId };
	if (raw.kind === "passage" && typeof raw.itemId === "string" && Number.isInteger(raw.page) && (raw.page as number) >= 1 && typeof raw.text === "string") return { kind: "passage", itemId: raw.itemId, page: raw.page as number, text: raw.text };
	return null;
}

/** GET-free preview and start. `preview: true` calls no model: it says what would be
 *  sent, to whom, so the click that costs is an informed one. */
export function cardGenerateResponse(request: Request, now: () => Date = () => new Date()): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => null) as ({ preview?: unknown } & Record<string, unknown>) | null;
		const input = parseGeneration(body);
		if (!input) return json({ error: "That source could not be read." }, 400);
		const resolved = await resolveCardSource(input);
		if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
		const refusal = cardModelRefusal();
		if (body?.preview === true) {
			return json({ label: resolved.label, source: resolved.source, chars: resolved.text.length, truncated: resolved.truncated, model: cardModelName(), refusal: refusal ? refusal.body : null });
		}
		if (refusal) return json(refusal.body, refusal.status);
		if (anyCardRunLive()) return json({ error: "Some flashcards are already being made. Wait for them, or stop them.", code: "busy" }, 409);
		// A newer-format file must refuse before anything is spent.
		await cardStore.read();
		return json({ run: runCardGeneration(resolved, now) }, 202);
	});
}

export function cardRunsResponse(): Promise<Response> {
	return guarded(async () => {
		const { file } = await cardStore.read();
		return json({ runs: cardRunRows(file.runs).slice(0, 10) });
	});
}
