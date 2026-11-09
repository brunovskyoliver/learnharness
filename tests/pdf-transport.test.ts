/** The reader's versioned-chunk transport (feature 024, R1a), with a fake
 *  server and a stand-in for pdf.js's PDFDataRangeTransport. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	chunkIndexes, chunkUrl, createLimiter, makeChunkTransport, openPdfSource, parseContentRange, PDF_CHUNK_SIZE, versionOf,
} from "../components/library/pdf-transport.ts";
import { pdfLoadOptions } from "../components/library/pdf-options.ts";
import { CONTENT_CHUNK_SIZES } from "../src/core/library.ts";

const FILE = Uint8Array.from({ length: 100_000 }, (_, i) => i % 251);
const URL_ = "/api/library/items/lib_1/content";
const TAG = "abc_DEF-123";

/** Serves FILE like the content route: ranges with the tag, versioned chunks, 412 when stale. */
function fakeServer(options: { tag?: () => string; delay?: number } = {}) {
	const tag = options.tag ?? (() => TAG);
	const log: string[] = [];
	let active = 0;
	let peak = 0;
	const fetcher = async (input: string, init?: RequestInit): Promise<Response> => {
		log.push(input);
		active++;
		peak = Math.max(peak, active);
		try {
			await new Promise((r) => setTimeout(r, options.delay ?? 1));
			const url = new URL(input, "http://x");
			if (url.searchParams.has("chunk")) {
				if (url.searchParams.get("v") !== tag()) return new Response("{}", { status: 412 });
				const size = Number(url.searchParams.get("size"));
				const start = Number(url.searchParams.get("chunk")) * size;
				return new Response(FILE.slice(start, Math.min(start + size, FILE.length)), { status: 200, headers: { etag: `"${tag()}"` } });
			}
			const range = new Headers(init?.headers).get("range");
			const match = range && /^bytes=(\d+)-(\d+)$/.exec(range);
			if (!match) return new Response(FILE.slice(), { status: 200, headers: { etag: `"${tag()}"` } });
			const start = Number(match[1]);
			const end = Math.min(Number(match[2]), FILE.length - 1);
			return new Response(FILE.slice(start, end + 1), { status: 206, headers: { etag: `"${tag()}"`, "content-range": `bytes ${start}-${end}/${FILE.length}` } });
		} finally {
			active--;
		}
	};
	return { fetcher, log, peak: () => peak };
}

/** Stand-in for pdf.js's PDFDataRangeTransport: records what it is handed. */
class FakeBase {
	received: [number, Uint8Array][] = [];
	constructor(public length: number, public initialData: Uint8Array | null) {}
	onDataRange(begin: number, chunk: Uint8Array) { this.received.push([begin, chunk]); }
	requestDataRange(_begin: number, _end: number) { throw new Error("abstract"); }
	abort() {}
}
const settle = () => new Promise((r) => setTimeout(r, 30));

describe("pdf chunk transport: pure parts", () => {
	it("uses an allowed chunk size, also as pdf.js's range chunk size", () => {
		assert.ok(CONTENT_CHUNK_SIZES.includes(PDF_CHUNK_SIZE));
		assert.equal(pdfLoadOptions("/x").rangeChunkSize, PDF_CHUNK_SIZE);
	});
	it("builds versioned chunk URLs and covers ranges with chunk indexes", () => {
		assert.equal(chunkUrl(URL_, "a b", 3, 32768), `${URL_}?v=a%20b&chunk=3&size=32768`);
		assert.deepEqual(chunkIndexes(0, 32768, 32768), [0]);
		assert.deepEqual(chunkIndexes(32768, 98304, 32768), [1, 2]);
		assert.deepEqual(chunkIndexes(65536, 100000, 32768), [2, 3]);
		assert.deepEqual(chunkIndexes(5, 5, 32768), []);
	});
	it("reads Content-Range and strong tags only", () => {
		assert.deepEqual(parseContentRange("bytes 0-99/1000"), { start: 0, end: 99, total: 1000 });
		for (const bad of [null, "bytes */1000", "bytes 5-1/10", "bytes 0-10/10", "items 0-1/2"]) assert.equal(parseContentRange(bad), null, String(bad));
		assert.equal(versionOf('"abc"'), "abc");
		for (const bad of [null, 'W/"abc"', "abc", '""']) assert.equal(versionOf(bad), null, String(bad));
	});
	it("limits concurrency and runs every task", async () => {
		const limit = createLimiter(3);
		let active = 0;
		let peak = 0;
		const done = await Promise.all(Array.from({ length: 10 }, (_, i) => limit(async () => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((r) => setTimeout(r, 2));
			active--;
			if (i === 4) throw new Error("four");
			return i;
		}).catch((e: Error) => e.message)));
		assert.equal(peak, 3);
		assert.deepEqual(done, [0, 1, 2, 3, "four", 5, 6, 7, 8, 9]);
	});
});

