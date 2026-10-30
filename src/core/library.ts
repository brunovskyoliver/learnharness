/**
 * The Library's shared vocabulary (feature 009): item types, the accepted
 * uploads per kind, the size limits and the name rules. Pure, so the store,
 * the server and the browser agree. data-model.md is the source for all of it.
 */

export const MAX_FILE_BYTES = 52_428_800;
export const REFERENCE_INLINE_MAX_BYTES = 32 * 1024;
export const REFERENCE_MESSAGE_MAX_BYTES = 64 * 1024;
export const REFERENCE_MAX_PER_MESSAGE = 8;
export const OUTLINE_MAX_BYTES = 8 * 1024;
export const PAGE_MAX_BYTES = 1_048_576;
/** Text kinds must decode as strict UTF-8 over this many leading bytes. */
export const CONTENT_CHECK_BYTES = 1_048_576;
const NUL_CHECK_BYTES = 8 * 1024;
const NAME_MAX_CHARS = 200;

export type LibraryKind = "markdown" | "text" | "code" | "csv" | "pdf" | "image" | "page" | "other";
export type LibraryTextState = "ok" | "none" | "pending" | "failed";
export type LibraryOrigin =
	| { type: "upload" }
	| { type: "existing" }
	| { type: "learner" }
	| { type: "agent"; chatId?: string };

export interface LibraryItem {
	id: string;
	name: string;
	/** Old names, for resolving old @ tokens. A live item's current name wins. */
	previousNames?: string[];
	kind: LibraryKind;
	size: number;
	createdAt: string;
	/** For documents this is the bytes' modification time, which a rename keeps. */
	updatedAt: string;
	origin: LibraryOrigin;
	textState?: LibraryTextState;
	headVersion?: number;
}

/** A deleted item. Keeps the name so old references stay honest. */
export interface LibraryTombstone {
	id: string;
	name: string;
	kind: LibraryKind;
	deletedAt: string;
}

export const CATALOG_VERSION = 1;
export interface LibraryCatalog {
	version: number;
	items: (LibraryItem | LibraryTombstone)[];
}

export const isTombstone = (item: LibraryItem | LibraryTombstone): item is LibraryTombstone => "deletedAt" in item;

/** The catalog exists but can't be used: unparsable, unreadable or from a newer
 *  version. Never recreated or rewritten, because that would lose every id. */
export class LibraryCatalogError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LibraryCatalogError";
	}
}

export const ACCEPTED_EXTENSIONS = {
	markdown: ["md", "markdown"],
	text: ["txt", "text", "log", "rst", "tex"],
	csv: ["csv", "tsv"],
	pdf: ["pdf"],
	image: ["jpg", "jpeg", "png", "gif", "webp", "bmp"],
	code: ["py", "js", "jsx", "ts", "tsx", "json", "yaml", "yml", "toml", "html", "css", "c", "h", "cpp", "hpp", "cc", "java", "kt", "go", "rs", "rb", "php", "swift", "sh", "bash", "sql", "r", "m", "jl", "lua", "ipynb"],
} as const satisfies Partial<Record<LibraryKind, readonly string[]>>;

export const KIND_LABEL: Record<LibraryKind, string> = {
	markdown: "Markdown",
	text: "Text",
	code: "Code",
	csv: "CSV",
	pdf: "PDF",
	image: "Image",
	page: "Page",
	other: "File",
};

/** A plain file name or null: NFC, trimmed, 1-200 characters, no separators,
 *  no leading dot, no control characters. */
export function uploadName(raw: string): string | null {
	const name = raw.normalize("NFC").trim();
	if (!name || name.length > NAME_MAX_CHARS || name.startsWith(".") || /[\\/\x00-\x1f\x7f]/.test(name)) return null;
	return name;
}

/** Names compare case-insensitively after NFC: macOS volumes do, and agents
 *  refer to items by name. */
export const nameKey = (name: string): string => name.normalize("NFC").toLowerCase();

export function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** The accepted kind for a file name, or null when uploads refuse it. */
export function kindForName(name: string): LibraryKind | null {
	const extension = extensionOf(name);
	for (const [kind, extensions] of Object.entries(ACCEPTED_EXTENSIONS)) {
		if ((extensions as readonly string[]).includes(extension)) return kind as LibraryKind;
	}
	return null;
}

