/**
 * The search index's engine (feature 019). Deterministic, with no model. All work
 * runs in the background on one queue per tenant: requests read what is there and
 * report the rest as pending, so no search ever parses a PDF or waits for one.
 *
 * Reindexing is idempotent: a shard whose signature still matches is left alone,
 * and an unchanged source writes identical bytes. A forced rebuild writes a new
 * generation and swaps at the end, so the old index serves until then.
 */
import { tenantScoped } from "../../config.ts";
import { pdfPageTexts } from "../agent/subagents/pdf-ops.ts";
import {
	compareHits, DOC_HITS_PER_ITEM, DOC_INDEX_VERSION, DOC_SEARCH_LIMIT, DOC_TEXT_MAX_BYTES, docFilterPredicate, docSignature, foldWithMap, isSearchableKind, pagePassages, parseDocQuery, pdfPassages, searchShard, textPassages,
	type DocFilters, type DocHit, type DocIndexShard, type DocIndexState, type DocIndexStatus, type DocSearchResponse, type DocSearchResult, type DocStatusRow, type Folded,
} from "../core/document-search.ts";
import { emit, subscribe } from "../core/events.ts";
import { folderPathLabel, type LibraryFolder, type LibraryItem } from "../core/library.ts";
import { libraryStore } from "../store/library.ts";
import * as files from "../store/library-index.ts";
import { enqueuePdfWork } from "./library-text.ts";

const SETTLE_MS = 150;
const SLICE_MS = 8;
/** Cached folded text per tenant. Past this, the oldest shards drop and reload. */
const CACHE_CHARS = 32 * 1024 * 1024;

interface CachedShard { stamp: number; generation: string; shard: DocIndexShard; folded: Folded[]; chars: number }
interface EngineState {
	queue: Promise<unknown>;
	timer: ReturnType<typeof setTimeout> | null;
	running: boolean;
	queued: boolean;
	progress: { done: number; total: number } | null;
	cache: Map<string, CachedShard>;
	cacheChars: number;
}

const engine = () => tenantScoped<EngineState>("__lhDocIndex", () => ({ queue: Promise.resolve(), timer: null, running: false, queued: false, progress: null, cache: new Map(), cacheChars: 0 }));

const yieldToRequests = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Reads a source into a shard. Replaceable in tests, to force a failure. */
export type DocExtract = (item: LibraryItem) => Promise<DocIndexShard>;

const shardOf = (item: LibraryItem, state: DocIndexShard["state"], passages: DocIndexShard["passages"], reason?: string): DocIndexShard => ({
	v: DOC_INDEX_VERSION, itemId: item.id, signature: docSignature(item), state, ...(reason ? { reason } : {}), passages,
});

/** One item's text. A failure becomes a state on the shard, never a thrown sync. */
export const extractDocument: DocExtract = async (item) => {
	if (!isSearchableKind(item.kind)) return shardOf(item, "unsupported", [], item.kind === "image" ? "Images have no text to search." : "This kind of file can't be read.");
	try {
		if (item.kind === "pdf") {
			const pages = await enqueuePdfWork(() => pdfPageTexts(libraryStore.documentPath(item)));
			const passages = pdfPassages(pages);
			return passages.length === 0 ? shardOf(item, "no-text", [], "No text could be read. It may be a scan.") : shardOf(item, "indexed", passages);
		}
		if (item.kind === "page") return shardOf(item, "indexed", pagePassages(await libraryStore.readText(item)));
		if (item.size > DOC_TEXT_MAX_BYTES) return shardOf(item, "unsupported", [], "Too large to search.");
		return shardOf(item, "indexed", textPassages(await libraryStore.readText(item)));
	} catch (err) {
		console.error(`[library-index] ${item.id}:`, err instanceof Error ? err.message : err);
		return shardOf(item, "failed", [], "This file could not be read.");
	}
};

function forget(state: EngineState, itemId: string) {
	const cached = state.cache.get(itemId);
	if (!cached) return;
	state.cacheChars -= cached.chars;
	state.cache.delete(itemId);
}

