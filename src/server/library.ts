/**
 * The Library's HTTP handlers (feature 009, contracts/library-api.md). Routes
 * wrap these in withTenant. Upload checks run in the contract's order: name,
 * declared length, type by extension, then the store's stream, received
 * length, content check and link.
 */
import { Readable } from "node:stream";
import {
	ACCEPTED_EXTENSIONS, cleanTags, extensionOf, isPageStale, isRefusal, isVersionedKind, kindForName, LIBRARY_REFUSALS, LibraryCatalogError, MAX_FILE_BYTES,
	REFERENCE_INLINE_MAX_BYTES, uploadName,
	pageVersionName, type LibraryItem, type LibraryMarks, type LibraryRefusal, type LibraryRefusalCode, type PageVersionCause, type PageWriteResult,
} from "../core/library.ts";
import { libraryStore, openDocumentStream } from "../store/library.ts";
import { indexAfterUpload } from "./library-text.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const REFUSAL_STATUS: Record<LibraryRefusalCode, number> = {
	invalid_name: 400,
	empty: 400,
	length_mismatch: 400,
	too_large: 413,
	unsupported_type: 415,
	content_mismatch: 415,
	name_taken: 409,
	folder_missing: 404,
	folder_cycle: 409,
	folder_not_empty: 409,
};

function refusal(r: LibraryRefusal, status = REFUSAL_STATUS[r.refused]): Response {
	return json({ error: r.message, code: r.refused, ...(r.name ? { name: r.name } : {}), ...(r.suggestedName ? { suggestedName: r.suggestedName } : {}) }, status);
}

/** A catalog that can't be used is a 500 with a plain sentence; the detail stays in the log. */
async function guarded(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (err) {
		if (!(err instanceof LibraryCatalogError)) throw err;
		console.error("[library]", err.message);
		return json({ error: "Your Library could not be loaded.", code: "catalog" }, 500);
	}
}

export function libraryListResponse(): Promise<Response> {
	return guarded(async () => json({
		items: await libraryStore.list(),
		folders: await libraryStore.folders(),
		recentIds: (await libraryStore.recent()).map((item) => item.id),
		limits: { maxFileBytes: MAX_FILE_BYTES, inlineItemBytes: REFERENCE_INLINE_MAX_BYTES, accepted: ACCEPTED_EXTENSIONS },
	}));
}

export function libraryUploadResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const name = uploadName(new URL(request.url).searchParams.get("name") ?? "");
		if (!name) return refusal(LIBRARY_REFUSALS.invalidName);
		const header = request.headers.get("content-length");
		const declared = header !== null && /^\d+$/.test(header) ? Number(header) : null;
		if (declared === null) return json({ error: "The upload did not say how large it is.", code: "length_required" }, 411);
		if (declared === 0) return refusal(LIBRARY_REFUSALS.empty);
		if (declared > MAX_FILE_BYTES) return refusal(LIBRARY_REFUSALS.tooLarge);
		if (!kindForName(name)) return refusal(LIBRARY_REFUSALS.unsupportedType);
		const body = request.body ?? new ReadableStream<Uint8Array>({ start: (c) => c.close() });
		const result = await libraryStore.writeUpload(name, body as unknown as AsyncIterable<Uint8Array>, declared, new URL(request.url).searchParams.get("folder"));
		if (isRefusal(result)) return refusal(result);
		indexAfterUpload(result);
		return json({ item: result }, 201);
	});
}

/** A folder id or null for the top level; undefined when it is neither. */
const parentField = (value: unknown): string | null | undefined => (value === null || (typeof value === "string" && value) ? value : undefined);
const folderGone = () => json({ error: "That folder is no longer in your Library." }, 404);

export function folderCreateResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => null) as { name?: unknown; parentId?: unknown } | null;
		if (typeof body?.name !== "string") return refusal(LIBRARY_REFUSALS.invalidName);
		const parentId = parentField(body.parentId ?? null);
		if (parentId === undefined) return refusal(LIBRARY_REFUSALS.folderMissing, 400);
		const result = await libraryStore.createFolder(body.name, parentId);
		return isRefusal(result) ? refusal(result) : json({ folder: result }, 201);
	});
}

/** Valid marks from a body, or null. Tags only where they apply. */
function marksField(raw: unknown, allowTags: boolean): LibraryMarks | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const body = raw as Record<string, unknown>;
	const marks: LibraryMarks = {};
	for (const key of ["favorite", "pinned", "archived"] as const) {
		if (body[key] === undefined) continue;
		if (typeof body[key] !== "boolean") return null;
		marks[key] = body[key];
	}
	if (body.tags !== undefined) {
		const tags = allowTags ? cleanTags(body.tags) : null;
		if (!tags) return null;
		marks.tags = tags;
	}
	return marks;
}
const badMarks = () => json({ error: "Those marks can't be used.", code: "invalid_marks" }, 400);

export function libraryTrashListResponse(): Promise<Response> {
	return guarded(async () => json({ entries: await libraryStore.listTrash() }));
}

