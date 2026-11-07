"use client";

/**
 * The settings modal (feature 025, T040-T042): Notebook's modal shell
 * (components/paper/settings-shell.tsx) in both modes, with Customize and
 * Reviewers first and Study's categories after them. Search settings at the
 * top of the nav finds every row in every page; choosing a result opens its
 * page, scrolls to the row, focuses its control and shows a brief shelf
 * highlight (research R12). Every change saves at once; a refused save stays
 * pinned under the page title with Show details and Try again.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import {
	CURRENT_SETTINGS_VERSION,
	resolveSettings,
	type AgentSettings,
	type CompactionSettings,
	type GraphSettings,
	type ModelsSettings,
	type UserSettings,
} from "@/src/core";
import { usePaperAppearance } from "@/components/paper/appearance";
import { SettingsPage, SettingsShellBody, SettingsShellFrame, SettingsTitle, type SettingsNavItem } from "@/components/paper/settings-shell";
import { MENU_CLOSE_EVENT, MENU_OPEN_EVENT, MenuPortalContext } from "@/components/menu-shell";
import { notifySettingsSaved } from "@/components/settings-signal";
import { CustomizePage } from "@/components/notebook/settings-modal";
import { ReviewersPage } from "@/components/notebook/reviewers";
import type { NotebookPreferences, NotebookReviewerView } from "@/components/notebook/nb-shared";
import { SettingsFailure, SettingsGroup, SettingsRowsSkeleton, SettingsSection } from "./controls.tsx";
import { useSettingsDialog, type NotebookSettingsSource, type SectionId } from "./settings-dialog.tsx";
import { searchSettings, type SettingsIndexEntry } from "./settings-index";
import { UpdateSettings } from "./update-settings.tsx";
import { AgentSection } from "./agent-section.tsx";
import { KeysSection } from "./keys-section.tsx";
import { GraphSection } from "./graph-section.tsx";
import { GraphDisplaySection } from "./graph-display-section.tsx";
import { KeyboardSection } from "./keyboard-section.tsx";

export type { SectionId } from "./settings-dialog.tsx";

/** The nav (ui-contract "Settings nav"); Notebook's two pages keep their test ids. */
export const SETTINGS_NAV: readonly (SettingsNavItem & { value: SectionId; hint?: string })[] = [
	{ value: "customize", label: "Customize", testid: "nb-settings-nav-customize" },
	{ value: "reviewers", label: "Reviewers", testid: "nb-settings-nav-reviewers" },
	{ value: "keys", label: "Providers", testid: "settings-nav-keys" },
	{ value: "agent", label: "Agent", testid: "settings-nav-agent" },
	{ value: "graph", label: "Graph", testid: "settings-nav-graph" },
	/** Owner (2026-09-20): hints earn their place — only the keyboard note stays. */
	{ value: "keyboard", label: "Keyboard", testid: "settings-nav-keyboard", hint: "Stored on this device" },
	{ value: "general", label: "General", testid: "settings-nav-general" },
];

type WritableSection = "general" | "agent" | "models" | "graph" | "compaction";

/** Section names in words, for failed saves (contract, finding 11). */
const SECTION_WORDS: Record<WritableSection, string> = {
	general: "General",
	agent: "Agent",
	models: "Model",
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
	/** The row to land on (see the provider). */
	initialRow: string | null;
	returnFocusElement?: HTMLElement | null;
}) {
	const { notebook } = useSettingsDialog();
	const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
	const atOpen = useRef<HTMLElement | null>(null);
	const returnFocus = useRef<HTMLElement | null>(
		returnFocusElement ?? (typeof document === "undefined" ? null : document.activeElement as HTMLElement | null),
	);
	return (
		<SettingsShellFrame
			onClose={onClose}
			container={notebook?.root}
			contentRef={setPortalContainer}
			// The page's tab takes the focus (Notebook's rule), not the search field.
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				// Where the focus was as the card opened (a menu item that opened it has given the focus back by now).
				if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) atOpen.current = document.activeElement;
				const content = event.currentTarget as HTMLElement;
				(content.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? content).focus();
			}}
			onPointerDownOutside={(event) => {
				// A menu or tooltip portalled outside the card is not "outside".
				if ((event.target as Element | null)?.closest?.("[data-lh-menu], [data-lh-modal-content]")) event.preventDefault();
			}}
			onCloseAutoFocus={(event) => {
				event.preventDefault();
				const target = returnFocus.current;
				const fallback = () => document.querySelector<HTMLElement>('[aria-label="Open sidebar"]');
				requestAnimationFrame(() => {
					if (document.querySelector("[data-lh-modal-content]")) return;
					// Hint can replace its trigger subtree when its open state changes.
					const opener = target?.dataset.testid === "settings-entry"
						? document.querySelector<HTMLElement>('[data-testid="settings-entry"]')
						: target;
					const liveTarget = opener?.isConnected && opener !== document.body ? opener : atOpen.current;
					const rect = liveTarget?.getBoundingClientRect();
					if (liveTarget?.isConnected && liveTarget !== document.body && rect && rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth) liveTarget.focus();
					else if (liveTarget?.isConnected && liveTarget.isContentEditable) liveTarget.focus();
					else fallback()?.focus();
				});
			}}
		>
			<MenuPortalContext.Provider value={portalContainer}>
				<SettingsDialogBody onClose={onClose} initialSection={initialSection} initialRow={initialRow} inModal />
			</MenuPortalContext.Provider>
		</SettingsShellFrame>
	);
}

