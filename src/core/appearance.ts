/**
 * The shared Appearance (feature 025, research R2, data-model.md): one
 * theme, text size, lettering and AI ink for both modes, read from the
 * stored `notebook` section. Pure: the server layout resolves it for the
 * first paint, the client provider for every change after.
 *
 * Theme precedence: `notebook.appearance` when the key is on disk, else
 * Study's old `appearance.mode` (dark/light, its only explicit choice),
 * else `system`. The resolution writes nothing; the first change in
 * Settings writes `notebook.appearance`.
 */

import {
	NOTEBOOK_APPEARANCES,
	NOTEBOOK_INKS,
	NOTEBOOK_LETTERINGS,
	NOTEBOOK_TEXT_SIZES,
	type NotebookAppearance,
	type NotebookInk,
	type NotebookLettering,
	type NotebookTextSize,
} from "./settings.ts";

export interface SharedAppearance {
	theme: NotebookAppearance;
	textSize: NotebookTextSize;
	lettering: NotebookLettering;
	ink: NotebookInk;
}

export const DEFAULT_SHARED_APPEARANCE: Readonly<SharedAppearance> = Object.freeze({
	theme: "system",
	textSize: "default",
	lettering: "serif",
	ink: "ink",
});

const section = (record: unknown, key: string): Record<string, unknown> | undefined => {
	if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
	const value = (record as Record<string, unknown>)[key];
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
};

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
	return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Pure: the stored settings record (as on disk, not merged with the factory) → the shared Appearance. */
export function resolveSharedAppearance(stored: unknown): SharedAppearance {
	const notebook = section(stored, "notebook");
	const legacy = section(stored, "appearance");
	const legacyMode = legacy?.mode === "dark" || legacy?.mode === "light" ? legacy.mode : undefined;
	return {
		theme: oneOf(notebook?.appearance, NOTEBOOK_APPEARANCES) ?? legacyMode ?? DEFAULT_SHARED_APPEARANCE.theme,
		textSize: oneOf(notebook?.textSize, NOTEBOOK_TEXT_SIZES) ?? DEFAULT_SHARED_APPEARANCE.textSize,
		lettering: oneOf(notebook?.lettering, NOTEBOOK_LETTERINGS) ?? DEFAULT_SHARED_APPEARANCE.lettering,
		ink: oneOf(notebook?.ink, NOTEBOOK_INKS) ?? DEFAULT_SHARED_APPEARANCE.ink,
	};
}

/** The attributes the root layouts and the provider put on <html class="lh-paper">. */
export function sharedAppearanceAttributes(a: SharedAppearance): Record<"data-theme" | "data-ink" | "data-text-size" | "data-lettering", string> {
	return { "data-theme": a.theme, "data-ink": a.ink, "data-text-size": a.textSize, "data-lettering": a.lettering };
}
