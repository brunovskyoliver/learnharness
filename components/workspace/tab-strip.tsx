"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpenIcon, DumbbellIcon, FileTextIcon, NetworkIcon, PanelRightCloseIcon, PanelRightOpenIcon, XIcon } from "lucide-react";
import { BrailleSpinner } from "@/components/braille-spinner";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { kbdEventForAction, type WorkspaceTab } from "@/src/core";
import { useWorkspace } from "./workspace-context";
import { pendingArrival } from "@/components/paper/motion-arrival";

const TAB_ICON = { lesson: BookOpenIcon, practice: DumbbellIcon, item: FileTextIcon } as const;
const TAB_KIND_LABEL = { lesson: "Lesson", practice: "Practice", item: "Library item" } as const;

/** The strip, pure for render tests. One tab stop (roving); arrows walk, Enter
 *  activates, Delete closes. Each close button is for pointers: taking it out of
 *  the walk keeps the tablist one stop, and Delete is its keyboard path. */
export function TabStripView({ tabs, selectedId, shownIds, pendingId, focusId, onFocusId, onActivate, onClose, onKeyDown, listRef, markerRef, trailing, className }: {
	tabs: readonly WorkspaceTab[];
	selectedId: string | null;
	shownIds: readonly string[];
	pendingId?: string | null;
	/** The roving stop. Null falls back to the selected tab, then the first. */
	focusId?: string | null;
	onFocusId?: (id: string) => void;
	onActivate: (tab: WorkspaceTab) => void;
	onClose: (tab: WorkspaceTab) => void;
	onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
	listRef?: React.Ref<HTMLDivElement>;
	/** The sliding selection marker (feature 028, row 6). */
	markerRef?: React.Ref<HTMLSpanElement>;
	trailing?: React.ReactNode;
	className?: string;
}) {
	const stop = tabs.some((tab) => tab.id === focusId) ? focusId : selectedId ?? tabs[0]?.id ?? null;
	return (
		<div data-workspace-tabs="" data-testid="workspace-tabs" className={cn("flex h-9 shrink-0 items-stretch gap-1 px-3 pb-1 pointer-coarse:h-12 pointer-coarse:pb-0", className)}>
			<div ref={listRef} role="tablist" aria-label="Open items" aria-orientation="horizontal" onKeyDownCapture={onKeyDown} className="relative flex min-w-0 flex-1 items-stretch gap-[21px] overflow-x-auto p-px">
				<span ref={markerRef} className="lh-tab-marker" aria-hidden="true" />
				{tabs.map((tab) => {
					const Icon = tab.itemKind === "diagram" ? NetworkIcon : TAB_ICON[tab.kind];
					const selected = tab.id === selectedId;
					const shown = shownIds.includes(tab.id);
					return (
						<div key={tab.id} data-tab-row="" data-selected={selected || undefined} className={cn("lh-tab group/tab relative flex max-w-52 shrink-0 items-center transition-colors", selected || shown ? "text-ink" : "text-faint hover:text-ink")}>
							<button
								type="button"
								role="tab"
								aria-selected={selected}
								aria-busy={tab.id === pendingId || undefined}
								aria-keyshortcuts="Delete"
								tabIndex={tab.id === stop ? 0 : -1}
								title={`${tab.title}\n${TAB_KIND_LABEL[tab.kind]}`}
								data-tab-id={tab.id}
								data-testid="workspace-tab"
								onFocus={() => onFocusId?.(tab.id)}
								onClick={() => onActivate(tab)}
								className="relative flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pr-1 text-sm"
							>
								{tab.id === pendingId ? <span className="flex size-4 shrink-0 items-center justify-center text-faint"><BrailleSpinner /></span> : <Icon className="size-3.5 shrink-0 text-faint" aria-hidden="true" />}
								<span className="min-w-0 truncate">{tab.title}</span>
							</button>
							<button
								type="button"
								tabIndex={-1}
								aria-label={`Close ${tab.title}`}
								data-testid="workspace-tab-close"
								onClick={() => onClose(tab)}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition-opacity hover:bg-shelf hover:text-ink focus-visible:opacity-100 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
							>
								<XIcon className="size-3.5" aria-hidden="true" />
							</button>
						</div>
					);
				})}
			</div>
			{trailing}
		</div>
	);
}

