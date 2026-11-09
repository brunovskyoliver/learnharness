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
import { useArrival } from "./motion-arrival";
import { STAGGER, staggerCount } from "@/src/core";

/** The rows that ink in on the first open (row 7). */
const ROWS = ".nb-side-scroll :is(.nb-side-row, .nb-side-note)";
/** How long the ☰ redraws after the sidebar closes (row 9: 200ms and a margin). */
const REDRAW_MS = 260;

export function OverlaySidebarDialog({ state, onClose, onPromote, title, returnFocus, searchRef, query = "", onClearQuery, holdEscape = false, dim = false, container, contentRef, children, openedFrom }: OverlaySidebarShellProps & { openedFrom: RefObject<Element | null> }) {
	const before = useRef<Element | null>(null);
	const open = state !== null;
	const hover = state?.via === "hover";
	const content = useRef<HTMLDivElement | null>(null);
	// Row 7: the rows ink in on the first open of this page load only (this
	// dialog mounts on the first open and stays mounted).
	const { arriving } = useArrival("sidebar-rows");
	const rowsArrive = open && arriving;
	// The content mounts a commit after the dialog (its portal), so the rows
	// are marked as it attaches, before its first paint.
	const attach = (node: HTMLDivElement | null) => {
		content.current = node;
		contentRef?.(node);
		if (!node || !rowsArrive) return;
		const limit = staggerCount(STAGGER.sidebar);
		[...node.querySelectorAll<HTMLElement>(ROWS)].slice(0, limit).forEach((row, i) => { row.setAttribute("data-ink-order", ""); row.style.setProperty("--i", String(i)); });
	};
	// Feature 028 (R7, FR-005): the sheet lifts away for 160ms, but focus is
	// back where it was in the closing commit (the trap is already off), not
	// when Radix unmounts the content after the lift. The ☰ redraws.
	const wasOpen = useRef(false);
	const returned = useRef(false);
	const fallback = useRef(returnFocus);
	fallback.current = returnFocus;
	// A passive effect: the focus trap lets go in its own effect cleanup, which
	// runs first (a discrete close flushes both before the next frame).
	useEffect(() => {
		if (open) { wasOpen.current = true; returned.current = false; return; }
		if (!wasOpen.current) return;
		wasOpen.current = false;
		returned.current = true;
		// Another layer that opened as this one closed (Settings, Links) keeps the focus it took.
		const now = document.activeElement;
		if (now && now !== document.body && !content.current?.contains(now)) return;
		const back = before.current;
		if (back instanceof HTMLElement && back.isConnected && back !== document.body && !back.closest(".nb-sidebar")) back.focus();
		else fallback.current()?.focus();
		const root = document.documentElement;
		root.setAttribute("data-lh-menu-redraw", "");
		const timer = window.setTimeout(() => root.removeAttribute("data-lh-menu-redraw"), REDRAW_MS);
		return () => { window.clearTimeout(timer); root.removeAttribute("data-lh-menu-redraw"); };
	}, [open]);

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
					ref={attach}
					className="nb-sidebar"
					data-testid="nb-sidebar"
					data-rows-arrive={rowsArrive ? "" : undefined}
					aria-describedby={undefined}
					onOpenAutoFocus={(event) => {
						before.current = openedFrom.current ?? document.activeElement;
						if (state?.search) { event.preventDefault(); searchRef?.current?.focus(); }
						else if (hover) { event.preventDefault(); (event.currentTarget as HTMLElement | null)?.focus(); }
					}}
					// Focus went back as it closed (above); else (unmounted outright, or lost since) here.
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						// Already back, unless something took it into the closing sheet since (it is gone now).
						const lost = document.activeElement === null || document.activeElement === document.body;
						if (returned.current && !lost) return;
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
