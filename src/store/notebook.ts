/**
 * Notebook companions (feature 024): one additive file per page,
 * library/notebook/<pageId>.json, holding the AI's threads, the note chat
 * and the note's mode, instruction and reviewer. The page's own text is
 * never written here or anywhere by this module. An older app ignores the
 * folder.
 *
 * - One write lock per tenant (as library-annotations.ts), so concurrent
 *   runs and route writes never lose each other's changes.
 * - A newer version is refused: read as an empty, read-only companion and
 *   never rewritten.
 * - A damaged file is set aside as <pageId>.damaged-<time>.json and an
 *   empty companion is used; the next read says so once.
 * - Moving the page to the trash keeps the file; deleting it for good
 *   removes it (src/store/library.ts calls removeCompanionFile).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nanoid } from "nanoid";
import { PATHS, tenantScoped } from "../../config.ts";
import { emptyCompanion, parseCompanion, type NoteCompanion } from "../core/notebook.ts";

const dir = () => path.join(PATHS.library, "notebook");
/** The companion file of a page. */
export const companionFile = (pageId: string) => path.join(dir(), `${pageId}.json`);

/** Deletes a page's companion for good. Missing is fine. */
export async function removeCompanionFile(pageId: string): Promise<void> {
	await fs.rm(companionFile(pageId), { force: true });
}

export class NotebookReadOnlyError extends Error {
	constructor() {
		super("These notes were written by a newer version of the app, so they can't be changed here.");
		this.name = "NotebookReadOnlyError";
	}
}

export interface CompanionRead {
	companion: NoteCompanion;
	/** "future-version": shown empty and never written. */
	readOnly: "future-version" | null;
	/** A damaged file was set aside on this read (or since the last write). */
	setAside: boolean;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
	const lock = tenantScoped("__lhNotebookLock", () => ({ tail: Promise.resolve() as Promise<unknown> }));
	const run = lock.tail.then(fn, fn);
	lock.tail = run.catch(() => {});
	return run;
}

/** Pages whose damaged file was set aside and not yet written over: the note says so until then. */
const setAsidePages = () => tenantScoped("__lhNotebookSetAside", () => new Set<string>());

async function read(pageId: string): Promise<CompanionRead> {
	const file = companionFile(pageId);
	const raw = await fs.readFile(file, "utf8").catch((err) => {
		if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
		throw err;
	});
	if (raw === null) return { companion: emptyCompanion(pageId), readOnly: null, setAside: setAsidePages().has(pageId) };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = undefined;
	}
	const result = parseCompanion(parsed, pageId);
	if (result.ok) return { companion: result.companion, readOnly: null, setAside: setAsidePages().has(pageId) };
	if (result.reason === "future-version") return { companion: emptyCompanion(pageId), readOnly: "future-version", setAside: false };
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	await fs.rename(file, path.join(dir(), `${pageId}.damaged-${stamp}-${nanoid(4)}.json`)).catch(() => {});
	console.error(`[notebook] set aside a damaged companion for ${pageId}: ${result.detail}`);
	setAsidePages().add(pageId);
	return { companion: emptyCompanion(pageId), readOnly: null, setAside: true };
}

async function write(companion: NoteCompanion): Promise<void> {
	await fs.mkdir(dir(), { recursive: true });
	const file = companionFile(companion.pageId);
	const temp = `${file}.${nanoid(8)}.tmp`;
	const handle = await fs.open(temp, "wx");
	try {
		await handle.writeFile(JSON.stringify(companion));
		await handle.sync();
	} finally {
		await handle.close();
	}
	await fs.rename(temp, file);
	setAsidePages().delete(companion.pageId);
}

/**
 * How many open threads each note has, from the companion files alone
 * (the sidebar's dots). Read-only and lock-free: files are replaced by
 * rename, so a read sees a whole one. Damaged, newer-version and stray
 * files are skipped here (the note's own read sets a damaged one aside).
 * Notes with none are left out.
 */
async function openThreadCounts(): Promise<Record<string, number>> {
	const names = await fs.readdir(dir()).catch((err) => {
		if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [] as string[];
		throw err;
	});
	const counts: Record<string, number> = {};
	await Promise.all(names.map(async (name) => {
		const match = /^([A-Za-z0-9_-]+)\.json$/.exec(name);
		if (!match) return;
		const pageId = match[1]!;
		const raw = await fs.readFile(path.join(dir(), name), "utf8").catch(() => null);
		if (raw === null) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		const result = parseCompanion(parsed, pageId);
		if (!result.ok) return;
		const open = result.companion.threads.filter((thread) => thread.status === "open").length;
		if (open > 0) counts[pageId] = open;
	}));
	return counts;
}

/** What an update callback answers: the next companion, or a refusal that writes nothing. */
export type CompanionChange<R> = { companion: NoteCompanion; result: R } | { refused: string; status: number };

export const notebookStore = {
	read: (pageId: string) => withLock(() => read(pageId)),
	/** Read, change and write under the lock. A newer-version file throws
	 *  NotebookReadOnlyError and is left alone; a refusal writes nothing. */
	update: <R>(pageId: string, change: (companion: NoteCompanion) => CompanionChange<R>) => withLock(async (): Promise<{ result: R; companion: NoteCompanion } | { refused: string; status: number }> => {
		const current = await read(pageId);
		if (current.readOnly) throw new NotebookReadOnlyError();
		const outcome = change(structuredClone(current.companion));
		if ("refused" in outcome) return outcome;
		await write(outcome.companion);
		return { result: outcome.result, companion: outcome.companion };
	}),
	remove: (pageId: string) => withLock(() => removeCompanionFile(pageId)),
	openThreadCounts,
};

export type NotebookStore = typeof notebookStore;
