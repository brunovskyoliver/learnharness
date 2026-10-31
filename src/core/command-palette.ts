/**
 * The command palette's entries and ranking (feature 015). Pure: the dialog
 * supplies the lists and acts on the chosen entry. Matching is `fuzzyScore`,
 * the same ranking the sidebar search and model menu use.
 */
import type { DocSearchResult } from "./document-search.ts";
import { fuzzyScore } from "./fuzzy.ts";
import { folderPathLabel, KIND_LABEL, type LibraryFolder, type LibraryItem } from "./library.ts";

export type PaletteActionId = "new-lesson" | "new-practice" | "new-page" | "open-settings" | "open-home" | "toggle-sidebar" | "toggle-right-pane" | "choose-model" | "show-shortcuts" | "library-all" | "library-favorites" | "library-recent" | "library-archive" | "library-trash" | "study-notes" | "save-passage";

export type PaletteEntry =
	| { kind: "action"; id: string; action: PaletteActionId; label: string; meta?: string; keywords: string[] }
	| { kind: "session"; id: string; chatId: string; practice: boolean; label: string; meta: string; keywords: string[] }
	| { kind: "item"; id: string; item: LibraryItem; label: string; meta: string; keywords: string[] }
	| { kind: "folder"; id: string; folderId: string; label: string; meta: string; keywords: string[] }
	| { kind: "passage"; id: string; hit: DocSearchResult; label: string; meta: string; keywords: string[] };

export interface PaletteGroup {
	label: string;
	entries: PaletteEntry[];
}

const action = (id: PaletteActionId, label: string, keywords: string[], meta?: string): PaletteEntry => ({ kind: "action", id: `action:${id}`, action: id, label, meta, keywords });

/** Actions in the order they list with no query. `inSession` adds what only a
 *  session's composer can answer. */
export function paletteActions(inSession: boolean, inLesson = false): PaletteEntry[] {
	return [
		action("new-lesson", "New lesson", ["session", "teach", "start"]),
		action("new-practice", "New practice", ["session", "problem", "start"]),
		action("new-page", "New page", ["note", "document", "library", "create"]),
		action("library-all", "Open Library", ["documents", "notes", "view", "all"]),
		action("library-favorites", "Open Library favorites", ["view", "star"]),
		action("library-recent", "Open Library recent", ["view", "history"]),
		action("library-archive", "Open Library archive", ["view"]),
		action("library-trash", "Open Library trash", ["view", "deleted", "restore"]),
		action("open-home", "Open Home", ["graph", "waiting", "start"]),
		action("open-settings", "Open settings", ["preferences", "keys", "models"]),
		action("toggle-sidebar", "Toggle sidebar", ["left", "pane", "panel", "navigation", "collapse"]),
		action("toggle-right-pane", "Toggle right pane", ["context", "outline", "panel", "collapse", "demo", "page"]),
		...(inSession ? [action("choose-model", "Choose a model", ["model", "selector", "composer"])] : []),
		...(inLesson ? [action("study-notes", "Turn this lesson into study notes", ["page", "note", "summary", "extract"])] : []),
		...(inSession ? [action("save-passage", "Save the selected text to a page", ["passage", "highlight", "note", "quote"])] : []),
		action("show-shortcuts", "Show keyboard shortcuts", ["keys", "help", "cheat sheet"]),
	];
}

/** Every entry the palette can reach. Archived entries stay in the Archive view,
 *  as they do in the @ list and the Library's own list. */
export function buildPaletteEntries(input: {
	inSession: boolean;
	inLesson?: boolean;
	chats: readonly { id: string; title: string; kind?: string }[];
	items: readonly LibraryItem[];
	folders: readonly LibraryFolder[];
}): PaletteEntry[] {
	const { chats, items, folders } = input;
	const sessions = chats.map((chat): PaletteEntry => {
		const practice = chat.kind === "practice";
		return { kind: "session", id: `chat:${chat.id}`, chatId: chat.id, practice, label: chat.title, meta: practice ? "Practice" : "Lesson", keywords: [practice ? "practice" : "lesson", "session"] };
	});
	const library = items.filter((item) => !item.archivedAt).map((item): PaletteEntry => {
		const where = folderPathLabel(item.folderId, folders);
		return { kind: "item", id: `item:${item.id}`, item, label: item.name, meta: [KIND_LABEL[item.kind], where].filter(Boolean).join(" · "), keywords: [KIND_LABEL[item.kind], where, ...(item.tags ?? [])] };
	});
	const places = folders.filter((folder) => !folder.archivedAt).map((folder): PaletteEntry => {
		const where = folderPathLabel(folder.parentId, folders);
		return { kind: "folder", id: `folder:${folder.id}`, folderId: folder.id, label: folder.name, meta: where ? `Folder · ${where}` : "Folder", keywords: ["folder", where] };
	});
	return [...paletteActions(input.inSession, input.inLesson), ...sessions, ...library, ...places];
}

const RESULT_LIMIT = 50;
const GROUP_LIMIT = 6;

/** With no query: grouped, each list short. With one: a single ranked list,
 *  because the best match is what Enter should take, whatever its type. */
export function rankPalette(entries: readonly PaletteEntry[], query: string): PaletteGroup[] {
	if (!query.trim()) {
		const of = (kind: PaletteEntry["kind"]) => entries.filter((entry) => entry.kind === kind);
		const groups: PaletteGroup[] = [
			{ label: "Actions", entries: of("action") },
			{ label: "Sessions", entries: of("session").slice(0, GROUP_LIMIT) },
			{ label: "Library", entries: of("item").slice(0, GROUP_LIMIT) },
			{ label: "Folders", entries: of("folder").slice(0, GROUP_LIMIT) },
		];
		return groups.filter((group) => group.entries.length > 0);
	}
	const ranked = entries
		.map((entry) => ({ entry, score: fuzzyScore(query, entry.label, ...entry.keywords) }))
		.filter((row): row is { entry: PaletteEntry; score: number } => row.score !== null)
		.sort((a, b) => b.score - a.score)
		.slice(0, RESULT_LIMIT)
		.map((row) => row.entry);
	return ranked.length > 0 ? [{ label: "Results", entries: ranked }] : [];
}

/** Full-text hits as a group of their own, after the name matches (feature 019).
 *  They come from the server, ranked, so nothing here re-ranks them. */
export function passageGroup(hits: readonly DocSearchResult[]): PaletteGroup | null {
	const textHits = hits.filter((hit) => hit.snippet);
	if (textHits.length === 0) return null;
	return {
		label: "Inside your documents",
		entries: textHits.map((hit) => ({
			kind: "passage", id: `passage:${hit.id}`, hit, label: hit.name,
			meta: [KIND_LABEL[hit.kind], hit.jump?.page !== undefined ? `Page ${hit.jump.page}` : hit.jump?.line !== undefined ? `Line ${hit.jump.line}` : "", hit.location].filter(Boolean).join(" · "),
			keywords: [],
		})),
	};
}
