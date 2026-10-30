"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
useState,
} from "react";
import { Dialog } from "radix-ui";
import { BotIcon, KeyboardIcon, NetworkIcon, PaletteIcon, SearchIcon, Settings2Icon, KeyRoundIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import {
	CURRENT_SETTINGS_VERSION,
	type AgentSettings,
	type AppearanceSettings,
	type CompactionSettings,
	type GraphSettings,
	type UserSettings,
} from "@/src/core";
import { useAppearance } from "./appearance.tsx";
import { SettingsFailure, SettingsGroup, SettingsRowsSkeleton, SettingsSection } from "./controls.tsx";
import { useSettingsDialog } from "./settings-dialog.tsx";
import { searchSettings, type SettingsIndexEntry } from "./settings-index";
import { UpdateSettings } from "./update-settings.tsx";
import { AgentSection } from "./agent-section.tsx";
import type { ModelsSettings } from "@/src/core";
import { MENU_CLOSE_EVENT, MENU_OPEN_EVENT, MenuPortalContext } from "@/components/menu-shell";
import { notifySettingsSaved } from "@/components/settings-signal";
import { KeysSection } from "./keys-section.tsx";
import { Hint } from "@/components/ui/hint";
import { AppearanceSection, GraphSection } from "./appearance-section.tsx";
import { GraphDisplaySection } from "./graph-display-section.tsx";
import { KeyboardSection } from "./keyboard-section.tsx";

/** Owner (2026-09-20): hints earn their place — mechanics-explaining
 *  prose is out; only the keyboard note stays (storage location is a
 *  real question users ask). */
const SECTIONS = [
	{ id: "keys", icon: KeyRoundIcon, label: "Providers" },
	{ id: "agent", icon: BotIcon, label: "Agent" },
	{ id: "appearance", icon: PaletteIcon, label: "Appearance" },
	{ id: "graph", icon: NetworkIcon, label: "Graph" },
	{ id: "keyboard", icon: KeyboardIcon, label: "Keyboard", hint: "Stored on this device" },
	{ id: "general", icon: Settings2Icon, label: "General" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

type WritableSection = "general" | "agent" | "models" | "appearance" | "graph" | "compaction";

/** Section names in words, for failed saves (contract, finding 11). */
const SECTION_WORDS: Record<WritableSection, string> = {
	general: "General",
	agent: "Agent",
	models: "Model",
	appearance: "Appearance",
	graph: "Graph",
	compaction: "Context",
};

interface SaveFailure {
	section: WritableSection;
	body: object;
	detail: string;
}

const ROW_CONTROL = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ROW_WAIT_MS = 5000;
const ROW_HIGHLIGHT_MS = 160;
export default function SettingsDialog({
	onClose,
	initialSection,
	initialRow,
	returnFocusElement,
}: {
	onClose: () => void;
	initialSection: SectionId;
	/** The keys-section row to unfold (see DialogContext above). */
	initialRow: string | null;
	returnFocusElement?: HTMLElement | null;
}) {
	const backdropDismiss = useBackdropDismiss(onClose);
	const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
	const returnFocus = useRef<HTMLElement | null>(
		returnFocusElement ?? (typeof document === "undefined" ? null : document.activeElement as HTMLElement | null),
	);

	return (
		<Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-background" data-testid="settings-backdrop" {...backdropDismiss} />
				<Dialog.Content
					ref={setPortalContainer}
					// The dialog itself takes focus, so no control's tooltip opens with it.
					tabIndex={-1}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						(event.currentTarget as HTMLElement).focus();
					}}
					data-lh-modal-content
					aria-describedby={undefined}
					data-settings-surface
					className="fixed inset-3 z-50 overflow-hidden rounded-lg border border-border bg-background outline-none sm:inset-6 lg:inset-x-[6vw] lg:inset-y-[5vh]"
					onPointerDownOutside={(event) => event.preventDefault()}
					onEscapeKeyDown={(event) => event.preventDefault()}
						onCloseAutoFocus={(event) => {
							event.preventDefault();
							const target = returnFocus.current;
							requestAnimationFrame(() => {
								if (document.querySelector("[data-lh-modal-content]")) return;
								// Hint can replace its trigger subtree when its open state changes.
								const liveTarget = target?.dataset.testid === "settings-entry"
									? document.querySelector<HTMLElement>('[data-testid="settings-entry"]')
									: target;
								const rect = liveTarget?.getBoundingClientRect();
								if (liveTarget?.isConnected && rect && rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth) liveTarget.focus();
								else document.querySelector<HTMLElement>('[aria-label="Open sidebar"]')?.focus();
							});
						}}
				>
					<Dialog.Title className="sr-only">Settings</Dialog.Title>
					<MenuPortalContext.Provider value={portalContainer}>
						<SettingsDialogBody onClose={onClose} initialSection={initialSection} initialRow={initialRow} inModal />
					</MenuPortalContext.Provider>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/** The dialog without the portal/backdrop — the SSR-testable frame
 *  (portals render nothing under renderToStaticMarkup). */
export function SettingsDialogBody({
	onClose,
	initialSection = "keys",
	initialRow = null,
	inModal = false,
}: {
	onClose: () => void;
	inModal?: boolean;
	initialSection?: SectionId;
	/** The row to jump to on arrival (null = none); a keys row also unfolds.
	 *  While-open retargets follow it exactly like initialSection below. */
initialRow?: string | null;
}) {
	const { onAppearanceChange } = useAppearance();
	const [record, setRecord] = useState<UserSettings | null | undefined>(
		undefined,
	);
	const [error, setError] = useState<SaveFailure | null>(null);
	const [loadRequest, setLoadRequest] = useState(0);
	const { hosted } = useSettingsDialog();
// MenuShell open-count — drives the content column's scroll lock.
	const [openMenus, setOpenMenus] = useState(0);
	const contentRef = useRef<HTMLDivElement | null>(null);
	// Scroll-lock (fix wave, owner ruling: scrolling must NOT happen, nothing
	// may move): scrollbars are hidden globally now, and the lock still stops
	// scrolling. The content column keeps overflow-y-auto, and while any
	// MenuShell is open, non-passive wheel + touchmove listeners on the column
	// preventDefault. React attaches synthetic wheel/touch passively at the
	// root, so this needs the native-listener ref seam.
useEffect(() => {
		const el = contentRef.current;
		if (!el || openMenus === 0) return;
		const block = (e: Event) => e.preventDefault();
		el.addEventListener("wheel", block, { passive: false });
		el.addEventListener("touchmove", block, { passive: false });
		return () => {
			el.removeEventListener("wheel", block);
			el.removeEventListener("touchmove", block);
		};
	}, [openMenus]);

	useEffect(() => {
		const onOpen = () => setOpenMenus((n) => n + 1);
		const onClose = () => setOpenMenus((n) => Math.max(0, n - 1));
		window.addEventListener(MENU_OPEN_EVENT, onOpen);
		window.addEventListener(MENU_CLOSE_EVENT, onClose);
		return () => {
			window.removeEventListener(MENU_OPEN_EVENT, onOpen);
			window.removeEventListener(MENU_CLOSE_EVENT, onClose);
		};
	}, []);
	const [active, setActive] = useState<SectionId>(initialSection);
	const [search, setSearch] = useState("");
	const [desktop, setDesktop] = useState(false);
	useEffect(() => setDesktop(Boolean(window.lh?.checkForUpdates)), []);
	const results = useMemo(() => searchSettings(search, { hosted, desktop }), [search, hosted, desktop]);
	/** One jump request; the count re-runs a repeated jump to the same row. */
	const [jump, setJump] = useState<{ row: string | null; request: number }>({ row: initialRow, request: 0 });
	const activeSection = SECTIONS.find((section) => section.id === active) ?? SECTIONS[0];
// A deep-link fired while the dialog is ALREADY open (first exercised by
	// the wave-6 embedding picker's "Add a provider key first…" link — the
	// picker itself died with wave 7, the mechanism is general) changes
	// initialSection under our feet — follow it, or the link silently does
	// nothing.
	useEffect(() => {
		setActive(initialSection);
	}, [initialSection]);
	useEffect(() => {
		setJump((current) => (current.row === initialRow ? current : { row: initialRow, request: current.request + 1 }));
	}, [initialRow]);

	const chooseResult = (entry: SettingsIndexEntry) => {
		setActive(entry.section);
		setJump((current) => ({ row: entry.row, request: current.request + 1 }));
		setSearch("");
	};

	// The row jump (research R12): rows can arrive after the record or a
	// section's own fetch, so wait for the row rather than assume it is there.
	useEffect(() => {
		const root = contentRef.current;
		const row = jump.row;
		if (!root || !row) return;
		let clear: ReturnType<typeof setTimeout> | undefined;
		const land = () => {
			const target = root.querySelector<HTMLElement>(`[data-settings-row="${CSS.escape(row)}"]`);
			if (!target) return false;
			const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
			target.querySelector<HTMLElement>(ROW_CONTROL)?.focus({ preventScroll: true });
			target.setAttribute("data-settings-jump", "");
			clear = setTimeout(() => target.removeAttribute("data-settings-jump"), ROW_HIGHLIGHT_MS);
			return true;
		};
		if (land()) return () => clearTimeout(clear);
		const observer = new MutationObserver(() => { if (land()) stop(); });
		const timeout = setTimeout(() => stop(), ROW_WAIT_MS);
		const stop = () => { observer.disconnect(); clearTimeout(timeout); };
		observer.observe(root, { childList: true, subtree: true });
		return () => { stop(); clearTimeout(clear); };
	}, [jump]);
// Fetch once per dialog mount. 200 {settings: null} is FIRST BOOT
	// (no record = factory everything), not a failure — the error state is
	// a non-200 or a network throw only.
	useEffect(() => {
		setRecord(undefined);
		fetch("/api/settings")
.then((r) =>
				r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)),
			)
			.then((body: { settings: UserSettings | null }) =>
				setRecord(body.settings ?? { version: CURRENT_SETTINGS_VERSION }),
			)
			.catch(() => setRecord(null));
	}, [loadRequest]);
// Escape closes — the layered-dismiss convention (Esc is dead for the
	// sections' own editors while they hold focus; this listener is the
	// dialog's outer layer).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && openMenus === 0) {
				// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): claim
				// at the document level — the window chain (dictation →
				// abort) must not also act. One Esc, one action.
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose, openMenus]);

	/** ONE writer for the whole dialog: PUT the whole section, keep the
	 *  record mirror in sync, surface route errors inline (a 400 is a
	 *  schema mistake caught by the validation surface). */
	const write = useCallback(
		async (section: WritableSection, body: object) => {
			// A failure in another section keeps its own Try again.
			setError((current) => (current?.section === section ? null : current));
			let res: Response;
			try {
				res = await fetch(`/api/settings/${section}`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				});
			} catch {
				setError({ section, body, detail: "The server could not be reached." });
				return;
			}
			if (!res.ok) {
				const detail = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				setError({ section, body, detail: `${res.status}${detail.error ? `: ${detail.error}` : ""}` });
				return;
			}
// Server truth, never the request body (fix wave, owner repro):
			// the models section clamps pinned thinking levels on write
			// (bd68486) — a swap that rides an unsupported level lands
			// CLAMPED in the record, and the writing surface must show the
			// stored value in this same interaction, not the optimistic one.
			const stored = (
				(await res.json().catch(() => null)) as { settings?: UserSettings } | null
			)?.settings;
			setRecord(
				(prev) =>
					stored ?? ({ ...(prev ?? {}), [section]: body }) as UserSettings,
			);
			notifySettingsSaved(section);
			if (section === "appearance")
				onAppearanceChange(body as AppearanceSettings);
		},
		[onAppearanceChange],
	);

	return (
		<div
			role={inModal ? undefined : "dialog"}
			aria-modal={inModal ? undefined : true}
			aria-label={inModal ? undefined : "Settings"}
			data-testid="settings-dialog"
			className="settings-dialog-pop flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
			onClick={(e) => e.stopPropagation()}
		>
			{/* Shared header height and section breadcrumb. */}
			<header className="flex h-13 shrink-0 items-center gap-3 px-5 sm:px-6">
				<span className="text-sm text-muted-foreground">Settings</span>
				<span aria-hidden="true" className="text-muted-foreground">/</span>
				<span className="truncate text-sm font-medium text-foreground">{activeSection.label}</span>
				<Hint
						// Esc closes the dialog (its own listener) — surface it.
						label="Close"
						binding="escape"
						side="left"
					>
						<button
					type="button"
					aria-label="Close settings"
					data-testid="settings-close"
					className="ui-icon-button ml-auto"
					onClick={onClose}
				>
					<XIcon aria-hidden="true" className="mx-auto size-4" />
				</button>
					</Hint>
			</header>

			<div className="flex min-h-0 flex-1 flex-col sm:flex-row">
				{/* Searchable categories; horizontal navigation on narrow screens. */}
				<nav
					aria-label="Settings sections"
					data-testid="settings-nav"
					className="flex min-h-0 shrink-0 flex-col gap-3 bg-background p-3 sm:w-56 sm:p-4"
				>
					<label className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-muted-foreground pointer-coarse:h-11">
						<SearchIcon aria-hidden="true" className="size-4 shrink-0" />
						<input
							type="search"
							name="settings-search"
							autoComplete="off"
							aria-label="Search settings"
							data-testid="settings-search"
							placeholder="Search settings"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && results[0]) {
									event.preventDefault();
									chooseResult(results[0]);
								}
								// Escape clears the search first, the innermost layer.
								if (event.key === "Escape" && search) {
									event.preventDefault();
									event.stopPropagation();
									setSearch("");
								}
							}}
							className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
						/>
					</label>
					{search.trim() ? (
						<SearchResults query={search} results={results} onChoose={chooseResult} />
					) : (
						<div className="-m-1 flex gap-1 overflow-x-auto p-1 sm:flex-col">
							{SECTIONS.map((s) => (
								<button
									key={s.id}
									type="button"
									data-testid={`settings-nav-${s.id}`}
									aria-current={active === s.id}
									className={cn("flex min-h-10 shrink-0 items-center gap-3 rounded-md px-3 py-2 text-left font-ui text-sm transition-colors", active === s.id ? "bg-accent text-foreground" : "text-ink-2 hover:bg-accent hover:text-foreground")}
									onClick={() => setActive(s.id)}
								>
									<s.icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
									{s.label}
								</button>
							))}
						</div>
					)}
