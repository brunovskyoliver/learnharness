"use client";

/**
 * Feature 028: "once per arrival" (research R5-R6, data-model.md).
 *
 * A per-page-load registry of what has arrived, the pending navigation kind
 * that the next content region reads at mount, and the layout's
 * <MotionArrival /> that ends the cold-load signature. Module state lives
 * only in the browser: the server never writes it (writes happen in effects
 * and event handlers), so server renders always see a first arrival.
 */

import { cloneElement, createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type CSSProperties, type ReactElement } from "react";
import { usePathname } from "next/navigation";
import { SIGNATURE_ATTRIBUTE, STAGGER, staggerCount, type NavigationKind } from "@/src/core";

// ─── Pending navigation kind ─────────────────────────────────────────────────

/** A pending kind older than this is stale (a navigation that never committed). */
const PENDING_MS = 5000;
let pending: { kind: NavigationKind; at: number } | null = null;

/** Set by navigateTo (components/paper/navigate.ts) and the popstate listener, just before the navigation. */
export function setPendingArrival(kind: NavigationKind) {
	pending = { kind, at: Date.now() };
}

/** The kind of the navigation in flight or just committed, if any. */
export function pendingArrival(): NavigationKind | null {
	if (pending && Date.now() - pending.at > PENDING_MS) pending = null;
	return pending?.kind ?? null;
}

/** True while the cold-load signature plays (`<html data-lh-arrival="signature">`). */
export function signaturePlaying(): boolean {
	return typeof document !== "undefined" && document.documentElement.getAttribute(SIGNATURE_ATTRIBUTE) === "signature";
}

/** Ends the signature for this document: later mounts never get it. */
export function endSignature() {
	if (typeof document !== "undefined") document.documentElement.removeAttribute(SIGNATURE_ATTRIBUTE);
}

// ─── Arrival registry ────────────────────────────────────────────────────────

/** Keys that have arrived in this page load (`sidebar-rows`, `demo:{id}`, …). */
const arrived = new Set<string>();

/** How long an arrival attribute may stay if its animation never reports its end (hidden tab, no rule). */
const ARRIVAL_MAX_MS = 1000;

