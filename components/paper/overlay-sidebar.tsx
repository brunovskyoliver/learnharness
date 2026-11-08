"use client";

/**
 * The overlay sidebar both modes use (feature 024 visual-reference §18,
 * feature 025 R6): a 288px shelf over the page, opened by the menu button,
 * a shortcut or a hover at the left edge. A Radix Dialog: focus is trapped
 * while open and returns where it was (or to the menu button); Escape, ✕
 * and a click outside close it, and so does the pointer leaving it after a
 * hover-open, until he clicks or types inside. Each mode fills the body
 * with its own list and footer.
 *
 * The dialog itself (Radix Dialog, scroll lock, focus trap) loads on the
 * first open, and on the edge hover's wait before it, so neither mode's
 * startup JS carries it (feature 025, T065).
 */
import { CheckIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
		preloadOverlaySidebar();
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


const loadDialog = () => import("./overlay-sidebar-dialog");
const OverlaySidebarDialog = lazy(() => loadDialog().then((m) => ({ default: m.OverlaySidebarDialog })));
/** Starts loading the sidebar's dialog ahead of its first open. */
export function preloadOverlaySidebar(): void {
	void loadDialog();
}

/** Renders nothing until the sidebar first opens; from then on the dialog stays mounted (open or closed). */
export function OverlaySidebarShell(props: OverlaySidebarShellProps) {
	const [armed, setArmed] = useState(false);
	const open = props.state !== null;
	if (open && !armed) setArmed(true);
	// Where the focus was as it opens, read in the opening commit: the page under
	// it may turn inert, and the browser's focus fixup would blur it before a
	// dialog that is still loading could look.
	const openedFrom = useRef<Element | null>(null);
	useLayoutEffect(() => {
		if (open) openedFrom.current = document.activeElement;
	}, [open]);
	if (!armed && !open) return null;
	return (
		<Suspense fallback={null}>
			<OverlaySidebarDialog {...props} openedFrom={openedFrom} />
		</Suspense>
	);
}
