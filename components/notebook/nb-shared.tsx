"use client";

/**
 * What Notebook's parts share (feature 024): the root element (menus and
 * dialogs portal into it so they keep the Notebook tokens), the platform's
 * key glyphs, the sidebar's open state and the note's save state.
 */
import { createContext, useContext } from "react";
import type { SaveStatus } from "@/components/library/page-draft";
import type { LibraryList } from "./use-notebook-data";
import type { NotebookAppearance, NotebookInk, NotebookLayout, NotebookLettering, NotebookPace, NotebookStartMode, NotebookTextSize } from "@/src/core";

export interface NotebookPreferences {
	startMode: NotebookStartMode;
	pointerInk: boolean;
	appearance: NotebookAppearance;
	textSize: NotebookTextSize;
	lettering: NotebookLettering;
	ink: NotebookInk;
	pace: NotebookPace;
	layout: NotebookLayout;
}

/** What the corner hint says about this note's automatic reading (ui-contract "Chrome"). */
export type ReadingStatus =
	| { state: "running"; runId: string; phase: "reading" | "writing" | "drawing" }
	| { state: "refused"; reason: "models" | "key"; provider?: string }
	| { state: "failed"; retry: () => void }
	| null;

export interface NotebookReviewerView { id: string; name: string; instructions: string; seeded?: true }

/** The settings modal's two pages (ui-contract "Settings modal" nav). */
export type SettingsTab = "customize" | "reviewers";

/** How the sidebar was opened: a hover-open closes when the pointer leaves. */
export type SidebarOpen = { via: "click" | "hover" | "key"; search: boolean } | null;

export interface NotebookShared {
	root: HTMLElement | null;
	mac: boolean;
	noteId: string;
	startMode: NotebookStartMode;
	reviewers: readonly NotebookReviewerView[];
	/** Stores the whole reviewer list (PUT the notebook section); shown at once, false when it didn't save. */
	saveReviewers: (next: readonly NotebookReviewerView[]) => Promise<boolean>;
	/** Opens the settings modal on its Reviewers page. */
	openReviewers: () => void;
	/** Opens the settings modal (Mod+,), on Customize unless told otherwise. */
	openSettings: (tab?: SettingsTab) => void;
	/** Links (sidebar footer): closes the sidebar and opens the Links panel. */
	openLinks: () => void;
	/** The Links panel is open (the page slides aside as for the chat). */
	linksOpen: boolean;
	/** Hosted (signed-in) mode: the footer offers Sign out. */
	hosted: boolean;
	account: string | null;
	preferences: NotebookPreferences;
	/** Applies at once and saves the `notebook` settings section; false when the save failed. */
	updatePreferences: (patch: Partial<NotebookPreferences>) => Promise<boolean>;
	/** The last preferences save failed (the settings modal says so with Try again). */
	preferencesFailed: boolean;
	/** Saves the preferences as they stand again. */
	retryPreferences: () => Promise<boolean>;
	sidebar: SidebarOpen;
	openSidebar: (via: "click" | "hover" | "key", search?: boolean) => void;
	closeSidebar: () => void;
	saveStatus: SaveStatus | null;
	setSaveStatus: (status: SaveStatus | null) => void;
	/** The Library's pages and folders (sidebar, title); null until read. */
	library: LibraryList | null;
	libraryFailed: boolean;
	refreshLibrary: () => Promise<void>;
	/** The note's automatic reading, for the corner hint. */
	reading: ReadingStatus;
	setReading: (status: ReadingStatus) => void;
	/** Says something once to screen readers (polite live region). */
	announce: (text: string) => void;
	/** Just my words (US7): every AI layer hidden, reads paused. Per browser. */
	plain: boolean;
	togglePlain: () => void;
	/** Copy this note (Mod+Shift+C): the open note's Markdown, with the notes unless Just my words is on. */
	copyNote: () => void;
	/** Export this note (Mod+Shift+E): the Export dialog. */
	openExport: () => void;
	/** The open note hands its commands here (NoteView). */
	noteCommands: { current: NoteCommands | null };
}

export interface NoteCommands { copy: () => void; openExport: () => void; makeFlashcards: () => void }

const noop = () => {};

/** The factory preferences (data-model.md "notebook"). */
export const DEFAULT_PREFERENCES: NotebookPreferences = { startMode: "thinks", pointerInk: false, appearance: "system", textSize: "default", lettering: "serif", ink: "ink", pace: "regular", layout: "both" };

/** What a part sees outside NotebookApp (and what render tests start from). */
export const DEFAULT_SHARED: NotebookShared = {
	root: null,
	mac: false,
	noteId: "",
	startMode: "thinks",
	reviewers: [],
	saveReviewers: async () => false,
	openReviewers: noop,
	openSettings: noop,
	openLinks: noop,
	linksOpen: false,
	hosted: false,
	account: null,
	preferences: DEFAULT_PREFERENCES,
	updatePreferences: async () => false,
	preferencesFailed: false,
	retryPreferences: async () => false,
	sidebar: null,
	openSidebar: noop,
	closeSidebar: noop,
	saveStatus: null,
	setSaveStatus: noop,
	library: null,
	libraryFailed: false,
	refreshLibrary: async () => {},
	reading: null,
	setReading: noop,
	announce: noop,
	plain: false,
	togglePlain: noop,
	copyNote: noop,
	openExport: noop,
	noteCommands: { current: null },
};

export const NotebookContext = createContext<NotebookShared>(DEFAULT_SHARED);

export const useNotebook = () => useContext(NotebookContext);

export { isMod, keyLabel, saveStateLine, useArrowChoice, useIsMac } from "@/components/paper/shared";

/** Names the Library gives a new note; the title shows them as its placeholder. */
export const UNTITLED_NOTE = "Untitled note";
export const isUntitledName = (name: string): boolean => /^Untitled note( \(\d+\))?$/.test(name);
