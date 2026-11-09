"use client";

/**
 * Context-free helpers both modes share (feature 025, R5; lifted from
 * Notebook's nb-shared.tsx, which re-exports them): the platform's key
 * glyphs, the Mod key test, the sidebar's save line and the arrow-choosing
 * radio group handlers.
 */
import { useRef, useSyncExternalStore, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SaveStatus } from "@/components/library/page-draft";

const MAC = /Mac|iPhone|iPad|iPod/;
const noop = () => {};
const subscribeNever = () => noop;

/** True on Apple platforms. The server and the first paint say false. */
export function useIsMac(): boolean {
	return useSyncExternalStore(subscribeNever, () => MAC.test(navigator.platform || navigator.userAgent), () => false);
}

/** "mod+shift+o" as ⌘⇧O on a Mac and Ctrl+Shift+O elsewhere. */
export function keyLabel(binding: string, mac: boolean): string {
	const parts = binding.split("+");
	const key = parts.pop() ?? "";
	const glyph = key === "\\" ? "\\" : key === "," ? "," : key.toUpperCase();
	if (mac) {
		const marks: Record<string, string> = { mod: "⌘", alt: "⌥", shift: "⇧" };
		return parts.map((p) => marks[p] ?? "").join("") + glyph;
	}
	const words: Record<string, string> = { mod: "Ctrl", alt: "Alt", shift: "Shift" };
	return [...parts.map((p) => words[p] ?? p), glyph].join("+");
}

/** The sidebar's save line (024 ui-contract.md "Overlay sidebar"). */
export function saveStateLine(status: SaveStatus | null): string {
	if (status === "saving") return "Saving…";
	if (status === "failed") return "Not saved. Your text is kept in this browser.";
	return "All notes saved";
}

/** Ctrl on other platforms, Cmd on a Mac; never with Alt. */
export const isMod = (event: KeyboardEvent | ReactKeyboardEvent, mac: boolean): boolean => (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.altKey;

/**
 * A radio group of cards where an arrow key moves and chooses (WAI-ARIA
 * radio). Radix moves the focus a tick after the keydown and forgets the
 * arrow on keyup, so a quick press (or a fast typist) could land without
 * choosing; these handlers keep the arrow until the focus it caused
 * arrives. Spread them on `RadioGroup.Root`.
 */
export function useArrowChoice<T extends string>(value: T, onChange: (value: T) => void) {
	const arrowed = useRef(false);
	return {
		onKeyDownCapture: (event: ReactKeyboardEvent) => { arrowed.current = event.key.startsWith("Arrow"); },
		onPointerDownCapture: () => { arrowed.current = false; },
		onFocusCapture: (event: ReactFocusEvent) => {
			const next = (event.target as HTMLElement).getAttribute("value");
			const byArrow = arrowed.current;
			arrowed.current = false;
			if (byArrow && next && next !== value) onChange(next as T);
		},
	};
}
