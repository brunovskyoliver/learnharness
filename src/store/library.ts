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
	CATALOG_VERSION, CONTENT_CHECK_BYTES, contentMatches, folderSubtree, isTombstone, isVersionedKind, liveFolderId, withMarks, wouldCycle, isUnseenTutorVersion, kindForName, LIBRARY_REFUSALS, LibraryCatalogError,
	nameKey, PAGE_MAX_BYTES, suggestName, uploadName,
	type LibraryCatalog, type LibraryFolder, type LibraryItem, type LibraryMarks, type LibraryTrashEntry, type LibraryKind, type LibraryOrigin, type LibraryRefusal, type LibraryTextState, type LibraryTombstone,
	type PageDraft, type PageHead, type PageState, type PageStale, type PageVersion, type PageVersionCause, type PageWriteResult,
} from "../core/library.ts";
import { diagramIdeaLinks, diagramOutline, diagramScanText, parseDiagram } from "../core/diagram.ts";
import { scanWikiLinks, type WikiPins } from "../core/note-links.ts";
import { appendBlock } from "../core/note-sources.ts";
import type { AgentRevision, AgentRevisionResult, LibraryStore, PageCreateOptions, PageText } from "../core/ports.ts";

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

const catalogFile = () => path.join(PATHS.library, "catalog.json");
const derivedFile = (id: string) => path.join(PATHS.library, "derived", `${id}.json`);
/** Feature 020's file: it goes when the item goes for good, and stays through the trash. */
const annotationsFile = (id: string) => path.join(PATHS.library, "annotations", `${id}.json`);
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
	// Diagrams live beside `items` on disk (feature 022). In memory they are items.
	const { diagrams, ...rest } = parsed;
	if (!Array.isArray(diagrams)) return rest;
	const known = new Set(diagrams.map((entry) => entry.id));
	return { ...rest, items: [...rest.items.filter((entry) => !known.has(entry.id)), ...diagrams] };
}

async function writeCatalog(catalog: LibraryCatalog): Promise<void> {
	await fs.mkdir(PATHS.library, { recursive: true });
	const temp = `${catalogFile()}.${nanoid(8)}.tmp`;
	const file = await fs.open(temp, "wx");
	const diagrams = catalog.items.filter((entry) => entry.kind === "diagram");
	const onDisk: LibraryCatalog = diagrams.length === 0 ? catalog : { ...catalog, items: catalog.items.filter((entry) => entry.kind !== "diagram"), diagrams };
	try {
		await file.writeFile(JSON.stringify(onDisk, null, "\t"));
		await file.sync();
	} finally {
		await file.close();
	}
	await fs.rename(temp, catalogFile());
}

const foldersOf = (catalog: LibraryCatalog) => catalog.folders ?? [];
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
	const documents = liveItems(catalog).filter((i) => !isVersionedKind(i.kind));
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

