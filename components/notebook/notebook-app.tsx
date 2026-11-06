"use client";

/**
 * Notebook's root (feature 024, US1). The `.nb-root` wrapper carries the
 * theme, text size, lettering and ink attributes and the route's font
 * variables; inside it sit the fixed paper grain, the top-left menu and
 * wordmark, the overlay sidebar, the page sheet with the note, and the
 * corner hint. Opening a note remembers it as the one Notebook reopens
 * (`notebook.lastNoteId`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeSettingsKey } from "@/components/interface-switch";
import type { SaveStatus } from "@/components/library/page-draft";
import type { NotebookStartMode } from "@/src/core";
import { isMod, keyLabel, NotebookContext, useIsMac, type NotebookPreferences, type NotebookReviewerView, type NotebookShared, type SidebarOpen } from "./nb-shared";
import { MenuGlyph, Wordmark } from "./chrome";
import { NoteView } from "./note-view";
import { OverlaySidebar } from "./overlay-sidebar";
import { useLibraryList } from "./use-notebook-data";

export type { NotebookPreferences } from "./nb-shared";

/** Hovering the left edge this long opens the sidebar (ui-contract.md). */
const EDGE_HOVER_MS = 250;
const DARK = "(prefers-color-scheme: dark)";

/** "system" until mounted (CSS follows the OS then), afterwards the resolved theme, following changes. */
function useResolvedTheme(appearance: NotebookPreferences["appearance"]): "light" | "dark" | "system" {
	const [systemDark, setSystemDark] = useState<boolean | null>(null);
	useEffect(() => {
		const query = window.matchMedia(DARK);
		const sync = () => setSystemDark(query.matches);
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, []);
	if (appearance !== "system") return appearance;
	return systemDark === null ? "system" : systemDark ? "dark" : "light";
}

export function NotebookApp({ note, fontClasses, preferences, startMode = "thinks", reviewers = [], lastNoteId, account = null }: {
	note: { id: string; name: string };
	fontClasses: string;
	preferences: NotebookPreferences;
	startMode?: NotebookStartMode;
	reviewers?: readonly NotebookReviewerView[];
	lastNoteId: string | null | undefined;
	account?: string | null;
}) {
	const mac = useIsMac();
	const [root, setRoot] = useState<HTMLDivElement | null>(null);
	const [prefs, setPrefs] = useState(preferences);
	// A new server render (navigation, refresh) brings the stored values.
	const incoming = JSON.stringify(preferences);
	useEffect(() => { setPrefs(JSON.parse(incoming) as NotebookPreferences); }, [incoming]);
	const theme = useResolvedTheme(prefs.appearance);
	const [sidebar, setSidebar] = useState<SidebarOpen>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
	const { list: library, failed: libraryFailed, refresh: refreshLibrary } = useLibraryList();
	const menuButton = useRef<HTMLButtonElement>(null);
	const edgeTimer = useRef<number | null>(null);

	useEffect(() => {
		if (lastNoteId === note.id) return;
		void writeSettingsKey("notebook", { lastNoteId: note.id }).catch(() => {
			/* Notebook then reopens on the newest page instead */
		});
	}, [note.id, lastNoteId]);

	const updatePreferences = useCallback((patch: Partial<NotebookPreferences>) => {
		setPrefs((current) => ({ ...current, ...patch }));
		void writeSettingsKey("notebook", patch).catch(() => {
			console.error("[notebook] could not save the reading settings");
		});
	}, []);
	const openSidebar = useCallback((via: "click" | "hover" | "key", search = false) => setSidebar({ via, search }), []);
	const closeSidebar = useCallback(() => setSidebar(null), []);

	// Mod+\ toggles the sidebar and Mod+K opens it on the search, from anywhere in Notebook.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || !isMod(event, mac) || event.shiftKey) return;
			if (event.key === "\\") {
				event.preventDefault();
				setSidebar((open) => (open ? null : { via: "key", search: false }));
			} else if (event.key.toLowerCase() === "k") {
				event.preventDefault();
				setSidebar({ via: "key", search: true });
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [mac]);

	useEffect(() => () => { if (edgeTimer.current) window.clearTimeout(edgeTimer.current); }, []);
	const edgeEnter = (event: React.PointerEvent) => {
		if (event.pointerType !== "mouse" || !window.matchMedia("(pointer: fine)").matches) return;
		if (edgeTimer.current) window.clearTimeout(edgeTimer.current);
		edgeTimer.current = window.setTimeout(() => setSidebar((open) => open ?? { via: "hover", search: false }), EDGE_HOVER_MS);
	};
	const edgeLeave = () => {
		if (edgeTimer.current) window.clearTimeout(edgeTimer.current);
		edgeTimer.current = null;
	};

	const shared = useMemo<NotebookShared>(() => ({
		root, mac, noteId: note.id, startMode, reviewers, account, preferences: prefs, updatePreferences,
		sidebar, openSidebar, closeSidebar, saveStatus, setSaveStatus, library, libraryFailed, refreshLibrary,
	}), [root, mac, note.id, startMode, reviewers, account, prefs, updatePreferences, sidebar, openSidebar, closeSidebar, saveStatus, library, libraryFailed, refreshLibrary]);

	return (
		<NotebookContext.Provider value={shared}>
			<div
				ref={setRoot}
				className={`nb-root ${fontClasses}`}
				data-testid="notebook-root"
				data-nb-theme={theme}
				data-nb-text-size={prefs.textSize}
				data-nb-lettering={prefs.lettering}
				data-nb-ink={prefs.ink}
				data-note-id={note.id}
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
				<div className="nb-edge" aria-hidden="true" data-testid="nb-edge" onPointerEnter={edgeEnter} onPointerLeave={edgeLeave} />
				<OverlaySidebar returnFocus={menuButton} />
				<div className="nb-sheet" data-aside={sidebar ? "" : undefined} inert={sidebar ? true : undefined}>
					<NoteView key={note.id} note={note} />
				</div>
				<p className="nb-corner-hint" data-testid="nb-corner-hint">{`${keyLabel("mod+k", mac)} finds a note`}</p>
			</div>
		</NotebookContext.Provider>
	);
}
