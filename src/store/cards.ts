/**
 * Flashcards on disk (feature 021), tenant-scoped under cards/:
 *   cards.json    the card records and generation runs, written atomically
 *   reviews.jsonl the append-only review log
 *
 * WRITE-AHEAD: a review goes to the log first, then to the card. A crash between the
 * two is repaired on read (`reconcileCards`), so an accepted rating is never lost. A
 * torn last line is what such a crash leaves in the log: it was never acknowledged,
 * so it reads as absent, and the next append starts on a line of its own.
 *
 * A newer format is refused, for reads and writes, and never rewritten. A damaged
 * cards.json is refused too and left in place: losing the queue to a bad byte would
 * be worse than saying so. Nothing here touches a graph ledger.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nanoid } from "nanoid";
import { PATHS, tenantScoped } from "../../config.ts";
import { CARDS_VERSION, normalizeCardFront, reconcileCards, type Card, type CardLogLine, type CardRating, type CardRun, type CardSchedule, type CardsFile, type ReviewLine } from "../core/cards.ts";

export class CardsFormatError extends Error {
	constructor(readonly reason: "future" | "damaged", detail: string) {
		super(detail);
		this.name = "CardsFormatError";
	}
}

const cardsFile = () => path.join(PATHS.cards, "cards.json");
const logFile = () => path.join(PATHS.cards, "reviews.jsonl");

export const cardContentHash = (front: string): string => createHash("sha256").update(normalizeCardFront(front)).digest("hex");

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
	const lock = tenantScoped("__lhCardsLock", () => ({ tail: Promise.resolve() as Promise<unknown> }));
	const run = lock.tail.then(fn, fn);
	lock.tail = run.catch(() => {});
	return run;
}

const absent = (err: unknown) => (err as NodeJS.ErrnoException)?.code === "ENOENT";

async function readFile(): Promise<CardsFile> {
	const raw = await fs.readFile(cardsFile(), "utf8").catch((err) => { if (absent(err)) return null; throw err; });
	if (raw === null) return { version: CARDS_VERSION, cards: [], runs: [] };
	let parsed: CardsFile;
	try { parsed = JSON.parse(raw) as CardsFile; } catch { throw new CardsFormatError("damaged", "cards.json is not valid JSON"); }
	if (typeof parsed?.version !== "number") throw new CardsFormatError("damaged", "cards.json has no version");
	if (parsed.version > CARDS_VERSION) throw new CardsFormatError("future", `cards.json is version ${parsed.version}`);
	if (!Array.isArray(parsed.cards)) throw new CardsFormatError("damaged", "cards.json has no card list");
	return { version: parsed.version, cards: parsed.cards, runs: Array.isArray(parsed.runs) ? parsed.runs : [] };
}

async function writeFile(file: CardsFile): Promise<void> {
	await fs.mkdir(PATHS.cards, { recursive: true });
	const temp = `${cardsFile()}.${nanoid(8)}.tmp`;
	const handle = await fs.open(temp, "wx");
	try {
		await handle.writeFile(JSON.stringify({ ...file, version: CARDS_VERSION }));
		await handle.sync();
	} finally {
		await handle.close();
	}
	await fs.rename(temp, cardsFile());
}

async function readLog(): Promise<{ lines: CardLogLine[]; raw: string }> {
	const raw = await fs.readFile(logFile(), "utf8").catch((err) => { if (absent(err)) return ""; throw err; });
	const lines: CardLogLine[] = [];
	for (const text of raw.split("\n")) {
		if (!text.trim()) continue;
		let line: CardLogLine;
		try { line = JSON.parse(text) as CardLogLine; } catch { continue; } // a torn or bad line never counted
		if (typeof line?.v !== "number") continue;
		if (line.v > 1) throw new CardsFormatError("future", `reviews.jsonl holds version ${line.v}`);
		if ((line.type === "review" && line.before && line.after) || (line.type === "undo" && line.reviewId)) lines.push(line);
	}
	return { lines, raw };
}

async function appendLog(line: CardLogLine, raw: string): Promise<void> {
	await fs.mkdir(PATHS.cards, { recursive: true });
	const handle = await fs.open(logFile(), "a");
	try {
		// A torn tail stays as it is, on its own line, for anyone reading the file.
		await handle.writeFile(`${raw && !raw.endsWith("\n") ? "\n" : ""}${JSON.stringify(line)}\n`);
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function current(): Promise<{ file: CardsFile; log: CardLogLine[]; raw: string }> {
	const [file, { lines, raw }] = await Promise.all([readFile(), readLog()]);
	return { file: { ...file, cards: reconcileCards(file.cards, lines) }, log: lines, raw };
}

export type CardNew = Pick<Card, "front" | "back" | "source" | "conceptIds" | "status"> & { runId?: string };
export type CardEdit = Partial<Pick<Card, "front" | "back" | "source" | "conceptIds" | "suspended">>;

const replaceCard = (file: CardsFile, next: Card): CardsFile => ({ ...file, cards: file.cards.map((card) => (card.id === next.id ? next : card)) });

export const cardStore = {
	read: () => withLock(current),
	/** Cards added together (one draft set is one write). `schedule` is decided by
	 *  the caller, because core owns no scheduler. */
	add: (inputs: readonly (CardNew & { schedule: CardSchedule | null })[], now: Date) => withLock(async () => {
		const { file } = await current();
		const stamp = now.toISOString();
		const made: Card[] = inputs.map((input) => ({
			id: `card_${nanoid()}`, front: input.front, back: input.back, source: input.source, conceptIds: input.conceptIds,
			status: input.status, schedule: input.schedule, suspended: false, contentHash: cardContentHash(input.front), lastReviewId: null,
			...(input.runId ? { runId: input.runId } : {}), createdAt: stamp, updatedAt: stamp,
		}));
		await writeFile({ ...file, cards: [...file.cards, ...made] });
		return made;
	}),
	/** Text, links and suspension. The schedule stays what it was: a fixed typo
	 *  doesn't make the card new again. */
	edit: (id: string, edit: CardEdit, now: Date) => withLock(async () => {
		const { file } = await current();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card) return null;
		const next: Card = { ...card, ...edit, contentHash: edit.front === undefined ? card.contentHash : cardContentHash(edit.front), updatedAt: now.toISOString() };
		await writeFile(replaceCard(file, next));
		return next;
	}),
	/** A kept draft joins the schedule, new, from now. */
	accept: (id: string, schedule: CardSchedule, now: Date) => withLock(async () => {
		const { file } = await current();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card || card.status !== "draft") return null;
		const next: Card = { ...card, status: "active", schedule, updatedAt: now.toISOString() };
		await writeFile(replaceCard(file, next));
		return next;
	}),
	setDeleted: (id: string, deleted: boolean, now: Date) => withLock(async () => {
		const { file } = await current();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card) return null;
		const { deletedAt: _old, ...rest } = card;
		const next: Card = { ...rest, ...(deleted ? { deletedAt: now.toISOString() } : {}), updatedAt: now.toISOString() };
		await writeFile(replaceCard(file, next));
		return next;
	}),
	/** Delete for good. Log lines hold no card text and stay: the log is append-only. */
	purge: (id: string) => withLock(async () => {
		const { file } = await current();
		if (!file.cards.some((card) => card.id === id)) return false;
		await writeFile({ ...file, cards: file.cards.filter((card) => card.id !== id) });
		return true;
	}),
	/** One rating, log first. `base` is the review the rating was made after, so a
	 *  second tab's stale view gets "stale" rather than rating twice. */
	review: (id: string, input: { base: string | null; rating: CardRating; now: Date; schedule: (current: CardSchedule) => CardSchedule }) => withLock(async () => {
		const { file, raw } = await current();
		const card = file.cards.find((candidate) => candidate.id === id);
		if (!card || card.status !== "active" || !card.schedule || card.deletedAt) return "missing" as const;
		if (card.suspended) return "suspended" as const;
		if (card.lastReviewId !== input.base) return "stale" as const;
		const at = input.now.toISOString();
		const line: ReviewLine = { v: 1, type: "review", id: `rev_${nanoid()}`, cardId: id, rating: input.rating, at, before: card.schedule, after: input.schedule(card.schedule) };
		await appendLog(line, raw);
		await writeFile(replaceCard(file, { ...card, schedule: line.after, lastReviewId: line.id, updatedAt: at }));
		return line;
	}),
	/** Only the card's standing review can be undone, and only the once. */
	undo: (reviewId: string, now: Date) => withLock(async () => {
		const { file, log, raw } = await current();
		const review = log.find((line): line is ReviewLine => line.type === "review" && line.id === reviewId);
		if (!review) return "missing" as const;
		const card = file.cards.find((candidate) => candidate.id === review.cardId);
		if (!card || card.lastReviewId !== reviewId) return "stale" as const;
		const at = now.toISOString();
		await appendLog({ v: 1, type: "undo", id: `und_${nanoid()}`, reviewId, cardId: card.id, at }, raw);
		const earlier = log.filter((line) => line.cardId === card.id).reduce<ReviewLine[]>((stack, line) => {
			if (line.type === "review") stack.push(line);
			else { const found = stack.findLastIndex((entry) => entry.id === line.reviewId); if (found !== -1) stack.splice(found, 1); }
			return stack;
		}, []).filter((line) => line.id !== reviewId).at(-1);
		await writeFile(replaceCard(file, { ...card, schedule: review.before, lastReviewId: earlier?.id ?? null, updatedAt: at }));
		return review;
	}),
	saveRun: (run: CardRun) => withLock(async () => {
		const { file } = await current();
		const runs = file.runs.some((entry) => entry.id === run.id) ? file.runs.map((entry) => (entry.id === run.id ? run : entry)) : [...file.runs, run];
		await writeFile({ ...file, runs: runs.slice(-50) });
	}),
	/** A run and its drafts land together, or not at all. */
	finishRun: (run: CardRun, drafts: readonly (CardNew & { schedule: null })[], now: Date) => withLock(async () => {
		const { file } = await current();
		const stamp = now.toISOString();
		const made: Card[] = drafts.map((input) => ({
			id: `card_${nanoid()}`, front: input.front, back: input.back, source: input.source, conceptIds: input.conceptIds,
			status: "draft", schedule: null, suspended: false, contentHash: cardContentHash(input.front), lastReviewId: null, runId: run.id, createdAt: stamp, updatedAt: stamp,
		}));
		await writeFile({ ...file, cards: [...file.cards, ...made], runs: file.runs.map((entry) => (entry.id === run.id ? run : entry)) });
		return made;
	}),
};
