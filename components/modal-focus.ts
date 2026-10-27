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
