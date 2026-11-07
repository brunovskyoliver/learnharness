"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpenIcon, DumbbellIcon, FileTextIcon, NetworkIcon, PanelRightCloseIcon, PanelRightOpenIcon, XIcon } from "lucide-react";
import { BrailleSpinner } from "@/components/braille-spinner";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { kbdEventForAction, type WorkspaceTab } from "@/src/core";
import { useWorkspace } from "./workspace-context";

const TAB_ICON = { lesson: BookOpenIcon, practice: DumbbellIcon, item: FileTextIcon } as const;
const TAB_KIND_LABEL = { lesson: "Lesson", practice: "Practice", item: "Library item" } as const;

/** The strip, pure for render tests. One tab stop (roving); arrows walk, Enter
 *  activates, Delete closes. Each close button is for pointers: taking it out of
 *  the walk keeps the tablist one stop, and Delete is its keyboard path. */
export function TabStripView({ tabs, selectedId, shownIds, pendingId, focusId, onFocusId, onActivate, onClose, onKeyDown, listRef, trailing, className }: {
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
	trailing?: React.ReactNode;
	className?: string;
}) {
	const stop = tabs.some((tab) => tab.id === focusId) ? focusId : selectedId ?? tabs[0]?.id ?? null;
	return (
		<div data-workspace-tabs="" data-testid="workspace-tabs" className={cn("flex h-9 shrink-0 items-stretch gap-1 bg-paper px-3 pb-1 pointer-coarse:h-12 pointer-coarse:pb-0", className)}>
			<div ref={listRef} role="tablist" aria-label="Open items" aria-orientation="horizontal" onKeyDownCapture={onKeyDown} className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto p-px">
				{tabs.map((tab) => {
					const Icon = tab.itemKind === "diagram" ? NetworkIcon : TAB_ICON[tab.kind];
					const selected = tab.id === selectedId;
					const shown = shownIds.includes(tab.id);
					return (
						<div key={tab.id} data-tab-row="" className={cn("flex max-w-52 shrink-0 items-center rounded-md transition-colors", selected ? "bg-shelf text-ink" : shown ? "bg-shelf text-ink" : "text-graphite hover:bg-shelf")}>
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
								className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pl-2 pr-1 text-sm"
							>
								{tab.id === pendingId ? <span className="flex size-4 shrink-0 items-center justify-center text-faint"><BrailleSpinner /></span> : <Icon className="ui-icon shrink-0 text-faint" aria-hidden="true" />}
								<span className="min-w-0 truncate">{tab.title}</span>
							</button>
							<button
								type="button"
								tabIndex={-1}
								aria-label={`Close ${tab.title}`}
								data-testid="workspace-tab-close"
								onClick={() => onClose(tab)}
								className="mr-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-faint hover:bg-shelf hover:text-ink pointer-coarse:size-11"
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

/** Where a surface shows the tabs: under its 52px band, so the band keeps the
 *  window's drag region and native gutters to itself. */
export function WorkspaceTabStrip({ className }: { className?: string }) {
	const workspace = useWorkspace();
	const [focusId, setFocusId] = useState<string | null>(null);
	const list = useRef<HTMLDivElement>(null);
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
