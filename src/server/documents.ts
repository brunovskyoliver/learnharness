/**
 * Search and annotation handlers (features 019-020). Routes wrap these in
 * withTenant, and every path below is tenant-scoped, so another tenant's id is
 * simply an unknown id: a 404. Nothing here calls a model.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { ANNOTATION_NOTE_MAX, ANNOTATION_QUOTE_MAX, documentPassageBlock, parseAnchor, type DocumentCitation } from "../core/document-anchors.ts";
import { DOC_QUERY_MAX_CHARS, type DocFilters } from "../core/document-search.ts";
import { KIND_LABEL, LIBRARY_REFUSALS, LibraryCatalogError, type LibraryKind } from "../core/library.ts";
import { annotationStore } from "../store/library-annotations.ts";
import { libraryStore } from "../store/library.ts";
import { documentIndexStatus, searchDocuments, startDocumentIndexWatcher, syncDocumentIndex } from "./library-index.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function guarded(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (err) {
		if (!(err instanceof LibraryCatalogError)) throw err;
		console.error("[documents]", err.message);
		return json({ error: "Your Library could not be loaded.", code: "catalog" }, 500);
	}
}

const itemGone = () => json({ error: "That item is no longer in your Library." }, 404);

/** Tests start it themselves, so a store test never gets a stray background sync. */
if (process.env.NODE_ENV !== "test") startDocumentIndexWatcher();

// ── Search ──

export function documentSearchResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const params = new URL(request.url).searchParams;
		const q = params.get("q") ?? "";
		if (q.length > DOC_QUERY_MAX_CHARS) return json({ error: "That search is too long.", code: "query_too_long" }, 400);
		const kind = params.get("kind");
		if (kind && !(kind in KIND_LABEL)) return json({ error: "That type can't be used as a filter.", code: "invalid_filter" }, 400);
		const filters: DocFilters = {
			kind: kind as LibraryKind | null,
			tag: params.get("tag"),
			folderId: params.get("folder"),
			hideArchived: params.get("archived") === "hide",
		};
		const rawLimit = Number(params.get("limit"));
		const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : undefined;
		return json(await searchDocuments(q, filters, limit));
	});
}

export function documentStatusResponse(): Promise<Response> {
	return guarded(async () => json(await documentIndexStatus()));
}

/** Starts a full rebuild and returns at once: the old index serves until it's done. */
export function documentReindexResponse(): Promise<Response> {
	return guarded(async () => {
		void syncDocumentIndex({ force: true }).catch(() => {});
		return json({ started: true }, 202);
	});
}

// ── Highlights and annotations ──

const noteField = (value: unknown): string | null | undefined => {
	if (value === null) return null;
	if (typeof value !== "string" || value.length > ANNOTATION_NOTE_MAX) return undefined;
	return value.trim() || null;
};

async function pdfItem(id: string) {
	const item = await libraryStore.get(id);
	return item?.kind === "pdf" ? item : null;
}

export function annotationsListResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const item = await pdfItem(id);
		if (!item) return itemGone();
		return json({ annotations: await annotationStore.list(id), fingerprint: { size: item.size, updatedAt: item.updatedAt } });
	});
}

export function annotationCreateResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const item = await pdfItem(id);
		if (!item) return itemGone();
		const body = await request.json().catch(() => null) as { anchor?: unknown; note?: unknown } | null;
		const anchor = parseAnchor(body?.anchor);
		if (!anchor) return json({ error: `That highlight could not be read. A passage is at most ${ANNOTATION_QUOTE_MAX} characters.` }, 400);
		const note = body?.note === undefined ? null : noteField(body.note);
		if (note === undefined) return json({ error: `A note is at most ${ANNOTATION_NOTE_MAX} characters.` }, 400);
		const annotation = await annotationStore.add(id, { anchor, ...(note ? { note } : {}), fingerprint: { size: item.size, updatedAt: item.updatedAt } });
		return json({ annotation }, 201);
	});
}

export function annotationPatchResponse(request: Request, id: string, annotationId: string): Promise<Response> {
	return guarded(async () => {
		if (!await pdfItem(id)) return itemGone();
		const body = await request.json().catch(() => null) as { note?: unknown } | null;
		const note = body && "note" in body ? noteField(body.note) : undefined;
		if (note === undefined) return json({ error: `A note is at most ${ANNOTATION_NOTE_MAX} characters.` }, 400);
		const annotation = await annotationStore.setNote(id, annotationId, note);
		return annotation ? json({ annotation }) : json({ error: "That highlight is no longer there." }, 404);
	});
}

export function annotationDeleteResponse(id: string, annotationId: string): Promise<Response> {
	return guarded(async () => {
		if (!await pdfItem(id)) return itemGone();
		return (await annotationStore.remove(id, annotationId)) ? json({ ok: true }) : json({ error: "That highlight is no longer there." }, 404);
	});
}