export interface ArrivalProps {
	"data-arrive"?: "";
	onAnimationEnd?: (event: AnimationEvent<Element>) => void;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * True on the first mount of `key` in this page load. Spread `arrivalProps`
 * on the element: it carries `data-arrive` until its own animation ends, so
 * a re-render or a re-show (display: none → shown) never replays it (FR-009).
 * With `enabled` false the element arrives finished and the key stays free.
 */
export function useArrival(key: string, enabled = true): { arriving: boolean; arrivalProps: ArrivalProps } {
	const [arriving, setArriving] = useState(() => enabled && !arrived.has(key));
	useEffect(() => {
		if (!enabled) return;
		arrived.add(key);
		if (!arriving) return;
		const timer = window.setTimeout(() => setArriving(false), ARRIVAL_MAX_MS);
		return () => window.clearTimeout(timer);
	}, [key, arriving, enabled]);
	const onAnimationEnd = useCallback((event: AnimationEvent<Element>) => {
		if (event.target === event.currentTarget) setArriving(false);
	}, []);
	const on = arriving && enabled;
	return { arriving: on, arrivalProps: on ? { "data-arrive": "", onAnimationEnd } : {} };
}

// ─── Lists: new rows, leaving rows (rows 13, 15, 16) ────────────────────────

/** How a new row arrives (app/paper.css `[data-lh-row]`). */
export type RowArrival = "unfold" | "settle" | "ink";
/** A row's motion attributes; list rows spread them on their element. */
export interface RowMotionProps {
	"data-lh-row"?: RowArrival | "leave";
	"aria-hidden"?: true;
	inert?: boolean;
}
/** A new row's attribute stays this long (unfold 340ms with margin). */
const ROW_ENTER_MS = 600;
/** A leaving row stays this long (lift 160ms with margin), then goes and the gap closes. */
const ROW_LEAVE_MS = 200;
const NONE: ReadonlySet<string> = new Set();

/**
 * The ids that appeared since this mount's previous render: none on the
 * first render with data (the list arrives as a whole), none while `ids` is
 * null (not loaded), none for a refresh with equal data. A scroll-back or a
 * remount is a first render, so history never re-animates (FR-009).
 */
export function useNewRows(ids: readonly string[] | null): ReadonlySet<string> {
	const seen = useRef<Set<string> | null>(null);
	const [fresh, setFresh] = useState<ReadonlySet<string>>(NONE);
	const key = ids === null ? null : ids.join("\u0000");
	useIsoLayoutEffect(() => {
		if (key === null) return;
		const current = key ? key.split("\u0000") : [];
		const before = seen.current;
		seen.current = new Set(current);
		if (!before) return;
		const added = current.filter((id) => !before.has(id));
		if (added.length) setFresh((prev) => new Set([...prev, ...added]));
	}, [key]);
	useEffect(() => {
		if (!fresh.size) return;
		const timer = window.setTimeout(() => setFresh(NONE), ROW_ENTER_MS);
		return () => window.clearTimeout(timer);
	}, [fresh]);
	return fresh;
}

interface Ghost { key: string; node: ReactElement<RowMotionProps>; after: string | null }

/**
 * Rows (keyed elements) removed since the last render stay where they were
 * for one lift, marked `data-lh-row="leave"`, hidden from assistive tech and
 * inert, then go and the gap closes. The row keeps its key, so React keeps
 * its element and the lift plays on it. Rows are DOM elements or components
 * that spread RowMotionProps on theirs.
 */
export function useLeavingRows(rows: readonly ReactElement<RowMotionProps>[] | null): ReactElement<RowMotionProps>[] {
	const last = useRef<readonly ReactElement<RowMotionProps>[] | null>(null);
	const [ghosts, setGhosts] = useState<readonly Ghost[]>([]);
	const key = rows === null ? null : rows.map((row) => String(row.key)).join("\u0000");
	useIsoLayoutEffect(() => {
		const before = last.current;
		if (key === null || !before) return;
		const now = new Set(key ? key.split("\u0000") : []);
		const gone: Ghost[] = [];
		let after: string | null = null;
		for (const row of before) {
			const k = String(row.key);
			if (now.has(k)) after = k;
			else gone.push({ key: k, node: row, after });
		}
		setGhosts((prev) => {
			const kept = prev.filter((ghost) => !now.has(ghost.key) && !gone.some((g) => g.key === ghost.key));
			return gone.length || kept.length !== prev.length ? [...kept, ...gone] : prev;
		});
	}, [key]);
	// After the diff: the rows as rendered, for the next one.
	useIsoLayoutEffect(() => { if (rows !== null) last.current = rows; });
	useEffect(() => {
		if (!ghosts.length) return;
		const timer = window.setTimeout(() => setGhosts([]), ROW_LEAVE_MS);
		return () => window.clearTimeout(timer);
	}, [ghosts]);
	if (rows === null) return [];
	if (!ghosts.length) return [...rows];
	const lift = (ghost: Ghost) => cloneElement(ghost.node, { "data-lh-row": "leave", "aria-hidden": true, inert: true });
	const out: ReactElement<RowMotionProps>[] = ghosts.filter((g) => g.after === null).map(lift);
	for (const row of rows) {
		out.push(row);
		for (const ghost of ghosts) if (ghost.after === String(row.key)) out.push(lift(ghost));
	}
	// A ghost whose neighbour went too: at the end.
	for (const ghost of ghosts) if (ghost.after !== null && !rows.some((row) => String(row.key) === ghost.after)) out.push(lift(ghost));
	return out;
}

/**
 * Order props for a list's own late arrival (`[data-row-order]` + `--j`):
 * its rows ink in staggered when the data lands after the page arrived
 * (SkeletonLift, components/ui/skeleton.tsx). Only the leading rows take
 * part; the rest of the first viewport takes the last step (FR-011).
 */
export function rowOrder(index: number, limit = staggerCount(STAGGER.desktop)): { "data-row-order"?: ""; style?: CSSProperties } {
	const slot = orderSlot(index, limit);
	return slot === null ? {} : { "data-row-order": "", style: { "--j": slot } as CSSProperties };
}

/**
 * The most items a first viewport holds (Home's rows are ~44px; 900px fits
 * about 20). Items past the stagger's last step but within this many still
 * ink in, with that last step, so the first viewport never shows a later row
 * solid before an earlier one (rows 2, 13, 29; FR-011 caps the delay, not
 * the ink-in); items past it are below the fold and arrive finished.
 */
const FIRST_VIEWPORT_ITEMS = 24;

/** The stagger slot of the item at `index`: its own up to the cap, then the cap's; null below the fold. */
function orderSlot(index: number, limit: number): number | null {
	if (!(index >= 0) || index >= Math.max(limit, FIRST_VIEWPORT_ITEMS)) return null;
	return Math.min(Math.floor(index), limit - 1);
}

// ─── Settled history (rows 17-19) ────────────────────────────────────────────

/**
 * The transcript's message ids present when the lesson mounted (provided by
 * the chat). A part of a message outside it arrived while the lesson was
 * open. Without a provider everything counts as settled: nothing animates.
 */
export const SettledMessagesContext = createContext<ReadonlySet<string> | null>(null);

/** True when `messageId` arrived after the lesson mounted (a new turn, a demo delivered now). */
export function useArrivedMessage(messageId: string | undefined): boolean {
	const settled = useContext(SettledMessagesContext);
	const [arrivedNow] = useState(() => Boolean(settled && messageId && !settled.has(messageId)));
	return arrivedNow;
}

/** Checks posed as threads in this page load: their grade arrives while he watches (row 18). */
const posed = new Set<string>();
/** A pending check's thread mounted (components/study/check-thread.tsx). */
export function notePosedCheck(id: string) { posed.add(id); }
/** True when this check was pending in this page load, so its grade is news. */
export function wasPosedCheck(id: string): boolean { return posed.has(id); }

/**
 * Reading-order props for the item at `index` inside an arriving region
 * (`[data-ink-order]` + `--i`). The leading items stagger; later ones in the
 * first viewport ink in with the last step; items below the fold get none
 * and arrive finished (FR-011, R6).
 */
export function inkOrder(index: number, limit = staggerCount(STAGGER.desktop)): { "data-ink-order"?: ""; style?: CSSProperties } {
	const slot = orderSlot(index, limit);
	return slot === null ? {} : { "data-ink-order": "", style: { "--i": slot } as CSSProperties };
}

// ─── <MotionArrival /> (root layout) ─────────────────────────────────────────

/** The signature's attribute stays at most this long after hydration. */
const SIGNATURE_MS = 900;

function onPopState() {
	setPendingArrival("history");
}

/** Popovers (row 10), which lift away while still mounted. Radix menus close at once (app/paper.css). */
const RETURNING = '[data-slot="popover-content"]';

/**
 * Feature 028 (R7, FR-005): a popover lifts away for 100ms and Radix gives
 * focus back to its trigger only when it unmounts, after the lift. This gives it back as the layer closes, when focus is still inside
 * it (so a choice that moved focus elsewhere keeps it there).
 */
function returnFocusOnClose(): () => void {
	const observer = new MutationObserver((records) => {
		const closed = records.filter((record) => record.oldValue !== "closed" && (record.target as Element).getAttribute("data-state") === "closed").map((record) => record.target as HTMLElement);
		for (const layer of closed) {
			if (!layer.matches(RETURNING) || !layer.contains(document.activeElement)) continue;
			// The trigger names the popover, or closed in the same commit.
			const named = layer.getAttribute("aria-labelledby");
			const trigger = (named ? document.getElementById(named) : null)
				?? (layer.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(layer.id)}"]`) : null)
				?? closed.find((other) => other !== layer && other.hasAttribute("aria-haspopup"));
			trigger?.focus();
		}
	});
	observer.observe(document.body, { attributes: true, attributeFilter: ["data-state"], attributeOldValue: true, subtree: true });
	return () => observer.disconnect();
}

/** Row 26: what presses (app/paper.css "Motion: small parts"). */
const PRESSABLE = '.nb-pill, .lh-tool, .lh-rating, [data-slot="button"]';

/**
 * Row 26 (FR-016): a touch or pen press marks its pill `data-pressed` until
 * it lifts, so it presses on touch too (a touch does not always make
 * :active: Safari without touch listeners, Chromium's headless shell). The
 * mouse has :active.
 */
function pressOnTouch(): () => void {
	let pressed: Element | null = null;
	const release = () => { pressed?.removeAttribute("data-pressed"); pressed = null; };
	const down = (event: PointerEvent) => {
		if (event.pointerType === "mouse") return;
		const target = event.target instanceof Element ? event.target.closest(PRESSABLE) : null;
		release();
		if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
		pressed = target;
		target.setAttribute("data-pressed", "");
	};
	document.addEventListener("pointerdown", down, { capture: true, passive: true });
	for (const type of ["pointerup", "pointercancel", "dragstart"]) document.addEventListener(type, release, { capture: true, passive: true });
	return () => {
		release();
		document.removeEventListener("pointerdown", down, { capture: true });
		for (const type of ["pointerup", "pointercancel", "dragstart"]) document.removeEventListener(type, release, { capture: true });
	};
}

/**
 * Ends the cold-load signature at the first navigation or 900ms after
 * mount, whichever is first, marks browser back/forward as `history`,
 * gives focus back as a popover closes, and marks touch presses (row 26).
 */
export function MotionArrival(): null {
	const pathname = usePathname();
	const [firstPath] = useState(pathname);
	useEffect(() => {
		window.addEventListener("popstate", onPopState);
		const stop = returnFocusOnClose();
		const unpress = pressOnTouch();
		return () => { window.removeEventListener("popstate", onPopState); stop(); unpress(); };
	}, []);
	useEffect(() => {
		if (pathname !== firstPath) {
			endSignature();
			return;
		}
		const timer = window.setTimeout(endSignature, SIGNATURE_MS);
		return () => window.clearTimeout(timer);
	}, [pathname, firstPath]);
	return null;
}