async function writeUpload(name: string, body: AsyncIterable<Uint8Array>, declared: number, folderId?: string | null): Promise<LibraryItem | LibraryRefusal> {
	await fs.mkdir(tmpDir(), { recursive: true });
	const temp = path.join(tmpDir(), `upload-${nanoid()}`);
	try {
		if (!await receive(body, declared, temp)) return LIBRARY_REFUSALS.lengthMismatch;
		if (!contentMatches(name, await readHead(temp))) return LIBRARY_REFUSALS.contentMismatch;
		const handle = await fs.open(temp, "r+");
		try { await handle.sync(); } finally { await handle.close(); }
		const item = await withLock(async () => {
			const catalog = await loadReconciled();
			if (folderId && !foldersOf(catalog).some((f) => f.id === folderId)) return LIBRARY_REFUSALS.folderMissing;
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
				origin: { type: "upload" }, ...(kind === "pdf" ? { textState: "pending" as const } : {}), ...(folderId ? { folderId } : {}),
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
	if (isVersionedKind(item.kind)) return item.kind;
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
		if (!isVersionedKind(item.kind)) {
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
		if (nameKey(name) !== nameKey(item.name)) await pinLinksTo(catalog, id, item.name);
		emit("library-changed", { itemId: id });
		return renamed;
	});
}

async function remove(id: string): Promise<boolean> {
	return withLock(async () => {
		const catalog = await readCatalog();
		const item = liveItems(catalog).find((i) => i.id === id);
		if (!item) return false;
		if (isVersionedKind(item.kind)) await fs.rm(pageDir(id), { recursive: true, force: true });
		else await fs.rm(path.join(PATHS.files, item.name), { force: true });
		await fs.rm(proposalsDir(id), { recursive: true, force: true });
		await fs.rm(derivedFile(id), { force: true });
		await fs.rm(annotationsFile(id), { force: true });
		replace(catalog, id, tombstone(item, new Date().toISOString()));
		await writeCatalog(catalog);
		emit("library-changed", { itemId: id });
		return true;
	});
}

// ── Folders (feature 011): catalog only, so no byte ever moves ──

const siblingKeys = (catalog: LibraryCatalog, parentId: string | null, except?: string) =>
	new Set(foldersOf(catalog).filter((f) => f.id !== except && liveFolderId(f.parentId, foldersOf(catalog)) === parentId).map((f) => nameKey(f.name)));
const folderClash = (name: string, taken: Set<string>): LibraryRefusal => ({
	...nameTaken(name, taken),
	message: `${name} is already a folder here.`,
});
const putFolder = (catalog: LibraryCatalog, next: LibraryFolder) => {
	catalog.folders = foldersOf(catalog).map((f) => (f.id === next.id ? next : f));
};

async function createFolder(raw: string, parentId: string | null): Promise<LibraryFolder | LibraryRefusal> {
	const name = uploadName(raw);
	if (!name) return LIBRARY_REFUSALS.invalidName;
	return withLock(async () => {
		const catalog = await readCatalog();
		if (parentId && !foldersOf(catalog).some((f) => f.id === parentId)) return LIBRARY_REFUSALS.folderMissing;
		const taken = siblingKeys(catalog, parentId);
		if (taken.has(nameKey(name))) return folderClash(name, taken);
		const now = new Date().toISOString();
		const folder: LibraryFolder = { id: `fld_${nanoid()}`, name, parentId, createdAt: now, updatedAt: now };
		catalog.folders = [...foldersOf(catalog), folder];
		await writeCatalog(catalog);
		emit("library-changed", { itemId: folder.id });
		return folder;
	});
}

async function renameFolder(id: string, raw: string): Promise<LibraryFolder | LibraryRefusal | null> {
	const name = uploadName(raw);
	return withLock(async () => {
		const catalog = await readCatalog();
		const folder = foldersOf(catalog).find((f) => f.id === id);
		if (!folder) return null;
		if (!name) return LIBRARY_REFUSALS.invalidName;
		if (name === folder.name) return folder;
		const taken = siblingKeys(catalog, liveFolderId(folder.parentId, foldersOf(catalog)), id);
		if (taken.has(nameKey(name))) return folderClash(name, taken);
		const next = { ...folder, name, updatedAt: new Date().toISOString() };
		putFolder(catalog, next);
		await writeCatalog(catalog);
		emit("library-changed", { itemId: id });
		return next;
	});
}

async function moveFolder(id: string, parentId: string | null): Promise<LibraryFolder | LibraryRefusal | null> {
	return withLock(async () => {
		const catalog = await readCatalog();
		const folders = foldersOf(catalog);
		const folder = folders.find((f) => f.id === id);
		if (!folder) return null;
		if (parentId && !folders.some((f) => f.id === parentId)) return LIBRARY_REFUSALS.folderMissing;
		if (wouldCycle(id, parentId, folders)) return LIBRARY_REFUSALS.folderCycle;
		if (liveFolderId(folder.parentId, folders) === parentId) return folder;
		const taken = siblingKeys(catalog, parentId, id);
		if (taken.has(nameKey(folder.name))) return folderClash(folder.name, taken);
		const next = { ...folder, parentId, updatedAt: new Date().toISOString() };
		putFolder(catalog, next);
		await writeCatalog(catalog);
		emit("library-changed", { itemId: id });
		return next;
	});
}

async function removeFolder(id: string): Promise<boolean | LibraryRefusal> {
	return withLock(async () => {
		const catalog = await loadReconciled();
		const folders = foldersOf(catalog);
		if (!folders.some((f) => f.id === id)) return false;
		if (folders.some((f) => f.parentId === id) || liveItems(catalog).some((i) => i.folderId === id)) return LIBRARY_REFUSALS.folderNotEmpty;
		catalog.folders = folders.filter((f) => f.id !== id);
		await writeCatalog(catalog);
		emit("library-changed", { itemId: id });
		return true;
	});
}

async function moveItem(id: string, folderId: string | null): Promise<LibraryItem | LibraryRefusal | null> {
	return withLock(async () => {
		const catalog = await loadReconciled();
		const item = liveItems(catalog).find((i) => i.id === id);
		if (!item) return null;
		if (folderId && !foldersOf(catalog).some((f) => f.id === folderId)) return LIBRARY_REFUSALS.folderMissing;
		const { folderId: _old, ...rest } = item;
		const next: LibraryItem = folderId ? { ...rest, folderId } : rest;
		replace(catalog, id, next);
		await writeCatalog(catalog);
		emit("library-changed", { itemId: id });
		return next;
	});
}

// ── Marks, recent and trash (feature 012) ──

const putFolderMarks = (id: string, marks: Omit<LibraryMarks, "tags">) => withLock(async () => {
	const catalog = await readCatalog();
	const folder = foldersOf(catalog).find((f) => f.id === id);
	if (!folder) return null;
	const next = withMarks(folder, marks, new Date().toISOString());
	putFolder(catalog, next);
	await writeCatalog(catalog);
	emit("library-changed", { itemId: id });
	return next;
});

const putItemMarks = (id: string, marks: LibraryMarks) => withLock(async () => {
	const catalog = await loadReconciled();
	const item = liveItems(catalog).find((i) => i.id === id);
	if (!item) return null;
	const next = withMarks(item, marks, new Date().toISOString());
	replace(catalog, id, next);
	await writeCatalog(catalog);
	emit("library-changed", { itemId: id });
	return next;
});

const trashOf = (catalog: LibraryCatalog) => catalog.trash ?? [];
const trashDir = (entryId: string) => path.join(PATHS.library, "trash", entryId);
const trashedBytes = (entryId: string, itemId: string) => path.join(trashDir(entryId), itemId);

/** Documents leave files/, so the agent's jailed file tools can't read them. The
 *  catalog is written first: a crash here leaves the file in files/, where
 *  reconcile adopts it as an item. Nothing is lost either way. */
async function moveBytesToTrash(entry: LibraryTrashEntry): Promise<void> {
	await fs.mkdir(trashDir(entry.id), { recursive: true });
	for (const item of entry.items) {
		if (!isVersionedKind(item.kind)) await fs.rename(path.join(PATHS.files, item.name), trashedBytes(entry.id, item.id)).catch((err) => { if (!isCode(err, "ENOENT")) throw err; });
	}
}

async function trashItem(id: string): Promise<LibraryTrashEntry | null> {
	return withLock(async () => {
		const catalog = await loadReconciled();
		const item = liveItems(catalog).find((i) => i.id === id);
		if (!item) return null;
		const entry: LibraryTrashEntry = {
			id: `trs_${nanoid()}`, name: item.name, kind: item.kind, trashedAt: new Date().toISOString(),
			folderId: liveFolderId(item.folderId, foldersOf(catalog)), items: [item], folders: [],
		};
		catalog.items = catalog.items.filter((i) => i.id !== id);
		catalog.trash = [...trashOf(catalog), entry];
		await writeCatalog(catalog);
		await moveBytesToTrash(entry);
		emit("library-changed", { itemId: id });
		return entry;
	});
}

async function trashFolder(id: string): Promise<LibraryTrashEntry | null> {
	return withLock(async () => {
		const catalog = await loadReconciled();
		const folders = foldersOf(catalog);
		const root = folders.find((f) => f.id === id);
		if (!root) return null;
		const subtree = folderSubtree(id, folders);
		const items = liveItems(catalog).filter((i) => i.folderId && subtree.has(i.folderId));
		const entry: LibraryTrashEntry = {
			id: `trs_${nanoid()}`, name: root.name, kind: "folder", trashedAt: new Date().toISOString(),
			folderId: liveFolderId(root.parentId, folders), items, folders: [root, ...folders.filter((f) => f.id !== id && subtree.has(f.id))],
		};
		const gone = new Set(items.map((i) => i.id));
		catalog.items = catalog.items.filter((i) => !gone.has(i.id));
		catalog.folders = folders.filter((f) => !subtree.has(f.id));
		catalog.trash = [...trashOf(catalog), entry];
		await writeCatalog(catalog);
		await moveBytesToTrash(entry);
		emit("library-changed", { itemId: id });
		return entry;
	});
}

async function restoreTrash(entryId: string): Promise<{ items: LibraryItem[]; folders: LibraryFolder[] } | null> {
	return withLock(async () => {
		const catalog = await loadReconciled();
		const entry = trashOf(catalog).find((e) => e.id === entryId);
		if (!entry) return null;
		const parent = liveFolderId(entry.folderId, foldersOf(catalog));
		const restoredFolders = entry.folders.map((folder, index) => {
			if (index !== 0) return folder;
			const taken = siblingKeys(catalog, parent);
			return { ...folder, parentId: parent, name: taken.has(nameKey(folder.name)) ? suggestName(folder.name, (c) => taken.has(nameKey(c))) : folder.name };
		});
		const taken = await takenKeys(catalog);
		const restoredItems: LibraryItem[] = [];
		for (const item of entry.items) {
			const name = taken.has(nameKey(item.name)) ? suggestName(item.name, (c) => taken.has(nameKey(c))) : item.name;
			taken.add(nameKey(name));
			const { folderId: _old, ...rest } = item;
			const home = entry.folders.length > 0 ? item.folderId : (parent ?? undefined);
			if (!isVersionedKind(item.kind)) {
				await fs.mkdir(PATHS.files, { recursive: true });
				// link() never overwrites. The bytes stay in the trash until the catalog is written.
				await fs.link(trashedBytes(entry.id, item.id), path.join(PATHS.files, name));
			}
			restoredItems.push({
				...rest, name, ...(home ? { folderId: home } : {}),
				...(name !== item.name ? { previousNames: [...(item.previousNames ?? []), item.name] } : {}),
			});
		}
		catalog.items = [...catalog.items.filter((i) => !restoredItems.some((r) => r.id === i.id)), ...restoredItems];
		catalog.folders = [...foldersOf(catalog), ...restoredFolders];
		catalog.trash = trashOf(catalog).filter((e) => e.id !== entryId);
		await writeCatalog(catalog);
		await fs.rm(trashDir(entry.id), { recursive: true, force: true });
		emit("library-changed", { itemId: entryId });
		return { items: restoredItems, folders: restoredFolders };
	});
}

async function purgeTrash(entryId: string): Promise<boolean> {
	return withLock(async () => {
		const catalog = await readCatalog();
		const entry = trashOf(catalog).find((e) => e.id === entryId);
		if (!entry) return false;
		const now = new Date().toISOString();
		catalog.items = [...catalog.items, ...entry.items.map((item) => tombstone(item, now))];
		catalog.trash = trashOf(catalog).filter((e) => e.id !== entryId);
		await writeCatalog(catalog);
		await fs.rm(trashDir(entry.id), { recursive: true, force: true });
		for (const item of entry.items) {
			if (isVersionedKind(item.kind)) await fs.rm(pageDir(item.id), { recursive: true, force: true });
			await fs.rm(proposalsDir(item.id), { recursive: true, force: true });
			await fs.rm(derivedFile(item.id), { force: true });
			await fs.rm(annotationsFile(item.id), { force: true });
		}
		emit("library-changed", { itemId: entryId });
		return true;
	});
}

// ── Note links (feature 016) ──

const pinsFile = () => path.join(PATHS.library, "wiki-pins.json");

/** After a rename, pages linking to the old name keep meaning this item even if
 *  another page later takes that name. A separate file, so an older app ignores
 *  it. A failure here costs that protection, never the rename. */
async function pinLinksTo(catalog: LibraryCatalog, id: string, oldName: string): Promise<void> {
	try {
		const key = nameKey(oldName.trim());
		const pins = (await readJsonFile<WikiPins>(pinsFile())) ?? {};
		let touched = false;
		for (const page of liveItems(catalog).filter((i) => isVersionedKind(i.kind))) {
			const loaded = await loadPage(catalog, page.id, page.kind);
			if (!loaded || pins[page.id]?.[key]) continue;
			const texts = [loaded.head.content, ...(loaded.draft ? [loaded.draft.content] : [])].map((text) => linkableText(page.kind, text));
			if (!texts.some((text) => scanWikiLinks(text).some(({ target }) => nameKey(target.trim()) === key))) continue;
			pins[page.id] = { ...pins[page.id], [key]: id };
			touched = true;
		}
		if (touched) await writeJsonFile(pinsFile(), pins);
	} catch (err) {
		console.error("[library] wiki links not pinned:", err);
	}
}

/** What the link scanners may read. A diagram that can't be read has no links to give. */
function linkableText(kind: LibraryKind, content: string): string {
	if (kind !== "diagram") return content;
	const parsed = parseDiagram(content);
	return parsed.ok ? diagramScanText(parsed.doc) : "";
}

const pageTexts = () => withLock(async (): Promise<PageText[]> => {
	const catalog = await loadReconciled();
	const out: PageText[] = [];
	for (const item of liveItems(catalog)) {
		if (!isVersionedKind(item.kind)) continue;
		const page = await loadPage(catalog, item.id, item.kind);
		if (!page) continue;
		const chatIds = [...new Set(page.versions.flatMap((v) => (v.chatId ? [v.chatId] : [])))];
		const content = page.draft?.content ?? page.head.content;
		const parsed = item.kind === "diagram" ? parseDiagram(content) : null;
		out.push({ item, text: linkableText(item.kind, content), chatIds, ...(parsed?.ok ? { ideas: diagramIdeaLinks(parsed.doc) } : {}) });
	}
	return out;
});

const recentFile = () => path.join(PATHS.library, "recent.json");
const RECENT_KEPT = 50;
type RecentEntry = { id: string; at: string };

const markOpened = (id: string) => withLock(async () => {
	if (!liveItems(await readCatalog()).some((i) => i.id === id)) return false;
	const recent = (await readJsonFile<RecentEntry[]>(recentFile())) ?? [];
	await fs.mkdir(PATHS.library, { recursive: true });
	await writeJsonFile(recentFile(), [{ id, at: new Date().toISOString() }, ...recent.filter((r) => r.id !== id)].slice(0, RECENT_KEPT));
	emit("library-changed", { itemId: id });
	return true;
});

const recentItems = (limit = 20) => withLock(async () => {
	const live = liveItems(await loadReconciled());
	const recent = (await readJsonFile<RecentEntry[]>(recentFile())) ?? [];
	return recent.flatMap((r) => live.find((i) => i.id === r.id) ?? []).slice(0, limit);
});

// ── Pages (data-model.md): append-only versions and one learner draft ──────

const pageDir = (id: string) => path.join(PATHS.library, "pages", id);
/** A diagram's proposals (feature 022), apart from its versions. "new" holds those that make one. */
const proposalsDir = (id: string) => path.join(PATHS.library, "diagram-proposals", id);
const versionsFile = (id: string) => path.join(pageDir(id), "versions.jsonl");
const contentFile = (id: string, n: number) => path.join(pageDir(id), `v${n}.md`);
const draftFile = (id: string) => path.join(pageDir(id), "draft.json");
const namesFile = (id: string) => path.join(pageDir(id), "names.json");
const seenFile = (id: string) => path.join(pageDir(id), "seen.json");

async function readJsonFile<T>(file: string): Promise<T | null> {
	const raw = await fs.readFile(file, "utf8").catch((err) => {
		if (isCode(err, "ENOENT")) return null;
		throw err;
	});
	if (raw === null) return null;
	try { return JSON.parse(raw) as T; } catch { return null; }
}

/** Written whole through a temp file, like the draft. */
async function writeJsonFile(file: string, value: unknown): Promise<void> {
	const temp = `${file}.${nanoid(8)}.tmp`;
	const handle = await fs.open(temp, "wx");
	try {
		await handle.writeFile(JSON.stringify(value));
		await handle.sync();
	} finally {
		await handle.close();
	}
	await fs.rename(temp, file);
}

const readNames = async (id: string) => (await readJsonFile<Record<string, string>>(namesFile(id))) ?? {};
const withNames = (versions: readonly PageVersion[], names: Record<string, string>) =>
	versions.map((v) => (names[String(v.n)] ? { ...v, name: names[String(v.n)] } : v));

const tooLarge = (content: string) => Buffer.byteLength(content) > PAGE_MAX_BYTES;

/** Lines in order. A crash can leave a torn last line; it is not a version. */
async function readVersions(id: string): Promise<PageVersion[]> {
	const raw = await fs.readFile(versionsFile(id), "utf8").catch((err) => {
		if (isCode(err, "ENOENT")) return "";
		throw err;
	});
	const versions: PageVersion[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line) as PageVersion;
			if (typeof parsed.n === "number") versions.push(parsed);
		} catch { /* torn line */ }
	}
	return versions;
}