describe("pdf chunk transport: opening", () => {
	it("reads the first chunk, the version and the length in one request", async () => {
		const server = fakeServer();
		const source = await openPdfSource(URL_, 32768, server.fetcher);
		assert.equal(source.kind, "chunks");
		if (source.kind !== "chunks") return;
		assert.equal(source.version, TAG);
		assert.equal(source.length, FILE.length);
		assert.deepEqual(source.head, FILE.slice(0, 32768));
		assert.equal(server.log.length, 1);
	});
	it("takes a whole-file answer as data, and refuses a missing item", async () => {
		const whole = await openPdfSource(URL_, 32768, async () => new Response(FILE.slice(), { status: 200 }));
		assert.equal(whole.kind, "whole");
		await assert.rejects(openPdfSource(URL_, 32768, async () => new Response("{}", { status: 404 })), /404/);
	});
	it("falls back to the whole file when the answer carries no strong tag", async () => {
		const calls: string[] = [];
		const source = await openPdfSource(URL_, 32768, async (input, init) => {
			calls.push(new Headers(init?.headers).get("range") ?? "none");
			return calls.length === 1
				? new Response(FILE.slice(0, 32768), { status: 206, headers: { "content-range": `bytes 0-32767/${FILE.length}` } })
				: new Response(FILE.slice(), { status: 200 });
		});
		assert.equal(source.kind, "whole");
		assert.deepEqual(calls, ["bytes=0-32767", "none"]);
	});
});

describe("pdf chunk transport: reading", () => {
	it("answers each pdf.js ask once, with exactly its bytes, from versioned URLs in parallel", async () => {
		const server = fakeServer({ delay: 5 });
		const source = await openPdfSource(URL_, 16384, server.fetcher);
		assert.equal(source.kind, "chunks");
		if (source.kind !== "chunks") return;
		const failures: string[] = [];
		const transport = makeChunkTransport(FakeBase, source, { contentUrl: URL_, chunkSize: 16384, concurrency: 4, fetcher: server.fetcher, onFailure: (kind) => failures.push(kind) }) as unknown as FakeBase;
		assert.equal(transport.length, FILE.length);
		assert.deepEqual(transport.initialData, FILE.slice(0, 16384));
		transport.requestDataRange(16384, 65536);
		transport.requestDataRange(81920, FILE.length);
		await settle();
		const got = new Map(transport.received);
		assert.deepEqual(got.get(16384), FILE.slice(16384, 65536));
		assert.deepEqual(got.get(81920), FILE.slice(81920));
		assert.equal(transport.received.length, 2);
		const chunks = server.log.slice(1);
		assert.equal(chunks.length, 5);
		for (const url of chunks) assert.match(url, new RegExp(`\\?v=${TAG}&chunk=\\d+&size=16384$`));
		assert.ok(server.peak() > 1 && server.peak() <= 4, `peak ${server.peak()}`);
		assert.deepEqual(failures, []);
	});
	it("reports a changed file once as stale, and other failures as errors", async () => {
		let tag = TAG;
		const server = fakeServer({ tag: () => tag });
		const source = await openPdfSource(URL_, 16384, server.fetcher);
		if (source.kind !== "chunks") throw new Error("chunks");
		tag = "new";
		const failures: string[] = [];
		const transport = makeChunkTransport(FakeBase, source, { contentUrl: URL_, chunkSize: 16384, fetcher: server.fetcher, onFailure: (kind) => failures.push(kind) }) as unknown as FakeBase;
		transport.requestDataRange(16384, 32768);
		transport.requestDataRange(32768, 49152);
		await settle();
		assert.deepEqual(failures, ["stale"]);
		assert.equal(transport.received.length, 0);

		const broken: string[] = [];
		const other = makeChunkTransport(FakeBase, source, { contentUrl: URL_, chunkSize: 16384, fetcher: async () => new Response("", { status: 500 }), onFailure: (kind) => broken.push(kind) }) as unknown as FakeBase;
		other.requestDataRange(16384, 32768);
		await settle();
		assert.deepEqual(broken, ["error"]);
	});
	it("stays quiet after abort", async () => {
		const server = fakeServer({ delay: 10 });
		const source = await openPdfSource(URL_, 16384, server.fetcher);
		if (source.kind !== "chunks") throw new Error("chunks");
		const failures: string[] = [];
		const transport = makeChunkTransport(FakeBase, source, { contentUrl: URL_, chunkSize: 16384, fetcher: server.fetcher, onFailure: (kind) => failures.push(kind) }) as unknown as FakeBase;
		transport.requestDataRange(16384, 32768);
		transport.abort();
		await settle();
		assert.equal(transport.received.length, 0);
		assert.deepEqual(failures, []);
	});
});
