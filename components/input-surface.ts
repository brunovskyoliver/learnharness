import type { MouseEvent } from "react";

/** Focus or unsent text keeps an input surface available while reading. */
export function inputSurfaceIsEditing(surface: HTMLElement | null): boolean {
	if (!surface) return false;
	if (surface.contains(surface.ownerDocument.activeElement)) return true;
	return Array.from(surface.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
		'textarea, input:not([type]), input[type="text"]',
	)).some((input) => input.value.length > 0);
}

/** Empty space belongs to the input; nested controls keep their own actions. */
export function focusSurfaceInput(event: MouseEvent<HTMLElement>): void {
	const target = event.target as Element;
	if (target.closest('button, a, input, textarea, select, [role="button"], [contenteditable]')) return;
	event.currentTarget.querySelector<HTMLTextAreaElement>("textarea:not(:disabled)")?.focus({ preventScroll: true });
}
