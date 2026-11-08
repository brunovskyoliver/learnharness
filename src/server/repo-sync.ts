/**
 * Library git sync's pulls (feature 026, research R4, R5, R9): the per-tenant
 * registry of first links still pulling, the process-wide pool of
 * REPO_PULL_POOL concurrent pulls (FIFO across tenants), and one pull's steps:
 * tip → shallow snapshot → classify each entry → limits → stage the blobs →
 * one catalog write. A failure before the write discards the staged snapshot
 * and changes nothing.
 *
 * Later pulls of a link run single-flight per link (a second "Sync now" joins
 * the running one, FR-015): an unchanged tip moves only `lastSuccessAt`; a
 * failure keeps the last good mirror and records why. The schedule (R9):
 * local and Electron arm on the process's first window, pull what is over 15
 * minutes old, then every 15 minutes and never disarm; hosted pulls once when
 * a tenant's first window opens and every 15 minutes while one is open.
 * The remote, the clock and the timers are injectable for tests.
 */
import { nanoid } from "nanoid";
import { hostedMode, tenantScoped } from "../../config.ts";
import { emit } from "../core/events.ts";
import type { LibraryFolder, LibraryRefusal } from "../core/library.ts";
import type { FirstLink, MirrorFile, RepoRemote, RepoTip } from "../core/ports.ts";
import {
	classifyEntry, failureMessage, isIgnoredDirectory, limitFailure, redactSecrets, REPO_MAX_BYTES, REPO_MAX_FILES, REPO_PULL_POOL, REPO_SYNC_INTERVAL_MS, RepoRemoteError, repoKeyOf,
	type RepoLink, type RepoSyncState, type SkippedFile, type SyncFailure,
} from "../core/repo-link.ts";
import { libraryStore } from "../store/library.ts";
import { repoTokens } from "../store/repo-tokens.ts";
import { indexAfterUpload } from "./library-text.ts";
import { repoRemote } from "./repo-git.ts";

/** A first link still pulling: shown as a row, never a folder (US1 #5). */
export interface PendingLink {
	requestId: string;
	display: string;
	folderName: string;
	parentId: string | null;
	startedAt: string;
}

let remote: RepoRemote = repoRemote;
let clock: () => Date = () => new Date();
/** Tests: a fake remote, or the real one again with no argument. */
export function setRepoRemote(next?: RepoRemote): void { remote = next ?? repoRemote; }
/** Tests: a fixed or stepping clock, or the real one again with no argument. */
export function setRepoClock(next?: () => Date): void { clock = next ?? (() => new Date()); }

/** Repeats `run` every `ms` until the returned stop is called. */
export interface RepoTimers { every(ms: number, run: () => void): () => void }
const realTimers: RepoTimers = {
	every(ms, run) {
		const timer = setInterval(run, ms);
		// The schedule never keeps a process (or a test run) alive by itself.
		timer.unref?.();
		return () => clearInterval(timer);
	},
};
let timers: RepoTimers = realTimers;
/** Tests: timers they tick by hand, or the real ones again with no argument. */
export function setRepoTimers(next?: RepoTimers): void { timers = next ?? realTimers; }

interface Pull { started: Promise<RepoLink | null>; done: Promise<void> }
interface Registry {
	pending: Map<string, PendingLink>;
	/** linkId → the pull running now (single flight, FR-015). */
	running: Map<string, Pull>;
	/** Open windows (SSE connections) of this tenant. */
	windows: number;
	/** Local: armed once, for the life of the process. */
	armed: boolean;
	stopTimer?: () => void;
	/** The last scan for due links, for repoSyncIdle(). */
	scan?: Promise<void>;
}
const registry = () => tenantScoped("__lhRepoSync", (): Registry => ({ pending: new Map(), running: new Map(), windows: 0, armed: false }));

/** Tests: forget windows, timers and the armed flag of the current tenant. */
export function resetRepoSchedule(): void {
	const reg = registry();
	reg.stopTimer?.();
	reg.stopTimer = undefined;
	reg.windows = 0;
	reg.armed = false;
}

