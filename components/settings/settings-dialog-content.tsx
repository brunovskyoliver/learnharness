"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Dialog } from "radix-ui";
import { BotIcon, FolderIcon, KeyboardIcon, NetworkIcon, PaletteIcon, SearchIcon, Settings2Icon, KeyRoundIcon, XIcon } from "lucide-react";
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
import { SettingsSection } from "./controls.tsx";
import { UpdateSettings } from "./update-settings.tsx";
import { AgentSection } from "./agent-section.tsx";
import type { ModelsSettings } from "@/src/core";
import { MENU_CLOSE_EVENT, MENU_OPEN_EVENT, MenuPortalContext } from "@/components/menu-shell";
import { notifySettingsSaved } from "@/components/settings-signal";
import { KeysSection } from "./keys-section.tsx";
import { Hint } from "@/components/ui/hint";
import { AppearanceSection, GraphSection } from "./appearance-section.tsx";
import { KeyboardSection } from "./keyboard-section.tsx";
import { FilesSection } from "./files-section.tsx";

/** Owner (2026-09-20): hints earn their place — mechanics-explaining
 *  prose is out; only the keyboard note stays (storage location is a
 *  real question users ask). */
const SECTIONS = [
	{ id: "keys", icon: KeyRoundIcon, label: "Providers" },
	{ id: "agent", icon: BotIcon, label: "Agent" },
	{ id: "appearance", icon: PaletteIcon, label: "Appearance" },
	{ id: "graph", icon: NetworkIcon, label: "Graph" },
	{ id: "keyboard", icon: KeyboardIcon, label: "Keyboard", hint: "Stored on this device" },
	/** Hosted only: the upload folder the agent's file tools read. */
	{ id: "files", icon: FolderIcon, label: "Files" },
	{ id: "general", icon: Settings2Icon, label: "General" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsDialog({
	onClose,
	initialSection,
	initialRow,
	hosted,
	returnFocusElement,
}: {
	onClose: () => void;
	initialSection: SectionId;
	/** The keys-section row to unfold (see DialogContext above). */
	initialRow: string | null;
	hosted: boolean;
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
				<Dialog.Overlay className="fixed inset-0 z-50 bg-background/80" data-testid="settings-backdrop" {...backdropDismiss} />
				<Dialog.Content
					ref={setPortalContainer}
					data-lh-modal-content
					aria-describedby={undefined}
					className="fixed inset-3 z-50 overflow-hidden rounded-xl border border-border bg-background shadow-2xl outline-none sm:inset-6 lg:inset-x-[6vw] lg:inset-y-[5vh]"
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
						<SettingsDialogBody onClose={onClose} initialSection={initialSection} initialRow={initialRow} hosted={hosted} inModal />
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
	hosted = false,
	inModal = false,
}: {
	onClose: () => void;
	/** Shows the hosted-only sections (Files). */
	hosted?: boolean;
	inModal?: boolean;
	initialSection?: SectionId;
	/** The keys row to unfold on arrival (null = none). While-open
	 *  retargets follow it exactly like initialSection below. */
	initialRow?: string | null;
}) {
	const { onAppearanceChange } = useAppearance();
	const [record, setRecord] = useState<UserSettings | null | undefined>(
		undefined,
	);
	const [error, setError] = useState<string | null>(null);
	// MenuShell open-count — drives the content column's scroll lock.
	const [openMenus, setOpenMenus] = useState(0);
	const contentRef = useRef<HTMLDivElement | null>(null);
	// Scroll-lock (fix wave, owner ruling: the scrollbar MAY stay,
	// scrolling must NOT happen, nothing may move): the content column
	// keeps overflow-y-auto — the scrollbar and every width stay exactly
	// as they are — and while any MenuShell is open, non-passive wheel +
	// touchmove listeners on the column preventDefault. React attaches
	// synthetic wheel/touch passively at the root, so this needs the
	// native-listener ref seam.
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
	const activeSection = SECTIONS.find((section) => section.id === active) ?? SECTIONS[0];
	// A deep-link fired while the dialog is ALREADY open (first exercised by
	// the wave-6 embedding picker's "Add a provider key first…" link — the
	// picker itself died with wave 7, the mechanism is general) changes
	// initialSection under our feet — follow it, or the link silently does
	// nothing.
	useEffect(() => {
		setActive(initialSection);
	}, [initialSection]);

	// Fetch once per dialog mount. 200 {settings: null} is FIRST BOOT
	// (no record = factory everything), not a failure — the error state is
	// a non-200 or a network throw only.
	useEffect(() => {
		fetch("/api/settings")
			.then((r) =>
				r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)),
			)
			.then((body: { settings: UserSettings | null }) =>
				setRecord(body.settings ?? { version: CURRENT_SETTINGS_VERSION }),
			)
			.catch(() => setRecord(null));
	}, []);

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
		async (
			section: "general" | "agent" | "models" | "appearance" | "graph" | "compaction",
			body: object,
		) => {
			setError(null);
			const res = await fetch(`/api/settings/${section}`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const detail = (await res.json().catch(() => ({}))) as {
					error?: string;
				};
				setError(`${section}: ${detail.error ?? res.status}`);
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
			<header className="flex h-13 shrink-0 items-center gap-3 border-b border-border px-5 sm:px-6">
				<span className="text-sm text-muted-foreground">Settings</span>
				<span aria-hidden="true" className="text-muted-foreground">/</span>
				<span className="truncate text-sm font-medium">{activeSection.label}</span>
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
					className="ml-auto size-7 rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
					className="flex shrink-0 flex-col gap-3 border-b border-border bg-card p-3 sm:w-56 sm:border-r sm:border-b-0 sm:p-4"
				>
					<label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-muted-foreground">
						<SearchIcon aria-hidden="true" className="size-4 shrink-0" />
						<input type="search" aria-label="Search settings categories" placeholder="Search settings" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
					</label>
					<div className="flex gap-1 overflow-x-auto sm:flex-col">
					{SECTIONS.filter((s) => (hosted || s.id !== "files") && s.label.toLowerCase().includes(search.toLowerCase())).map((s) => (
						<button
							key={s.id}
							type="button"
							data-testid={`settings-nav-${s.id}`}
							aria-current={active === s.id}
							className={cn("flex min-h-10 shrink-0 items-center gap-3 rounded-md px-3 py-2 text-left font-ui text-sm transition-colors", active === s.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
							onClick={() => setActive(s.id)}
						>
							<s.icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
							{s.label}
						</button>
					))}
					</div>
					{!SECTIONS.some((s) => (hosted || s.id !== "files") && s.label.toLowerCase().includes(search.toLowerCase())) && <p role="status" className="px-2 text-sm text-muted-foreground">No categories found.</p>}
				</nav>

				{/* Content column — one section at a time, this scrolls — and
				    LOCKS while any MenuShell is open (owner ruling: no
				    scrolling with a dropdown down; MenuShell announces
				    open/close, the count keeps overlap honest). The lock
				    intercepts wheel/touch instead of hiding the scrollbar —
				    nothing may shift when the lock engages. */}
				<div
					ref={contentRef}
					className="min-w-0 flex-1 overflow-y-auto"
					data-testid="settings-content"
				>
					{error && (
						<p
							role="alert"
							className="m-4 rounded-sm border border-destructive/40 px-3 py-2 text-xs text-destructive"
							data-testid="settings-error"
						>
							{error}
						</p>
					)}
					{record === undefined ? (
						<p className="px-6 py-5 text-xs text-muted-foreground/70">
							Loading settings…
						</p>
					) : record === null ? (
						<p className="px-6 py-5 text-xs text-muted-foreground/70">
							Settings could not be loaded — refresh to retry.
						</p>
					) : (
						<div>
							{active === "general" && (
								<SettingsSection
									title="General"
									testid="section-general"
								>
									<UpdateSettings
										autoUpdate={record.general?.autoUpdate ?? true}
										onAutoUpdateChange={(on) =>
											void write("general", { ...record.general, autoUpdate: on })
										}
									/>
								</SettingsSection>
							)}
							{active === "files" && hosted && (
								<SettingsSection title="Files" testid="section-files">
									<FilesSection />
								</SettingsSection>
							)}
							{active === "keys" && (
								<SettingsSection title="Providers" testid="section-keys">
									<KeysSection initialRow={initialRow ?? undefined} />
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
									<GraphSection
										graph={record.graph}
										onSectionChange={(next: GraphSettings) =>
											void write("graph", next)
										}
									/>
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
