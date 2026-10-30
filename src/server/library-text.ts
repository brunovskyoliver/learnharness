/**
 * Cached facts about a document's text (feature 009, research R6). No model is
 * involved. library/derived/<id>.json is rebuildable, keyed by size and mtime.
 * pdfjs runs on the main thread, so PDFs go one at a time per tenant.
 */
import { createReadStream } from "node:fs";
import { tenantScoped } from "../../config.ts";
import { pdfInfo } from "../agent/subagents/pdf-ops.ts";
import type { LibraryItem } from "../core/library.ts";
import { libraryStore } from "../store/library.ts";

export interface DerivedText {
	size: number;
	mtime: string;
	lines?: number;
	pdf?: { pageCount: number; meanTextLength: number };
}

const queue = () => tenantScoped("__lhLibraryText", () => ({ tail: Promise.resolve() as Promise<unknown> }));
const NEWLINE = 0x0a;

async function countLines(file: string): Promise<number> {
	let lines = 0;
	let last = NEWLINE;
	for await (const chunk of createReadStream(file) as AsyncIterable<Buffer>) {
		for (const byte of chunk) if (byte === NEWLINE) lines++;
		last = chunk[chunk.length - 1] ?? last;
	}
	return last === NEWLINE ? lines : lines + 1;
}

/** Cached or fresh text info for a document. */
export async function readDerivedText(item: LibraryItem): Promise<DerivedText | null> {
	const cached = await libraryStore.readDerived(item.id) as DerivedText | null;
	return cached?.size === item.size && cached.mtime === item.updatedAt ? cached : null;
}

async function index(item: LibraryItem): Promise<void> {
	const file = libraryStore.documentPath(item);
	const base = { size: item.size, mtime: item.updatedAt };
	try {
		if (item.kind === "pdf") {
			const info = await pdfInfo(file);
			await libraryStore.writeDerived(item.id, { ...base, pdf: { pageCount: info.page_count, meanTextLength: info.mean_text_length } } satisfies DerivedText);
			await libraryStore.setTextState(item.id, info.mean_text_length === 0 ? "none" : "ok");
		} else {
			await libraryStore.writeDerived(item.id, { ...base, lines: await countLines(file) } satisfies DerivedText);
			await libraryStore.setTextState(item.id, "ok");
		}
	} catch (err) {
		console.error(`[library] text info failed for ${item.id}:`, err instanceof Error ? err.message : err);
		await libraryStore.setTextState(item.id, "failed").catch(() => {});
	}
}

/** After an upload, in the background. Images have no text to index. */
export function indexAfterUpload(item: LibraryItem): void {
	if (item.kind === "image" || item.kind === "other" || item.kind === "page") return;
	const slot = queue();
	slot.tail = slot.tail.then(() => index(item));
}

/** Settles once this tenant's queued work is done. For tests and shutdown. */
export function libraryTextIdle(): Promise<unknown> {
	return queue().tail;
}
