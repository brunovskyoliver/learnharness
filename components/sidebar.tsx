"use client";

import { createContext, Fragment, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { MenuPortalContext, MenuShell } from "@/components/menu-shell";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import type { ChatDeleteMode } from "@/src/core";
import { BookOpenIcon, CheckIcon, DumbbellIcon, ListFilterIcon, PlusIcon, SearchIcon } from "lucide-react";
import { ActivityCornerHint } from "@/components/activity-dock";
import { CoverageMenuBlock } from "@/components/extraction-coverage";
import { BrailleSpinner } from "@/components/braille-spinner";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { usePointerBlur } from "@/components/focus-hygiene";
import { SettingsDialogProvider, useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { Hint } from "@/components/ui/hint";
import { switchInterface, rememberStudyPath } from "@/components/interface-switch";
import { navigateTo } from "@/components/paper/navigate";
import { MenuGlyph, Wordmark } from "@/components/paper/chrome";
import { EdgeStrip, OverlaySidebarShell, SidebarBody, SidebarFooterRow, SidebarHead, type SidebarState, type SidebarVia } from "@/components/paper/overlay-sidebar";
import { keyLabel, useIsMac } from "@/components/paper/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fuzzyScore } from "@/src/core";
import type { ChatListItem } from "@/src/core";
import { bindingForAction, isNotebookPath, kbdEventForAction } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";
import { SessionListProvider, useSessionList, useSessionListDemand } from "@/components/session-list";
import { CommandPaletteHost } from "@/components/command-palette";
import { SidebarNav } from "@/components/workspace/sidebar-nav";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import type { ChatGPTControlBridge, NativeSubscriptionControlBridge } from "@/src/core";
import type { UpdateState } from "@/components/settings/update-settings.tsx";

/** Hosted only, on demand: the Clerk SDK stays out of local mode. */
const SignOutRow = dynamic(() => import("@/components/notebook/sign-out-row"), { ssr: false });

/**
 * Study's navigation (feature 025, R6): Notebook's overlay sidebar, opened
 * by the ☰ at the top left, Mod+B, the session search shortcut or a hover
 * at the left edge. It dims the page (Study's page does not slide aside)
 * and closes on Escape, ✕, a click outside or a navigation. The open state
 * lives in the root layout's provider; the old persistent column, its
 * width and its stored keys (`lh:sidebar-open`, `lh:sidebar-width`) are
 * gone (stored values are ignored, not deleted).
 */

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
			/** Window chrome follows the paper (feature 025, R15): background and title-bar symbol colours, #rrggbb. */
			setChrome?: (colors: { background: string; symbol: string }) => void;
		};
	}
}

interface SidebarValue {
	state: SidebarState;
	open: boolean;
	openSidebar: (via: SidebarVia, search?: boolean) => void;
	close: () => void;
	toggle: (via?: SidebarVia) => void;
}

const SidebarContext = createContext<SidebarValue>({
	state: null,
	open: false,
	openSidebar: () => {},
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
	const [state, setState] = useState<SidebarState>(null);

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
		return () => off?.();
	}, []);

	const openSidebar = useCallback((via: SidebarVia, search = false) => setState({ via, search }), []);
	const close = useCallback(() => setState(null), []);
	const toggle = useCallback((via: SidebarVia = "key") => setState((open) => (open ? null : { via, search: false })), []);

	// ⌘B: the global shortcut dispatches kbdEventForAction("toggle-sidebar")
	// and the context answers on exactly that name — the shared spelling
	// is the fix for the interlude bug (owner 2026-09-25).
	useEffect(() => {
		const event = kbdEventForAction("toggle-sidebar");
		const onToggle = () => toggle("key");
		window.addEventListener(event, onToggle);
		return () => window.removeEventListener(event, onToggle);
	}, [toggle]);

	const value = useMemo(() => ({ state, open: state !== null, openSidebar, close, toggle }), [state, openSidebar, close, toggle]);
	return (
		<SidebarContext.Provider value={value}>
			<div className="flex h-dvh">{children}</div>
		</SidebarContext.Provider>
	);
}

/** The ☰ that is on screen (a surface may hold an invisible twin under the shell's own). */
function visibleMenuButton(): HTMLElement | null {
	return [...document.querySelectorAll<HTMLElement>("[data-sidebar-toggle]")].find((el) => el.checkVisibility?.({ visibilityProperty: true }) ?? el.offsetParent !== null) ?? null;
}