/** Higher than any line and any file: a content file with no line keeps its number. */
async function nextVersionNumber(id: string, versions: readonly PageVersion[]): Promise<number> {
	const names = await fs.readdir(pageDir(id)).catch(() => [] as string[]);
	const onDisk = names.map((name) => /^v(\d+)\.md$/.exec(name)?.[1]).filter(Boolean).map(Number);
	return Math.max(0, ...onDisk, ...versions.map((v) => v.n)) + 1;
}

async function appendSynced(file: string, text: string): Promise<void> {
	const handle = await fs.open(file, "a+");
	try {
		const { size } = await handle.stat();
		let lead = "";
		if (size > 0) {
			const last = new Uint8Array(1);
			await handle.read(last, 0, 1, size - 1);
			if (last[0] !== 0x0a) lead = "\n";
		}
		await handle.appendFile(`${lead}${text}\n`);
		await handle.sync();
	} finally {
		await handle.close();
	}
}

/** Content first, synced, with "wx"; the line after. Then the catalog follows. */
async function appendVersion(
	catalog: LibraryCatalog, item: LibraryItem, versions: readonly PageVersion[], content: string,
	meta: Pick<PageVersion, "author" | "base" | "cause"> & Partial<Pick<PageVersion, "restoredFrom" | "chatId" | "toolCallId" | "proposalId" | "editedByLearner">>,
): Promise<{ version: PageVersion; item: LibraryItem }> {
	await fs.mkdir(pageDir(item.id), { recursive: true });
	const n = await nextVersionNumber(item.id, versions);
	const handle = await fs.open(contentFile(item.id, n), "wx");
	try {
		await handle.writeFile(content);
		await handle.sync();
	} finally {
		await handle.close();
	}
	const version: PageVersion = { n, at: new Date().toISOString(), bytes: Buffer.byteLength(content), ...meta };
	await appendSynced(versionsFile(item.id), JSON.stringify(version));
	const next: LibraryItem = { ...item, headVersion: n, size: version.bytes, updatedAt: version.at };
	replace(catalog, item.id, next);
	await writeCatalog(catalog);
	return { version, item: next };
}

