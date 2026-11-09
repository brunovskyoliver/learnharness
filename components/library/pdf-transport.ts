/**
 * The reader's own way to fetch a PDF (feature 024, research R1a).
 *
 * pdf.js reads scattered objects on open, and Chromium runs cacheable range
 * requests to one URL one at a time. So the reader learns the file's version
 * tag and length from one revalidated request for the first chunk, then reads
 * fixed-size chunks at their own URLs (`?v=<tag>&chunk=<n>&size=<bytes>`). The
 * route answers those as private and immutable, so they run in parallel and a
 * reopen reads them from the browser cache without asking. A file that changed
 * answers 412, and the reader opens it again from the top.
 *
 * The pure parts are exported for tests; `makeChunkTransport` takes pdf.js's
 * own PDFDataRangeTransport class, since pdf.js loads only with the first PDF.
 */

/** Measured on the 17 MB scanned baseline PDF (progress.md, 2026-11-09). */
export const PDF_CHUNK_SIZE = 32_768;
/** Parallel chunk requests per document. */
export const PDF_CHUNK_CONCURRENCY = 10;

export type PdfSource =
	| { kind: "chunks"; version: string; length: number; head: Uint8Array }
	| { kind: "whole"; data: Uint8Array };

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** The file changed since its version was read. */
export class StalePdfError extends Error {
	constructor() {
		super("This file changed while it was open.");
		this.name = "StalePdfError";
	}
}

export function chunkUrl(contentUrl: string, version: string, index: number, size: number): string {
	return `${contentUrl}?v=${encodeURIComponent(version)}&chunk=${index}&size=${size}`;
}

/** Chunk indexes covering bytes [begin, end). */
export function chunkIndexes(begin: number, end: number, size: number): number[] {
	if (end <= begin) return [];
	const first = Math.floor(begin / size);
	const last = Math.floor((end - 1) / size);
	return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** `bytes a-b/total` → numbers, or null. */
export function parseContentRange(header: string | null): { start: number; end: number; total: number } | null {
	const match = header && /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim());
	if (!match) return null;
	const [start, end, total] = [Number(match[1]), Number(match[2]), Number(match[3])];
	return start <= end && end < total ? { start, end, total } : null;
}

/** A strong tag's opaque value, without quotes; null for weak or missing tags. */
export function versionOf(etag: string | null): string | null {
	const match = etag && /^"([^"]+)"$/.exec(etag.trim());
	return match ? match[1]! : null;
}

/** Runs at most `max` tasks at once, in the order they were asked for. */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
	let running = 0;
	const waiting: (() => void)[] = [];
	const next = () => {
		if (running >= max) return;
		const start = waiting.shift();
		if (!start) return;
		running++;
		start();
	};
	return (task) => new Promise((resolve, reject) => {
		waiting.push(() => {
			task().then(resolve, reject).finally(() => {
				running--;
				next();
			});
		});
		next();
	});
}

const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());

/** The first chunk, with the version and length, revalidated with the server on
 *  every open (`private, no-cache`). A server that ignores the range gives the
 *  whole file, which pdf.js then reads from memory. */
export async function openPdfSource(contentUrl: string, chunkSize: number, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<PdfSource> {
	const response = await fetcher(contentUrl, { headers: { Range: `bytes=0-${chunkSize - 1}` }, signal });
	if (response.status === 200) return { kind: "whole", data: await bytesOf(response) };
	if (response.status !== 206) {
		await response.body?.cancel();
		throw new Error(`The PDF could not be read (${response.status}).`);
	}
	const range = parseContentRange(response.headers.get("content-range"));
	const version = versionOf(response.headers.get("etag"));
	const head = await bytesOf(response);
	if (!range || range.start !== 0 || head.length !== range.end + 1) throw new Error("The PDF's first part did not arrive whole.");
	if (!version) {
		// No version to pin chunks to: read the whole file instead.
		const whole = await fetcher(contentUrl, { signal });
		if (!whole.ok) throw new Error(`The PDF could not be read (${whole.status}).`);
		return { kind: "whole", data: await bytesOf(whole) };
	}
	return { kind: "chunks", version, length: range.total, head };
}

/** Reads one chunk, checking it is exactly the expected length. */
export async function fetchChunk(contentUrl: string, source: Extract<PdfSource, { kind: "chunks" }>, index: number, chunkSize: number, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<Uint8Array> {
	const response = await fetcher(chunkUrl(contentUrl, source.version, index, chunkSize), { signal });
	if (response.status === 412) {
		await response.body?.cancel();
		throw new StalePdfError();
	}
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(`Part of the PDF could not be read (${response.status}).`);
	}
	const bytes = await bytesOf(response);
	const expected = Math.min(chunkSize, source.length - index * chunkSize);
	if (bytes.length !== expected) throw new Error("Part of the PDF did not arrive whole.");
	return bytes;
}

export function joinChunks(parts: readonly Uint8Array[]): Uint8Array {
	if (parts.length === 1) return parts[0]!;
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** The subset of pdf.js's PDFDataRangeTransport this file relies on. */
export interface RangeTransportBase {
	onDataRange(begin: number, chunk: Uint8Array): void;
	requestDataRange(begin: number, end: number): void;
	abort(): void;
}
type RangeTransportClass = new (length: number, initialData: Uint8Array | null) => RangeTransportBase;

export type ChunkTransportOptions = {
	contentUrl: string;
	chunkSize: number;
	concurrency?: number;
	fetcher?: Fetcher;
	/** A chunk failed: "stale" when the file changed, "error" otherwise. Called once. */
	onFailure: (kind: "stale" | "error", error: unknown) => void;
};

/** A pdf.js range transport over versioned chunks. pdf.js asks for chunk-aligned
 *  ranges (its rangeChunkSize must equal `chunkSize`) and expects one answer per ask. */
export function makeChunkTransport<T extends RangeTransportClass>(Base: T, source: Extract<PdfSource, { kind: "chunks" }>, options: ChunkTransportOptions): InstanceType<T> {
	const { contentUrl, chunkSize, concurrency = PDF_CHUNK_CONCURRENCY, fetcher = fetch, onFailure } = options;
	const limit = createLimiter(concurrency);
	const controller = new AbortController();
	const inFlight = new Map<number, Promise<Uint8Array>>();
	let failed = false;
	const chunk = (index: number) => {
		let pending = inFlight.get(index);
		if (!pending) {
			pending = limit(() => fetchChunk(contentUrl, source, index, chunkSize, fetcher, controller.signal));
			inFlight.set(index, pending);
			void pending.finally(() => inFlight.delete(index)).catch(() => {});
		}
		return pending;
	};
	class ChunkTransport extends (Base as RangeTransportClass) {
		requestDataRange(begin: number, end: number) {
			Promise.all(chunkIndexes(begin, end, chunkSize).map(chunk)).then((parts) => {
				if (controller.signal.aborted) return;
				const joined = joinChunks(parts);
				const offset = begin - Math.floor(begin / chunkSize) * chunkSize;
				this.onDataRange(begin, offset === 0 && joined.length === end - begin ? joined : joined.subarray(offset, offset + (end - begin)));
			}).catch((error: unknown) => {
				if (controller.signal.aborted || failed) return;
				failed = true;
				onFailure(error instanceof StalePdfError ? "stale" : "error", error);
			});
		}
		abort() {
			controller.abort();
		}
	}
	return new ChunkTransport(source.length, source.head) as InstanceType<T>;
}
