import { useEffect } from "react";

/** Preserve cyclic keyboard focus when a native modal replaces a focus scope. */
export function containModalTab(event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "preventDefault">, dialog: HTMLElement) {
	if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;
	const items = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
		.filter((item) => item.tabIndex >= 0 && !item.matches(":disabled") && !item.closest('[hidden], [inert], [aria-hidden="true"]') && item.getClientRects().length > 0);
	const first = items[0], last = items.at(-1);
	if (!first) { event.preventDefault(); dialog.focus(); return; }
	const active = document.activeElement;
	const unlisted = !items.some((item) => item === active);
	if (event.shiftKey && (active === first || unlisted)) {
		event.preventDefault(); last?.focus();
	} else if (!event.shiftKey && (active === last || unlisted)) {
		event.preventDefault(); first.focus();
	}
}

/** A hand-rolled modal's focus rule (constitution VI): on open the focus moves
 *  to `first` inside the dialog (the cautious choice), Tab cycles inside it, and
 *  on close the focus goes back to what held it before, when it is still there. */
export function useModalFocus(ref: { current: HTMLElement | null }, open: boolean, first: string) {
	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		ref.current?.querySelector<HTMLElement>(first)?.focus({ preventScroll: true });
		const onKey = (event: KeyboardEvent) => { if (ref.current && event.key === "Tab") containModalTab(event, ref.current); };
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("keydown", onKey, true);
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		};
	}, [ref, open, first]);
}