/** Where the selected tab's underline sits, in the strip's scrolled content (px). */
interface MarkerSpot { left: number; width: number }
/** The last spot of any strip in this page load: a tab select remounts the page and its strip, and the marker slides on from here. */
let lastSpot: { spot: MarkerSpot; at: number } | null = null;
/** A remounted strip takes over the last spot only this soon after it was left. */
const CARRY_MS = 1500;
/** The slide's longest run (280ms) with margin: past it the marker rests whatever happened. */
const SLIDE_MS = 600;

function spotOf(list: HTMLElement, selectedId: string | null): MarkerSpot | null {
	const tab = selectedId ? list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(selectedId)}"]`) : null;
	if (!tab) return null;
	const box = tab.getBoundingClientRect(), bounds = list.getBoundingClientRect();
	// The underline spans the tab button less its 4px right inset (app/paper.css).
	return { left: box.left - bounds.left - list.clientLeft + list.scrollLeft, width: Math.max(0, box.width - 4) };
}

/**
 * Row 6 (feature 028, research R8): when the selected tab changes, the one
 * marker slides from the old underline to the new one (transform only) and
 * then hands back to the selected tab's own underline. A tab select that
 * routes remounts the strip, so the old spot is carried across for a
 * moment. Reduced motion: no slide, the underline jumps.
 */
function useTabMarker(list: React.RefObject<HTMLDivElement | null>, marker: React.RefObject<HTMLSpanElement | null>, selectedId: string | null) {
	const spot = useRef<MarkerSpot | null>(null);
	const slides = useRef(0);
	useLayoutEffect(() => {
		const host = list.current, mark = marker.current;
		if (!host || !mark) return;
		const to = spotOf(host, selectedId);
		const carried = lastSpot && pendingArrival() === "tab" && performance.now() - lastSpot.at < CARRY_MS ? lastSpot.spot : null;
		const from = spot.current ?? carried;
		spot.current = to;
		if (to) lastSpot = { spot: to, at: performance.now() };
		if (!to || !from || (from.left === to.left && from.width === to.width)) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const place = (at: MarkerSpot) => `translateX(${at.left}px) scaleX(${at.width})`;
		mark.style.transition = "none";
		mark.style.transform = place(from);
		host.setAttribute("data-tab-sliding", "");
		void mark.getBoundingClientRect();
		mark.style.transition = "";
		mark.style.transform = place(to);
		// The slide always hands back to the underline: on its end, or on a
		// clock (a hidden tab, StrictMode's second effect run). Only the
		// latest slide may end it.
		const token = ++slides.current;
		const rest = () => { if (token === slides.current) host.removeAttribute("data-tab-sliding"); };
		window.setTimeout(rest, SLIDE_MS);
		const ended = (event: TransitionEvent) => { if (event.propertyName === "transform") rest(); };
		mark.addEventListener("transitionend", ended, { once: true });
		return () => mark.removeEventListener("transitionend", ended);
	}, [list, marker, selectedId]);
	// Leaving: the next strip (a tab select remounts the page) slides on from
	// here. A layout cleanup, so it runs before the new strip's layout effect.
	useLayoutEffect(() => () => { if (spot.current) lastSpot = { spot: spot.current, at: performance.now() }; }, []);
}

/** Where a surface shows the tabs: under its 52px band, so the band keeps the
 *  window's drag region and native gutters to itself. */