</nav>

				{/* Content column — one section at a time, this scrolls — and
				    LOCKS while any MenuShell is open (owner ruling: no
				    scrolling with a dropdown down; MenuShell announces
				    open/close, the count keeps overlap honest). Scrollbars are
				    hidden globally; the lock intercepts wheel/touch so nothing
				    moves while a menu is open. */}
				<div
					ref={contentRef}
					className="min-w-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]"
					data-testid="settings-content"
				>
					{/* Stays in view however far down the failed control was. */}
					{error && (
						<div className="sticky top-0 z-10 mx-auto w-full max-w-5xl bg-background px-5 pt-3 sm:px-8">
							<SettingsFailure
								testid="settings-error"
								retryTestid="settings-error-retry"
								detailsTestid="settings-error-details"
								message={`Your ${SECTION_WORDS[error.section]} settings could not be saved.`}
								detail={error.detail}
								onRetry={() => void write(error.section, error.body)}
							/>
						</div>
					)}
					{record === undefined ? (
						<SettingsSection title={activeSection.label}>
							<SettingsRowsSkeleton label="Loading settings…" />
						</SettingsSection>
					) : record === null ? (
						<SettingsSection title={activeSection.label}>
							<SettingsFailure
								testid="settings-load-error"
								retryTestid="settings-load-retry"
								message="Settings could not be loaded."
								onRetry={() => setLoadRequest((request) => request + 1)}
							/>
						</SettingsSection>
					) : (
						<div>
							{active === "general" && (
								<SettingsSection
									title="General"
									testid="section-general"
								>
									<SettingsGroup>
<UpdateSettings
										autoUpdate={record.general?.autoUpdate ?? true}
										onAutoUpdateChange={(on) =>
											void write("general", { ...record.general, autoUpdate: on })
										}
									/>
</SettingsGroup>
								</SettingsSection>
							)}
							{active === "keys" && (
								<SettingsSection title="Providers" testid="section-keys">
									<KeysSection initialRow={jump.row ?? undefined} rowRequest={jump.request} />
								</SettingsSection>
							)}
							{active === "agent" && (
								<SettingsSection
									title="Agent"
									testid="section-agent"
								>
									<AgentSection
										agent={record.agent}
										models={record.models}
										graph={record.graph}
										compaction={record.compaction}
										onModelsChange={(next: ModelsSettings) =>
											void write("models", next)
										}
										onSectionChange={(next: AgentSettings) =>
											void write("agent", next)
										}
										onCompactionChange={(next: CompactionSettings) =>
											void write("compaction", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "appearance" && (
								<SettingsSection
									title="Appearance"
									testid="section-appearance"
								>
									<AppearanceSection
										appearance={record.appearance}
										onSectionChange={(next: AppearanceSettings) =>
											void write("appearance", next)
										}
									/>
								</SettingsSection>
							)}
							{active === "graph" && (
								<SettingsSection
									title="Graph"
									testid="section-graph"
								>
									<SettingsGroup>
<GraphSection
										graph={record.graph}
										onSectionChange={(next: GraphSettings) =>
											void write("graph", next)
										}
									/>
</SettingsGroup>
									{/* Display (feature 002): moved here from the gear over the graph. */}
									<SettingsGroup label="Display" testid="graph-group-display">
										<div className="py-4"><GraphDisplaySection /></div>
									</SettingsGroup>
								</SettingsSection>
							)}
							{active === "keyboard" && (
								<SettingsSection
									title="Keyboard"
									hint="Stored on this device"
									testid="section-keyboard"
								>
									<KeyboardSection />
								</SettingsSection>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

/** Matches under their category headings; choosing one jumps to the row. */
function SearchResults({ query, results, onChoose }: { query: string; results: SettingsIndexEntry[]; onChoose: (entry: SettingsIndexEntry) => void }) {
	if (results.length === 0) return <p role="status" data-testid="settings-search-empty" className="px-2 text-sm text-muted-foreground">Nothing matches {query}</p>;
	return (
		<div data-testid="settings-search-results" className="-m-1 flex max-h-[40dvh] min-h-0 flex-col gap-3 overflow-y-auto p-1 sm:max-h-none">
			<p role="status" className="sr-only">{results.length === 1 ? "1 setting found" : `${results.length} settings found`}</p>
			{SECTIONS.map((section) => {
				const hits = results.filter((entry) => entry.section === section.id);
				if (hits.length === 0) return null;
				return (
					<div key={section.id} className="flex flex-col gap-0.5">
						<h3 className="flex items-center gap-2 px-2 pb-1 text-sm text-muted-foreground">
							<section.icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
							{section.label}
						</h3>
						{hits.map((entry) => (
							<button
								key={entry.row}
								type="button"
								data-testid={`settings-result-${entry.row}`}
								className="flex min-h-10 w-full flex-col justify-center rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent pointer-coarse:min-h-11"
								onClick={() => onChoose(entry)}
							>
								{entry.label}
								{entry.hint && <span className="line-clamp-1 text-muted-foreground">{entry.hint}</span>}
							</button>
						))}
					</div>
				);
			})}
		</div>
	);
}
