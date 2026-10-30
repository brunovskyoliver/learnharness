/**
 * The Library store (feature 009, research R2-R3). Every Library filesystem
 * write lives here. Document bytes stay in the flat files/ folder, under their
 * names, so the jailed fs tools keep working; library/catalog.json holds what
 * a folder can't. Listing reconciles the two and never touches bytes.
 */
import { createReadStream, createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { nanoid } from "nanoid";
import { PATHS, tenantScoped } from "../../config.ts";
import { emit } from "../core/events.ts";
import {
	CATALOG_VERSION, CONTENT_CHECK_BYTES, contentMatches, isTombstone, kindForName, LIBRARY_REFUSALS, LibraryCatalogError,
	nameKey, suggestName, uploadName,
	type LibraryCatalog, type LibraryItem, type LibraryKind, type LibraryRefusal, type LibraryTextState, type LibraryTombstone,
} from "../core/library.ts";
import type { LibraryStore } from "../core/ports.ts";

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

const catalogFile = () => path.join(PATHS.library, "catalog.json");
const derivedFile = (id: string) => path.join(PATHS.library, "derived", `${id}.json`);
const tmpDir = () => path.join(PATHS.data, "tmp");
const isCode = (err: unknown, code: string) => (err as NodeJS.ErrnoException)?.code === code;

/** One writer at a time per tenant. docs/hosting.md: one process, so a promise
 *  chain is enough. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
	const lock = tenantScoped("__lhLibraryLock", () => ({ tail: Promise.resolve() as Promise<unknown> }));
	const run = lock.tail.then(fn, fn);
	lock.tail = run.catch(() => {});
	return run;
}

async function readCatalog(): Promise<LibraryCatalog> {
	let raw: string;
	try {
		raw = await fs.readFile(catalogFile(), "utf8");
	} catch (err) {
		if (isCode(err, "ENOENT")) return { version: CATALOG_VERSION, items: [] };
		throw new LibraryCatalogError(`The Library catalog could not be read: ${(err as Error).message}`);
	}
	let parsed: LibraryCatalog;
	try {
		parsed = JSON.parse(raw) as LibraryCatalog;
	} catch {
		throw new LibraryCatalogError("The Library catalog is damaged.");
	}
	if (typeof parsed?.version !== "number" || !Array.isArray(parsed.items)) throw new LibraryCatalogError("The Library catalog is damaged.");
	if (parsed.version > CATALOG_VERSION) throw new LibraryCatalogError("The Library catalog comes from a newer version of the app.");
	return parsed;
}

async function writeCatalog(catalog: LibraryCatalog): Promise<void> {
	await fs.mkdir(PATHS.library, { recursive: true });
	const temp = `${catalogFile()}.${nanoid(8)}.tmp`;
	const file = await fs.open(temp, "wx");
	try {
		await file.writeFile(JSON.stringify(catalog, null, "\t"));
		await file.sync();
	} finally {
		await file.close();
	}
	await fs.rename(temp, catalogFile());
}

const liveItems = (catalog: LibraryCatalog) => catalog.items.filter((i): i is LibraryItem => !isTombstone(i));
const tombstone = (item: LibraryItem, deletedAt: string): LibraryTombstone => ({ id: item.id, name: item.name, kind: item.kind, deletedAt });
const replace = (catalog: LibraryCatalog, id: string, next: LibraryItem | LibraryTombstone) => {
	catalog.items = catalog.items.map((i) => (i.id === id ? next : i));
};

/** Bring the catalog in line with the folder. Returns whether it changed. */
async function reconcile(catalog: LibraryCatalog): Promise<boolean> {
	const entries = await fs.readdir(PATHS.files, { withFileTypes: true }).catch((err) => {
		if (isCode(err, "ENOENT")) return [];
		throw err;
	});
	const onDisk = new Map<string, { size: number; mtime: string }>();
	for (const entry of entries) {
		// Regular files with a usable name only: symlinks are never followed.
		if (!entry.isFile() || !uploadName(entry.name)) continue;
		const stat = await fs.lstat(path.join(PATHS.files, entry.name));
		onDisk.set(entry.name, { size: stat.size, mtime: stat.mtime.toISOString() });
	}
	let changed = false;
	const documents = liveItems(catalog).filter((i) => i.kind !== "page");
	const vanished: LibraryItem[] = [];
	for (const item of documents) {
		const file = onDisk.get(item.name);
		if (!file) { vanished.push(item); continue; }
		onDisk.delete(item.name);
		if (file.size !== item.size || file.mtime !== item.updatedAt) {
			replace(catalog, item.id, { ...item, size: file.size, updatedAt: file.mtime });
			changed = true;
		}
	}
	for (const [name, file] of onDisk) {
		const matches = vanished.filter((i) => i.size === file.size && i.updatedAt === file.mtime);
		if (matches.length === 1) {
			// A crash between moving a file and writing the catalog.
			const item = matches[0]!;
			vanished.splice(vanished.indexOf(item), 1);
			replace(catalog, item.id, { ...item, name, kind: kindForName(name) ?? "other", previousNames: [...(item.previousNames ?? []), item.name] });
		} else {
			catalog.items.push({ id: newId(), name, kind: kindForName(name) ?? "other", size: file.size, createdAt: file.mtime, updatedAt: file.mtime, origin: { type: "existing" } });
		}
		changed = true;
	}
	const now = new Date().toISOString();
	for (const item of vanished) {
		replace(catalog, item.id, tombstone(item, now));
		changed = true;
	}
	return changed;
}

const newId = () => `lib_${nanoid()}`;

/** Reconciled catalog, saved if reconciling changed it. Call inside the lock. */
async function loadReconciled(): Promise<LibraryCatalog> {
	const catalog = await readCatalog();
	if (await reconcile(catalog)) await writeCatalog(catalog);
	return catalog;
}

/** A crash can strand an upload's temp file; nothing legitimate lasts a day. */
async function sweepStaleUploads(): Promise<void> {
	const names = await fs.readdir(tmpDir()).catch(() => [] as string[]);
	const cutoff = Date.now() - STALE_UPLOAD_MS;
	await Promise.all(names.filter((n) => n.startsWith("upload-")).map(async (name) => {
		const file = path.join(tmpDir(), name);
		const stat = await fs.lstat(file).catch(() => null);
		if (stat && stat.mtimeMs < cutoff) await fs.rm(file, { force: true });
	}));
}

/** Every name a new item can't take: live items plus anything in the folder,
 *  including the symlinks and folders reconcile skips. */
async function takenKeys(catalog: LibraryCatalog): Promise<Set<string>> {
	const disk = await fs.readdir(PATHS.files).catch(() => [] as string[]);
	return new Set([...liveItems(catalog).map((i) => i.name), ...disk].map(nameKey));
}

const nameTaken = (name: string, taken: Set<string>): LibraryRefusal => ({
	refused: "name_taken",
	message: `${name} is already in your Library.`,
	name,
	suggestedName: suggestName(name, (candidate) => taken.has(nameKey(candidate))),
});

async function readHead(file: string): Promise<Uint8Array> {
	const handle = await fs.open(file, "r");
	try {
		const buffer = new Uint8Array(CONTENT_CHECK_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, CONTENT_CHECK_BYTES, 0);
		return buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

/** Stream to a temp file. Returns false when the body wasn't exactly `declared`
 *  bytes, including a sender that went away. Disk errors throw. */
async function receive(body: AsyncIterable<Uint8Array>, declared: number, temp: string): Promise<boolean> {
	let received = 0;
	let whole = true;
	async function* counted() {
		try {
			for await (const chunk of body) {
				received += chunk.length;
				// Stop writing past the declared length; the upload is already refused.
				if (received > declared) { whole = false; return; }
				yield chunk;
			}
		} catch {
			whole = false;
		}
	}
	const out = createWriteStream(temp, { flags: "wx" });
	await pipeline(counted, out);
	return whole && received === declared;
}

async function writeUpload(name: string, body: AsyncIterable<Uint8Array>, declared: number): Promise<LibraryItem | LibraryRefusal> {
	await fs.mkdir(tmpDir(), { recursive: true });
	const temp = path.join(tmpDir(), `upload-${nanoid()}`);
	try {
		if (!await receive(body, declared, temp)) return LIBRARY_REFUSALS.lengthMismatch;
		if (!contentMatches(name, await readHead(temp))) return LIBRARY_REFUSALS.contentMismatch;
		const handle = await fs.open(temp, "r+");
		try { await handle.sync(); } finally { await handle.close(); }
		const item = await withLock(async () => {
			const catalog = await loadReconciled();
			const taken = await takenKeys(catalog);
			if (taken.has(nameKey(name))) return nameTaken(name, taken);
			await fs.mkdir(PATHS.files, { recursive: true });
			const target = path.join(PATHS.files, name);
			try {
				// link() never overwrites and never follows a symlink at the target.
				await fs.link(temp, target);
			} catch (err) {
				if (isCode(err, "EEXIST")) return nameTaken(name, taken.add(nameKey(name)));
				throw err;
			}
			const stat = await fs.lstat(target);
			const kind = kindForName(name) ?? "other";
			const added: LibraryItem = {
				id: newId(), name, kind, size: stat.size, createdAt: new Date().toISOString(), updatedAt: stat.mtime.toISOString(),
				origin: { type: "upload" }, ...(kind === "pdf" ? { textState: "pending" as const } : {}),
			};
			catalog.items.push(added);
			await writeCatalog(catalog);
			return added;
		});
		if (!("refused" in item)) emit("library-changed", { itemId: item.id });
		return item;
	} finally {
		await fs.rm(temp, { force: true });
	}
}

/** What a rename's new name makes the item. Null when the bytes don't fit it. */
async function kindAfterRename(item: LibraryItem, name: string): Promise<LibraryKind | null> {
	if (item.kind === "page") return "page";
	const next = kindForName(name) ?? "other";
	if (next === item.kind) return next;
	if (next === "other") return null;
	return contentMatches(name, await readHead(path.join(PATHS.files, item.name))) ? next : null;
}

async function moveDocument(from: string, to: string): Promise<void> {
	const source = path.join(PATHS.files, from);
	const target = path.join(PATHS.files, to);
	// Same file by another case: link() would see itself on a case-insensitive volume.
	if (nameKey(from) === nameKey(to)) return fs.rename(source, target);
	await fs.link(source, target);
	await fs.unlink(source);
}

async function rename(id: string, raw: string): Promise<LibraryItem | LibraryRefusal | null> {
	const name = uploadName(raw);
	return withLock(async () => {
		const catalog = await loadReconciled();
		const item = liveItems(catalog).find((i) => i.id === id);
		if (!item) return null;
		if (!name) return LIBRARY_REFUSALS.invalidName;
		if (name === item.name) return item;
		const taken = await takenKeys(catalog);
		if (nameKey(name) !== nameKey(item.name) && taken.has(nameKey(name))) return nameTaken(name, taken);
		const kind = await kindAfterRename(item, name);
		if (!kind) return { refused: "unsupported_type", message: `${item.name} can't become that type of file.` };
		if (item.kind !== "page") {
			try {
				await moveDocument(item.name, name);
			} catch (err) {
				if (isCode(err, "EEXIST")) return nameTaken(name, taken.add(nameKey(name)));
				throw err;
			}
		}
		const previous = nameKey(name) === nameKey(item.name) ? item.previousNames : [...(item.previousNames ?? []), item.name];
		const renamed: LibraryItem = { ...item, name, kind, ...(previous ? { previousNames: previous } : {}) };
		replace(catalog, id, renamed);
		await writeCatalog(catalog);
		emit("library-changed", { itemId: id });
		return renamed;
	});
}

async function remove(id: string): Promise<boolean> {
	return withLock(async () => {
		const catalog = await readCatalog();
		const item = liveItems(catalog).find((i) => i.id === id);
		if (!item) return false;
		if (item.kind === "page") await fs.rm(path.join(PATHS.library, "pages", id), { recursive: true, force: true });
		else await fs.rm(path.join(PATHS.files, item.name), { force: true });
		await fs.rm(derivedFile(id), { force: true });
		replace(catalog, id, tombstone(item, new Date().toISOString()));
		await writeCatalog(catalog);
		emit("library-changed", { itemId: id });
		return true;
	});
}

export const libraryStore: LibraryStore = {
	list: () => withLock(async () => {
		await sweepStaleUploads();
		const items = liveItems(await loadReconciled());
		return items.sort((a, b) => a.name.localeCompare(b.name));
	}),
	get: (id) => withLock(async () => liveItems(await loadReconciled()).find((i) => i.id === id) ?? null),
	catalog: () => withLock(async () => (await loadReconciled()).items),
	readText: (item) => fs.readFile(
		item.kind === "page"
			? path.join(PATHS.library, "pages", item.id, `v${item.headVersion ?? 1}.md`)
			: path.join(PATHS.files, item.name),
		"utf8",
	),
	writeUpload,
	rename,
	remove,
	setTextState: (id, state: LibraryTextState) => withLock(async () => {
		const catalog = await readCatalog();
		const item = liveItems(catalog).find((i) => i.id === id);
		if (!item || item.textState === state) return;
		replace(catalog, id, { ...item, textState: state });
		await writeCatalog(catalog);
		emit("library-changed", { itemId: id });
	}),
	readDerived: async (id) => {
		const raw = await fs.readFile(derivedFile(id), "utf8").catch(() => null);
		if (raw === null) return null;
		try { return JSON.parse(raw) as unknown; } catch { return null; }
	},
	writeDerived: async (id, value) => {
		await fs.mkdir(path.dirname(derivedFile(id)), { recursive: true });
		const temp = `${derivedFile(id)}.${nanoid(8)}.tmp`;
		await fs.writeFile(temp, JSON.stringify(value));
		await fs.rename(temp, derivedFile(id));
	},
	documentPath: (item) => path.join(PATHS.files, item.name),
};

/** A read stream for a document, refusing anything but a regular file. */
export async function openDocumentStream(file: string): Promise<{ stream: ReturnType<typeof createReadStream>; size: number } | null> {
	const stat = await fs.lstat(file).catch(() => null);
	if (!stat?.isFile()) return null;
	return { stream: createReadStream(file), size: stat.size };
}