export function WorkspaceTabStrip({ className }: { className?: string }) {
	const workspace = useWorkspace();
	const [focusId, setFocusId] = useState<string | null>(null);
	const list = useRef<HTMLDivElement>(null);
	const marker = useRef<HTMLSpanElement>(null);
	const returnTo = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const event = kbdEventForAction("focus-tabs");
		const onFocusTabs = () => {
			const target = list.current?.querySelector<HTMLElement>('[role="tab"][tabindex="0"]');
			if (!target) return;
			if (!list.current?.contains(document.activeElement)) returnTo.current = document.activeElement as HTMLElement | null;
			target.focus();
		};
		window.addEventListener(event, onFocusTabs);
		return () => window.removeEventListener(event, onFocusTabs);
	}, []);

	// Keep the selected tab in view, moving only the strip's own scroll.
	const selectedId = workspace?.selectedId ?? null;
	useLayoutEffect(() => {
		const host = list.current;
		const tab = host?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(selectedId ?? "")}"]`)?.closest<HTMLElement>("[data-tab-row]");
		if (!host || !tab) return;
		const box = tab.getBoundingClientRect(), bounds = host.getBoundingClientRect();
		if (box.left < bounds.left) host.scrollLeft -= bounds.left - box.left;
		else if (box.right > bounds.right) host.scrollLeft += box.right - bounds.right;
	}, [selectedId]);
	useTabMarker(list, marker, selectedId);

	if (!workspace) return null;
	const { tabs, paneRoute, rightPaneVisible, toggleRightPane } = workspace;
	// With nothing to show, a route that has no pane spends no height on this.
	if (tabs.length === 0 && !paneRoute) return <div data-tab-reserve="" aria-hidden="true" className="hidden h-9 shrink-0 pointer-coarse:h-12" />;

	const closeAndKeepFocus = (tab: WorkspaceTab) => {
		const at = tabs.findIndex((other) => other.id === tab.id);
		const next = tabs[at + 1] ?? tabs[at - 1] ?? null;
		const hadFocus = list.current?.contains(document.activeElement);
		workspace.close(tab.id);
		if (hadFocus) {
			if (next) {
				setFocusId(next.id);
				requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus());
			} else {
				returnTo.current?.focus();
			}
		}
	};

	const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
		const current = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
		if (!current || event.metaKey || event.ctrlKey || event.altKey) return;
		const ids = tabs.map((tab) => tab.id);
		const at = ids.indexOf(current.dataset.tabId ?? "");
		const move = event.key === "ArrowRight" ? (at + 1) % ids.length
			: event.key === "ArrowLeft" ? (at - 1 + ids.length) % ids.length
			: event.key === "Home" ? 0
			: event.key === "End" ? ids.length - 1 : null;
		const claim = () => { event.preventDefault(); event.stopPropagation(); };
		if (move !== null) {
			claim();
			list.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(ids[move]!)}"]`)?.focus();
		} else if (event.key === "Delete" || event.key === "Backspace") {
			claim();
			const tab = tabs[at];
			if (tab) closeAndKeepFocus(tab);
		} else if (event.key === "Enter" || event.key === " ") {
			claim();
			const tab = tabs[at];
			if (tab) workspace.activate(tab);
		} else if (event.key === "Escape") {
			claim();
			if (returnTo.current?.isConnected && returnTo.current !== document.body) returnTo.current.focus();
			else current.blur();
		}
	};

	// On a phone it opens the session's Notes and outline; a page or demo has its own layer.
	const label = rightPaneVisible ? "Hide right pane" : "Show right pane";
	const showToggle = paneRoute || workspace.occupied;
	return (
		<TabStripView
			tabs={tabs}
			selectedId={workspace.selectedId}
			shownIds={workspace.shownIds}
			pendingId={workspace.pendingId}
			focusId={focusId}
			onFocusId={setFocusId}
			onActivate={workspace.activate}
			onClose={closeAndKeepFocus}
			onKeyDown={onKeyDown}
			listRef={list}
			markerRef={marker}
			// The toggle would be the only content then, with nothing to say on a phone.
			className={cn(className, tabs.length === 0 && workspace.shownIds.length === 0 && "max-md:hidden")}
			trailing={showToggle ? (
				<Hint label={label} action="toggle-right-pane" side="bottom">
					<button
						type="button"
						aria-label={label}
						aria-expanded={rightPaneVisible}
						data-testid="right-pane-toggle"
						onClick={toggleRightPane}
						className={cn("size-8 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-shelf hover:text-ink md:flex pointer-coarse:size-11", workspace.occupied ? "hidden" : "flex")}
					>
						{rightPaneVisible ? <PanelRightCloseIcon className="ui-icon" aria-hidden="true" /> : <PanelRightOpenIcon className="ui-icon" aria-hidden="true" />}
					</button>
				</Hint>
			) : undefined}
		/>
	);
}
