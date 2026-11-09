/**
 * The Library's shared vocabulary (feature 009): item types, the accepted
 * uploads per kind, the size limits and the name rules. Pure, so the store,
 * the server and the browser agree. data-model.md is the source for all of it.
 */
import type { RepoLink } from "./repo-link.ts";

export const MAX_FILE_BYTES = 52_428_800;
export const REFERENCE_INLINE_MAX_BYTES = 32 * 1024;
export const REFERENCE_MESSAGE_MAX_BYTES = 64 * 1024;
export const REFERENCE_MAX_PER_MESSAGE = 8;
export const OUTLINE_MAX_BYTES = 8 * 1024;
export const PAGE_MAX_BYTES = 1_048_576;
/** Chunk sizes the content route serves at versioned URLs (feature 024, R1a):
 *  a small fixed set, so a client can't make the cache hold arbitrary slices. */
export const CONTENT_CHUNK_SIZES: readonly number[] = [16_384, 32_768, 65_536, 131_072, 262_144];
/** Text kinds must decode as strict UTF-8 over this many leading bytes. */
export const CONTENT_CHECK_BYTES = 1_048_576;
const NUL_CHECK_BYTES = 8 * 1024;
const NAME_MAX_CHARS = 200;

export type LibraryKind = "markdown" | "text" | "code" | "csv" | "pdf" | "image" | "page" | "diagram" | "other";
/** Kinds with version folders rather than bytes in files/ (feature 022). */
export const isVersionedKind = (kind: LibraryKind | "folder"): boolean => kind === "page" || kind === "diagram";
export type LibraryTextState = "ok" | "none" | "pending" | "failed";
export type LibraryOrigin =
	| { type: "upload" }
	| { type: "existing" }
	| { type: "learner" }
	| { type: "agent"; chatId?: string }
	/** A file mirrored from a linked repo (feature 026). */
	| { type: "repo"; linkId: string };

/** Where a mirrored entry comes from (feature 026, data-model.md). `(repoKey, path)`
 *  is its identity across pulls, unlinks and relinks; `linkId` is the link that
 *  holds it now. */
export interface MirrorRef {
	linkId: string;
	/** "<host>/<path>#<branch>" (research R7). */
	repoKey: string;
	/** Repo-relative, "/"-separated; "" marks the linked folder itself. */
	path: string;
	/** Items: the blob oid at the last pull. */
	oid?: string;
	/** Items: the snapshot directory that holds the bytes now. */
	snapshot?: string;
}

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
	/** Absent, or a folder that no longer exists, reads as the top level (feature 011). */
	folderId?: string;
	tags?: string[];
	favorite?: boolean;
	pinned?: boolean;
	archivedAt?: string;
	/** A file mirrored from a linked repo (feature 026): bytes under files/.mirrors. */
	mirror?: MirrorRef;
}

/** A Library folder (feature 011). Catalog only: bytes stay flat in files/. */
export interface LibraryFolder {
	id: string;
	name: string;
	parentId: string | null;
	createdAt: string;
	updatedAt: string;
	favorite?: boolean;
	pinned?: boolean;
	archivedAt?: string;
	/** Feature 026: `path: ""` is a linked folder, any other path a mirror folder. */
	mirror?: MirrorRef;
}

/** What one "move to trash" took (feature 012). Kept outside `items`, so an
 *  older app can neither list these nor tombstone them, and rewrites them as is. */
export interface LibraryTrashEntry {
	id: string;
	name: string;
	kind: LibraryKind | "folder";
	trashedAt: string;
	/** The folder it was in, for restoring. */
	folderId: string | null;
	items: LibraryItem[];
	/** A trashed folder's whole subtree, root first. */
	folders: LibraryFolder[];
}

/** The marks a learner can change without touching content. */
export interface LibraryMarks {
	tags?: string[];
	favorite?: boolean;
	pinned?: boolean;
	archived?: boolean;
}

export const TAG_MAX_CHARS = 40;
export const TAGS_MAX_PER_ITEM = 20;

/** Tags trimmed, de-duplicated by case, or null when any can't be used. */
export function cleanTags(raw: unknown): string[] | null {
	if (!Array.isArray(raw) || raw.length > TAGS_MAX_PER_ITEM) return null;
	const tags = new Map<string, string>();
	for (const entry of raw) {
		if (typeof entry !== "string") return null;
		const tag = entry.normalize("NFC").trim();
		if (!tag || tag.length > TAG_MAX_CHARS || /[\x00-\x1f\x7f]/.test(tag)) return null;
		if (!tags.has(nameKey(tag))) tags.set(nameKey(tag), tag);
	}
	return [...tags.values()];
}