const readVersionText = (id: string, n: number) => fs.readFile(contentFile(id, n), "utf8");

async function readDraft(id: string): Promise<PageDraft | null> {
	const raw = await fs.readFile(draftFile(id), "utf8").catch((err) => {
		if (isCode(err, "ENOENT")) return null;
		throw err;
	});
	if (raw === null) return null;
	try { return JSON.parse(raw) as PageDraft; } catch { return null; }
}

async function writeDraft(id: string, draft: PageDraft): Promise<void> {
	const temp = `${draftFile(id)}.${nanoid(8)}.tmp`;
	const handle = await fs.open(temp, "wx");
	try {
		await handle.writeFile(JSON.stringify(draft));
		await handle.sync();
	} finally {
		await handle.close();
	}
	await fs.rename(temp, draftFile(id));
}

const clearDraft = (id: string) => fs.rm(draftFile(id), { force: true });

/** Always above the last rev, and above a cleared draft's rev too, since the
 *  clock moves on: a tab holding an old rev can never match a newer draft. */
const nextRev = (draft: PageDraft | null) => Math.max((draft?.rev ?? 0) + 1, Date.now());

const headOf = async (id: string, versions: readonly PageVersion[]): Promise<PageHead | null> => {
	const last = versions.at(-1);
	if (!last) return null;
	return { n: last.n, content: await readVersionText(id, last.n), author: last.author, at: last.at };
};

