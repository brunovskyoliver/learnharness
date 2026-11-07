"use client";

/**
 * Notebook's root (feature 024, US1). The `.nb-root` wrapper mirrors the
 * shared Appearance (feature 025: theme, text size, lettering and ink live on
 * <html> through components/paper/appearance.tsx) as data-nb-* attributes;
 * inside it sit the fixed paper grain, the top-left menu and
 * wordmark, the overlay sidebar, the page sheet with the note, and the
 * corner hint. Opening a note remembers it as the one Notebook reopens
 * (`notebook.lastNoteId`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeSettingsKey } from "@/components/interface-switch";
import { usePaperAppearance } from "@/components/paper/appearance";
import { EdgeStrip } from "@/components/paper/overlay-sidebar";
import { SurfaceRootContext } from "@/components/paper/surface-root";
import type { SaveStatus } from "@/components/library/page-draft";
import { CornerHint } from "./corner-hint";
import { LinksPanel } from "./links-panel";
import { readJustMyWords, writeJustMyWords } from "./nb-actions";
import { isMod, NotebookContext, useIsMac, type NoteCommands, type NotebookPreferences, type NotebookReviewerView, type NotebookShared, type ReadingStatus, type SettingsTab, type SidebarOpen } from "./nb-shared";
import { MenuGlyph, Wordmark } from "./chrome";
import { NoteView } from "./note-view";
import { OverlaySidebar } from "./overlay-sidebar";
import { PointerInk } from "./pointer-ink";
import { SettingsModal } from "./settings-modal";
import { useLibraryList } from "./use-notebook-data";

export type { NotebookPreferences } from "./nb-shared";

/** Just my words' confirmation (ui-contract "Overlay sidebar"); turning it off says the notes are back. */
export const PLAIN_ON_TEXT = "Just your words. The notes are hidden, not gone.";
export const PLAIN_OFF_TEXT = "The notes are back.";

