"use client";

import { useEffect } from "react";

/**
 * FOCUS HYGIENE — transient transcript controls don't keep focus
 * (owner, keyboard round 2026-10-10). A pointer click on a thinking
 * toggle, a copy button, a plan chip used to LEAVE focus on that
 * button; the learner's next Enter then re-activated the toggle
 * instead of submitting (see enter-submits.ts for the other half of
 * the fix). Here we restore, after pointer activation, exactly the
 * state clicking empty transcript space produces: focus falls back to
 * the body — Enter submits, arrows cycle the question rows, nothing
 * re-toggles. Deliberately NOT a focus-into-a-text-field: a focused
 * field would own the arrows as caret moves, against the arrows-always
 * law (owner, 2026-10-10).
 *
 * Keyboard-activated clicks are untouched: e.detail === 0 marks the
 * synthesized click of Enter/Space on a keyboard-focused button — the
 * keyboard user keeps their focus.
 */

/** Attach as (or compose into) a transient control's onClick: blurs the
 *  control after POINTER clicks (keyboard clicks keep focus). Node-safe
 *  duck-typing — no HTMLElement global needed (the test harness runs
 *  bare node with linkedom). */
export function blurAfterPointerClick(e: {
	detail: number;
	currentTarget: EventTarget | null;
}): void {
	if (e.detail === 0) return;
	const el = e.currentTarget as { blur?: unknown } | null;
	if (el && typeof el.blur === "function") (el.blur as () => void).call(el);
}

/** The app-wide half (polish pass 2026-10-26): what blurAfterPointerClick
 *  does per control, done once for every control. After a POINTER click
 *  on a button/link that still holds focus, focus falls back to the body,
 *  so a later key can never light the keyboard ring on it. Text fields
 *  and anything inside a modal (focus traps) are left alone. Mounted
 *  once in AppShell. */
export function usePointerBlur(): void {
	useEffect(() => {
		const onClick = (e: MouseEvent) => {
			if (e.detail === 0) return;
			const el = (e.target as Element | null)?.closest?.('button, a[href], summary, [role="button"], [role="tab"], [role="option"], [role="radio"], [role="checkbox"], [role="menuitem"], [role="switch"]');
			if (!(el instanceof HTMLElement) || document.activeElement !== el) return;
			if (el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return;
			el.blur();
		};
		document.addEventListener("click", onClick);
		return () => document.removeEventListener("click", onClick);
	}, []);
}
