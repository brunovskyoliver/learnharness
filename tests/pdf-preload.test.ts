/** Feature 024 T009d/T009e: the first chunk starts at the click and the reader
 *  takes it once; the scanned-PDF note checks the first three pages only. */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { PRELOAD_TTL_MS, preloadPdfSource, takePdfSource } from "../components/library/pdf-preload.ts";
import { textCheckPages } from "../components/library/pdf-options.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function countingFetch() {
	const calls: string[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		calls.push(`${String(input)} ${new Headers(init?.headers).get("range") ?? ""}`.trim());
		return new Response(new Uint8Array(10), { status: 206, headers: { etag: '"t1"', "content-range": "bytes 0-9/10" } });
	}) as typeof fetch;
	return calls;
}

describe("pdf preload", () => {
	it("starts the first-chunk request once, and the reader takes that one", async () => {
		const calls = countingFetch();
		preloadPdfSource("lib_a", 1000);
		preloadPdfSource("lib_a", 1100);
		assert.equal(calls.length, 1);
		assert.match(calls[0]!, /^\/api\/library\/items\/lib_a\/content bytes=0-\d+$/);
		const source = await takePdfSource("lib_a", undefined, 1200);
		assert.equal(source.kind, "chunks");
		assert.equal(calls.length, 1);
	});
	it("is used once: a second open asks again", async () => {
		const calls = countingFetch();
		preloadPdfSource("lib_b", 0);
		await takePdfSource("lib_b", undefined, 10);
		await takePdfSource("lib_b", undefined, 20);
		assert.equal(calls.length, 2);
	});
	it("asks again when the waiting answer is too old, or when nothing was started", async () => {
		const calls = countingFetch();
		preloadPdfSource("lib_c", 0);
		await takePdfSource("lib_c", undefined, PRELOAD_TTL_MS + 1);
		assert.equal(calls.length, 2);
		await takePdfSource("lib_d");
		assert.equal(calls.length, 3);
	});
});

describe("scanned-PDF note", () => {
	it("checks pages 1-3 only (owner, 2026-11-09)", () => {
		assert.deepEqual(textCheckPages(75), [1, 2, 3]);
		assert.deepEqual(textCheckPages(2), [1, 2]);
		assert.deepEqual(textCheckPages(1), [1]);
		assert.deepEqual(textCheckPages(0), []);
	});
});
