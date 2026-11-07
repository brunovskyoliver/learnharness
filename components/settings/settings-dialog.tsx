"use client";

/**
 * The one settings modal for both modes (feature 025, T041). Every caller
 * opens it through `open(section?, row?, trigger?)`: Study's sidebar footer,
 * the palette, Mod+, (both modes), the Electron menu (General), Notebook's
 * sidebar rows, corner hint, threads and chat. Notebook registers its live
 * preferences and reviewers while it is mounted, so Customize and Reviewers
 * change the open note at once; in Study the modal reads and writes the same
 * stored `notebook` section itself.
 */
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChatGPTUIProvider } from "./chatgpt-connection";
import { NativeSubscriptionUIProvider } from "./subscription-connections";
import type { NotebookPreferences, NotebookReviewerView } from "@/components/notebook/nb-shared";

/** The modal's pages, in nav order (ui-contract "Settings nav"). */
export const SETTINGS_SECTIONS = ["customize", "reviewers", "keys", "agent", "graph", "keyboard", "general"] as const;
export type SectionId = (typeof SETTINGS_SECTIONS)[number];

/** Section names callers still use: Notebook's "models" is the Agent page; the old Appearance is folded into Customize. */
const SECTION_ALIASES: Record<string, SectionId> = { models: "agent", appearance: "customize" };

/** A caller's section name as a page, or null when it names none. */
export function settingsSectionOf(section: string | undefined): SectionId | null {
	if (!section) return null;
	if ((SETTINGS_SECTIONS as readonly string[]).includes(section)) return section as SectionId;
	return SECTION_ALIASES[section] ?? null;
}

/** What a mounted Notebook hands the modal (its live state; see NotebookApp). */
export interface NotebookSettingsSource {
	/** Notebook's root: the modal portals there so it stacks over the sidebar. */
	root: HTMLElement | null;
	preferences: NotebookPreferences;
	failed: boolean;
	update: (patch: Partial<NotebookPreferences>) => Promise<boolean>;
	retry: () => Promise<boolean>;
	reviewers: readonly NotebookReviewerView[];
	saveReviewers: (next: readonly NotebookReviewerView[]) => Promise<boolean>;
}

interface SettingsDialogValue {
	open: (section?: string, row?: string, trigger?: HTMLElement) => void;
	hosted: boolean;
	/** The modal is open (Notebook's own shortcuts stay out from under it). */
	shown: boolean;
	/** Notebook's live settings while it is mounted (null in Study). */
	notebook: NotebookSettingsSource | null;
	registerNotebook: (source: NotebookSettingsSource | null) => void;
}

const SettingsDialog = lazy(() => import("./settings-dialog-content"));
const DialogContext = createContext<SettingsDialogValue>({ open: () => {}, hosted: false, shown: false, notebook: null, registerNotebook: () => {} });

/** The providers stay mounted; the settings editor loads only when opened. */
export function SettingsDialogProvider({ children, hosted = false }: { children: ReactNode; hosted?: boolean }) {
	const [show, setShow] = useState(false);
	const [landOn, setLandOn] = useState<SectionId>("keys");
	const [landOnRow, setLandOnRow] = useState<string | null>(null);
	const [notebook, registerNotebook] = useState<NotebookSettingsSource | null>(null);
	const inNotebook = useRef(false);
	inNotebook.current = notebook !== null;
	const opener = useRef<HTMLElement | null>(null);
	const open = useCallback((section?: string, row?: string, trigger?: HTMLElement) => {
		if (trigger) opener.current = trigger;
		else if (!document.activeElement?.closest("[data-lh-modal-content]")) opener.current = document.activeElement as HTMLElement | null;
		// Each mode keeps its own first page: Customize in Notebook, Providers in Study.
		setLandOn(settingsSectionOf(section) ?? (inNotebook.current ? "customize" : "keys"));
		setLandOnRow(row ?? null);
		setShow(true);
	}, []);
	useEffect(() => window.lh?.onOpenSettings?.((section) => open(section)), [open]);
	const close = useCallback(() => setShow(false), []);
	const value = useMemo<SettingsDialogValue>(() => ({ open, hosted, shown: show, notebook, registerNotebook }), [open, hosted, show, notebook]);
	return (
		<ChatGPTUIProvider><NativeSubscriptionUIProvider><DialogContext.Provider value={value}>
			{children}
			{show && <Suspense fallback={null}><SettingsDialog onClose={close} initialSection={landOn} initialRow={landOnRow} returnFocusElement={opener.current} /></Suspense>}
		</DialogContext.Provider></NativeSubscriptionUIProvider></ChatGPTUIProvider>
	);
}

export function useSettingsDialog() { return useContext(DialogContext); }
