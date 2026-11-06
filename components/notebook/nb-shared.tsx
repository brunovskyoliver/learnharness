"use client";

/**
 * What Notebook's parts share (feature 024): the root element (menus and
 * dialogs portal into it so they keep the Notebook tokens), the platform's
 * key glyphs, the sidebar's open state and the note's save state.
 */
import { createContext, useContext, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SaveStatus } from "@/components/library/page-draft";
import type { LibraryList } from "./use-notebook-data";
import type { NotebookAppearance, NotebookInk, NotebookLettering, NotebookStartMode, NotebookTextSize } from "@/src/core";

export interface NotebookPreferences {
	appearance: NotebookAppearance;
	textSize: NotebookTextSize;
	lettering: NotebookLettering;
	ink: NotebookInk;
}

export interface NotebookReviewerView { id: string; name: string; instructions: string }

/** How the sidebar was opened: a hover-open closes when the pointer leaves. */
export type SidebarOpen = { via: "click" | "hover" | "key"; search: boolean } | null;

export interface NotebookShared {
	root: HTMLElement | null;
	mac: boolean;
	noteId: string;
	startMode: NotebookStartMode;
	reviewers: readonly NotebookReviewerView[];
	account: string | null;
	preferences: NotebookPreferences;
	/** Applies at once and saves the `notebook` settings section (Phase 10's settings modal). */
	updatePreferences: (patch: Partial<NotebookPreferences>) => void;
	sidebar: SidebarOpen;
	openSidebar: (via: "click" | "hover" | "key", search?: boolean) => void;
	closeSidebar: () => void;
	saveStatus: SaveStatus | null;
	setSaveStatus: (status: SaveStatus | null) => void;
	/** The Library's pages and folders (sidebar, title); null until read. */
	library: LibraryList | null;
	libraryFailed: boolean;
	refreshLibrary: () => Promise<void>;
}

const noop = () => {};

export const NotebookContext = createContext<NotebookShared>({
	root: null,
	mac: false,
	noteId: "",
	startMode: "thinks",
	reviewers: [],
	account: null,
	preferences: { appearance: "system", textSize: "default", lettering: "serif", ink: "ink" },
	updatePreferences: noop,
	sidebar: null,
	openSidebar: noop,
	closeSidebar: noop,
	saveStatus: null,
	setSaveStatus: noop,
	library: null,
	libraryFailed: false,
	refreshLibrary: async () => {},
});

export const useNotebook = () => useContext(NotebookContext);

const MAC = /Mac|iPhone|iPad|iPod/;
const subscribeNever = () => noop;

/** True on Apple platforms. The server and the first paint say false. */
export function useIsMac(): boolean {
	return useSyncExternalStore(subscribeNever, () => MAC.test(navigator.platform || navigator.userAgent), () => false);
}

/** "mod+shift+o" as ⌘⇧O on a Mac and Ctrl+Shift+O elsewhere. */
export function keyLabel(binding: string, mac: boolean): string {
	const parts = binding.split("+");
	const key = parts.pop() ?? "";
	const glyph = key === "\\" ? "\\" : key === "," ? "," : key.toUpperCase();
	if (mac) {
		const marks: Record<string, string> = { mod: "⌘", alt: "⌥", shift: "⇧" };
		return parts.map((p) => marks[p] ?? "").join("") + glyph;
	}
	const words: Record<string, string> = { mod: "Ctrl", alt: "Alt", shift: "Shift" };
	return [...parts.map((p) => words[p] ?? p), glyph].join("+");
}

/** The sidebar's save line (ui-contract.md "Overlay sidebar"). */
export function saveStateLine(status: SaveStatus | null): string {
	if (status === "saving") return "Saving…";
	if (status === "failed") return "Not saved. Your text is kept in this browser.";
	return "All notes saved";
}

/** Ctrl on other platforms, Cmd on a Mac; never with Alt. */
export const isMod = (event: KeyboardEvent | ReactKeyboardEvent, mac: boolean): boolean => (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.altKey;

/** Names the Library gives a new note; the title shows them as its placeholder. */
export const UNTITLED_NOTE = "Untitled note";
export const isUntitledName = (name: string): boolean => /^Untitled note( \(\d+\))?$/.test(name);