/**
 * The top-left chrome in Study (feature 025, R6/R7): Notebook's ☰ and our
 * wordmark (to Home), first in every top band. It holds the Electron
 * traffic-light gutter (lh-closed-toggle). `shellMobile`: the band keeps
 * the slot but the shell's fixed twin is the live one, so a conversation's
 * navigation works before its richer modules arrive.
 */
export function SidebarToggle({ shellMobile = false }: { shellMobile?: boolean } = {}) {
	const { open, openSidebar } = useSidebar();
	return (
		<span className={cn("lh-study-chrome lh-closed-toggle lh-no-drag flex shrink-0 items-center", shellMobile && "invisible")}>
			<Hint label="Open sidebar" action="toggle-sidebar" side="bottom">
				<button
					type="button"
					className="nb-menu-button"
					aria-label="Open sidebar"
					aria-expanded={open}
					aria-haspopup="dialog"
					data-sidebar-toggle=""
					tabIndex={shellMobile ? -1 : undefined}
					onClick={() => openSidebar("click")}
				>
					<MenuGlyph />
				</button>
			</Hint>
			<Wordmark href="/" className="lh-study-wordmark" />
		</span>
	);
}

/**
 * The row's status indicator (owner, minimal-color round): the braille
 * spinner, ONLY while a teach turn is in flight; a waiting session shows
 * the bulb dot (owner Q4, feature 025); idle is the absence of a signal.
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
 * One session row: the kind icon, the whole title (it wraps), the status
 * (spinner while working, the bulb dot while waiting) and the time.
 * Exported for render tests — pure function of the list item.
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
			data-kbd={kbdSelected || undefined}
			aria-current={active ? "page" : undefined}
			className="nb-side-row nb-side-session"
		>
			{practice ? <DumbbellIcon className="nb-side-icon" aria-label="Practice session" /> : <BookOpenIcon className="nb-side-icon" aria-label="Lesson session" />}
			{/* Whole titles (feature 002): they wrap instead of truncating. */}
			<span className="nb-side-title">{chat.title}</span>
			{chat.busy || chat.compacting ? (
				<span className="nb-side-status-glyph"><SessionStatus busy /></span>
			) : waiting ? (
				<span role="img" aria-label="Waiting for you" data-testid="waiting-dot" className="nb-side-waiting" />
			) : null}
			<span suppressHydrationWarning className="nb-side-time">{shortAgo(chat.updatedAt)}</span>
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
 *  title becomes a text input — select-all on entry (the click means
 *  "replace", the header rename's rule), Enter/blur commits, Esc discards. */
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
		<div data-testid="session-rename-row" className="nb-side-row nb-side-session nb-side-rename">
			<span className="nb-side-icon" aria-hidden="true" />
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

function StudySidebar({ account, hosted }: { account?: React.ReactNode; hosted: boolean }) {
	const { state, open, openSidebar, close } = useSidebar();
	const { chats, loadError, refresh, setChats } = useSessionList();
	useSessionListDemand(open);
	const mac = useIsMac();
	const [query, setQuery] = useState("");
	const [kindFilter, setKindFilter] = useState<SessionKindFilter>("all");
	const [hydrated, setHydrated] = useState(false);
	const [content, setContent] = useState<HTMLDivElement | null>(null);
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
	// Any navigation (a row, the Library, Review, a folder) closes it.
	useEffect(() => { close(); }, [pathname, close]);
	const router = useRouter();
	const { open: openSettings } = useSettingsDialog();
	// A dialog opened from here waits for the sidebar's focus return first.
	const afterClose = useCallback((then: () => void) => { close(); requestAnimationFrame(then); }, [close]);

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

	/* THE SEARCH OWNS THE WALK (search-walk round 2026-10-10): ⌘⇧F opens
	   the sidebar on the search; ↑/↓ cycle the filtered list (wrap), Enter
	   opens the walked row, or the FIRST match when nothing is walked. The
	   selection is a row index into `shown`. Mouse and keyboard coexist:
	   hovering doesn't claim, a click or an open clears the selection. */
	const [kbdIndex, setKbdIndex] = useState<number | null>(null);
	const openSession = useCallback((id: string) => {
		setKbdIndex(null);
		close();
		router.push(`/chat/${id}`);
	}, [router, close]);
	const searchRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	/* ── Wave 6: context menu + inline rename + deletion ── Right-click a
	   session row → MenuShell: Rename, Export, Delete, then the extraction
	   coverage block. The anchor is the row that was right-clicked. */
	const [ctxChatId, setCtxChatId] = useState<string | null>(null);
	const ctxAnchorRef = useRef<HTMLElement | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<ChatListItem | null>(null);

	const openContext = useCallback((e: React.MouseEvent<HTMLAnchorElement>, chat: ChatListItem) => {
		e.preventDefault(); // suppress the native menu
		ctxAnchorRef.current = e.currentTarget;
		setCtxChatId(chat.id);
	}, []);

	// The menu contract: any pointerdown outside the menu or its row closes
	// it; Esc is CLAIMED so it never also aborts a turn or closes the sidebar.
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

	// Inline rename (wave 6): commit rides the SAME plumbing as the header
	// rename — PUT the title, then lh:chat-renamed patches every listener.
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
	// navigate home if the open session died, and announce the graph
	// revision so the graph view refetches.
	const onDeleted = useCallback(
		(id: string, _mode: ChatDeleteMode, graphRevision: number) => {
			setDeleting(null);
			setChats((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
			if (pathname === `/chat/${id}`) router.push("/");
			window.dispatchEvent(new CustomEvent("lh:graph-revision", { detail: { revision: graphRevision } }));
		},
		[pathname, router, setChats],
	);

	// ⌘⇧F: the sidebar opens on its search.
	useEffect(() => {
		const onFocusSearch = () => openSidebar("key", true);
		window.addEventListener(kbdEventForAction("sessions-search"), onFocusSearch);
		return () => window.removeEventListener(kbdEventForAction("sessions-search"), onFocusSearch);
	}, [openSidebar]);

	// Keep the kbd-selected row in view.
	useEffect(() => {
		if (kbdIndex === null) return;
		listRef.current?.querySelectorAll("[data-session-id]")[kbdIndex]?.scrollIntoView({ block: "nearest" });
	}, [kbdIndex]);

	const [filterOpen, setFilterOpen] = useState(false);
	const filterRef = useRef<HTMLButtonElement | null>(null);
	useMenuDismissal(filterOpen, setFilterOpen, filterRef);
	const [newOpen, setNewOpen] = useState(false);
	const newRef = useRef<HTMLButtonElement | null>(null);
	useMenuDismissal(newOpen, setNewOpen, newRef);
	// A menu, rename or confirmation inside owns Escape; closing the sidebar drops them.
	const holding = Boolean(ctxChatId || filterOpen || newOpen || renamingId || deleting);
	useEffect(() => {
		if (open) return;
		setCtxChatId(null);
		setFilterOpen(false);
		setNewOpen(false);
		setKbdIndex(null);
	}, [open]);

	const search = (
		<div className="nb-side-row nb-side-search" onPointerDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); searchRef.current?.focus(); } }}>
			<SearchIcon className="nb-side-icon" aria-hidden="true" />
			<input
				ref={searchRef}
				type="search"
				data-testid="session-search"
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					// The list reorders under the query every keystroke —
					// a stale walk index would point at the wrong row.
					setKbdIndex(null);
				}}
				onKeyDown={(e) => {
					if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.nativeEvent.isComposing) return;
					const n = shown?.length ?? 0;
					if (n === 0) return;
					if (e.key === "ArrowDown" || e.key === "ArrowUp") {
						e.preventDefault();
						const dir = e.key === "ArrowDown" ? 1 : -1;
						setKbdIndex((i) => (i === null || i >= n ? (dir === 1 ? 0 : n - 1) : (i + dir + n) % n));
						return;
					}
					if (e.key === "Enter") {
						const target = shown![kbdIndex !== null && kbdIndex < n ? kbdIndex : 0];
						if (!target) return;
						e.preventDefault();
						openSession(target.id);
					}
				}}
				placeholder="Find a session"
				aria-label="Search sessions"
				autoComplete="off"
				spellCheck={false}
			/>
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
					className="nb-side-filter"
				>
					<ListFilterIcon className="nb-side-icon" aria-hidden="true" />
				</button>
			</Hint>
		</div>
	);

	const body = (
		<SidebarBody
			head={<SidebarHead closeLabel="Close sidebar" onClose={close} wordmark={<Wordmark href="/" />} />}
			search={search}
			actions={
				<button ref={newRef} type="button" className="nb-side-row nb-side-action" data-testid="new-menu" aria-haspopup="menu" aria-expanded={newOpen} onClick={() => setNewOpen((v) => !v)}>
					<PlusIcon className="nb-side-icon" aria-hidden="true" />
					<span>New</span>
					<kbd className="nb-side-kbd" aria-hidden="true">{keyLabel(bindingForAction("new-session"), mac)}</kbd>
				</button>
			}
			footer={
				<>
					{account && <div className="nb-side-account" data-testid="sidebar-account">{account}</div>}
					<ul className="nb-side-actions" aria-label="Study">
						<SidebarFooterRow label="Settings" binding={bindingForAction("open-settings")} mac={mac} testId="settings-entry" onClick={() => afterClose(() => openSettings(undefined, undefined, visibleMenuButton() ?? undefined))} />
						<SidebarFooterRow label="Command palette" binding={bindingForAction("command-palette")} mac={mac} testId="command-palette-entry" onClick={() => afterClose(() => window.dispatchEvent(new CustomEvent(kbdEventForAction("command-palette"))))} />
						<SidebarFooterRow label="Switch to Notebook" binding={bindingForAction("toggle-interface")} mac={mac} testId="switch-to-notebook" onClick={() => { close(); void switchInterface("notebook", (href) => navigateTo(router, href, "mode")); }} />
						{hosted && <li><SignOutRow className="nb-side-row nb-side-footer-action" /></li>}
					</ul>
				</>
			}
		>
			{/* Unified navigation (feature 014): Lessons, Practice, and the Library
			    with its folder tree, then Review, above the date shelves. */}
			<SidebarNav
				pathname={pathname}
				kindFilter={kindFilter}
				onKindFilter={setFilter}
				lessonCount={chats ? chats.filter((c) => (c.kind ?? "teach") === "teach").length : null}
				practiceCount={chats ? chats.filter((c) => c.kind === "practice").length : null}
				onNavigate={close}
			/>

			<div ref={listRef} className="nb-side-sessions" data-testid="session-list">
				{shown === null ? (
					loadError ? (
						<div role="status" className="nb-side-status">
							<p>Could not load sessions.</p>
							<button type="button" className="nb-text-button" onClick={() => void refresh()}>Try again</button>
						</div>
					) : (
						<div role="status" aria-label="Loading sessions" className="flex flex-col gap-2 px-[7px] py-2"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-5 w-3/4" /></div>
					)
				) : shown.length === 0 ? (
					<p className="nb-side-status">{query.trim() ? "No sessions match." : "No sessions yet."}</p>
				) : (
					shown.map((c, i) => {
						// Date shelves over the natural most-recent-first order; a
						// ranked search has no groups. Local calendar shelves wait for
						// hydration: server and reader may live in different timezones.
						const group = query.trim() || !hydrated ? null : dateGroup(c.updatedAt);
						const header =
							group !== null && (i === 0 || dateGroup(shown[i - 1]!.updatedAt) !== group) ? (
								<div className="nb-side-shelf" data-testid="session-group">
									<span>{group}</span>
									<span className="nb-side-count">{shown.filter((x) => dateGroup(x.updatedAt) === group).length}</span>
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
		</SidebarBody>
	);

	return (
		<>
			<EdgeStrip onOpen={() => { if (!state) openSidebar("hover"); }} />
			<OverlaySidebarShell
				state={state}
				onClose={close}
				onPromote={() => openSidebar("click")}
				title="Sessions"
				returnFocus={visibleMenuButton}
				searchRef={searchRef}
				query={query}
				onClearQuery={() => { setQuery(""); setKbdIndex(null); }}
				holdEscape={holding}
				dim
				contentRef={setContent}
			>
				<MenuPortalContext.Provider value={content}>
					{body}

					{newOpen && (
						<MenuShell anchorRef={newRef} testid="new-menu-list" preferredSide="down" menuClass="flex w-50 flex-col">
							<div role="menu" aria-label="New" className="flex flex-col">
								<button type="button" role="menuitem" data-testid="new-session" onClick={() => { setNewOpen(false); close(); router.push("/chat/new"); }} className="nb-menu-item">
									<BookOpenIcon className="nb-side-icon mt-[3px]" aria-hidden="true" />
									<span className="flex-1">Lesson</span>
								</button>
								<button type="button" role="menuitem" data-testid="new-session-practice" onClick={() => { setNewOpen(false); close(); router.push("/chat/new?mode=practice"); }} className="nb-menu-item">
									<DumbbellIcon className="nb-side-icon mt-[3px]" aria-hidden="true" />
									<span className="flex-1">Practice</span>
								</button>
							</div>
						</MenuShell>
					)}

					{filterOpen && (
						<MenuShell anchorRef={filterRef} testid="kind-filter-menu" preferredSide="down" menuClass="flex w-45 flex-col">
							<span className="nb-menu-label" aria-hidden="true">Show</span>
							{([["all", "All sessions"], ["teach", "Lessons"], ["practice", "Practice"]] as const).map(([f, label]) => (
								<button
									key={f}
									type="button"
									data-testid={`kind-filter-${f}`}
									aria-pressed={kindFilter === f}
									onClick={() => { setFilter(f); setFilterOpen(false); }}
									className={cn("nb-menu-item", kindFilter !== f && "text-graphite")}
								>
									<span className="nb-menu-check">{kindFilter === f && <CheckIcon aria-hidden="true" />}</span>
									<span className="flex-1">{label}</span>
								</button>
							))}
						</MenuShell>
					)}

					{/* The context menu (wave 6 + the extraction-UX redesign): the two
					    management actions and Export first, Delete last (the danger
					    fence), then the coverage block below a hairline. */}
					{ctxChatId !== null && (
						<MenuShell anchorRef={ctxAnchorRef} testid="session-context-menu" preferredSide="down" menuClass="flex w-56 flex-col">
							<button type="button" data-testid="ctx-rename" onClick={() => { setRenamingId(ctxChatId); setCtxChatId(null); }} className="nb-menu-item">
								Rename
							</button>
							{/* Export as Markdown (owner, release polish 2026-10-06): a
							    same-origin anchor download; the route names the file. */}
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
								className="nb-menu-item"
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
								className="nb-menu-item text-graphite"
							>
								Delete…
							</button>
							<div className="nb-menu-separator" aria-hidden="true" />
							<CoverageMenuBlock chatId={ctxChatId} />
						</MenuShell>
					)}

					{/* The two-option delete dialog (wave 6), portaled inside the sidebar. */}
					<DeleteSessionDialog chat={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />
				</MenuPortalContext.Provider>
			</OverlaySidebarShell>
		</>
	);
}

/** The app frame, rendered once in the root layout. `account`: the
 *  hosted-mode account row (layout passes it; Clerk stays out of this module). */
export function AppShell({ children, account, hosted = false, initialChats }: { children: React.ReactNode; account?: React.ReactNode; hosted?: boolean; initialChats?: ChatListItem[] }) {
	usePointerBlur();
	const pathname = usePathname();
	// Keep a conversation's navigation interactive while its richer
	// rendering modules are still downloading: the shell's ☰ sits where the
	// session's top band will put its own (an invisible twin).
	const conversation = pathname.startsWith("/chat/") && pathname !== "/chat/new";
	const notebook = isNotebookPath(pathname);
	// Study's last location, so a switch back from Notebook returns there (feature 024).
	useEffect(() => {
		if (!notebook) rememberStudyPath(`${pathname}${window.location.search}`);
	}, [pathname, notebook]);
	// One tree for both modes: Notebook brings its own chrome (no sessions
	// sidebar, tabs, right pane or palette), but the page slot keeps its place
	// and type, so a mode switch never remounts the layout's Suspense boundary
	// around the page. A remounted boundary shows its empty fallback while the
	// new mode loads (a blank frame); a kept one holds the old page until the
	// new one is ready (feature 028). The providers stay, so drafts, settings
	// and events work, and the keyboard listener keeps only the mode toggle in
	// Notebook (keyed by mode: it remounts on a switch, as before).
	return (
		<SettingsDialogProvider hosted={hosted}>
			<SessionListProvider initialChats={initialChats}>
				<WorkspaceProvider>
				{!notebook && <StudySidebar account={account} hosted={hosted} />}
				{!notebook && conversation && <div data-mobile-chat-navigation="" className="fixed left-0 top-0 z-20 flex h-(--lh-band) items-center pl-(--lh-chrome-left) pr-3"><SidebarToggle /></div>}
				{/* Study's main landmark; in Notebook a layout-free wrapper (its note page is the main). */}
				<div role={notebook ? undefined : "main"} className={notebook ? "contents" : "min-w-0 flex-1"}>{children}</div>
				{/* The single document-level keydown listener (keyboard wave A) —
				    window-level, so order only matters for the events it
				    dispatches, never for DOM priority. */}
				<KeyboardShortcuts key={notebook ? "notebook" : "study"} />
				{!notebook && <CommandPaletteHost />}
				{!notebook && <ActivityCornerHint />}
				</WorkspaceProvider>
			</SessionListProvider>
		</SettingsDialogProvider>
	);
}
