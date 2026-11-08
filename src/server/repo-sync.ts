/**
 * Library git sync's pulls (feature 026, research R4, R5, R9): the per-tenant
 * registry of first links still pulling, the process-wide pool of
 * REPO_PULL_POOL concurrent pulls (FIFO across tenants), and one pull's steps:
 * tip → shallow snapshot → classify each entry → limits → stage the blobs →
 * one catalog write. A failure before the write discards the staged snapshot
 * and changes nothing.
 *
 * This file holds the first pull (US1). Later pulls of an existing link, the
 * 15-minute schedule and "Sync now" arrive with US2 (T025, T029, T030).
 * The remote and the clock are injectable for tests.
 */
import { nanoid } from "nanoid";
import { tenantScoped } from "../../config.ts";
import { emit } from "../core/events.ts";
import type { LibraryFolder, LibraryRefusal } from "../core/library.ts";
import type { FirstLink, MirrorFile, RepoRemote } from "../core/ports.ts";
import {
	classifyEntry, failureMessage, isIgnoredDirectory, limitFailure, redactSecrets, REPO_MAX_BYTES, REPO_MAX_FILES, REPO_PULL_POOL, RepoRemoteError, repoKeyOf,
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

const registry = () => tenantScoped("__lhRepoSync", () => ({ pending: new Map<string, PendingLink>() }));

/** This tenant's first links still pulling, oldest first. */
export function pendingLinks(): PendingLink[] {
	return [...registry().pending.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

interface Pool { active: number; waiting: (() => void)[] }
/** Process-wide, not per tenant: the pool bounds the server's memory (R5). */
const pool = (): Pool => ((globalThis as { __lhRepoPool?: Pool }).__lhRepoPool ??= { active: 0, waiting: [] });

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
async function readMirror(linkId: string, request: { url: string; token?: string; branch?: string }): Promise<ReadMirror> {
	const tip = await remote.tip(request);
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
