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

import { useCallback, useEffect, useState, type AnimationEvent, type CSSProperties } from "react";
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
/** Per list key, the row ids seen so far. */
const seenRows = new Map<string, Set<string>>();

/** How long an arrival attribute may stay if its animation never reports its end (hidden tab, no rule). */
const ARRIVAL_MAX_MS = 1000;

export interface ArrivalProps {
	"data-arrive"?: "";
	onAnimationEnd?: (event: AnimationEvent<Element>) => void;
}

/**
 * True on the first mount of `key` in this page load. Spread `arrivalProps`
 * on the element: it carries `data-arrive` until its own animation ends, so
 * a re-render or a re-show (display: none → shown) never replays it (FR-009).
 */
export function useArrival(key: string): { arriving: boolean; arrivalProps: ArrivalProps } {
	const [arriving, setArriving] = useState(() => !arrived.has(key));
	useEffect(() => {
		arrived.add(key);
		if (!arriving) return;
		const timer = window.setTimeout(() => setArriving(false), ARRIVAL_MAX_MS);
		return () => window.clearTimeout(timer);
	}, [key, arriving]);
	const onAnimationEnd = useCallback((event: AnimationEvent<Element>) => {
		if (event.target === event.currentTarget) setArriving(false);
	}, []);
	return { arriving, arrivalProps: arriving ? { "data-arrive": "", onAnimationEnd } : {} };
}

/**
 * The ids in `ids` that appeared after the list's first render in this page
 * load. A refresh with equal data returns none; the first render returns
 * none (the list arrives as a whole). Call `settle(id)` when a new row's
 * arrival ends.
 */
export function useNewRows(listKey: string, ids: readonly string[]): { fresh: ReadonlySet<string>; settle: (id: string) => void } {
	const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
	const signature = ids.join("\u0000");
	useEffect(() => {
		const seen = seenRows.get(listKey);
		const current = signature ? signature.split("\u0000") : [];
		if (!seen) {
			seenRows.set(listKey, new Set(current));
			return;
		}
		const added = current.filter((id) => !seen.has(id));
		for (const id of added) seen.add(id);
		if (added.length) setFresh((prev) => new Set([...prev, ...added]));
	}, [listKey, signature]);
	const settle = useCallback((id: string) => {
		setFresh((prev) => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}, []);
	return { fresh, settle };
}

/**
 * Reading-order props for the item at `index` inside an arriving region
 * (`[data-ink-order]` + `--i`). Only the leading items take part; later ones
 * get none and arrive finished (FR-011, R6).
 */
export function inkOrder(index: number, limit = staggerCount(STAGGER.desktop)): { "data-ink-order"?: ""; style?: CSSProperties } {
	if (!(index >= 0) || index >= limit) return {};
	return { "data-ink-order": "", style: { "--i": Math.floor(index) } as CSSProperties };
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

/**
 * Ends the cold-load signature at the first navigation or 900ms after
 * mount, whichever is first, marks browser back/forward as `history`, and
 * gives focus back as a popover closes.
 */
export function MotionArrival(): null {
	const pathname = usePathname();
	const [firstPath] = useState(pathname);
	useEffect(() => {
		window.addEventListener("popstate", onPopState);
		const stop = returnFocusOnClose();
		return () => { window.removeEventListener("popstate", onPopState); stop(); };
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