export function NotebookApp({ note, fontClasses = "", preferences, reviewers = [], lastNoteId, account = null, hosted = false }: {
	note: { id: string; name: string };
	/** Unused since feature 025 (the faces sit on <html>); kept for tests. */
	fontClasses?: string;
	/** Notebook's own preferences; theme, text size, lettering and ink come from the shared Appearance. */
	preferences: NotebookPreferences;
	reviewers?: readonly NotebookReviewerView[];
	lastNoteId: string | null | undefined;
	account?: string | null;
	hosted?: boolean;
}) {
	const mac = useIsMac();
	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const paper = usePaperAppearance();
	const [ownPrefs, setPrefs] = useState(preferences);
	// A new server render (navigation, refresh) brings the stored values.
	const incoming = JSON.stringify(preferences);
	useEffect(() => { setPrefs(JSON.parse(incoming) as NotebookPreferences); }, [incoming]);
	const look = paper.appearance;
	const prefs = useMemo<NotebookPreferences>(() => ({ ...ownPrefs, appearance: look.theme, textSize: look.textSize, lettering: look.lettering, ink: look.ink }), [ownPrefs, look]);
	const theme = paper.resolvedTheme;
	const [sidebar, setSidebar] = useState<SidebarOpen>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
	const [reading, setReading] = useState<ReadingStatus>(null);
	// The polite live region: the same words twice in a row still get said (a nonce keeps them apart).
	const [spoken, setSpoken] = useState<{ text: string; n: number }>({ text: "", n: 0 });
	const announce = useCallback((text: string) => setSpoken((s) => ({ text, n: s.n + 1 })), []);
	const { list: library, failed: libraryFailed, refresh: refreshLibrary } = useLibraryList();
	const menuButton = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (lastNoteId === note.id) return;
		void writeSettingsKey("notebook", { lastNoteId: note.id }).catch(() => {
			/* Notebook then reopens on the newest page instead */
		});
	}, [note.id, lastNoteId]);

	// Every write of the notebook section goes one after another, through the shared queue.
	const { queueWrite, apply: applyAppearance } = paper;
	const prefsRef = useRef(prefs);
	prefsRef.current = prefs;
	const [preferencesFailed, setPreferencesFailed] = useState(false);
	const savePreferences = useCallback(async (patch: Partial<NotebookPreferences>) => {
		const ok = await queueWrite(patch);
		if (!ok) console.error("[notebook] could not save the reading settings");
		setPreferencesFailed(!ok);
		return ok;
	}, [queueWrite]);
	const updatePreferences = useCallback((patch: Partial<NotebookPreferences>) => {
		const { appearance: theme, textSize, lettering, ink } = patch;
		const sharedPatch = Object.fromEntries(Object.entries({ theme, textSize, lettering, ink }).filter(([, v]) => v !== undefined));
		// The shared fields show on <html> (a theme change cross-fades); the rest in this state, in the same update.
		applyAppearance(sharedPatch, () => setPrefs((current) => ({ ...current, ...patch })));
		return savePreferences(patch);
	}, [savePreferences, applyAppearance]);
	// Try again: everything he chose here, as it stands now.
	const retryPreferences = useCallback(() => savePreferences(prefsRef.current), [savePreferences]);
	// The reviewer list lives here: the picker and the Reviewers page show a change at once.
	const [reviewerList, setReviewerList] = useState<readonly NotebookReviewerView[]>(reviewers);
	const incomingReviewers = JSON.stringify(reviewers);
	useEffect(() => { setReviewerList(JSON.parse(incomingReviewers) as NotebookReviewerView[]); }, [incomingReviewers]);
	const saveReviewers = useCallback((next: readonly NotebookReviewerView[]) => {
		setReviewerList(next);
		const list = next.map((r) => ({ id: r.id, name: r.name, instructions: r.instructions, ...(r.seeded ? { seeded: true as const } : {}) }));
		return queueWrite({ reviewers: list });
	}, [queueWrite]);
	const [settings, setSettings] = useState<SettingsTab | null>(null);
	// From a menu item or a sidebar row: the menu gives the focus back first, so closing returns it there.
	const openSettings = useCallback((tab: SettingsTab = "customize") => { window.setTimeout(() => setSettings(tab), 0); }, []);
	const openReviewers = useCallback(() => openSettings("reviewers"), [openSettings]);
	// The Links panel (sidebar footer): the sidebar closes and gives the focus to ☰, where it comes back after.
	const [linksOpen, setLinksOpen] = useState(false);
	const openLinks = useCallback(() => {
		setSidebar(null);
		window.setTimeout(() => setLinksOpen(true), 0);
	}, []);

	// Just my words: read after mount (the server can't see this browser's choice).
	const [plain, setPlain] = useState(false);
	useEffect(() => { setPlain(readJustMyWords()); }, []);
	const togglePlain = useCallback(() => {
		setPlain((on) => {
			const next = !on;
			writeJustMyWords(next);
			return next;
		});
	}, []);
	const plainSeen = useRef<boolean | null>(null);
	useEffect(() => {
		// Say it when he changes it, not when a page loads with it on.
		if (plainSeen.current !== null && plainSeen.current !== plain) announce(plain ? PLAIN_ON_TEXT : PLAIN_OFF_TEXT);
		plainSeen.current = plain;
	}, [plain, announce]);
	const noteCommands = useRef<NoteCommands | null>(null);
	const copyNote = useCallback(() => noteCommands.current?.copy(), []);
	const openExport = useCallback(() => noteCommands.current?.openExport(), []);

	const openSidebar = useCallback((via: "click" | "hover" | "key", search = false) => setSidebar({ via, search }), []);
	const closeSidebar = useCallback(() => setSidebar(null), []);

	// Mod+\ toggles the sidebar and Mod+K opens it on the search, from anywhere in Notebook.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || !isMod(event, mac)) return;
			// The settings modal is the top layer: nothing opens behind it.
			if (settings) return;
			if (event.shiftKey) {
				// Mod+Shift+H Just my words, Mod+Shift+C Copy this note, Mod+Shift+E Export (ui-contract "Overlay sidebar").
				const key = event.code === "KeyH" ? "h" : event.code === "KeyC" ? "c" : event.code === "KeyE" ? "e" : event.key.toLowerCase();
				if (key === "h") { event.preventDefault(); togglePlain(); }
				else if (key === "c") { event.preventDefault(); copyNote(); }
				else if (key === "e") { event.preventDefault(); openExport(); }
				return;
			}
			if (event.key === ",") {
				// Mod+, Settings (Study's own Mod+, stays out of Notebook routes).
				event.preventDefault();
				setSettings("customize");
			} else if (event.key === "\\") {
				event.preventDefault();
				setSidebar((open) => (open ? null : { via: "key", search: false }));
			} else if (event.key.toLowerCase() === "k") {
				event.preventDefault();
				setSidebar({ via: "key", search: true });
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [mac, togglePlain, copyNote, openExport, settings]);

	const shared = useMemo<NotebookShared>(() => ({
		root, mac, noteId: note.id, startMode: prefs.startMode, reviewers: reviewerList, saveReviewers, openReviewers, openSettings, openLinks, linksOpen, hosted, account,
		preferences: prefs, updatePreferences, preferencesFailed, retryPreferences,
		sidebar, openSidebar, closeSidebar, saveStatus, setSaveStatus, library, libraryFailed, refreshLibrary,
		reading, setReading, announce, plain, togglePlain, copyNote, openExport, noteCommands,
	}), [root, mac, note.id, reviewerList, saveReviewers, openReviewers, openSettings, openLinks, linksOpen, hosted, account, prefs, updatePreferences, preferencesFailed, retryPreferences, sidebar, openSidebar, closeSidebar, saveStatus, library, libraryFailed, refreshLibrary, reading, announce, plain, togglePlain, copyNote, openExport]);

	return (
		<NotebookContext.Provider value={shared}>
		<SurfaceRootContext.Provider value={root}>
			<div
				ref={setRoot}
				className={fontClasses ? `nb-root ${fontClasses}` : "nb-root"}
				data-testid="notebook-root"
				data-nb-theme={theme}
				data-nb-text-size={prefs.textSize}
				data-nb-lettering={prefs.lettering}
				data-nb-ink={prefs.ink}
				data-note-id={note.id}
				data-plain={plain ? "" : undefined}
			>
				<div className="nb-paper" aria-hidden="true" />
				<header className="nb-header">
					<button
						ref={menuButton}
						type="button"
						className="nb-menu-button"
						aria-label="Open notes"
						aria-expanded={sidebar !== null}
						aria-haspopup="dialog"
						data-testid="nb-menu-button"
						onClick={() => openSidebar("click")}
					>
						<MenuGlyph />
					</button>
					<Wordmark noteId={note.id} />
				</header>
				<EdgeStrip onOpen={() => setSidebar((open) => open ?? { via: "hover", search: false })} />
				<OverlaySidebar returnFocus={menuButton} />
				<div className="nb-sheet" data-aside={sidebar ? "" : undefined} inert={sidebar ? true : undefined}>
					<NoteView key={note.id} note={note} />
				</div>
				<SettingsModal tab={settings} onTabChange={setSettings} />
				<LinksPanel open={linksOpen} onOpenChange={setLinksOpen} pageId={note.id} noteName={library?.items.find((item) => item.id === note.id)?.name ?? note.name} returnFocus={menuButton} />
				{prefs.pointerInk && <PointerInk />}
				<CornerHint />
				<p className="nb-sr-only" aria-live="polite" data-testid="nb-live"><span key={spoken.n}>{spoken.text}</span></p>
			</div>
		</SurfaceRootContext.Provider>
		</NotebookContext.Provider>
	);
}