/** This tenant's first links still pulling, oldest first. */
export function pendingLinks(): PendingLink[] {
	return [...registry().pending.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

interface Pool { active: number; waiting: (() => void)[] }
/** Process-wide, not per tenant: the pool bounds the server's memory (R5). */
const pool = (): Pool => ((globalThis as { __lhRepoPool?: Pool }).__lhRepoPool ??= { active: 0, waiting: [] });

/** Tests: how full the process-wide pool is. */
export const repoPoolState = () => ({ active: pool().active, waiting: pool().waiting.length });

async function inPool<T>(run: () => Promise<T>): Promise<T> {
	const slots = pool();
	if (slots.active >= REPO_PULL_POOL) await new Promise<void>((resolve) => slots.waiting.push(resolve));
	else slots.active++;
	try {
		return await run();
	} finally {
		// A waiting pull takes this slot over; otherwise it is freed.
		const next = slots.waiting.shift();
		if (next) next();
		else slots.active--;
	}
}

interface ReadMirror {
	branch: string;
	commit: string;
	snapshot: string;
	files: MirrorFile[];
	bytes: number;
	skipped: NonNullable<RepoSyncState["skipped"]>;
}

/** Reads the branch tip into a staged snapshot. Throws a RepoRemoteError
 *  (limits included), after discarding what it staged. */
async function readMirror(linkId: string, request: { url: string; token?: string; branch?: string }, known?: RepoTip): Promise<ReadMirror> {
	const tip = known ?? await remote.tip(request);
	const stage = await libraryStore.stageSnapshot(linkId);
	const files: MirrorFile[] = [];
	const named: SkippedFile[] = [];
	let unsupported = 0;
	let hiddenOrIgnored = 0;
	// Every file that would be mirrored counts, also past a limit, so the sentence says by how much.
	let found = 0;
	let bytes = 0;
	try {
		const read = await remote.snapshot({
			...request,
			branch: tip.branch,
			linkId,
			skipDirectory: (_path, name) => {
				if (!isIgnoredDirectory(name)) return false;
				hiddenOrIgnored++;
				return true;
			},
		}, async (entry) => {
			const facts = { path: entry.path, mode: entry.mode };
			let verdict = classifyEntry(facts);
			if (verdict.action === "read") {
				const data = await entry.read();
				verdict = classifyEntry(facts, data);
				if (verdict.action === "keep") {
					found++;
					bytes += data.length;
					// Past a limit nothing more is written; the pull is refused below.
					if (found <= REPO_MAX_FILES && bytes <= REPO_MAX_BYTES) {
						await stage.put(entry.path, entry.oid, data);
						files.push({ path: entry.path, oid: entry.oid, size: data.length, kind: verdict.kind });
					}
					return;
				}
			}
			if (verdict.action === "skip") named.push(verdict.file);
			else if (verdict.action === "count") {
				if (verdict.bucket === "unsupported") unsupported++;
				else hiddenOrIgnored++;
			}
		});
		const over = limitFailure({ files: found, bytes });
		if (over) throw new RepoRemoteError(over);
		return { branch: read.branch, commit: read.commit, snapshot: stage.snapshot, files, bytes, skipped: { unsupported, hiddenOrIgnored, named } };
	} catch (err) {
		await libraryStore.discardSnapshot(linkId, stage.snapshot).catch(() => {});
		throw err;
	}
}

const asFailure = (err: unknown, token: string | undefined): SyncFailure => {
	if (err instanceof RepoRemoteError) return err.failure;
	return { code: "server", message: failureMessage("server"), detail: redactSecrets(String((err as Error)?.message ?? err), [token]) };
};

export interface LinkRequest {
	/** The client's id for the pending row. */
	requestId: string;
	url: string;
	display: string;
	repoBase: string;
	token?: string;
	/** Absent: the remote's default branch. */
	branch?: string;
	folderName: string;
	parentId: string | null;
}

export type LinkOutcome =
	| { ok: true; link: RepoLink; folder: LibraryFolder }
	| { ok: false; failure: SyncFailure }
	| { ok: false; refusal: LibraryRefusal };

/** A link's first pull, inside the request (contracts/api.md POST). Folder,
 *  items, link and token are written only when it succeeds; on any failure
 *  nothing is kept and the token is dropped. */
export async function linkRepo(request: LinkRequest): Promise<LinkOutcome> {
	const linkId = `rpl_${nanoid()}`;
	const startedAt = clock().toISOString();
	const pending = registry().pending;
	pending.set(request.requestId, { requestId: request.requestId, display: request.display, folderName: request.folderName, parentId: request.parentId, startedAt });
	emit("library-sync", { linkId: request.requestId });
	try {
		return await inPool(async (): Promise<LinkOutcome> => {
			let read: ReadMirror;
			try {
				read = await readMirror(linkId, { url: request.url, ...(request.token ? { token: request.token } : {}), ...(request.branch ? { branch: request.branch } : {}) });
			} catch (err) {
				return { ok: false, failure: asFailure(err, request.token) };
			}
			const sync: RepoSyncState = {
				state: "synced",
				lastAttemptAt: startedAt,
				lastSuccessAt: clock().toISOString(),
				commit: read.commit,
				counts: { files: read.files.length, bytes: read.bytes, added: read.files.length, changed: 0, removed: 0, revived: 0 },
				skipped: read.skipped,
			};
			const first: FirstLink = {
				link: {
					id: linkId, url: request.url, display: request.display, repoKey: repoKeyOf(request.repoBase, read.branch), branch: read.branch,
					branchGiven: Boolean(request.branch), hasToken: Boolean(request.token), createdAt: startedAt,
				},
				folderName: request.folderName,
				parentId: request.parentId,
			};
			try {
				const applied = await libraryStore.applyMirror(linkId, { snapshot: read.snapshot, files: read.files, sync }, first);
				if ("refused" in applied) {
					await libraryStore.discardSnapshot(linkId, read.snapshot);
					return { ok: false, refusal: applied };
				}
				if (request.token) repoTokens.set(linkId, request.token);
				for (const item of await libraryStore.list()) if (item.mirror?.linkId === linkId) indexAfterUpload(item);
				return { ok: true, ...applied };
			} catch (err) {
				await libraryStore.discardSnapshot(linkId, read.snapshot).catch(() => {});
				return { ok: false, failure: asFailure(err, request.token) };
			}
		});
	} finally {
		pending.delete(request.requestId);
		emit("library-sync", { linkId: request.requestId });
		emit("library-sync", { linkId });
	}
}

// ── Later pulls (US2, T029, T030) ──

/** One pull of an existing link, or the one already running for it (FR-015).
 *  `started` settles once the link reads "syncing" (null: no such link). */
export function pullLink(linkId: string): Pull {
	const reg = registry();
	const running = reg.running.get(linkId);
	if (running) return running;
	let markStarted!: (link: RepoLink | null) => void;
	const started = new Promise<RepoLink | null>((resolve) => { markStarted = resolve; });
	const done = (async () => {
		try {
			await runPull(linkId, markStarted);
		} catch (err) {
			markStarted(null);
			console.error("[repo-sync]", redactSecrets(String((err as Error)?.message ?? err), [repoTokens.get(linkId) ?? undefined]));
		} finally {
			reg.running.delete(linkId);
		}
	})();
	const pull = { started, done };
	reg.running.set(linkId, pull);
	return pull;
}

async function runPull(linkId: string, markStarted: (link: RepoLink | null) => void): Promise<void> {
	const attemptAt = clock().toISOString();
	const link = await libraryStore.setLinkSync(linkId, ({ failure: _f, ...sync }) => ({ ...sync, state: "syncing", lastAttemptAt: attemptAt }));
	markStarted(link);
	if (!link) return;
	emit("library-sync", { linkId });
	const token = repoTokens.get(linkId) ?? undefined;
	try {
		await inPool(async () => {
			await libraryStore.sweepMirrors().catch(() => {});
			const request = { url: link.url, branch: link.branch, ...(token ? { token } : {}) };
			let read: ReadMirror;
			try {
				const tip = await remote.tip(request);
				// Nothing changed upstream: one small request, and only the time moves (US2 #5).
				if (tip.commit === link.sync.commit && await libraryStore.mirrorWhole(linkId)) {
					await libraryStore.setLinkSync(linkId, (sync) => ({ ...sync, state: "synced", lastSuccessAt: clock().toISOString() }));
					return;
				}
				read = await readMirror(linkId, request, tip);
			} catch (err) {
				await failed(linkId, err, token);
				return;
			}
			try {
				const applied = await libraryStore.applyMirror(linkId, {
					snapshot: read.snapshot,
					files: read.files,
					sync: { state: "synced", lastAttemptAt: attemptAt, lastSuccessAt: clock().toISOString(), commit: read.commit, skipped: read.skipped },
				});
				if ("refused" in applied) {
					// Unlinked while it ran: the result is discarded.
					await libraryStore.discardSnapshot(linkId, read.snapshot);
					return;
				}
				for (const item of applied.changed ?? []) indexAfterUpload(item);
			} catch (err) {
				await libraryStore.discardSnapshot(linkId, read.snapshot).catch(() => {});
				await failed(linkId, err, token);
			}
		});
	} finally {
		emit("library-sync", { linkId });
	}
}

/** Unlink (US4, contracts/api.md DELETE): the link and its schedule go at
 *  once; a pull of it still running is awaited, and its result is discarded
 *  (its catalog write finds no link). Then the token and the bytes go. */
export async function unlinkLink(linkId: string): Promise<boolean> {
	const running = registry().running.get(linkId);
	const unlinked = await libraryStore.unlinkMirror(linkId);
	if (!unlinked) return false;
	await running?.done;
	repoTokens.delete(linkId);
	await libraryStore.dropMirrorFiles(linkId);
	emit("library-sync", { linkId });
	return true;
}

/** The mirror, commit and `lastSuccessAt` stay; the failure says why (US2 #4). */
async function failed(linkId: string, err: unknown, token: string | undefined): Promise<void> {
	const failure = asFailure(err, token);
	await libraryStore.setLinkSync(linkId, (sync) => ({ ...sync, state: "failed", failure }));
}

/** Tests: settles when this tenant's scans and pulls are done. */
export async function repoSyncIdle(): Promise<void> {
	const reg = registry();
	for (;;) {
		await reg.scan;
		const running = [...reg.running.values()];
		if (running.length === 0) return;
		await Promise.all(running.map((p) => p.done));
	}
}

/** Pulls every link of this tenant; with `olderThanMs`, only those whose last attempt is older. */
function pullAll(olderThanMs?: number): Promise<void> {
	const reg = registry();
	reg.scan = scanAndPull(olderThanMs);
	return reg.scan;
}

async function scanAndPull(olderThanMs?: number): Promise<void> {
	try {
		const now = clock().getTime();
		for (const link of await libraryStore.repoLinks()) {
			const last = link.sync.lastAttemptAt ? Date.parse(link.sync.lastAttemptAt) : NaN;
			if (olderThanMs !== undefined && Number.isFinite(last) && now - last < olderThanMs) continue;
			void pullLink(link.id).done;
		}
	} catch (err) {
		console.error("[repo-sync]", (err as Error)?.message ?? err);
	}
}

/** A window of this tenant opened (an SSE connection). Returns its close. */
export function openWindow(): () => void {
	const reg = registry();
	const hosted = hostedMode();
	reg.windows++;
	if (hosted) {
		// Hosted: once on open, then every 15 minutes while a window is open (SC-011).
		if (reg.windows === 1) {
			void pullAll();
			reg.stopTimer = timers.every(REPO_SYNC_INTERVAL_MS, () => void pullAll());
		}
	} else if (!reg.armed) {
		// Local and Electron: soon after start, what is due; then every 15 minutes for the process's life.
		reg.armed = true;
		void libraryStore.sweepMirrors().catch(() => {});
		void pullAll(REPO_SYNC_INTERVAL_MS);
		reg.stopTimer = timers.every(REPO_SYNC_INTERVAL_MS, () => void pullAll());
	}
	let closed = false;
	return () => {
		if (closed) return;
		closed = true;
		reg.windows = Math.max(0, reg.windows - 1);
		// A running pull finishes; only the ticks stop.
		if (hosted && reg.windows === 0) {
			reg.stopTimer?.();
			reg.stopTimer = undefined;
		}
	};
}
