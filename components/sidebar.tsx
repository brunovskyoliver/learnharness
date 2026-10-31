"use client";

import { createContext, Fragment, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { usePathname, useRouter } from "next/navigation";
import { MenuShell } from "@/components/menu-shell";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import type { ChatDeleteMode } from "@/src/core";
import { BookOpenIcon, CheckIcon, DumbbellIcon, LibraryIcon, ListFilterIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { ActivitySection } from "@/components/activity-dock";
import { CoverageMenuBlock } from "@/components/extraction-coverage";
import { LhMark } from "@/components/lh-mark";
import { BrailleSpinner } from "@/components/braille-spinner";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { usePointerBlur } from "@/components/focus-hygiene";
import { SettingsDialogProvider, useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fuzzyScore } from "@/src/core";
import type { ChatListItem } from "@/src/core";
import { kbdEventForAction } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";
import { SessionListProvider, useSessionList, useSessionListDemand } from "@/components/session-list";
import { SidebarFrame } from "@/components/sidebar-frame";
export { clampSidebarWidth } from "@/components/sidebar-frame";

/**
 * The desktop sidebar sits inline next to the session. Narrow browser
 * screens use a modal overlay so opening navigation never squeezes the lesson.
 * Open state persists across pages (provider lives in the root
 * layout) and across reloads (localStorage).
 */

const STORAGE_KEY = "lh:sidebar-open";
/*
 * Narrow-window behavior (owner, 2026-09-17): below SIDEBAR_AUTOCLOSE the
 * sidebar would squeeze the page below the 640px window floor (the two
 * numbers compose: 640 + 288 sidebar = 928), so it auto-closes — and
 * auto-RESTORES when the window widens again (owner choice: the sidebar
 * pops back, not a manual re-open). The whole behavior is one expression:
 * rendered = pref && !narrow, where pref is the persisted user choice.
 * Manual closes persist and stay closed; auto-close does not touch the
 * preference. Opening the sidebar while narrow asks the Electron shell to
 * widen the window to the threshold (window.lh.expandWindow, IPC in
 * electron/main.cjs) — the resize listener flips `narrow` and the sidebar
 * appears. In the plain browser there is no window to widen and no
 * suppression. In the browser, narrow tabs auto-collapse and reopen as a
 * modal overlay without changing the desktop preference (approved 2026-10-26).
 *
 * Mirrors SIDEBAR_AUTOCLOSE in electron/main.cjs — keep in sync.
 */
import type { ChatGPTControlBridge, NativeSubscriptionControlBridge } from "@/src/core";
import type { UpdateState } from "@/components/settings/update-settings.tsx";
const SIDEBAR_AUTOCLOSE = 928;

// Module scope, guarded for SSR (the server has no navigator).
const IS_ELECTRON = typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");

declare global {
	interface Window {
		/** Preload bridge (electron/preload.cjs) — Electron only, absent in the browser. */
		lh?: {
			/** Read-only host OS; determines the native-control gutter. */
			platform?: string;
			/** External Next desktop-dev uses the server's web connections. */
			subscriptionTransport?: "desktop" | "web";
			openSubscriptionBrowser?: (action: string) => Promise<void>;
			chatgpt?: ChatGPTControlBridge;
			subscriptions?: NativeSubscriptionControlBridge;
			expandWindow: () => void;
			/** The zoom truth (owner round 7): subscribes to "lh:zoom" pushes; returns unsubscribe. */
			onZoom?: (cb: (factor: number) => void) => () => void;
			getZoom?: () => Promise<number>;
			/** Observational update events and a snapshot for late subscribers. */
			onUpdateStatus?: (cb: (status: UpdateState) => void) => () => void;
			getUpdateState?: () => Promise<UpdateState>;
			/** Explicit manual check also downloads and stages available updates. */
			checkForUpdates?: () => Promise<void>;
			installUpdate?: () => void;
			onOpenSettings?: (cb: (section: string) => void) => () => void;
		};
	}
}

const SidebarContext = createContext<{ initializing: boolean; open: boolean; overlay: boolean; close: () => void; toggle: () => void }>({
	initializing: true,
	open: false,
	overlay: false,
	close: () => {},
	toggle: () => {},
});

export function useSidebar() {
	return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		const bridge = window.lh?.chatgpt;
		if (!bridge) return;
		const off = bridge.onChange(() => notifySettingsSaved("keys"));
		notifySettingsSaved("keys"); // cover changes missed before this root-lifetime subscription
		return off;
	}, []);
	// The server seed is readable before hydration. Bootstrap CSS restores
	// saved width/closed preference and hides the inline pane on mobile.
	const [open, setOpen] = useState(true);
	const [narrow, setNarrow] = useState(false);
	const [overlayOpen, setOverlayOpen] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		// Electron shell detection (merged chrome, 2026-09-17): keys the
		// .lh-electron CSS (app/globals.css) that turns the header bands
		// into the window's drag surface. Post-mount only — server HTML
		// and first client render must agree (no hydration mismatch),
		// and in the plain browser the class never appears.
		if (IS_ELECTRON) {
			document.documentElement.classList.add("lh-electron");
			document.documentElement.dataset.lhPlatform = window.lh?.platform ?? "";
		}

		// THE ZOOM TRUTH (owner round 7, 2026-10-05): ⌘±/⌘0 zoom the UI
		// (Electron zoomFactor) while the native traffic lights stay
		// physical-fixed — the CSS gutter lengths divide by this factor so
		// their RENDERED size never moves. getZoom covers the first-paint
		// race; every later change arrives as an lh:zoom push.
		const setZoomVar = (factor: number) =>
			document.documentElement.style.setProperty("--lh-zoom", String(factor));
		const off = window.lh?.onZoom?.(setZoomVar);
		void window.lh?.getZoom?.().then(setZoomVar);

		const stored = localStorage.getItem(STORAGE_KEY);
		// Default: open (first run introduces the sidebar).
		setOpen(stored === null ? true : stored === "1");
		setMounted(true);
		return () => off?.();
	}, []);

	// Narrow-window auto-close/auto-restore (see SIDEBAR_AUTOCLOSE note):
	// fires only on actual resizes — a boolean compare, no layout work.
	// Both this and the mount effect land before the first paint, so a
	// narrow window never flashes the open sidebar on load.
	useEffect(() => {
		const onResize = () => setNarrow(window.innerWidth < SIDEBAR_AUTOCLOSE);
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const close = useCallback(() => setOverlayOpen(false), []);
	const toggle = useCallback(() => {
		if (narrow && !IS_ELECTRON) { setOverlayOpen((value) => !value); return; }
		// Opening while narrow (auto-closed, or the user's own closed-at-
		// narrow): ask the shell to widen to the threshold — the resize
		// listener flips `narrow` and the sidebar appears. The preference
		// persists like any other open, so a restart at a narrow width
		// still auto-restores when widened.
		if (narrow && !open) {
			localStorage.setItem(STORAGE_KEY, "0");
			setOpen(true);
			window.lh?.expandWindow();
			return;
		}
		setOpen((v) => {
			localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
			return !v;
		});
	}, [narrow, open]);

	// ⌘B: the global shortcut dispatches kbdEventForAction("toggle-sidebar")
	// and the context answers on exactly that name — the shared spelling
	// is the fix for the interlude bug (the listener sat on the pre-
	// convention name "lh:toggle-sidebar" while the dispatcher sent
	// "lh:kbd-toggle-sidebar", so ⌘B silently did nothing; owner
	// 2026-09-25).
	useEffect(() => {
		const event = kbdEventForAction("toggle-sidebar");
		const onToggle = () => toggle();
		window.addEventListener(event, onToggle);
		return () => window.removeEventListener(event, onToggle);
	}, [toggle]);

	return (
		<SidebarContext.Provider value={{ initializing: !mounted, open: narrow ? !IS_ELECTRON && overlayOpen : open, overlay: narrow && !IS_ELECTRON, close, toggle }}>
			{/* transitions gated on mount: no slide-in flash on page load */}
			<div className={cn("flex h-dvh", mounted && "[&_.sidebar-motion]:transition-[width,margin,opacity]")}>{children}</div>
		</SidebarContext.Provider>
	);
}

/** Hamburger for page headers — only visible when the sidebar is closed.
 *
 *  Owner, round 6c: the toggle is ALWAYS MOUNTED, owning a slot whose
 *  width+margin animate in LOCKSTEP with the sidebar's own width
 *  transition (same duration-200, same easing, both gated on mount) —
 *  before, it mounted/unmounted in one frame, so its 48px footprint
 *  (button + gap) popped and dragged the title and chips sideways while
 *  the sidebar was still mid-slide. When open the slot is exactly zero
 *  (w-0 -mr-3: width 0, the negative margin cancels the header's gap-3),
 *  so resting layouts are pixel-identical to the old conditional render.
 *  The icon fades with the slot and is clipped by it as it collapses —
 *  no popping in either direction. */
export function SidebarToggle({ shellMobile = false }: { shellMobile?: boolean } = {}) {
	const { open, toggle } = useSidebar();
	return (
		<span
			className={cn(
				"sidebar-toggle-slot sidebar-motion lh-no-drag relative flex h-9 shrink-0 overflow-hidden duration-200",
				shellMobile && "max-[927px]:invisible",
				open ? "w-0 -mr-3" : "w-9 mr-0 lh-closed-toggle",
			)}
		>
			<Hint label="Open sidebar" action="toggle-sidebar">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Open sidebar"
				aria-hidden={open}
				tabIndex={open ? -1 : 0}
				onClick={toggle}
				className={cn("sidebar-motion duration-200", open ? "pointer-events-none opacity-0" : "opacity-100")}
			>
				{/* Owner, round 6: size-4, SAME as the close glyph — the toggle
				    must not grow when the sidebar is closed (it did: size-5 here).
				    The small look is the standard, both directions. */}
				<PanelLeftOpenIcon className="ui-icon" />
			</Button>
			</Hint>
		</span>
	);
}

/**
 * The row's status indicator (owner, minimal-color round): the braille
 * spinner, ONLY while a teach turn is in flight — monochrome motion, the
 * terminal's own glyph, existing exactly as long as the work does and
 * vanishing the moment it ends. Every other state renders NOTHING:
 * phases only advance (all sessions end in Teaching — phase-as-signal was
 * decoration, now retired app-wide), and question-pending is the dominant
 * RESTING state of real sessions — a resting state has no scan value, so
 * the meta line's "Waiting for input" text carries it. Idle is the
 * absence of a signal, by design.
 */
function SessionStatus({ busy }: { busy: boolean }) {
	if (!busy) return null;
	return <BrailleSpinner />;
}

/** Compact "how long ago": "just now", "5m ago", "3h ago", "2d ago",
 *  then a plain date. How long a session has been WAITING matters more
 *  than an absolute timestamp. Beyond a week the date renders ISO
 *  (YYYY-MM-DD, zero-padded) — the international standard: unambiguous
 *  in any locale and it sorts (owner, typography round 5; the old
 *  M/D/YYYY was the US convention. A user-locale setting can come later
 *  — trivial, a format function swap). Pure — exported for tests. */
/** The sidebar's date groups, by local calendar day. */
export function dateGroup(iso: string, now = new Date()): "Today" | "Yesterday" | "Earlier" {
	const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const diff = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
	return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : "Earlier";
}

export function timeAgo(iso: string, now = new Date()): string {
	const ms = now.getTime() - new Date(iso).getTime();
	if (ms < 60_000) return "just now";
	const min = Math.floor(ms / 60_000);
	if (min < 60) return `${min}m ago`;
	const h = Math.floor(min / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	const date = new Date(iso);
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${mm}-${dd}`;
}

/** The row's right-aligned time (T3-style slim rows, ui-v2): "now", "5m",
 *  "3h", "2d", then the ISO date. Pure — exported for tests. */
export function shortAgo(iso: string, now = new Date()): string {
	const long = timeAgo(iso, now);
	return long === "just now" ? "now" : long.replace(/ ago$/, "");
}

/** The row's second line: the state when a state exists (waiting/working),
 *  otherwise just how long ago. The message count is DROPPED (owner,
 *  typography round 5): it informed no decision — clutter. messageCount
 *  still rides the API payload, so this is a one-line flip back if it's
 *  ever wanted. */
function sessionMeta(chat: ChatListItem): string {
	if (chat.compacting) return `Compacting context · ${timeAgo(chat.updatedAt)}`;
	if (chat.pendingQuestion) return `Waiting for input · ${timeAgo(chat.updatedAt)}`;
	if ((chat.kind ?? "teach") === "practice" && chat.pendingProblem) {
		return `Problem waiting · ${timeAgo(chat.updatedAt)}`;
	}
	if (chat.busy) return "Working…";
	return timeAgo(chat.updatedAt);
}

/**
 * One session row: the status spinner (only while working), then title +
 * state-aware meta. Exported for render tests — pure function of the
 * list item.
 */
export function SessionRow({
	chat,
	active,
	onOpen,
	kbdSelected = false,
	onContextMenu,
}: {
	chat: ChatListItem;
	active: boolean;
	onOpen: () => void;
	/** Keyboard-walk highlight from the search field — distinct from the
	 *  active session, which stays filled. */
	kbdSelected?: boolean;
	/** Right-click opens the context menu (Rename / Export / Delete). */
	onContextMenu?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
	// Slim row (ui-v2, after T3 Code): a status glyph, the title, the time.
	// The state text lives in the tooltip; the glyph carries it at a glance.
	const practice = (chat.kind ?? "teach") === "practice";
	const waiting = chat.pendingQuestion || (practice && chat.pendingProblem);
	return (
		<a
			href={`/chat/${chat.id}`}
			suppressHydrationWarning
			onClick={(event) => {
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
				event.preventDefault();
				onOpen();
			}}
			onContextMenu={onContextMenu}
			title={`${chat.title}\n${sessionMeta(chat)}`}
			data-testid={kbdSelected ? "session-row-kbd" : "session-row"}
			data-session-id={chat.id}
			aria-current={active ? "page" : undefined}
			className={cn(
				"group flex min-h-9 w-full shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-base transition-colors hover:bg-accent",
				active ? "bg-accent text-foreground" : "text-ink-2",
				kbdSelected && !active && "bg-accent ring-1 ring-inset ring-ring/30",
			)}
		>
			<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
				{practice ? <DumbbellIcon className="ui-icon" aria-label="Practice session" /> : <BookOpenIcon className="ui-icon" aria-label="Lesson session" />}
			</span>
			{/* Whole titles (feature 002): they wrap instead of truncating. */}
			<span className="min-w-0 flex-1 break-words py-2 leading-5">{chat.title}</span>
			{chat.busy || chat.compacting ? (
				<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"><SessionStatus busy /></span>
			) : waiting ? (
				<span role="img" aria-label="Waiting for you" data-testid="waiting-dot" className="size-[7px] shrink-0 rounded-full bg-primary" />
			) : null}
			<span suppressHydrationWarning className="shrink-0 self-center text-sm tabular-nums text-muted-foreground">{shortAgo(chat.updatedAt)}</span>
		</a>
	);
}

/** Keep unchanged rows stable during search, events, and navigation. */
const StableSessionRow = memo(function StableSessionRow({ chat, active, kbdSelected, onOpen, onContextMenu }: {
	chat: ChatListItem; active: boolean; kbdSelected: boolean;
	onOpen: (id: string) => void;
	onContextMenu: (event: React.MouseEvent<HTMLAnchorElement>, chat: ChatListItem) => void;
}) {
	return <SessionRow chat={chat} active={active} kbdSelected={kbdSelected}
		onOpen={useCallback(() => onOpen(chat.id), [onOpen, chat.id])}
		onContextMenu={useCallback((event: React.MouseEvent<HTMLAnchorElement>) => onContextMenu(event, chat), [onContextMenu, chat])} />;
});

export { reconcileChatSnapshot } from "@/components/session-list";

/** The inline-rename row (wave 6): same geometry as SessionRow, but the
 *  title line becomes a text input — select-all on entry (the click means
 *  "replace", the header rename's rule), Enter/blur commits, Esc discards.
 *  The meta line stays so the row never changes height mid-edit. */
export function RenameRow({ chat, onCommit, onCancel }: { chat: ChatListItem; onCommit: (next: string) => void; onCancel: () => void }) {
	const [draft, setDraft] = useState(chat.title);
	const inputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		const el = inputRef.current;
		if (el) {
			el.focus();
			el.select();
		}
	}, []);
	return (
		<div
			data-testid="session-rename-row"
			className="flex h-9 w-full shrink-0 items-center gap-2.5 rounded-md bg-accent px-2.5"
		>
			<span className="size-4 shrink-0" />
			<input
				ref={inputRef}
				value={draft}
				spellCheck={false}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => onCommit(draft)}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
					if (e.key === "Escape") {
						e.preventDefault();
						e.stopPropagation(); // discard, not also the sidebar/chat chains
						onCancel();
					}
				}}
				aria-label="Rename session"
				data-testid="session-rename-input"
				className="w-full min-w-0 truncate border-0 bg-transparent px-0 text-sm text-foreground outline-none"
			/>
		</div>
	);
}

/** The menu contract (same as the context menu): an outside pointerdown or
 *  a claimed Esc closes it; MenuShell returns focus to the trigger. */
function useMenuDismissal(open: boolean, setOpen: (open: boolean) => void, anchorRef: React.RefObject<HTMLElement | null>) {
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (anchorRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, setOpen, anchorRef]);
}

/** The three-way kind filter (practice sessions, owner 2026-10-04):
 *  Teaching / All / Practice — a client-side filter over the same
 *  snapshot, persisted in localStorage, defaulting to All. */
export type SessionKindFilter = "teach" | "all" | "practice";
const KIND_FILTER_KEY = "lh:session-kind-filter";

function SessionsSidebar({ account }: { account?: React.ReactNode }) {
	const { initializing, open, toggle, overlay, close } = useSidebar();
	const { chats, loadError, refresh, setChats } = useSessionList();
	useSessionListDemand(open);
	const [query, setQuery] = useState("");
	const [kindFilter, setKindFilter] = useState<SessionKindFilter>("all");
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => {
		setHydrated(true);
		const stored = window.localStorage.getItem(KIND_FILTER_KEY);
		if (stored === "teach" || stored === "all" || stored === "practice") setKindFilter(stored);
	}, []);
	const setFilter = useCallback((f: SessionKindFilter) => {
		setKindFilter(f);
		window.localStorage.setItem(KIND_FILTER_KEY, f);
	}, []);
	const pathname = usePathname();
	useEffect(() => { if (overlay) close(); }, [pathname, overlay, close]);
	const router = useRouter();
	const { open: openSettings } = useSettingsDialog();

	/* New session (owner, 2026-09-13): NO POST — the button opens the
	   sessionless draft view; the session is created only when the first
	   message is sent (and that message becomes its title). Search: a
	   client-side filter over the poll snapshot — no server round trip. */
	const newSession = useCallback(() => {
		router.push("/chat/new");
	}, [router]);

	/* FUZZY (owner round 8, 2026-10-05): subsequence match ranked by
	 * fuzzyScore — prefix beats word-boundary beats scattered. Empty query
	 * keeps the natural list order (scores are all 0, sort is stable). */
	const shown = useMemo(() => {
		const q = query.trim();
		let list = chats;
		if (list && kindFilter !== "all") {
			list = list.filter((c) => (c.kind ?? "teach") === kindFilter);
		}
		if (!list) return list;
		if (!q) return list;
		return list
			.map((c) => ({ c, score: fuzzyScore(q, c.title) }))
			.filter((r): r is { c: (typeof list)[number]; score: number } => r.score !== null)
			.sort((a, b) => b.score - a.score)
			.map((r) => r.c);
	}, [chats, query, kindFilter]);

	/* ── Keyboard seams (shortcut wave A, 2026-09-17; search-walk round
	   2026-10-10) ── ⌘⇧F focuses the search field — and THE SEARCH OWNS THE
	   WALK: ↑/↓ cycle the filtered list (wrap — "cycle"), Enter opens the
	   walked row, or the FIRST match when nothing is walked (owner,
	   2026-10-10 — the quick-open pattern: ⌘⇧F, type, Enter, done). The
	   Alt+↑/↓/↵ global cycle was RETIRED the same round: barely used,
	   felt laggy. The selection is a row index into `shown`, so the walk
	   follows whatever the query + kind filter leave. Mouse and keyboard
	   coexist: hovering doesn't claim, a click or an open clears the
	   selection. */
	const [kbdIndex, setKbdIndex] = useState<number | null>(null);
	const openSession = useCallback((id: string) => {
		setKbdIndex(null);
		router.push(`/chat/${id}`);
		if (overlay) close();
	}, [router, overlay, close]);
	const searchRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	/* ── Wave 6 chunk A: context menu + inline rename + deletion ──
	   Right-click a session row → MenuShell: the two management actions
	   first (owner ruling), then — below a hairline — the extraction
	   coverage block (owner-locked redesign 2026-09-24, order refined
	   2026-09-24: Rename/Delete on top, the numbers + manual Extract
	   affordance at the bottom). The anchor is the row that was
	   right-clicked — assigned into a ref before the state flip so the
	   shell measures it on its first (hidden) pass. */
	const [ctxChatId, setCtxChatId] = useState<string | null>(null);
	const ctxAnchorRef = useRef<HTMLElement | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<ChatListItem | null>(null);

	const openContext = useCallback((e: React.MouseEvent<HTMLAnchorElement>, chat: ChatListItem) => {
		e.preventDefault(); // suppress the native menu
		ctxAnchorRef.current = e.currentTarget;
		setCtxChatId(chat.id);
	}, []);

	// The menu contract (agent-section's): any pointerdown outside the menu
	// or its row closes it; Esc is CLAIMED so it never also aborts a turn
	// or folds the sidebar. Right-clicking another row re-anchors: its
	// pointerdown closes this menu, its contextmenu opens the next.
	useEffect(() => {
		if (ctxChatId === null) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (ctxAnchorRef.current?.contains(target)) return;
			setCtxChatId(null);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				setCtxChatId(null);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [ctxChatId]);

	// Inline rename (owner ruling, wave 6): the row swaps to a text input;
	// commit rides the SAME plumbing as the header rename — PUT the title,
	// then lh:chat-renamed patches every listener (this sidebar's own
	// listener patches the snapshot instantly; an open chat header hears
	// it too). Esc discards; empty commit discards (the header's rules).
	const commitRename = useCallback(async (id: string, next: string) => {
		setRenamingId(null);
		const t = next.trim();
		if (t === "") return;
		try {
			const res = await fetch(`/api/chats/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: t }),
			});
			if (!res.ok) throw new Error(`rename failed: ${res.status}`);
			window.dispatchEvent(new CustomEvent("lh:chat-renamed", { detail: { id, title: t } }));
		} catch (err) {
			console.error("rename failed:", err); // keep the old title
		}
	}, []);

	// Delete success: patch the list instantly (the poll is the backstop),
	// navigate home if the open session died (the chat view unmounts —
	// drafts die with it, no orphan bubbles), and announce the graph
	// revision so the graph view refetches (deletion is the one writer
	// the status poll can't see — no run ever transitions some→none).
	const onDeleted = useCallback(
		(id: string, _mode: ChatDeleteMode, graphRevision: number) => {
			setDeleting(null);
			setChats((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
			if (pathname === `/chat/${id}`) router.push("/");
			window.dispatchEvent(new CustomEvent("lh:graph-revision", { detail: { revision: graphRevision } }));
		},
		[pathname, router],
	);

	useEffect(() => {
		const onFocusSearch = () => {
			if (!open) toggle();
			// A clipped (overflow-hidden) input still focuses — the sidebar's
			// slide-in doesn't gate the keystroke.
			requestAnimationFrame(() => searchRef.current?.focus());
		};
		window.addEventListener("lh:kbd-sessions-search", onFocusSearch);
		return () => window.removeEventListener("lh:kbd-sessions-search", onFocusSearch);
	}, [open, toggle]);

	// Keep the kbd-selected row in view (the rows are the container's only
	// buttons, so the index matches).
	useEffect(() => {
		if (kbdIndex === null) return;
		listRef.current?.querySelectorAll("button")[kbdIndex]?.scrollIntoView({ block: "nearest" });
	}, [kbdIndex]);

	const [filterOpen, setFilterOpen] = useState(false);
	const filterRef = useRef<HTMLButtonElement | null>(null);
	useMenuDismissal(filterOpen, setFilterOpen, filterRef);
	const [newOpen, setNewOpen] = useState(false);
	const newRef = useRef<HTMLButtonElement | null>(null);
	useMenuDismissal(newOpen, setNewOpen, newRef);

	const sidebar = (
		<SidebarFrame bootstrap={initializing} open={open} overlay={overlay} onClose={close} hasMenu={Boolean(ctxChatId || filterOpen || newOpen || renamingId || deleting)}>
			<div className="flex h-full flex-col bg-(--lh-sidebar)" style={{ width: overlay ? "100%" : "var(--lh-sidebar-width)" }}>
				{/* Brand band: in Electron it is the window's drag surface and
				    starts after the traffic lights (.lh-lights-gutter). */}
				<div className="lh-drag lh-lights-gutter flex h-13 shrink-0 items-center gap-2 px-3">
					<Hint label="Home" action="jump-graph" side="right">
						<Link
							href="/"
							aria-label="Home"
							className="lh-no-drag flex min-w-0 items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent"
						>
							<LhMark className="size-5 shrink-0" />
							<span className="truncate text-sm font-medium tracking-tight">Brunovský&apos;s study</span>
						</Link>
					</Hint>
					<Hint label="Close sidebar" action="toggle-sidebar">
						<Button variant="ghost" size="icon" aria-label="Close sidebar" onClick={toggle} className="lh-no-drag ml-auto size-8 text-muted-foreground">
							<PanelLeftCloseIcon className="ui-icon" />
						</Button>
					</Hint>
				</div>

				{/* Toolbar (feature 002): the Search field with the kind filter at
				    its right end, then one labelled New menu (Lesson, Practice). */}
				<div className="flex items-center gap-1.5 px-2.5 pb-2 pt-1">
					<div className="flex h-9 min-w-0 flex-1 items-center rounded-md bg-card pr-1 text-muted-foreground transition-colors focus-within:bg-accent pointer-coarse:h-11">
						<Hint label="Search sessions" action="sessions-search" side="bottom">
							<label className="flex h-full min-w-0 flex-1 cursor-text items-center gap-2 pl-2.5">
								<SearchIcon className="ui-icon shrink-0" />
								<input
									ref={searchRef}
									data-testid="session-search"
									value={query}
									onChange={(e) => {
										setQuery(e.target.value);
										// The list reorders under the query every keystroke —
										// a stale walk index would point at the wrong row.
										setKbdIndex(null);
									}}
									// THE SEARCH OWNS THE WALK: ↑/↓ cycle the filtered rows
									// (wrap), Enter opens the walked row — or the first match —
									// then blurs. Esc leaves the search and is claimed so the
									// window Esc chain doesn't also fire.
									onKeyDownCapture={(e) => {
										if (e.key !== "Tab" || overlay || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
										// Claim before document-level lesson handlers.
										e.preventDefault();
										e.stopPropagation();
										e.currentTarget.closest("aside")?.querySelector<HTMLElement>('[aria-label="Resize sidebar"]')?.focus();
									}}
									onKeyDown={(e) => {
										if (e.key === "Escape") {
											e.preventDefault();
											e.stopPropagation();
											e.currentTarget.blur();
											return;
										}
										if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
										const n = shown?.length ?? 0;
										if (n === 0) return;
										if (e.key === "ArrowDown" || e.key === "ArrowUp") {
											e.preventDefault();
											const dir = e.key === "ArrowDown" ? 1 : -1;
											setKbdIndex((i) =>
												i === null || i >= n ? (dir === 1 ? 0 : n - 1) : (i + dir + n) % n,
											);
											return;
										}
										if (e.key === "Enter") {
											const target = shown![kbdIndex !== null && kbdIndex < n ? kbdIndex : 0];
											if (!target) return;
											e.preventDefault();
											router.push(`/chat/${target.id}`);
											if (overlay) close();
											setKbdIndex(null);
											e.currentTarget.blur();
										}
									}}
									placeholder="Search"
									aria-label="Search sessions"
									className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
								/>
							</label>
						</Hint>
						<Hint label="Filter" side="bottom">
							<button
								ref={filterRef}
								type="button"
								data-testid="kind-filter"
								aria-label="Filter sessions"
								aria-haspopup="menu"
								aria-expanded={filterOpen}
								data-active={kindFilter !== "all" || undefined}
								onClick={() => setFilterOpen((v) => !v)}
								className={cn(
									"flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11",
									kindFilter === "all" ? "text-muted-foreground" : "bg-accent text-foreground",
								)}
							>
								<ListFilterIcon className="ui-icon" />
							</button>
						</Hint>
					</div>
					<button
						ref={newRef}
						type="button"
						data-testid="new-menu"
						aria-haspopup="menu"
						aria-expanded={newOpen}
						onClick={() => setNewOpen((v) => !v)}
						className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent pl-2.5 pr-3 text-sm font-medium text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_80%,var(--foreground))] pointer-coarse:h-11"
					>
						<PlusIcon className="ui-icon" aria-hidden="true" />
						New
					</button>
				</div>

				{/* The Library (feature 009): one labelled row above the date shelves. */}
				<div className="px-2 pb-1">
					<Link
						href="/library"
						data-testid="sidebar-library"
						aria-current={pathname === "/library" ? "page" : undefined}
						onClick={() => { if (overlay) close(); }}
						className={cn(
							"flex h-9 items-center gap-2 rounded-md px-2.5 text-base transition-colors hover:bg-accent pointer-coarse:h-11",
							pathname === "/library" ? "bg-accent text-foreground" : "text-ink-2",
						)}
					>
						<LibraryIcon className="size-[15px] shrink-0" aria-hidden="true" />
						Library
					</Link>
				</div>

				<div ref={listRef} className="flex flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
					{shown === null ? (
						loadError ? <div role="status" className="px-2 py-3 text-sm text-muted-foreground"><p>Could not load sessions.</p><Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>Try again</Button></div> : <div role="status" aria-label="Loading sessions" className="flex flex-col gap-3 px-2 py-3"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-4/5" /><Skeleton className="h-6 w-3/4" /></div>
					) : shown.length === 0 ? (
						<div className="px-2.5 py-2 text-sm text-muted-foreground">
							{query.trim() ? "No sessions match." : "No sessions yet."}
						</div>
					) : (
						shown.map((c, i) => {
							// Date shelves over the natural most-recent-first order; a
							// ranked search has no groups.
							// Local calendar shelves wait for hydration: server and reader
							// may live in different timezones. Seeded rows remain useful.
							const group = query.trim() || !hydrated ? null : dateGroup(c.updatedAt);
							const header =
								group !== null && (i === 0 || dateGroup(shown[i - 1]!.updatedAt) !== group) ? (
									<div className="flex h-9 shrink-0 items-baseline gap-2 px-2.5 pt-2 text-ink-2" data-testid="session-group">
										<span className="font-title text-lg font-medium">{group}</span>
										<span className="flex-1" aria-hidden="true" />
										<span className="text-sm tabular-nums text-muted-foreground">{shown.filter((x) => dateGroup(x.updatedAt) === group).length}</span>
									</div>
								) : null;
							return <Fragment key={c.id}>{header}{renamingId === c.id ? (
								<RenameRow
									key={c.id}
									chat={c}
									onCommit={(next) => void commitRename(c.id, next)}
									onCancel={() => setRenamingId(null)}
								/>
							) : (
								<StableSessionRow
									key={c.id}
									chat={c}
									active={pathname === `/chat/${c.id}`}
									kbdSelected={i === kbdIndex}
									onOpen={openSession}
									onContextMenu={openContext}
								/>
							)}</Fragment>;
						})
					)}
				</div>

				{/* Background agents: renders only while something runs. */}
				<ActivitySection />

				{/* Footer: icon buttons left, the account avatar right. */}
				<div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
					<Hint label="Settings" action="open-settings" side="top">
						<button
							type="button"
							onClick={(event) => { if (overlay) close(); openSettings(undefined, undefined, event.currentTarget); }}
							data-testid="settings-entry"
							aria-label="Settings"
							className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<SettingsIcon className="ui-icon" />
						</button>
					</Hint>
					<div className="ml-auto">{account}</div>
				</div>
			</div>

			{newOpen && (
				<MenuShell
					anchorRef={newRef}
					testid="new-menu-list"
					preferredSide="down"
					menuClass="flex w-50 flex-col rounded-[10px] bg-popover p-1 text-base"
				>
					<div role="menu" aria-label="New" className="flex flex-col">
						<button
							type="button"
							role="menuitem"
							data-testid="new-session"
							onClick={() => { setNewOpen(false); newSession(); }}
							className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-foreground transition-colors hover:bg-accent focus-visible:bg-accent pointer-coarse:h-11"
						>
							<BookOpenIcon className="ui-icon text-muted-foreground" aria-hidden="true" />
							<span className="flex-1">Lesson</span>
						</button>
						<button
							type="button"
							role="menuitem"
							data-testid="new-session-practice"
							onClick={() => { setNewOpen(false); router.push("/chat/new?mode=practice"); }}
							className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-foreground transition-colors hover:bg-accent focus-visible:bg-accent pointer-coarse:h-11"
						>
							<DumbbellIcon className="ui-icon text-muted-foreground" aria-hidden="true" />
							<span className="flex-1">Practice</span>
						</button>
					</div>
				</MenuShell>
			)}

			{filterOpen && (
				<MenuShell
					anchorRef={filterRef}
					testid="kind-filter-menu"
					preferredSide="down"
					menuClass="flex w-45 flex-col rounded-[10px] bg-popover p-1 text-base"
				>
					<span className="px-2.5 pb-1 pt-1.5 text-sm font-medium text-muted-foreground" aria-hidden="true">Show</span>
					{(
						[
							["all", "All sessions"],
							["teach", "Lessons"],
							["practice", "Practice"],
						] as const
					).map(([f, label]) => (
						<button
							key={f}
							type="button"
							data-testid={`kind-filter-${f}`}
							aria-pressed={kindFilter === f}
							onClick={() => {
								setFilter(f);
								setFilterOpen(false);
							}}
							className={cn(
								"flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent pointer-coarse:h-11",
								kindFilter === f ? "text-foreground" : "text-ink-2",
							)}
						>
							<span className="flex-1">{label}</span>
							{kindFilter === f && <CheckIcon className="size-4 text-muted-foreground" aria-hidden="true" />}
						</button>
					))}
				</MenuShell>
			)}

				{/* The context menu (wave 6 + the extraction-UX redesign): the
				    coverage block above, then exactly two management actions
				    (owner ruling — no more). MenuShell owns placement/focus/arrow
				    cycling; the dismissal effect above owns the contract. */}
				{ctxChatId !== null && (
					<MenuShell
						anchorRef={ctxAnchorRef}
						testid="session-context-menu"
						preferredSide="down"
						menuClass="flex w-52 flex-col gap-0.5 rounded-xl border bg-card p-2 text-sm "
					>
						{/* The two management actions first, then the extraction block
						    (owner refinement round, 2026-09-24): Rename/Delete stay at the
						    top, the coverage numbers + Extract affordance sit below the
						    hairline — the block is info + a stateful affordance, the
						    actions above it. Fetched on menu open (the block mounts WITH
						    the menu); 409 = benign. Renders nothing on a failed read. */}
						<button
							type="button"
							data-testid="ctx-rename"
							onClick={() => {
								setRenamingId(ctxChatId);
								setCtxChatId(null);
							}}
							className="flex items-center rounded-lg px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-accent"
						>
							Rename
						</button>
						{/* Export as Markdown (owner, release polish 2026-10-06): the
					    session-markdown engine's user-facing debut — same-origin
						    anchor download; the route's Content-Disposition names the
						    file. Sits with the management actions, above Delete (the
						    destructive action stays last — the danger-fence law). */}
						<button
							type="button"
							data-testid="ctx-export-md"
							onClick={() => {
								const chatId = ctxChatId;
								setCtxChatId(null);
								const a = document.createElement("a");
								a.href = `/api/chats/${chatId}/markdown`;
								a.download = ""; // the route's filename wins
								document.body.appendChild(a);
								a.click();
								a.remove();
							}}
							className="flex items-center rounded-lg px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-accent"
						>
							Export as Markdown…
						</button>
						<button
							type="button"
							data-testid="ctx-delete"
							onClick={() => {
								const target = chats?.find((c) => c.id === ctxChatId);
								if (target) setDeleting(target);
								setCtxChatId(null);
							}}
							className="flex items-center rounded-lg px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							Delete…
						</button>
						<div className="my-0.5" aria-hidden="true" />
						<CoverageMenuBlock chatId={ctxChatId} />
					</MenuShell>
				)}

				{/* The two-option delete dialog (wave 6) — portaled within the active modal
				    by the component itself, lives here for state locality. */}
				<DeleteSessionDialog
					chat={deleting}
					onClose={() => setDeleting(null)}
					onDeleted={onDeleted}
				/>
			</SidebarFrame>
	);
	return sidebar;
}

