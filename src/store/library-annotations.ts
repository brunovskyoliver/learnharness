/**
 * Highlights and annotations (feature 020), one additive file per item:
 * library/annotations/<itemId>.json. The learner's PDF is never written. An older
 * app ignores the folder. A damaged file is set aside, not overwritten, so a bad
 * write can't take the learner's highlights with it.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nanoid } from "nanoid";
import { PATHS, tenantScoped } from "../../config.ts";
import type { AnnotationsFile, DocumentAnnotation, TextAnchor } from "../core/document-anchors.ts";

const dir = () => path.join(PATHS.library, "annotations");
const fileOf = (itemId: string) => path.join(dir(), `${itemId}.json`);

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
	const lock = tenantScoped("__lhAnnotationsLock", () => ({ tail: Promise.resolve() as Promise<unknown> }));
	const run = lock.tail.then(fn, fn);
	lock.tail = run.catch(() => {});
	return run;
}

async function read(itemId: string): Promise<DocumentAnnotation[]> {
	const raw = await fs.readFile(fileOf(itemId), "utf8").catch((err) => {
		if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
		throw err;
	});
	if (raw === null) return [];
	try {
		const parsed = JSON.parse(raw) as AnnotationsFile;
		if (!Array.isArray(parsed?.annotations)) throw new Error("not a list");
		return parsed.annotations;
	} catch {
		await fs.rename(fileOf(itemId), `${fileOf(itemId)}.damaged-${nanoid(6)}`).catch(() => {});
		return [];
	}
}

async function write(itemId: string, annotations: DocumentAnnotation[]): Promise<void> {
	await fs.mkdir(dir(), { recursive: true });
	const temp = `${fileOf(itemId)}.${nanoid(8)}.tmp`;
	const handle = await fs.open(temp, "wx");
	try {
		await handle.writeFile(JSON.stringify({ version: 1, annotations } satisfies AnnotationsFile));
		await handle.sync();
	} finally {
		await handle.close();
	}
	await fs.rename(temp, fileOf(itemId));
}

export const annotationStore = {
	list: (itemId: string) => withLock(() => read(itemId)),
	add: (itemId: string, input: { anchor: TextAnchor; note?: string; fingerprint: DocumentAnnotation["fingerprint"] }) => withLock(async () => {
		const annotations = await read(itemId);
		const now = new Date().toISOString();
		const added: DocumentAnnotation = { id: `ann_${nanoid()}`, itemId, anchor: input.anchor, ...(input.note ? { note: input.note } : {}), fingerprint: input.fingerprint, createdAt: now, updatedAt: now };
		await write(itemId, [...annotations, added]);
		return added;
	}),
	/** A null note clears it, leaving the highlight. */
	setNote: (itemId: string, id: string, note: string | null) => withLock(async () => {
		const annotations = await read(itemId);
		const found = annotations.find((annotation) => annotation.id === id);
		if (!found) return null;
		const { note: _old, ...rest } = found;
		const next: DocumentAnnotation = { ...rest, ...(note ? { note } : {}), updatedAt: new Date().toISOString() };
		await write(itemId, annotations.map((annotation) => (annotation.id === id ? next : annotation)));
		return next;
	}),
	remove: (itemId: string, id: string) => withLock(async () => {
		const annotations = await read(itemId);
		if (!annotations.some((annotation) => annotation.id === id)) return false;
		await write(itemId, annotations.filter((annotation) => annotation.id !== id));
		return true;
	}),
};