const startsWith = (bytes: Uint8Array, ascii: string, at = 0) =>
	bytes.length >= at + ascii.length && [...ascii].every((c, i) => bytes[at + i] === c.charCodeAt(0));

function imageMatches(extension: string, b: Uint8Array): boolean {
	switch (extension) {
		case "jpg":
		case "jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
		case "png": return b[0] === 0x89 && startsWith(b, "PNG\r\n\x1a\n", 1);
		case "gif": return startsWith(b, "GIF87a") || startsWith(b, "GIF89a");
		case "webp": return startsWith(b, "RIFF") && startsWith(b, "WEBP", 8);
		case "bmp": return startsWith(b, "BM");
		default: return false;
	}
}

/** Whether a file's leading bytes (up to CONTENT_CHECK_BYTES) fit its name. */
export function contentMatches(name: string, head: Uint8Array): boolean {
	const kind = kindForName(name);
	if (kind === "pdf") return startsWith(head, "%PDF-");
	if (kind === "image") return imageMatches(extensionOf(name), head);
	if (!kind) return false;
	if (head.subarray(0, NUL_CHECK_BYTES).includes(0)) return false;
	try {
		// stream: a multi-byte character cut by the window's end is not an error.
		new TextDecoder("utf-8", { fatal: true }).decode(head.subarray(0, CONTENT_CHECK_BYTES), { stream: true });
		return true;
	} catch {
		return false;
	}
}

/** The first free "notes (2).pdf" style name. */
export function suggestName(name: string, isTaken: (candidate: string) => boolean): string {
	const dot = name.lastIndexOf(".");
	const base = dot > 0 ? name.slice(0, dot) : name;
	const extension = dot > 0 ? name.slice(dot) : "";
	for (let n = 2; ; n++) {
		const tail = ` (${n})${extension}`;
		const candidate = `${base.slice(0, NAME_MAX_CHARS - tail.length).trimEnd()}${tail}`;
		if (!isTaken(candidate)) return candidate;
	}
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Why a write was refused. Nothing is stored or changed on any of these. */
// ── Pages (data-model.md) ──
export type PageAuthor = "learner" | "agent";
export type PageVersionCause = "save" | "autosave-close" | "before-agent" | "conflict" | "restore" | "agent-create" | "agent-revise";
export interface PageVersion {
	n: number;
	author: PageAuthor;
	at: string;
	bytes: number;
	base: number;
	cause: PageVersionCause;
	restoredFrom?: number;
	chatId?: string;
	toolCallId?: string;
}
export interface PageHead { n: number; content: string; author: PageAuthor; at: string }
export interface PageDraft { base: number; rev: number; content: string; updatedAt: string }
export type PageDraftView = Pick<PageDraft, "base" | "rev" | "content">;
export interface PageState { item: LibraryItem; head: PageHead; draft: PageDraftView | null }
export interface PageStale { stale: true; head: PageHead; draft: PageDraftView | null }
/** What a page write answers: the result, or why nothing changed. */
export type PageWriteResult<T> = T | PageStale | "missing" | "too-large";
export const isPageStale = (value: unknown): value is PageStale => typeof value === "object" && value !== null && "stale" in value;

export type LibraryRefusalCode = "invalid_name" | "empty" | "length_mismatch" | "too_large" | "unsupported_type" | "content_mismatch" | "name_taken";
export interface LibraryRefusal {
	refused: LibraryRefusalCode;
	message: string;
	name?: string;
	suggestedName?: string;
}
export const isRefusal = (value: object): value is LibraryRefusal => "refused" in value;

export const LIBRARY_REFUSALS = {
	invalidName: { refused: "invalid_name", message: "That file name can't be used." },
	empty: { refused: "empty", message: "This file is empty." },
	lengthMismatch: { refused: "length_mismatch", message: "The upload did not arrive whole, so nothing was saved." },
	tooLarge: { refused: "too_large", message: "This file is over the 50 MB limit." },
	pageTooLarge: { refused: "too_large", message: "A page can be at most 1 MB." },
	unsupportedType: { refused: "unsupported_type", message: "This kind of file isn't accepted." },
	contentMismatch: { refused: "content_mismatch", message: "This file's contents don't match its type." },
} as const satisfies Record<string, LibraryRefusal>;