/** The app frame: sidebar inline + content. Rendered once in the root layout. */
/** account: the hosted-mode account row (layout passes it; Clerk stays out
 *  of this module). */
export function AppShell({ children, account, hosted = false, initialChats }: { children: React.ReactNode; account?: React.ReactNode; hosted?: boolean; initialChats?: ChatListItem[] }) {
	usePointerBlur();
	const pathname = usePathname();
	// Keep mobile navigation interactive while the conversation's richer
	// rendering modules are still downloading. Its header keeps the same slot.
	const conversation = pathname.startsWith("/chat/") && pathname !== "/chat/new";
	return (
		<SettingsDialogProvider hosted={hosted}>
			<SessionListProvider initialChats={initialChats}>
				<SessionsSidebar account={account} />
				{conversation && <div data-mobile-chat-navigation="" className="fixed left-0 top-0 z-40 flex h-13 items-center px-3 min-[928px]:hidden"><SidebarToggle /></div>}
				<main className="min-w-0 flex-1">{children}</main>
				{/* The single document-level keydown listener (keyboard wave A) —
				    after the content in the tree, but it's window-level so order only
				    matters for the events it dispatches, never for DOM priority. */}
				<KeyboardShortcuts />
			</SessionListProvider>
		</SettingsDialogProvider>
	);
}