/** The page or diagram under the lock: its catalog entry, versions, head and draft. */
async function loadPage(catalog: LibraryCatalog, id: string, kind: LibraryKind = "page") {
	const item = liveItems(catalog).find((i) => i.id === id && i.kind === kind);
	if (!item) return null;
	const versions = await readVersions(id);
	const head = await headOf(id, versions);
	if (!head) return null;
	const draft = await readDraft(id);
	return { item, versions, head, draft };
}

function changed(itemId: string, version: PageVersion) {
	emit("library-changed", { itemId, version: version.n, author: version.author });
}

async function createVersioned(kind: "page" | "diagram", rawName: string, content: string, options: PageCreateOptions & { cause?: PageVersionCause; proposalId?: string; editedByLearner?: boolean }): Promise<{ item: LibraryItem; head: PageHead } | LibraryRefusal> {
	const name = uploadName(rawName);
	if (!name) return LIBRARY_REFUSALS.invalidName;
	if (tooLarge(content)) return LIBRARY_REFUSALS.pageTooLarge;
	return withLock(async () => {
		const catalog = await loadReconciled();
		if (options.toolCallId) {
			// The same call again returns its page, whatever has happened to it since.
			for (const item of liveItems(catalog)) {
				if (item.kind !== kind || item.origin.type !== "agent") continue;
				const versions = await readVersions(item.id);
				if (!versions.some((v) => v.toolCallId === options.toolCallId)) continue;
				const head = await headOf(item.id, versions);
				if (head) return { item, head: { ...head, n: versions.find((v) => v.toolCallId === options.toolCallId)!.n } };
			}
		}
		if (options.folderId && !foldersOf(catalog).some((f) => f.id === options.folderId)) return LIBRARY_REFUSALS.folderMissing;
		const taken = await takenKeys(catalog);
		if (taken.has(nameKey(name))) return nameTaken(name, taken);
		const now = new Date().toISOString();
		const origin: LibraryOrigin = options.author === "agent" ? { type: "agent", ...(options.chatId ? { chatId: options.chatId } : {}) } : { type: "learner" };
		const created: LibraryItem = { id: newId(), name, kind, size: 0, createdAt: now, updatedAt: now, origin, headVersion: 0, ...(options.folderId ? { folderId: options.folderId } : {}) };
		catalog.items.push(created);
		const { version, item } = await appendVersion(catalog, created, [], content, {
			author: options.author,
			base: 0,
			cause: options.cause ?? (options.author === "agent" ? "agent-create" : "save"),
			...(options.chatId ? { chatId: options.chatId } : {}),
			...(options.toolCallId ? { toolCallId: options.toolCallId } : {}),
			...(options.proposalId ? { proposalId: options.proposalId } : {}),
			...(options.editedByLearner ? { editedByLearner: true } : {}),
		});
		changed(item.id, version);
		return { item, head: { n: version.n, content, author: version.author, at: version.at } };
	});
}