/** Customize and Reviewers in Study: the stored `notebook` section, written through the shared queue. */
function useStoredNotebookSettings(record: UserSettings | null | undefined): NotebookSettingsSource | null {
	const paper = usePaperAppearance();
	const stored = useMemo(() => (record ? resolveSettings(record).notebook : null), [record]);
	const [own, setOwn] = useState<Partial<NotebookPreferences>>({});
	const [reviewers, setReviewers] = useState<readonly NotebookReviewerView[] | null>(null);
	const [failed, setFailed] = useState(false);
	const look = paper.appearance;
	const preferences = useMemo<NotebookPreferences | null>(() => stored && ({
		startMode: stored.startMode, pointerInk: stored.pointerInk, pace: stored.pace, layout: stored.layout, ...own,
		appearance: look.theme, textSize: look.textSize, lettering: look.lettering, ink: look.ink,
	}), [stored, own, look]);
	const current = useRef(preferences);
	current.current = preferences;
	const { apply, queueWrite } = paper;
	const save = useCallback(async (patch: Record<string, unknown>) => {
		const ok = await queueWrite(patch);
		setFailed(!ok);
		return ok;
	}, [queueWrite]);
	const update = useCallback((patch: Partial<NotebookPreferences>) => {
		const { appearance: theme, textSize, lettering, ink, ...rest } = patch;
		const shared = Object.fromEntries(Object.entries({ theme, textSize, lettering, ink }).filter(([, v]) => v !== undefined));
		apply(shared, () => setOwn((now) => ({ ...now, ...rest })));
		return save(patch);
	}, [apply, save]);
	const retry = useCallback(() => save({ ...(current.current ?? {}) }), [save]);
	const list = useMemo(() => reviewers ?? stored?.reviewers.map((r) => ({ id: r.id, name: r.name, instructions: r.instructions, ...(r.seeded ? { seeded: true as const } : {}) })) ?? [], [reviewers, stored]);
	const saveReviewers = useCallback((next: readonly NotebookReviewerView[]) => {
		setReviewers(next);
		return queueWrite({ reviewers: next.map((r) => ({ id: r.id, name: r.name, instructions: r.instructions, ...(r.seeded ? { seeded: true as const } : {}) })) });
	}, [queueWrite]);
	return useMemo(() => (preferences ? { root: null, preferences, failed, update, retry, reviewers: list, saveReviewers } : null), [preferences, failed, update, retry, list, saveReviewers]);
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
	const [record, setRecord] = useState<UserSettings | null | undefined>(undefined);
	const [error, setError] = useState<SaveFailure | null>(null);
	const [loadRequest, setLoadRequest] = useState(0);
	const { hosted, notebook: liveNotebook } = useSettingsDialog();
	const storedNotebook = useStoredNotebookSettings(record);
	// A mounted Notebook hands its live state (the open note follows at once).
	const notebook = liveNotebook ?? storedNotebook;
	// MenuShell open-count — drives the page's scroll lock.
	const [openMenus, setOpenMenus] = useState(0);
	const bodyRef = useRef<HTMLDivElement | null>(null);
	// Scroll-lock (fix wave, owner ruling: scrolling must NOT happen, nothing
	// may move while a menu is open): the page keeps overflow-y-auto, and
	// non-passive wheel + touchmove listeners on it preventDefault. React
	// attaches synthetic wheel/touch passively at the root, so this needs the
	// native listeners. Menus portal into the card, outside the page.
	useEffect(() => {
		const page = bodyRef.current?.querySelector<HTMLElement>(".nb-settings-page");
		if (!page || openMenus === 0) return;
		const block = (e: Event) => e.preventDefault();
		page.addEventListener("wheel", block, { passive: false });
		page.addEventListener("touchmove", block, { passive: false });
		return () => {
			page.removeEventListener("wheel", block);
			page.removeEventListener("touchmove", block);
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
	const activeSection = SETTINGS_NAV.find((section) => section.value === active) ?? SETTINGS_NAV[2]!;
	// A deep link fired while the dialog is ALREADY open changes
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
		const root = bodyRef.current;
		const row = jump.row;
		if (!root || !row) return;
		let clear: ReturnType<typeof setTimeout> | undefined;
		const land = () => {
			const target = root.querySelector<HTMLElement>(`[data-settings-row="${CSS.escape(row)}"]`);
			if (!target) return false;
			const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
			// A card group lands on its chosen card.
			const control = target.matches(ROW_CONTROL) ? target : target.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? target.querySelector<HTMLElement>(ROW_CONTROL);
			control?.focus({ preventScroll: true });
			target.setAttribute("data-settings-jump", "");
			clear = setTimeout(() => target.removeAttribute("data-settings-jump"), ROW_HIGHLIGHT_MS);
			return true;
		};
		if (land()) return () => clearTimeout(clear);
		let landed = false;
		const observer = new MutationObserver(() => { if (!landed && land()) { landed = true; stop(); } });
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
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
			.then((body: { settings: UserSettings | null }) => setRecord(body.settings ?? { version: CURRENT_SETTINGS_VERSION }))
			.catch(() => setRecord(null));
	}, [loadRequest]);
	// Escape closes — the layered-dismiss convention. The closer listens on
	// the window's bubble phase, so every inner layer that claims the key at
	// the document (the search clearing itself, a key editor, a rebind, a
	// section menu, a connection dialog) stops it before it gets here; an
	// open MenuShell handles its own. Radix marks the key handled when it
	// sees it (its own close is ignored by the frame), so the window chain
	// (dictation → abort) leaves it alone: one Esc, one action.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || openMenus > 0) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose, openMenus]);

	/** ONE writer for Study's sections: PUT the whole section, keep the
	 *  record mirror in sync, surface route errors inline. */
	const write = useCallback(async (section: WritableSection, body: object) => {
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
			const detail = (await res.json().catch(() => ({}))) as { error?: string };
			setError({ section, body, detail: `${res.status}${detail.error ? `: ${detail.error}` : ""}` });
			return;
		}
		// Server truth, never the request body: the models section clamps
		// pinned thinking levels on write, and the surface must show the
		// stored value in this same interaction.
		const stored = ((await res.json().catch(() => null)) as { settings?: UserSettings } | null)?.settings;
		setRecord((prev) => stored ?? ({ ...(prev ?? {}), [section]: body }) as UserSettings);
		notifySettingsSaved(section);
	}, []);

	const alert = error && (
		<div className="nb-set-pinned">
			<SettingsFailure
				testid="settings-error"
				retryTestid="settings-error-retry"
				detailsTestid="settings-error-details"
				message={`Your ${SECTION_WORDS[error.section]} settings could not be saved.`}
				detail={error.detail}
				onRetry={() => void write(error.section, error.body)}
			/>
		</div>
	);

	/** Loading and a failed load, for a page that needs the record. */
	const waiting = (title: string) => record === undefined ? (
		<SettingsSection title={title}>
			<SettingsRowsSkeleton label="Loading settings…" />
		</SettingsSection>
	) : record === null ? (
		<SettingsSection title={title}>
			<SettingsFailure testid="settings-load-error" retryTestid="settings-load-retry" message="Settings could not be loaded." onRetry={() => setLoadRequest((request) => request + 1)} />
		</SettingsSection>
	) : null;

	const searchField = (
		<label className="nb-settings-search">
			<SearchIcon aria-hidden="true" className="nb-settings-search-icon" />
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
				className="nb-settings-search-input"
			/>
		</label>
	);

	return (
		<div
			ref={bodyRef}
			role={inModal ? undefined : "dialog"}
			aria-modal={inModal ? undefined : true}
			aria-label={inModal ? undefined : "Settings"}
			data-testid="settings-dialog"
			className="nb-settings-frame"
		>
			<SettingsShellBody
				items={SETTINGS_NAV}
				value={active}
				onValueChange={(value) => setActive(value as SectionId)}
				search={searchField}
				results={search.trim() ? <SearchResults query={search} results={results} onChoose={chooseResult} /> : null}
				onClose={inModal ? undefined : onClose}
			>
				<SettingsPage value="customize" testid="nb-settings-customize">
					{notebook ? (
						<CustomizePage preferences={notebook.preferences} failed={notebook.failed} onChange={(patch) => void notebook.update(patch)} onRetry={() => void notebook.retry()} alert={alert} />
					) : waiting("Customize")}
				</SettingsPage>
				<SettingsPage value="reviewers" testid="nb-settings-reviewers">
					{notebook ? (
						<>
							<SettingsTitle className="nb-sr-only">Reviewers</SettingsTitle>
							{alert}
							<ReviewersPage reviewers={notebook.reviewers} onSave={notebook.saveReviewers} />
						</>
					) : waiting("Reviewers")}
				</SettingsPage>
				{SETTINGS_NAV.slice(2).map((section) => (
					<SettingsPage key={section.value} value={section.value} testid="settings-content">
						{waiting(section.label) ?? (record && (
							<>
								{section.value === "general" && (
									<SettingsSection title="General" testid="section-general" alert={alert}>
										<SettingsGroup>
											<UpdateSettings autoUpdate={record.general?.autoUpdate ?? true} onAutoUpdateChange={(on) => void write("general", { ...record.general, autoUpdate: on })} />
										</SettingsGroup>
									</SettingsSection>
								)}
								{section.value === "keys" && (
									<SettingsSection title="Providers" testid="section-keys" alert={alert}>
										<KeysSection initialRow={jump.row ?? undefined} rowRequest={jump.request} />
									</SettingsSection>
								)}
								{section.value === "agent" && (
									<SettingsSection title="Agent" testid="section-agent" alert={alert}>
										<AgentSection
											agent={record.agent}
											models={record.models}
											graph={record.graph}
											compaction={record.compaction}
											onModelsChange={(next: ModelsSettings) => void write("models", next)}
											onSectionChange={(next: AgentSettings) => void write("agent", next)}
											onCompactionChange={(next: CompactionSettings) => void write("compaction", next)}
										/>
									</SettingsSection>
								)}
								{section.value === "graph" && (
									<SettingsSection title="Graph" testid="section-graph" alert={alert}>
										<SettingsGroup>
											<GraphSection graph={record.graph} onSectionChange={(next: GraphSettings) => void write("graph", next)} />
										</SettingsGroup>
										{/* Display (feature 002): moved here from the gear over the graph. */}
										<SettingsGroup label="Display" testid="graph-group-display">
											<div className="nb-set-display"><GraphDisplaySection /></div>
										</SettingsGroup>
									</SettingsSection>
								)}
								{section.value === "keyboard" && (
									<SettingsSection title="Keyboard" hint={section.hint} testid="section-keyboard" alert={alert}>
										<KeyboardSection />
									</SettingsSection>
								)}
							</>
						))}
					</SettingsPage>
				))}
			</SettingsShellBody>
		</div>
	);
}

/** Matches under their page names; choosing one jumps to the row. */
export function SearchResults({ query, results, onChoose }: { query: string; results: SettingsIndexEntry[]; onChoose: (entry: SettingsIndexEntry) => void }) {
	if (results.length === 0) return <p role="status" data-testid="settings-search-empty" className="nb-settings-results-empty">Nothing matches {query}</p>;
	return (
		<div data-testid="settings-search-results" className="nb-settings-results">
			<p role="status" className="sr-only">{results.length === 1 ? "1 setting found" : `${results.length} settings found`}</p>
			{SETTINGS_NAV.map((section) => {
				const hits = results.filter((entry) => entry.section === section.value);
				if (hits.length === 0) return null;
				return (
					<div key={section.value} className="nb-settings-results-group">
						<h3 className="nb-settings-results-head">{section.label}</h3>
						{hits.map((entry) => (
							<button key={entry.row} type="button" data-testid={`settings-result-${entry.row}`} className="nb-settings-result" onClick={() => onChoose(entry)}>
								<span className="nb-settings-result-label">{entry.label}</span>
								{entry.hint && <span className="nb-settings-result-hint">{entry.hint}</span>}
							</button>
						))}
					</div>
				);
			})}
		</div>
	);
}
