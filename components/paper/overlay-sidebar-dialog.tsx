"use client";

/**
 * The overlay sidebar's dialog (components/paper/overlay-sidebar.tsx): Radix
 * Dialog with its scroll lock, focus trap and outside-click handling. Split
 * out so it loads when the sidebar first opens, not in either mode's startup
 * JS (feature 025, T065: constitution VIII).
 */
import { Dialog } from "radix-ui";
import { useEffect, useRef, type RefObject } from "react";
import type { OverlaySidebarShellProps } from "./overlay-sidebar";

export function OverlaySidebarDialog({ state, onClose, onPromote, title, returnFocus, searchRef, query = "", onClearQuery, holdEscape = false, dim = false, container, contentRef, children, openedFrom }: OverlaySidebarShellProps & { openedFrom: RefObject<Element | null> }) {
	const before = useRef<Element | null>(null);
	const open = state !== null;
	const hover = state?.via === "hover";

	// Mod+K (or the search shortcut) while open moves to the search too.
	const wantsSearch = state?.search ?? false;
	useEffect(() => {
		if (wantsSearch) searchRef?.current?.focus();
	}, [wantsSearch, state, searchRef]);

	return (
		<Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
			<Dialog.Portal container={container ?? undefined}>
				<Dialog.Overlay className="nb-side-dim" data-testid="nb-sidebar-dim" data-dim={dim ? "" : undefined} />
				<Dialog.Content
					ref={contentRef}
					className="nb-sidebar"
					data-testid="nb-sidebar"
					aria-describedby={undefined}
					onOpenAutoFocus={(event) => {
						before.current = openedFrom.current ?? document.activeElement;
						if (state?.search) { event.preventDefault(); searchRef?.current?.focus(); }
						else if (hover) { event.preventDefault(); (event.currentTarget as HTMLElement | null)?.focus(); }
					}}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						const back = before.current;
						if (back instanceof HTMLElement && back.isConnected && back !== document.body && !back.closest(".nb-sidebar")) back.focus();
						else returnFocus()?.focus();
					}}
					// Escape in a search with words clears it first; the next one closes.
					onEscapeKeyDown={(event) => {
						if (holdEscape) { event.preventDefault(); return; }
						if (query && searchRef?.current && document.activeElement === searchRef.current) { event.preventDefault(); onClearQuery?.(); }
					}}
					// A hover-open closes when the pointer leaves, until he clicks or types inside.
					onPointerLeave={(event) => { if (hover && event.pointerType === "mouse") onClose(); }}
					onPointerDown={() => { if (hover) onPromote(); }}
					onKeyDown={(event) => { if (hover && event.key !== "Escape") onPromote(); }}
				>
					<Dialog.Title className="sr-only">{title}</Dialog.Title>
					{children}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