/** Applies marks, leaving absent fields out so old catalogs stay the same shape. */
export function withMarks<T extends { favorite?: boolean; pinned?: boolean; archivedAt?: string; tags?: string[] }>(target: T, marks: LibraryMarks, now: string): T {
	const next = { ...target };
	if (marks.favorite !== undefined) { if (marks.favorite) next.favorite = true; else delete next.favorite; }
	if (marks.pinned !== undefined) { if (marks.pinned) next.pinned = true; else delete next.pinned; }
	if (marks.archived !== undefined) { if (marks.archived) next.archivedAt = target.archivedAt ?? now; else delete next.archivedAt; }
	if (marks.tags !== undefined) { if (marks.tags.length > 0) next.tags = marks.tags; else delete next.tags; }
	return next;
}

/** A deleted item. Keeps the name so old references stay honest. */
export interface LibraryTombstone {
	id: string;
	name: string;
	kind: LibraryKind;
	deletedAt: string;
	/** Feature 026: a removed mirrored entry, kept so a returning path reattaches. */
	mirror?: MirrorRef;
	removedBecause?: "repo" | "unlinked";
	/** Feature 026: what a removed mirrored item had, so it comes back the same when its path returns. */
	kept?: Pick<LibraryItem, "createdAt" | "previousNames" | "tags" | "favorite" | "pinned" | "archivedAt">;
}

/** A mirror folder whose directory left the repo (feature 026, R3): kept with
 *  its id and marks, out of `folders`, so the same directory returning reattaches. */
export interface RemovedMirrorFolder extends LibraryFolder {
	mirror: MirrorRef;
	removedAt: string;
	removedBecause: "repo" | "unlinked";
}

export const CATALOG_VERSION = 1;
export interface LibraryCatalog {
	version: number;
	items: (LibraryItem | LibraryTombstone)[];
	/** Additive, so the version stays and an older app keeps these on rewrite. */
	folders?: LibraryFolder[];
	trash?: LibraryTrashEntry[];
	/** Diagrams and their tombstones (feature 022), on disk only: outside `items`,
	 *  because an older app tombstones any item with no file behind it. The store
	 *  merges them into `items` on read and splits them out again on write. */
	diagrams?: (LibraryItem | LibraryTombstone)[];
	/** Feature 026, on disk only like `diagrams`: the repo links… */
	repoLinks?: RepoLink[];
	/** …and every mirror folder and mirrored item, live or removed. Outside
	 *  `items`/`folders` so an older app neither lists nor tombstones them; the
	 *  store merges them in on read and splits them out on write by `mirror`. */
	mirrored?: { folders: LibraryFolder[]; items: (LibraryItem | LibraryTombstone)[]; removedFolders?: RemovedMirrorFolder[] };
	/** In memory only: `mirrored.removedFolders` while the catalog is read. */
	removedMirrorFolders?: RemovedMirrorFolder[];
}

export const isMirrored = (entry: { mirror?: MirrorRef }): boolean => entry.mirror !== undefined;
/** The folder a repo is linked to (its `mirror.path` is ""). */
export const isLinkedFolder = (folder: Pick<LibraryFolder, "mirror">): boolean => folder.mirror !== undefined && folder.mirror.path === "";
/** Whether a folder id is the linked folder or a folder under it: nothing may be added there. */
export function inMirror(folderId: string | null | undefined, folders: readonly Pick<LibraryFolder, "id" | "mirror">[]): boolean {
	if (!folderId) return false;
	return folders.find((f) => f.id === folderId)?.mirror !== undefined;
}

/** A mirrored item's @ name (R13, analyze M2): every folder above it, the
 *  linked folder and its repo path, "/"-joined: "Physics/Lecture notes/week1/notes.md". */
export const libraryPathName = (item: Pick<LibraryItem, "name" | "folderId">, folders: readonly LibraryFolder[]): string =>
	[...folderTrail(item.folderId, folders).map((f) => f.name), item.name].join("/");

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
	diagram: "Diagram",
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
export type PageVersionCause = "save" | "autosave-close" | "before-agent" | "conflict" | "restore" | "agent-create" | "agent-revise" | "undo-agent" | "passage" | "proposal-approved";
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
	/** Feature 022: the proposal this version came from, and whether he changed it first. */
	proposalId?: string;
	editedByLearner?: boolean;
	/** The learner's name for it (feature 010), from names.json, never the log. */
	name?: string;
}

/** A version name: trimmed, 1 to 80 characters, one line (feature 010). */
export const PAGE_VERSION_NAME_MAX = 80;
export function pageVersionName(raw: unknown): string | null | "invalid" {
	if (raw === null || raw === "") return null;
	if (typeof raw !== "string") return "invalid";
	const name = raw.trim();
	if (!name) return null;
	return name.length > PAGE_VERSION_NAME_MAX || /[\r\n]/.test(name) ? "invalid" : name;
}

