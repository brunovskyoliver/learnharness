"use client";

/**
 * The overlay sidebar both modes use (feature 024 visual-reference §18,
 * feature 025 R6): a 288px shelf over the page, opened by the menu button,
 * a shortcut or a hover at the left edge. A Radix Dialog: focus is trapped
 * while open and returns where it was (or to the menu button); Escape, ✕
 * and a click outside close it, and so does the pointer leaving it after a
 * hover-open, until he clicks or types inside. Each mode fills the body
 * with its own list and footer.
 */
import { CheckIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { CloseGlyph } from "./chrome";
import { keyLabel } from "./shared";

export type SidebarVia = "click" | "hover" | "key";
/** How the sidebar was opened (null: closed). A hover-open closes when the pointer leaves. */
export type SidebarState = { via: SidebarVia; search: boolean } | null;

/** Hovering the left edge this long opens the sidebar (024 ui-contract.md). */
export const EDGE_HOVER_MS = 250;

/**
 * The hover strip at the left edge (fine pointers only). A real pointer
 * movement on the strip starts the wait: the browser's synthetic "over" at
 * (0, 0) when a page loads under a resting (or absent) pointer must not
 * open the sidebar.
 */
export function EdgeStrip({ onOpen }: { onOpen: () => void }) {
	const timer = useRef<number | null>(null);
	const open = useRef(onOpen);
	open.current = onOpen;
	useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
	const enter = (event: React.PointerEvent) => {
		if (event.pointerType !== "mouse" || !window.matchMedia("(pointer: fine)").matches) return;
		if (timer.current) return;
		timer.current = window.setTimeout(() => {
			timer.current = null;
			open.current();
		}, EDGE_HOVER_MS);
	};
	const leave = () => {
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = null;
	};
	return <div className="nb-edge" aria-hidden="true" data-testid="nb-edge" onPointerMove={enter} onPointerLeave={leave} />;
}

/** "mod+shift+c" as aria-keyshortcuts wants it: Meta+Shift+C on a Mac, Control+Shift+C elsewhere. */
export const ariaKeys = (binding: string, mac: boolean): string =>
	binding.split("+").map((part) => (part === "mod" ? (mac ? "Meta" : "Control") : part === "shift" ? "Shift" : part === "alt" ? "Alt" : part.toUpperCase())).join("+");

/** One footer action: its words, then its shortcut hint right-aligned in faint ink. */
export function SidebarFooterRow({ label, binding, mac, testId, pressed, onClick }: { label: string; binding?: string; mac: boolean; testId: string; pressed?: boolean; onClick: () => void }) {
	return (
		<li>
			<button type="button" className="nb-side-row nb-side-footer-action" data-testid={testId} aria-pressed={pressed} aria-keyshortcuts={binding ? ariaKeys(binding, mac) : undefined} onClick={onClick}>
				<span>{label}</span>
				{pressed && <CheckIcon className="nb-side-icon nb-side-check" aria-hidden="true" />}
				{binding && <kbd className="nb-side-kbd" aria-hidden="true">{keyLabel(binding, mac)}</kbd>}
			</button>
		</li>
	);
}

/** The ✕ and the wordmark, where the menu button and wordmark sit on the page. */
export function SidebarHead({ closeLabel, onClose, wordmark }: { closeLabel: string; onClose: () => void; wordmark: ReactNode }) {
	return (
		<div className="nb-side-head">
			<button type="button" className="nb-menu-button" aria-label={closeLabel} data-testid="nb-sidebar-close" onClick={onClose}>
				<CloseGlyph />
			</button>
			{wordmark}
		</div>
	);
}

/** The sidebar's contents without the dialog around them: head, the scrolling list (search, primary actions, sections and rows), the footer. */
export function SidebarBody({ head, search, actions, children, footer }: { head: ReactNode; search: ReactNode; actions?: ReactNode; children?: ReactNode; footer: ReactNode }) {
	return (
		<>
			{head}
			<div className="nb-side-scroll">
				{search}
				{actions}
				{children}
			</div>
			<div className="nb-side-foot">{footer}</div>
		</>
	);
}

export interface OverlaySidebarShellProps {
	state: SidebarState;
	onClose: () => void;
	/** A hover-open becomes a click-open once he clicks or types inside. */
	onPromote: () => void;
	/** The dialog's name for screen readers. */
	title: string;
	/** Where the focus goes back to when what had it before is gone. */
	returnFocus: () => HTMLElement | null | undefined;
	/** The search field: opened "on the search" focuses it; Escape with words clears it first. */
	searchRef?: RefObject<HTMLInputElement | null>;
	query?: string;
	onClearQuery?: () => void;
	/** A menu, rename or confirmation inside owns Escape: the sidebar stays. */
	holdEscape?: boolean;
	/** Study: the page under it is washed with paper (Notebook's page fades and moves aside instead). */
	dim?: boolean;
	/** The portal container (Notebook's root); document.body otherwise. */
	container?: HTMLElement | null;
	/** The dialog element, for menus that portal inside it. */
	contentRef?: (node: HTMLDivElement | null) => void;
	children: ReactNode;
}

export function OverlaySidebarShell({ state, onClose, onPromote, title, returnFocus, searchRef, query = "", onClearQuery, holdEscape = false, dim = false, container, contentRef, children }: OverlaySidebarShellProps) {
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
						before.current = document.activeElement;
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
