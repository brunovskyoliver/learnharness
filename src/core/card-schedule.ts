/**
 * The scheduling seam and the daily queue (feature 021). Pure. Core knows only
 * this port: `src/server/card-scheduler.ts` backs it with ts-fsrs, loaded on first
 * use, so the library stays out of core and out of the browser.
 *
 * Every function takes `now`. The clock belongs to the server handler that calls
 * them, so tests can walk through days without waiting.
 */
import type { Card, CardFocus, CardRating, CardSchedule } from "./cards.ts";

export interface CardScheduler {
	initial(now: Date): CardSchedule;
	preview(schedule: CardSchedule, now: Date): Record<CardRating, CardSchedule>;
	apply(schedule: CardSchedule, rating: CardRating, now: Date): CardSchedule;
}

/** The learner's day turns over at 04:00 local, so a late night counts as one day. */
export const CARD_DAY_START_HOUR = 4;

export function validTimeZone(zone: string): boolean {
	if (zone.length > 100) return false;
	try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

function wallClock(at: number, zone: string) {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(at);
	const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
	return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** The instant a wall-clock hour falls in a zone. Checked twice for DST changes. */
function instantOf(y: number, m: number, d: number, h: number, zone: string): number {
	const wanted = Date.UTC(y, m - 1, d, h);
	let guess = wanted;
	for (let i = 0; i < 2; i++) {
		const w = wallClock(guess, zone);
		guess += wanted - Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s);
	}
	return guess;
}

/** The learner's current day, boundary to boundary. 23 or 25 hours across a DST change. */
export function learnerDay(now: Date, zone: string, startHour = CARD_DAY_START_HOUR): { start: Date; end: Date } {
	const w = wallClock(now.getTime(), zone);
	const base = new Date(Date.UTC(w.y, w.m - 1, w.d));
	if (w.h < startHour) base.setUTCDate(base.getUTCDate() - 1);
	const next = new Date(base);
	next.setUTCDate(next.getUTCDate() + 1);
	return {
		start: new Date(instantOf(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), startHour, zone)),
		end: new Date(instantOf(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), startHour, zone)),
	};
}

type Schedulable = Pick<Card, "status" | "suspended" | "deletedAt" | "schedule">;

/** In the schedule at all: kept, not suspended, not deleted. */
export const inSchedule = (card: Schedulable): boolean => card.status === "active" && !card.suspended && !card.deletedAt && card.schedule !== null;

/** Minute-scale steps come back at their minute. A card in review belongs to its
 *  day: due any time before today's boundary means due today. */
export function isDueNow(schedule: CardSchedule, now: Date, dayEnd: Date): boolean {
	const due = Date.parse(schedule.due);
	if (schedule.phase === "learning" || schedule.phase === "relearning") return due <= now.getTime();
	return due < dayEnd.getTime();
}

/** Steps in progress first, so they aren't forgotten mid-step, then review by how
 *  overdue, then new cards oldest first. Weak-first moves weak ideas ahead inside
 *  that order and changes no schedule. */
export function orderQueue<T extends Pick<Card, "id" | "schedule" | "createdAt">>(cards: readonly T[], focus: CardFocus, isWeak: (card: T) => boolean): T[] {
	const rank = (card: T) => { const phase = card.schedule!.phase; return phase === "learning" || phase === "relearning" ? 0 : phase === "review" ? 1 : 2; };
	const kept = focus === "weak-only" ? cards.filter(isWeak) : [...cards];
	return kept.sort((a, b) =>
		(focus === "weak-first" ? Number(isWeak(b)) - Number(isWeak(a)) : 0)
		|| rank(a) - rank(b)
		|| (rank(a) === 2 ? a.createdAt.localeCompare(b.createdAt) : a.schedule!.due.localeCompare(b.schedule!.due))
		|| a.id.localeCompare(b.id));
}