const createPage = (name: string, content: string, options: PageCreateOptions) => createVersioned("page", name, content, options);

const staleOf = (head: PageHead, draft: PageDraft | null): PageStale => ({
	stale: true,
	head,
	draft: draft ? { base: draft.base, rev: draft.rev, content: draft.content } : null,
});

async function savePageDraft(id: string, input: { base: number; rev: number; content: string }, kind: LibraryKind = "page"): Promise<PageWriteResult<{ rev: number }>> {
	if (tooLarge(input.content)) return "too-large";
	return withLock(async () => {
		const page = await loadPage(await readCatalog(), id, kind);
		if (!page) return "missing";
		const { head, draft } = page;
		if (input.base !== head.n || input.rev !== (draft?.rev ?? 0)) return staleOf(head, draft);
		// Back to exactly the head: nothing is unsaved.
		if (input.content === head.content) {
			if (draft) await clearDraft(id);
			return { rev: 0 };
		}
		const rev = nextRev(draft);
		await writeDraft(id, { base: input.base, rev, content: input.content, updatedAt: new Date().toISOString() });
		return { rev };
	});
}

async function commitPageVersion(
	id: string,
	input: { base: number; rev: number; content: string; cause?: PageVersionCause },
	kind: LibraryKind = "page",
): Promise<PageWriteResult<{ version: PageVersion; created: boolean; otherVersion?: number }>> {
	if (tooLarge(input.content)) return "too-large";
	return withLock(async () => {
		const catalog = await readCatalog();
		const page = await loadPage(catalog, id, kind);
		if (!page) return "missing";
		const { item, versions, head, draft } = page;
		const conflict = input.cause === "conflict";
		if (!conflict && (input.base !== head.n || input.rev !== (draft?.rev ?? 0))) return staleOf(head, draft);
		let current = { item, versions, head: head.n, content: head.content };
		let otherVersion: number | undefined;
		// Keep mine and Use latest: the other side's unsaved text goes in first.
		if (conflict && draft && draft.content !== head.content && draft.content !== input.content) {
			const saved = await appendVersion(catalog, item, versions, draft.content, { author: "learner", base: draft.base, cause: "conflict" });
			otherVersion = saved.version.n;
			current = { item: saved.item, versions: [...versions, saved.version], head: saved.version.n, content: draft.content };
		}
		await clearDraft(id);
		// Saving exactly what is already the newest makes no version.
		if (input.content === current.content) {
			if (otherVersion) changed(id, current.versions.at(-1)!);
			return { version: current.versions.at(-1)!, created: false, ...(otherVersion ? { otherVersion } : {}) };
		}
		const { version } = await appendVersion(catalog, current.item, current.versions, input.content, {
			author: "learner",
			base: input.base,
			cause: input.cause ?? "save",
		});
		changed(id, version);
		return { version, created: true, ...(otherVersion ? { otherVersion } : {}) };
	});
}

