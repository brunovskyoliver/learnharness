/**
 * Feature 028: the motion language's pure decisions (research R5, R6, R9;
 * data-model.md). No DOM, no React: the client parts live in
 * components/paper/motion-arrival.ts and components/paper/navigate.ts.
 */

/** sessionStorage key: the cold-load signature has played in this tab (data-model "Signature flag"). */
export const SIGNATURE_KEY = "lh.motion.signature";

/** `<html data-lh-arrival="signature">` while the signature plays. */
export const SIGNATURE_ATTRIBUTE = "data-lh-arrival";

/**
 * The signature plays on a visible cold load whose tab has not seen it; the
 * flag is written on every cold load, so a reload never replays it and a tab
 * hidden at load never plays it later (FR-012).
 */
export function signatureDecision(input: { visible: boolean; stored: boolean }): { play: boolean; store: true } {
	return { play: input.visible && !input.stored, store: true };
}

/**
 * The inline twin of {@link signatureDecision}, first in `<body>` of both root
 * layouts, so the signature's CSS keys on the attribute from first paint.
 * Blocked storage fails closed: no attribute, the page arrives finished.
 */
export const SIGNATURE_SCRIPT = `try{var s=sessionStorage,k=${JSON.stringify(SIGNATURE_KEY)};if(document.visibilityState==="visible"&&!s.getItem(k))document.documentElement.setAttribute(${JSON.stringify(SIGNATURE_ATTRIBUTE)},"signature");s.setItem(k,"1")}catch(e){}`;

/** What started a navigation (the transition type it carries, contract §4). */
export type NavigationKind = "route" | "mode" | "tab" | "history";

/** How a content region arrives (data-model "Arrival kind"). */
export type ArrivalKind = "signature" | "cold" | NavigationKind;

/**
 * The arrival kind a content region reads once, at mount: the pending
 * navigation's kind wins; without one, the signature while it plays, else a
 * cold arrival (reload, untyped navigation).
 */
export function arrivalKind(pending: NavigationKind | null, signature: boolean): ArrivalKind {
	if (pending) return pending;
	return signature ? "signature" : "cold";
}

/** Reading-order stagger: a step per item, capped (FR-011). */
export interface Stagger { step: number; cap: number }

/** Steps and caps in ms (spec catalogue; phones gate 2, FR-025). */
export const STAGGER = {
	desktop: { step: 40, cap: 240 },
	phone: { step: 24, cap: 160 },
	sidebar: { step: 24, cap: 200 },
	library: { step: 24, cap: 160 },
} as const satisfies Record<string, Stagger>;

/** Below this width the phone stagger applies (FR-025). */
export const PHONE_MAX_WIDTH = 639;

/** The delay of the item at `index` (0 for the first), never past the cap. */
export function staggerDelay(index: number, stagger: Stagger): number {
	const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
	return Math.min(i * stagger.step, stagger.cap);
}

/** How many leading items take part in a stagger; later ones arrive finished (R6). */
export function staggerCount(stagger: Stagger): number {
	return Math.floor(stagger.cap / stagger.step) + 1;
}

/**
 * The ink soak's origin (R9): the control's centre, the radius that reaches
 * the farthest viewport corner from it, and the width of its feathered edge
 * (about a sixth of that reach, 64-280px), so the edge reads as ink taking
 * to paper at any window size.
 */
export function soakOrigin(rect: { left: number; top: number; width: number; height: number }, viewport: { width: number; height: number }): { x: number; y: number; r: number; f: number } {
	const x = rect.left + rect.width / 2;
	const y = rect.top + rect.height / 2;
	const dx = Math.max(x, viewport.width - x);
	const dy = Math.max(y, viewport.height - y);
	const r = Math.ceil(Math.hypot(dx, dy));
	return { x, y, r, f: Math.min(280, Math.max(64, Math.round(r / 6))) };
}