/** POST {itemId} or {folderId}: moves it to the trash. */
export function libraryTrashResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const body = await jsonBody(request);
		const entry = typeof body?.itemId === "string" ? await libraryStore.trashItem(body.itemId)
			: typeof body?.folderId === "string" ? await libraryStore.trashFolder(body.folderId) : undefined;
		if (entry === undefined) return json({ error: "Say what to move to the trash.", code: "invalid_trash" }, 400);
		if (!entry) return json({ error: "That is no longer in your Library." }, 404);
		return json({ entry }, 201);
	});
}

export function libraryRestoreResponse(entryId: string): Promise<Response> {
	return guarded(async () => {
		const restored = await libraryStore.restoreTrash(entryId);
		return restored ? json(restored) : json({ error: "That is no longer in the trash." }, 404);
	});
}

export function libraryPurgeResponse(entryId: string): Promise<Response> {
	return guarded(async () => (await libraryStore.purgeTrash(entryId) ? json({ ok: true }) : json({ error: "That is no longer in the trash." }, 404)));
}

export function libraryOpenedResponse(id: string): Promise<Response> {
	return guarded(async () => (await libraryStore.markOpened(id) ? json({ ok: true }) : json({ error: "That item is no longer in your Library." }, 404)));
}

/** One change per request: marks, a name, or a parent. */
export function folderPatchResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => null) as { name?: unknown; parentId?: unknown; marks?: unknown } | null;
		let result;
		if (body && "marks" in body) {
			const marks = marksField(body.marks, false);
			if (!marks) return badMarks();
			result = await libraryStore.markFolder(id, marks);
		} else if (typeof body?.name === "string") result = await libraryStore.renameFolder(id, body.name);
		else if (body && "parentId" in body) {
			const parentId = parentField(body.parentId);
			if (parentId === undefined) return refusal(LIBRARY_REFUSALS.folderMissing, 400);
			result = await libraryStore.moveFolder(id, parentId);
		} else return refusal(LIBRARY_REFUSALS.invalidName);
		if (!result) return folderGone();
		return isRefusal(result) ? refusal(result) : json({ folder: result });
	});
}

export function folderDeleteResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const result = await libraryStore.removeFolder(id);
		if (result === false) return folderGone();
		return result === true ? json({ ok: true }) : refusal(result);
	});
}

export function libraryPatchResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => null) as { name?: unknown; folderId?: unknown; marks?: unknown } | null;
		if (body && "marks" in body) {
			const marks = marksField(body.marks, true);
			if (!marks) return badMarks();
			const marked = await libraryStore.markItem(id, marks);
			return marked ? json({ item: marked }) : json({ error: "That item is no longer in your Library." }, 404);
		}
		if (body && "folderId" in body && body.name === undefined) {
			const folderId = parentField(body.folderId);
			if (folderId === undefined) return refusal(LIBRARY_REFUSALS.folderMissing, 400);
			const moved = await libraryStore.moveItem(id, folderId);
			if (!moved) return json({ error: "That item is no longer in your Library." }, 404);
			return isRefusal(moved) ? refusal(moved) : json({ item: moved });
		}
		if (typeof body?.name !== "string") return refusal(LIBRARY_REFUSALS.invalidName);
		const result = await libraryStore.rename(id, body.name);
		if (!result) return json({ error: "That item is no longer in your Library." }, 404);
		// The contract has no 415 here: a type the bytes don't fit is a bad name.
		if (isRefusal(result)) return refusal(result, result.refused === "name_taken" ? 409 : 400);
		return json({ item: result });
	});
}

export function libraryDeleteResponse(id: string): Promise<Response> {
	return guarded(async () => {
		if (!await libraryStore.remove(id)) return json({ error: "That item is no longer in your Library." }, 404);
		return json({ ok: true });
	});
}

const INLINE_TYPES: Record<string, string> = {
	pdf: "application/pdf",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
};

/** PDF and raster images show with their type. Everything else is plain text,
 *  so nothing a learner uploaded ever runs as HTML in the app's origin. */
function contentHeaders(item: LibraryItem, size: number, download: boolean): Headers {
	const inlineType = item.kind === "pdf" || item.kind === "image" ? INLINE_TYPES[extensionOf(item.name)] : undefined;
	const headers = new Headers({
		"Content-Type": inlineType ?? "text/plain; charset=utf-8",
		"Content-Length": String(size),
		"X-Content-Type-Options": "nosniff",
		"Cache-Control": "no-store",
	});
	const filename = `filename*=UTF-8''${encodeURIComponent(item.name)}`;
	if (download) headers.set("Content-Disposition", `attachment; ${filename}`);
	else if (inlineType) headers.set("Content-Disposition", `inline; ${filename}`);
	return headers;
}

export function libraryContentResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const missing = () => json({ error: "That item is no longer in your Library." }, 404);
		const item = await libraryStore.get(id);
		if (!item || isVersionedKind(item.kind)) return missing();
		const opened = await openDocumentStream(libraryStore.documentPath(item));
		if (!opened) return missing();
		const download = new URL(request.url).searchParams.get("download") === "1";
		return new Response(Readable.toWeb(opened.stream) as ReadableStream<Uint8Array>, { headers: contentHeaders(item, opened.size, download) });
	});
}