async function restorePageVersion(id: string, n: number, kind: LibraryKind = "page"): Promise<{ version: PageVersion } | "missing"> {
	return withLock(async () => {
		const catalog = await readCatalog();
		const page = await loadPage(catalog, id, kind);
		if (!page) return "missing";
		if (!page.versions.some((v) => v.n === n)) return "missing";
		const { head, draft } = page;
		let { item, versions } = page;
		if (draft && draft.content !== head.content) {
			const saved = await appendVersion(catalog, item, versions, draft.content, { author: "learner", base: draft.base, cause: "save" });
			item = saved.item;
			versions = [...versions, saved.version];
		}
		await clearDraft(id);
		const text = await readVersionText(id, n);
		const latest = versions.at(-1)!;
		// Restoring the text that is already newest adds nothing (owner, 2026-10-31).
		if (latest.n === n || text === await readVersionText(id, latest.n)) {
			if (latest.n !== head.n) changed(id, latest);
			return { version: latest };
		}
		const { version } = await appendVersion(catalog, item, versions, text, {
			author: "learner", base: versions.at(-1)!.n, cause: "restore", restoredFrom: n,
		});
		changed(id, version);
		return { version };
	});
}

/** The order in contracts/agent-tools.md: the learner's draft becomes his own
 *  version before anything else can refuse, so no ordering loses his text. */
async function revisePageAsAgent(id: string, revision: AgentRevision): Promise<AgentRevisionResult> {
	return withLock(async () => {
		const catalog = await readCatalog();
		const page = await loadPage(catalog, id);
		if (!page) return { outcome: "missing" };
		const { head, draft } = page;
		let { item, versions } = page;
		if (revision.toolCallId) {
			const repeat = versions.find((v) => v.toolCallId === revision.toolCallId);
			if (repeat) return { outcome: "revised", item, version: repeat, repeated: true };
		}
		let savedLearnerVersion: number | undefined;
		let headNumber = head.n;
		let headText = head.content;
		if (draft && draft.content !== head.content) {
			const saved = await appendVersion(catalog, item, versions, draft.content, { author: "learner", base: draft.base, cause: "before-agent" });
			item = saved.item;
			versions = [...versions, saved.version];
			savedLearnerVersion = headNumber = saved.version.n;
			headText = draft.content;
			changed(id, saved.version);
		}
		if (draft) await clearDraft(id);
		if (revision.baseVersion !== headNumber) return { outcome: "stale", head: headNumber, savedLearnerVersion };
		const next = revision.apply(headText);
		if (typeof next !== "string") return { outcome: "refused", reason: next.refused, savedLearnerVersion };
		if (tooLarge(next)) return { outcome: "too-large", savedLearnerVersion };
		const written = await appendVersion(catalog, item, versions, next, {
			author: "agent",
			base: headNumber,
			cause: "agent-revise",
			...(revision.chatId ? { chatId: revision.chatId } : {}),
			...(revision.toolCallId ? { toolCallId: revision.toolCallId } : {}),
		});
		changed(id, written.version);
		return { outcome: "revised", item: written.item, version: written.version, savedLearnerVersion };
	});
}

/** The learner's own action (a saved passage), so it is his version. His draft
 *  goes in first, as his version too, so the new block lands after all of it. */
async function appendToPage(id: string, block: string, options: { chatId?: string }): Promise<{ item: LibraryItem; version: PageVersion } | "missing" | "too-large"> {
	return withLock(async () => {
		const catalog = await readCatalog();
		const page = await loadPage(catalog, id);
		if (!page) return "missing";
		const { head, draft } = page;
		let { item, versions } = page;
		let current = head.content;
		if (tooLarge(appendBlock(draft?.content ?? current, block))) return "too-large";
		if (draft && draft.content !== head.content) {
			const saved = await appendVersion(catalog, item, versions, draft.content, { author: "learner", base: draft.base, cause: "save" });
			item = saved.item;
			versions = [...versions, saved.version];
			current = draft.content;
			changed(id, saved.version);
		}
		if (draft) await clearDraft(id);
		const written = await appendVersion(catalog, item, versions, appendBlock(current, block), {
			author: "learner",
			base: versions.at(-1)!.n,
			cause: "passage",
			...(options.chatId ? { chatId: options.chatId } : {}),
		});
		changed(id, written.version);
		return written;
	});
}

/** A deleted session's agent-made pages stay, without their link (owner, 2026-10-30). */
async function unlinkChat(chatId: string): Promise<void> {
	await withLock(async () => {
		const catalog = await readCatalog();
		let touched = false;
		for (const item of liveItems(catalog)) {
			if (item.origin.type === "agent" && item.origin.chatId === chatId) {
				replace(catalog, item.id, { ...item, origin: { type: "agent" } });
				touched = true;
			}
		}
		for (const entry of trashOf(catalog)) {
			for (const item of entry.items) {
				if (item.origin.type === "agent" && item.origin.chatId === chatId) {
					item.origin = { type: "agent" };
					touched = true;
				}
			}
		}
		if (touched) await writeCatalog(catalog);
	});
}

