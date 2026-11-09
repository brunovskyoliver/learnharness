/** The reader's own pdf.js assets: text assets go gzip-compressed when the
 *  browser accepts it, binary ones as they are (specs/024-instant-loads R2). */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, it } from "node:test";

const { pdfjsAssetResponse } = await import("../src/server/documents.ts");

const WORKER = ["legacy", "build", "pdf.worker.min.mjs"];
const worker = fs.readFileSync(path.join("node_modules", "pdfjs-dist", ...WORKER));
const request = (encoding?: string) => new Request("http://localhost/pdfjs/x", { headers: encoding === undefined ? {} : { "accept-encoding": encoding } });

describe("pdf.js assets", () => {
	it("gzips the worker when Accept-Encoding has gzip, and varies on it", async () => {
		for (const encoding of ["gzip", "gzip, deflate, br, zstd", "br;q=1.0, gzip;q=0.8", "*"]) {
			const response = await pdfjsAssetResponse(WORKER, request(encoding));
			assert.equal(response.status, 200, encoding);
			assert.equal(response.headers.get("content-encoding"), "gzip", encoding);
			assert.equal(response.headers.get("vary"), "Accept-Encoding", encoding);
			assert.match(response.headers.get("content-type") ?? "", /javascript/);
			const body = Buffer.from(await response.arrayBuffer());
			assert.equal(response.headers.get("content-length"), String(body.length));
			assert.ok(body.length < worker.length / 2, `compressed ${body.length} of ${worker.length}`);
			assert.deepEqual(gunzipSync(body), worker);
		}
	});

	it("sends the worker as it is without gzip in Accept-Encoding, still varying", async () => {
		for (const encoding of [undefined, "", "br", "identity", "gzip;q=0"]) {
			const response = await pdfjsAssetResponse(WORKER, request(encoding));
			assert.equal(response.status, 200, String(encoding));
			assert.equal(response.headers.get("content-encoding"), null, String(encoding));
			assert.equal(response.headers.get("vary"), "Accept-Encoding", String(encoding));
			assert.deepEqual(Buffer.from(await response.arrayBuffer()), worker);
		}
		// Callers that pass no request get the plain bytes.
		const bare = await pdfjsAssetResponse(WORKER);
		assert.equal(bare.headers.get("content-encoding"), null);
		await bare.body?.cancel();
	});

	it("gzips the wasm fallback scripts too", async () => {
		const response = await pdfjsAssetResponse(["wasm", "openjpeg_nowasm_fallback.js"], request("gzip"));
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("content-encoding"), "gzip");
		await response.body?.cancel();
	});

	it("leaves binary assets alone", async () => {
		for (const segments of [["cmaps", "78-H.bcmap"], ["standard_fonts", "FoxitSerif.pfb"], ["wasm", "openjpeg.wasm"]]) {
			const response = await pdfjsAssetResponse(segments, request("gzip"));
			assert.equal(response.status, 200, segments.join("/"));
			assert.equal(response.headers.get("content-encoding"), null, segments.join("/"));
			assert.equal(response.headers.get("vary"), null, segments.join("/"));
			assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync(path.join("node_modules", "pdfjs-dist", ...segments)));
		}
	});

	it("still refuses anything outside the named assets", async () => {
		assert.equal((await pdfjsAssetResponse(["legacy", "build", "pdf.mjs"], request("gzip"))).status, 404);
	});
});