// ── Pages (contracts/library-api.md) ──

const pageGone = () => json({ error: "That page is no longer in your Library." }, 404);
const pageTooBig = () => refusal(LIBRARY_REFUSALS.pageTooLarge);
/** Causes a client may name. The rest are the server's own to write. */
const CLIENT_CAUSES: readonly PageVersionCause[] = ["save", "autosave-close", "conflict", "undo-agent"];

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
	const body = await request.json().catch(() => null) as unknown;
	return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

/** base, rev and content, or null when the body is not that shape. */
function pageWriteInput(body: Record<string, unknown> | null) {
	if (!body || !Number.isInteger(body.base) || !Number.isInteger(body.rev) || typeof body.content !== "string") return null;
	return { base: body.base as number, rev: body.rev as number, content: body.content };
}

function pageWriteResponse<T extends object>(result: PageWriteResult<T>, success: (value: T) => Response): Response {
	if (result === "missing") return pageGone();
	if (result === "too-large") return pageTooBig();
	if (isPageStale(result)) return json({ error: "This page changed elsewhere.", code: "stale", head: result.head, draft: result.draft }, 409);
	return success(result);
}

export function pageCreateResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const body = await jsonBody(request);
		if (typeof body?.name !== "string" || (body.content !== undefined && typeof body.content !== "string")) return refusal(LIBRARY_REFUSALS.invalidName);
		const folderId = parentField(body.folderId ?? null);
		if (folderId === undefined) return refusal(LIBRARY_REFUSALS.folderMissing, 400);
		const result = await libraryStore.createPage(body.name, (body.content as string | undefined) ?? "", { author: "learner", folderId });
		if (isRefusal(result)) return refusal(result);
		return json(result, 201);
	});
}

export function pageReadResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const page = await libraryStore.readPage(id);
		return page ? json(page) : pageGone();
	});
}

export function pageDraftResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const input = pageWriteInput(await jsonBody(request));
		if (!input) return json({ error: "That draft could not be read." }, 400);
		return pageWriteResponse(await libraryStore.savePageDraft(id, input), (ok) => json(ok));
	});
}

export function pageCommitResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const body = await jsonBody(request);
		const input = pageWriteInput(body);
		if (!input) return json({ error: "That version could not be read." }, 400);
		const cause = CLIENT_CAUSES.find((c) => c === body?.cause);
		const result = await libraryStore.commitPageVersion(id, { ...input, ...(cause ? { cause } : {}) });
		return pageWriteResponse(result, (ok) => json(ok, ok.created ? 201 : 200));
	});
}

/** Versions are listed newest first, a page at a time. */
export const PAGE_VERSIONS_LIMIT = 50;

export function pageVersionsResponse(id: string, request?: Request): Promise<Response> {
	return guarded(async () => {
		const all = await libraryStore.listPageVersions(id);
		if (!all) return pageGone();
		const raw = request ? new URL(request.url).searchParams.get("before") : null;
		const before = raw && /^\d+$/.test(raw) ? Number(raw) : null;
		const from = before === null ? all : all.filter((v) => v.n < before);
		const versions = from.slice(0, PAGE_VERSIONS_LIMIT);
		return json({ versions, more: from.length > versions.length });
	});
}

/** PATCH a version's name (feature 010, contracts/api.md). */
export function pageVersionNameResponse(request: Request, id: string, n: string): Promise<Response> {
	return guarded(async () => {
		const body = await jsonBody(request);
		const name = pageVersionName(body?.name ?? null);
		if (name === "invalid") return json({ error: "A version name is 1 to 80 characters on one line." }, 400);
		if (!/^\d+$/.test(n)) return json({ error: "That version doesn't exist." }, 404);
		const version = await libraryStore.namePageVersion(id, Number(n), name);
		return version === "missing" ? json({ error: "That version doesn't exist." }, 404) : json({ version });
	});
}

/** GET and PUT the last version the learner has seen (feature 010). */
export function pageSeenResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const seen = await libraryStore.readPageSeen(id);
		return seen === "missing" ? pageGone() : json(seen);
	});
}

export function pageMarkSeenResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const body = await jsonBody(request);
		if (!Number.isInteger(body?.version)) return json({ error: "A version number is needed." }, 400);
		const seen = await libraryStore.markPageSeen(id, body!.version as number);
		return seen === "missing" ? pageGone() : json(seen);
	});
}

export function pageVersionResponse(id: string, n: string): Promise<Response> {
	return guarded(async () => {
		const found = /^\d+$/.test(n) ? await libraryStore.readPageVersion(id, Number(n)) : null;
		return found ? json(found) : json({ error: "That version doesn't exist." }, 404);
	});
}

export function pageRestoreResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const body = await jsonBody(request);
		if (!Number.isInteger(body?.n)) return json({ error: "That version doesn't exist." }, 404);
		const result = await libraryStore.restorePageVersion(id, body!.n as number);
		return result === "missing" ? json({ error: "That version doesn't exist." }, 404) : json(result, 201);
	});
}
