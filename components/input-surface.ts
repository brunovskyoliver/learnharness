import type { MouseEvent } from "react";

/** Empty space belongs to the input; nested controls keep their own actions. */
export function focusSurfaceInput(event: MouseEvent<HTMLElement>): void {
	const target = event.target as Element;
	if (target.closest('button, a, input, textarea, select, [role="button"], [contenteditable]')) return;
	event.currentTarget.querySelector<HTMLTextAreaElement>("textarea:not(:disabled)")?.focus({ preventScroll: true });
}
