"use client";

/**
 * Where a chip was clicked, so the Library can offer "Back to {lesson}" and the
 * lesson can put focus back on the chip (feature 027, research R9,
 * data-model.md ReturnPoint). Held in this tab's sessionStorage only: a new tab
 * starts without one, so a Ctrl/Cmd-click opens the address without the pill
 * (FR-018). The scroll position is the lesson's own reading anchor
 * (components/session-reading-state.tsx); this only adds the focus.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const RETURN_KEY = "lh:reference-return";
/** The key in `history.state` that marks the Library entry a chip pushed. */
export const HISTORY_MARK = "lhReferenceReturn";
/** Marks an entry a chip for his own passage pushed, so the reader reports a
 *  miss in the passage's words, not a citation's (research R9). */
export const HISTORY_OWN = "lhReferenceOwn";
/** Tells the Back pill the point changed in this tab. */
export const RETURN_EVENT = "lh:reference-return-changed";

export interface ReturnPoint {
	chatId: string;
	title: string;
	messageId: string;
	chipKey: string;
	/** The nonce also written into the pushed entry's `history.state`. */
	pushed: string;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const session = (): Store | null => {
	try {
		return typeof window === "undefined" ? null : window.sessionStorage;
	} catch {
		return null;
	}
};

const changed = () => {
	if (typeof window !== "undefined") window.dispatchEvent(new Event(RETURN_EVENT));
};

const isPoint = (value: unknown): value is ReturnPoint => {
	if (!value || typeof value !== "object") return false;
	const point = value as Record<string, unknown>;
	return ["chatId", "title", "messageId", "chipKey", "pushed"].every((key) => typeof point[key] === "string") && (point.chatId as string).length > 0;
};

/** Invalid JSON or a wrong shape reads as none. */
export function readReturnPoint(store: Store | null = session()): ReturnPoint | null {
	try {
		const raw = store?.getItem(RETURN_KEY);
		if (!raw) return null;
		const value = JSON.parse(raw) as unknown;
		return isPoint(value) ? value : null;
	} catch {
		return null;
	}
}

export function saveReturnPoint(point: ReturnPoint, store: Store | null = session()): void {
	try {
		store?.setItem(RETURN_KEY, JSON.stringify(point));
	} catch { /* without storage there is no pill; browser Back still works */ }
	changed();
}

export function clearReturnPoint(store: Store | null = session()): void {
	try {
		store?.removeItem(RETURN_KEY);
	} catch { /* nothing to clear */ }
	changed();
}

export const newNonce = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ─── the pushed entry's mark ────────────────────────────────────────────────

let pendingMark: { nonce: string; own: boolean } | null = null;

/** Called right before `router.push`: the next Library entry gets this mark.
 *  `own`: the chip carries his own passage, not a tutor's citation. */
export function markNextEntry(nonce: string, own = true): void {
	pendingMark = { nonce, own };
}

/** Called once the Library entry is current (Next has written its own
 *  `history.state` by then; its data passes through untouched, research T001). */
export function stampPendingMark(history: Pick<History, "state" | "replaceState"> = window.history): void {
	if (pendingMark === null) return;
	const mark = pendingMark;
	pendingMark = null;
	try {
		const state = history.state && typeof history.state === "object" ? history.state as Record<string, unknown> : {};
		history.replaceState({ ...state, [HISTORY_MARK]: mark.nonce, ...(mark.own ? { [HISTORY_OWN]: true } : {}) }, "");
	} catch { /* the pill then pushes the lesson's address instead */ }
}

/** The current entry was pushed by a chip for his own passage. */
export const isOwnPassageEntry = (historyState: unknown): boolean =>
	Boolean(historyState && typeof historyState === "object" && (historyState as Record<string, unknown>)[HISTORY_OWN] === true);

/** How the pill goes back: `back` when the current entry is the one the chip
 *  pushed (so the lesson is right behind it), else `push` to the lesson. */
export function returnRoute(point: ReturnPoint, historyState: unknown): { type: "back" } | { type: "push"; href: string } {
	const state = historyState && typeof historyState === "object" ? historyState as Record<string, unknown> : null;
	if (state?.[HISTORY_MARK] === point.pushed) return { type: "back" };
	return { type: "push", href: `/chat/${encodeURIComponent(point.chatId)}` };
}

/** `data-ref-chip` value of a chip. */
export const chipKeyOf = (messageId: string, key: string): string => `${messageId}:${key}`;

const FOCUS_TRIES = 40;
const FOCUS_STEP_MS = 50;

/** Arriving back on the lesson (the pill, browser Back, or any other way):
 *  focus the clicked chip without scrolling, once the reading anchor has
 *  restored, then forget the point. Keyed on the pathname, because a cached
 *  chat route can show again without remounting (Next keeps it under React
 *  Activity). Cached routes stay in the DOM hidden, so the visible match wins. */
export function useFocusReturn(chatId: string): void {
	const pathname = usePathname();
	const here = pathname === `/chat/${chatId}` || pathname === `/chat/${encodeURIComponent(chatId)}`;
	useEffect(() => {
		if (!here) return;
		const point = readReturnPoint();
		if (!point || point.chatId !== chatId) return;
		const selector = `[data-ref-chip="${CSS.escape(chipKeyOf(point.messageId, point.chipKey))}"]`;
		let tries = 0;
		let timer = 0;
		const attempt = () => {
			const scroller = document.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(chatId)}"] [data-session-restored="true"]`);
			const chip = [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.getClientRects().length > 0);
			// Wait for the reading anchor's restore, so focus never moves the scroll.
			if ((!chip || !scroller) && ++tries < FOCUS_TRIES) {
				timer = window.setTimeout(attempt, FOCUS_STEP_MS);
				return;
			}
			if (chip) {
				// A visible ring even when he came back by pointer (ui-contract §5).
				chip.dataset.focusReturn = "";
				chip.addEventListener("blur", () => { delete chip.dataset.focusReturn; }, { once: true });
				chip.focus({ preventScroll: true });
			}
			clearReturnPoint();
		};
		timer = window.setTimeout(attempt, FOCUS_STEP_MS);
		return () => window.clearTimeout(timer);
	}, [here, chatId]);
}