/** The shard on disk, folded, using the cache while the file hasn't changed. */
async function loadShard(generation: string, itemId: string): Promise<CachedShard | null> {
	const state = engine();
	const stamp = await files.shardStamp(generation, itemId);
	const cached = state.cache.get(itemId);
	if (stamp === null) { forget(state, itemId); return null; }
	if (cached && cached.stamp === stamp && cached.generation === generation) {
		// Most recently used last, so eviction takes the oldest.
		state.cache.delete(itemId);
		state.cache.set(itemId, cached);
		return cached;
	}
	const shard = await files.readShard(generation, itemId);
	forget(state, itemId);
	if (!shard) return null;
	const folded = shard.passages.map((passage) => foldWithMap(passage.text));
	const chars = shard.passages.reduce((sum, passage) => sum + passage.text.length, 0);
	const entry: CachedShard = { stamp, generation, shard, folded, chars };
	state.cache.set(itemId, entry);
	state.cacheChars += chars;
	for (const key of state.cache.keys()) {
		if (state.cacheChars <= CACHE_CHARS || key === itemId) break;
		forget(state, key);
	}
	return entry;
}

function announce(building: boolean) {
	emit("library-index-changed", { building });
}

async function liveGeneration(): Promise<string> {
	const current = await files.readGeneration();
	if (current) return current;
	// Nothing to protect: the first build fills in where search can already see it.
	const generation = await files.createGeneration();
	await files.publishGeneration(generation);
	await files.sweepGenerations(generation);
	return generation;
}

/** Catches the index up. Each item is written as soon as it is read. */
async function catchUp(extract: DocExtract): Promise<void> {
	const state = engine();
	const items = await libraryStore.list();
	const generation = await liveGeneration();
	await files.sweepGenerations(generation);
	await files.sweepTemps(generation);
	const live = new Set(items.map((item) => item.id));
	for (const id of await files.listShardIds(generation)) {
		if (!live.has(id)) {
			await files.removeShard(generation, id);
			forget(state, id);
		}
	}
	const stale: LibraryItem[] = [];
	for (const item of items) {
		const current = (await loadShard(generation, item.id))?.shard;
		if (current?.signature !== docSignature(item)) stale.push(item);
	}
	if (stale.length === 0) return;
	state.progress = { done: 0, total: stale.length };
	announce(true);
	for (const item of stale) {
		await files.writeShard(generation, await extract(item));
		state.progress = { done: state.progress.done + 1, total: stale.length };
		await yieldToRequests();
	}
}

/** Reads everything again into a new generation, then swaps. The old one serves
 *  until the swap; a crash before it leaves a stray folder the next sync sweeps. */
async function rebuild(extract: DocExtract): Promise<void> {
	const state = engine();
	const items = await libraryStore.list();
	const next = await files.createGeneration();
	state.progress = { done: 0, total: items.length };
	announce(true);
	for (const item of items) {
		await files.writeShard(next, await extract(item));
		state.progress = { done: state.progress.done + 1, total: items.length };
		await yieldToRequests();
	}
	await files.publishGeneration(next);
	for (const id of [...state.cache.keys()]) forget(state, id);
	await files.sweepGenerations(next);
}

interface SyncOptions { force?: boolean; extract?: DocExtract }

/** Queues a sync. Requests while one runs fold into a single follow-up. */
export function syncDocumentIndex(options: SyncOptions = {}): Promise<void> {
	const state = engine();
	if (!options.force && state.queued) return state.queue as Promise<void>;
	if (!options.force) state.queued = true;
	const run = state.queue.then(async () => {
		if (!options.force) state.queued = false;
		state.running = true;
		try {
			if (options.force) await rebuild(options.extract ?? extractDocument);
			else await catchUp(options.extract ?? extractDocument);
		} finally {
			state.running = false;
			state.progress = null;
			announce(false);
		}
	});
	state.queue = run.catch((err) => { console.error("[library-index] sync failed:", err instanceof Error ? err.message : err); });
	return run;
}

/** Settles once this tenant's queued index work is done. For tests and shutdown. */
export function documentIndexIdle(): Promise<unknown> {
	return engine().queue;
}

/** After a change settles, in the background. */
export function scheduleDocumentIndex(): void {
	const state = engine();
	if (state.timer) clearTimeout(state.timer);
	state.timer = setTimeout(() => {
		state.timer = null;
		void syncDocumentIndex().catch(() => {});
	}, SETTLE_MS);
	state.timer.unref?.();
}