// ── A PDF passage into a note (feature 017's path, with a page for a source) ──

const PASSAGE_MAX = 20_000;

export function pageDocumentPassageResponse(request: Request, pageId: string): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => null) as Partial<DocumentCitation> & { text?: unknown } | null;
		if (typeof body?.text !== "string" || !body.text.trim() || typeof body.itemId !== "string" || !Number.isInteger(body.page) || (body.page as number) < 1) return json({ error: "That passage could not be read." }, 400);
		if (body.text.length > PASSAGE_MAX) return json({ error: "That passage is too long to save at once." }, 413);
		const source = await pdfItem(body.itemId);
		if (!source) return itemGone();
		const result = await libraryStore.appendToPage(pageId, documentPassageBlock(body.text, { itemId: source.id, name: source.name, page: body.page as number }), {});
		if (result === "missing") return json({ error: "That page is no longer in your Library." }, 404);
		if (result === "too-large") return json({ error: LIBRARY_REFUSALS.pageTooLarge.message, code: "too_large" }, 413);
		return json(result, 201);
	});
}

// ── The reader's own assets: same origin, no CDN ──

const PDFJS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", "pdfjs-dist");
const ALLOWED_ASSETS: readonly RegExp[] = [
	/^legacy\/build\/pdf\.worker\.min\.mjs$/,
	/^standard_fonts\/[\w.-]+\.(?:pfb|ttf|otf)$/,
	/^cmaps\/[\w.-]+\.bcmap$/,
	/^wasm\/[\w.-]+\.(?:wasm|js|mjs)$/,
	/^iccs\/[\w.-]+\.icc$/,
];
const ASSET_TYPE: Record<string, string> = { ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".wasm": "application/wasm" };

/** Text assets worth compressing: the worker alone is 1.3 MB raw, ~390 KB gzipped. */
const TEXT_ASSET = /\.(?:mjs|js)$/;
const gzipped = new Map<string, Promise<Buffer>>();
const gzipAsync = promisify(gzip);

/** True when the request's Accept-Encoding allows gzip (q > 0, or a positive `*`). */
function acceptsGzip(request: Request | undefined): boolean {
	const header = request?.headers.get("accept-encoding");
	if (!header) return false;
	let gzipQ: number | null = null;
	let anyQ: number | null = null;
	for (const part of header.split(",")) {
		const [name, ...params] = part.trim().toLowerCase().split(";");
		const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
		const q = qParam ? Number(qParam.slice(2)) : 1;
		if (name === "gzip" || name === "x-gzip") gzipQ = q;
		else if (name === "*") anyQ = q;
	}
	const q = gzipQ ?? anyQ ?? 0;
	return Number.isFinite(q) && q > 0;
}

/** Only named forms under pdfjs-dist, whose version is the bundled client's.
 *  Text assets go gzipped when the browser accepts it, compressed once per file
 *  and kept in memory (the set is bounded by ALLOWED_ASSETS). */
export async function pdfjsAssetResponse(segments: readonly string[], request?: Request): Promise<Response> {
	const rel = segments.join("/");
	if (!ALLOWED_ASSETS.some((pattern) => pattern.test(rel))) return new Response("Not found", { status: 404 });
	const roots = [PDFJS_ROOT, path.join(process.cwd(), "node_modules", "pdfjs-dist")];
	for (const root of roots) {
		// The tracer can't follow this and would sweep the whole project. It doesn't
		// need to: next.config.ts includes these folders, and the patterns above bound it.
		const file = path.join(/*turbopackIgnore: true*/ root, rel);
		const bytes = await fs.readFile(/*turbopackIgnore: true*/ file).catch(() => null);
		if (bytes) {
			const headers = new Headers({
				"Content-Type": ASSET_TYPE[path.extname(rel)] ?? "application/octet-stream",
				"Cache-Control": process.env.NODE_ENV === "production" ? "public, max-age=86400" : "no-store",
				"X-Content-Type-Options": "nosniff",
			});
			if (!TEXT_ASSET.test(rel)) return new Response(new Uint8Array(bytes), { headers });
			headers.set("Vary", "Accept-Encoding");
			if (!acceptsGzip(request)) return new Response(new Uint8Array(bytes), { headers });
			let packed = gzipped.get(file);
			if (!packed) {
				packed = gzipAsync(bytes);
				gzipped.set(file, packed);
				packed.catch(() => gzipped.delete(file));
			}
			const body = await packed;
			headers.set("Content-Encoding", "gzip");
			headers.set("Content-Length", String(body.length));
			return new Response(new Uint8Array(body), { headers });
		}
	}
	return new Response("Not found", { status: 404 });
}