/** A diagram's text was asked for and it can't be read. The message is for the learner. */
export class DiagramUnreadableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DiagramUnreadableError";
	}
}

/** The page machinery for store/diagrams.ts: same files, same order of writes, same
 *  repair after a crash. Everything but the catalog row stays private to these two. */
export const versionedInternals = {
	withLock,
	readCatalog,
	loadPage,
	appendVersion,
	clearDraft,
	createVersioned,
	savePageDraft,
	commitPageVersion,
	restorePageVersion,
	readVersionText,
	readJsonFile,
	writeJsonFile,
	proposalsDir,
	changed,
};

export const libraryStore: LibraryStore = {
	list: () => withLock(async () => {
		await sweepStaleUploads();
		const items = liveItems(await loadReconciled());
		return items.sort((a, b) => a.name.localeCompare(b.name));
	}),
	get: (id) => withLock(async () => liveItems(await loadReconciled()).find((i) => i.id === id) ?? null),
	// A trashed item reads as deleted to @ tokens, until it is restored.
	catalog: () => withLock(async () => {
		const catalog = await loadReconciled();
		return [...catalog.items, ...trashOf(catalog).flatMap((entry) => entry.items.map((item) => tombstone(item, entry.trashedAt)))];
	}),
	readText: async (item) => {
		if (!isVersionedKind(item.kind)) return fs.readFile(path.join(PATHS.files, item.name), "utf8");
		const last = (await readVersions(item.id)).at(-1);
		const content = await readVersionText(item.id, last?.n ?? item.headVersion ?? 1);
		if (item.kind !== "diagram") return content;
		const parsed = parseDiagram(content);
		if (!parsed.ok) throw new DiagramUnreadableError(parsed.message);
		return diagramOutline(parsed.doc);
	},
	createPage,
	readPage: (id) => withLock(async (): Promise<PageState | null> => {
		const page = await loadPage(await readCatalog(), id);
		if (!page) return null;
		const { item, head, draft } = page;
		// The log is the truth; a crash can leave the catalog one step behind.
		return { item: { ...item, headVersion: head.n }, head, draft: draft ? { base: draft.base, rev: draft.rev, content: draft.content } : null };
	}),
	savePageDraft,
	commitPageVersion,
	listPageVersions: (id) => withLock(async () => {
		const page = await loadPage(await readCatalog(), id);
		return page ? withNames([...page.versions].reverse(), await readNames(id)) : null;
	}),
	namePageVersion: (id, n, name) => withLock(async () => {
		const page = await loadPage(await readCatalog(), id);
		const version = page?.versions.find((v) => v.n === n);
		if (!version) return "missing";
		const names = await readNames(id);
		if (name === null) delete names[String(n)];
		else names[String(n)] = name;
		await writeJsonFile(namesFile(id), names);
		emit("library-changed", { itemId: id });
		return name === null ? version : { ...version, name };
	}),
	readPageSeen: (id) => withLock(async () => {
		const page = await loadPage(await readCatalog(), id);
		if (!page) return "missing";
		const seen = await readJsonFile<{ version: number }>(seenFile(id));
		if (!seen || !Number.isInteger(seen.version)) {
			await writeJsonFile(seenFile(id), { version: page.head.n, at: new Date().toISOString() });
			return { version: page.head.n, unseen: [] };
		}
		return { version: seen.version, unseen: page.versions.filter((v) => isUnseenTutorVersion(v, seen.version)) };
	}),
	markPageSeen: (id, version) => withLock(async () => {
		const page = await loadPage(await readCatalog(), id);
		if (!page) return "missing";
		const seen = await readJsonFile<{ version: number }>(seenFile(id));
		const next = Math.min(page.head.n, Math.max(seen?.version ?? 0, version));
		if (next !== seen?.version) await writeJsonFile(seenFile(id), { version: next, at: new Date().toISOString() });
		return { version: next };
	}),
	readPageVersion: (id, n) => withLock(async () => {
		const page = await loadPage(await readCatalog(), id);
		const version = page?.versions.find((v) => v.n === n);
		return version ? { version, content: await readVersionText(id, n) } : null;
	}),
	restorePageVersion,
	revisePageAsAgent,
	unlinkChat,
	pageTexts,
	wikiPins: () => withLock(async () => (await readJsonFile<WikiPins>(pinsFile())) ?? {}),
	appendToPage,
	writeUpload,
	folders: () => withLock(async () => [...foldersOf(await readCatalog())].sort((a, b) => a.name.localeCompare(b.name))),
	createFolder,
	renameFolder,
	moveFolder,
	removeFolder,
	moveItem,
	markItem: putItemMarks,
	markFolder: putFolderMarks,
	trashItem,
	trashFolder,
	listTrash: () => withLock(async () => [...trashOf(await readCatalog())].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt))),
	restoreTrash,
	purgeTrash,
	recent: recentItems,
	markOpened,
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