/** Every path that changes the Library emits library-changed: upload, page version,
 *  rename, move, trash, restore and the agent's own writes. The emitter's tenant
 *  context carries through. One listener per process. */
export function startDocumentIndexWatcher(): () => void {
	const g = globalThis as typeof globalThis & { __lhDocIndexWatcher?: () => void };
	g.__lhDocIndexWatcher ??= subscribe((event) => {
		if (event.type === "library-changed") scheduleDocumentIndex();
	});
	return () => { g.__lhDocIndexWatcher?.(); delete g.__lhDocIndexWatcher; };
}

function stateOf(item: LibraryItem, entry: CachedShard | null): { state: DocIndexState; reason?: string } {
	if (!entry || entry.shard.signature !== docSignature(item)) return { state: "pending" };
	return { state: entry.shard.state, ...(entry.shard.reason ? { reason: entry.shard.reason } : {}) };
}

const STATUS_ROW_LIMIT = 200;

function statusFrom(rows: readonly DocStatusRow[], progress: EngineState["progress"]): DocIndexStatus {
	const counts: Record<DocIndexState, number> = { indexed: 0, pending: 0, failed: 0, "no-text": 0, unsupported: 0 };
	for (const row of rows) counts[row.state]++;
	return { counts, notSearched: rows.filter((row) => row.state !== "indexed").slice(0, STATUS_ROW_LIMIT), building: progress };
}

/** Per-item states. Reads only what is on disk, and starts catching up if behind. */
export async function documentIndexStatus(): Promise<DocIndexStatus> {
	const items = await libraryStore.list();
	const generation = await files.readGeneration();
	const rows: DocStatusRow[] = [];
	for (const item of items) {
		const entry = generation ? await loadShard(generation, item.id) : null;
		rows.push({ id: item.id, name: item.name, kind: item.kind, ...stateOf(item, entry) });
	}
	const status = statusFrom(rows, engine().progress);
	if (status.counts.pending > 0 && !engine().running) scheduleDocumentIndex();
	return status;
}

/** Runs a query over what is indexed, yielding as it goes so a large Library can't
 *  hold up other requests. The catalog decides what exists, so a trashed item can't
 *  appear even in the moment before its shard is removed. */
export async function searchDocuments(raw: string, filters: DocFilters, limit = DOC_SEARCH_LIMIT): Promise<DocSearchResponse> {
	const items = await libraryStore.list();
	const folders: LibraryFolder[] = await libraryStore.folders();
	const generation = await files.readGeneration();
	const query = parseDocQuery(raw);
	const allowed = docFilterPredicate(filters, folders);
	const rows: DocStatusRow[] = [];
	const found: { result: DocSearchResult; score: number; name: string; id: string }[] = [];
	let sliceStart = performance.now();
	for (const item of items) {
		const entry = generation ? await loadShard(generation, item.id) : null;
		const { state, reason } = stateOf(item, entry);
		rows.push({ id: item.id, name: item.name, kind: item.kind, state, ...(reason ? { reason } : {}) });
		if (query && allowed(item)) {
			const usable = entry && state === "indexed";
			const hits: DocHit[] = searchShard(usable ? entry.shard : { itemId: item.id, passages: [] }, usable ? entry.folded : [], item.name, query);
			for (const hit of hits.slice(0, DOC_HITS_PER_ITEM)) {
				found.push({
					id: hit.id, name: item.name, score: hit.score,
					result: {
						id: hit.id, itemId: item.id, name: item.name, kind: item.kind, size: item.size,
						location: folderPathLabel(item.folderId, folders), archived: Boolean(item.archivedAt), tags: item.tags ?? [],
						state, ...(reason ? { reason } : {}), snippet: hit.snippet, jump: hit.jump,
					},
				});
			}
		}
		if (performance.now() - sliceStart > SLICE_MS) {
			await yieldToRequests();
			sliceStart = performance.now();
		}
	}
	found.sort(compareHits);
	const status = statusFrom(rows, engine().progress);
	if (status.counts.pending > 0 && !engine().running) scheduleDocumentIndex();
	return { query: raw, results: found.slice(0, limit).map((row) => row.result), total: found.length, status };
}