/** The tutor versions the learner hasn't seen highlighted (feature 010). */
export const isUnseenTutorVersion = (version: PageVersion, seen: number) => version.author === "agent" && version.cause === "agent-revise" && version.n > seen;
export interface PageHead { n: number; content: string; author: PageAuthor; at: string }
export interface PageDraft { base: number; rev: number; content: string; updatedAt: string }
export type PageDraftView = Pick<PageDraft, "base" | "rev" | "content">;
export interface PageState { item: LibraryItem; head: PageHead; draft: PageDraftView | null }
export interface PageStale { stale: true; head: PageHead; draft: PageDraftView | null }
/** What a page write answers: the result, or why nothing changed. */
export type PageWriteResult<T> = T | PageStale | "missing" | "too-large";
export const isPageStale = (value: unknown): value is PageStale => typeof value === "object" && value !== null && "stale" in value;

export type LibraryRefusalCode = "invalid_name" | "empty" | "length_mismatch" | "too_large" | "unsupported_type" | "content_mismatch" | "name_taken" | "folder_missing" | "folder_cycle" | "folder_not_empty"
	// Feature 026 (contracts/api.md)
	| "repo_file" | "repo_folder" | "repo_linked" | "holds_linked" | "not_https" | "credential_in_address" | "invalid_address" | "invalid_branch" | "already_linked" | "limit_links" | "address_blocked" | "sync_failed";
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
	folderMissing: { refused: "folder_missing", message: "That folder is no longer in your Library." },
	folderCycle: { refused: "folder_cycle", message: "A folder can't move into itself or a folder inside it." },
	folderNotEmpty: { refused: "folder_not_empty", message: "This folder isn't empty. Move or delete what's in it first." },
	// Feature 026, strings from contracts/ui-contract.md (owner approved 2026-11-08).
	notHttps: { refused: "not_https", message: "Only HTTPS addresses are supported." },
	credentialInAddress: { refused: "credential_in_address", message: "Take the name or token out of the address and put the token in its own field." },
	invalidAddress: { refused: "invalid_address", message: "That isn't a repo address." },
	invalidBranch: { refused: "invalid_branch", message: "That isn't a branch name." },
	limitLinks: { refused: "limit_links", message: "You have 10 linked repos, the most allowed. Unlink one to add another." },
	addressBlocked: { refused: "address_blocked", message: "This address can't be reached from the hosted app." },
} as const satisfies Record<string, LibraryRefusal>;

/** The feature-026 refusals that name something. */
export const REPO_REFUSALS = {
	repoFile: (name: string): LibraryRefusal => ({ refused: "repo_file", message: `${name} comes from the repo. Change it there.`, name }),
	repoFolder: (folder: string): LibraryRefusal => ({ refused: "repo_folder", message: `${folder} mirrors a repo. Add files in the repo instead.`, name: folder }),
	repoLinked: (name: string): LibraryRefusal => ({ refused: "repo_linked", message: `${name} is linked to a repo. Unlink it to remove it.`, name }),
	holdsLinked: (folder: string, linked: string): LibraryRefusal => ({ refused: "holds_linked", message: `${folder} holds the linked folder ${linked}. Move it out or unlink it first.`, name: folder }),
	alreadyLinked: (display: string, branch: string, folder: string): LibraryRefusal => ({ refused: "already_linked", message: `${display} (${branch}) is already linked as ${folder}.`, name: folder }),
} as const;

// ── Folders (feature 011) ──

/** The folder an item or folder really sits in: a dangling id is the top level,
 *  so nothing is ever hidden. */
export function liveFolderId(folderId: string | null | undefined, folders: readonly Pick<LibraryFolder, "id">[]): string | null {
	return folderId && folders.some((f) => f.id === folderId) ? folderId : null;
}

/** Top level first, ending at the folder. Stops at a loop in a damaged catalog. */
export function folderTrail<T extends Pick<LibraryFolder, "id" | "parentId">>(folderId: string | null | undefined, folders: readonly T[]): T[] {
	const trail: T[] = [];
	const seen = new Set<string>();
	let current = folders.find((f) => f.id === folderId);
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		trail.unshift(current);
		const parent: string | null = current.parentId;
		current = folders.find((f) => f.id === parent);
	}
	return trail;
}

/** "Physics / Waves", or an empty string at the top level. */
export const folderPathLabel = (folderId: string | null | undefined, folders: readonly LibraryFolder[]): string =>
	folderTrail(folderId, folders).map((f) => f.name).join(" / ");

/** The folder and everything under it. */
export function folderSubtree(folderId: string, folders: readonly Pick<LibraryFolder, "id" | "parentId">[]): Set<string> {
	const found = new Set([folderId]);
	for (let grew = true; grew;) {
		grew = false;
		for (const folder of folders) {
			if (folder.parentId && found.has(folder.parentId) && !found.has(folder.id)) {
				found.add(folder.id);
				grew = true;
			}
		}
	}
	return found;
}

export const wouldCycle = (folderId: string, parentId: string | null, folders: readonly Pick<LibraryFolder, "id" | "parentId">[]): boolean =>
	parentId !== null && folderSubtree(folderId, folders).has(parentId);
