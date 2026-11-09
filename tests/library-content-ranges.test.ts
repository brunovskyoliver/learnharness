/** The Library content route's ranges, version tag and caching, per
 *  specs/024-instant-loads/contracts/library-content-ranges.md. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-content-ranges-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_HOSTED = "1";
const { runAsTenant } = await import("../config.ts");
const { libraryContentResponse, libraryUploadResponse } = await import("../src/server/library.ts");
const { libraryTextIdle } = await import("../src/server/library-text.ts");
after(async () => {
	await runAsTenant("u_ranges", () => libraryTextIdle());
	delete process.env.LH_HOSTED;
	fs.rmSync(dir, { recursive: true, force: true });
});

// Padded past several chunks of every allowed size (trailing whitespace keeps it a PDF).
const PDF = Buffer.concat([fs.readFileSync(path.join(import.meta.dirname, "fixtures", "sample-3page.pdf")), Buffer.alloc(150_000, 0x20)]);
const SIZE = PDF.length;
const asUser = <T>(user: string, fn: () => Promise<T>) => runAsTenant(user, fn) as Promise<T>;
const stored = (user: string, name: string) => path.join(dir, "users", user, "files", name);

let id = "";
const get = (headers: Record<string, string> = {}, query = "") =>
	asUser("u_ranges", () => libraryContentResponse(new Request(`http://localhost/api/library/items/${id}/content${query}`, { headers }), id));
const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());

before(async () => {
	await asUser("u_ranges", async () => {
		const made = await libraryUploadResponse(new Request("http://localhost/api/library/upload?name=doc.pdf", {
			method: "POST", body: PDF, headers: { "content-length": String(SIZE) },
		}));
		assert.equal(made.status, 201);
		id = (await made.json()).item.id;
	});
});

describe("library content ranges", () => {
	it("answers a plain request in full, advertising ranges, a tag and private revalidation", async () => {
		const full = await get();
		assert.equal(full.status, 200);
		assert.equal(full.headers.get("content-type"), "application/pdf");
		assert.equal(full.headers.get("content-length"), String(SIZE));
		assert.equal(full.headers.get("accept-ranges"), "bytes");
		assert.match(full.headers.get("etag") ?? "", /^"[^"]+"$/, "a strong tag");
		const cache = full.headers.get("cache-control") ?? "";
		assert.match(cache, /\bprivate\b/);
		assert.match(cache, /\bno-cache\b/);
		assert.doesNotMatch(cache, /no-store|max-age|public/);
		assert.equal(full.headers.get("content-encoding"), null);
		assert.equal(full.headers.get("x-content-type-options"), "nosniff");
		assert.match(full.headers.get("content-disposition") ?? "", /^inline; filename\*=UTF-8''doc\.pdf$/);
		assert.deepEqual(await bytes(full), new Uint8Array(PDF));
	});

	it("answers 304 with no body when the tag still matches", async () => {
		const tag = (await get()).headers.get("etag")!;
		for (const value of [tag, `W/${tag}`, `"other", ${tag}`, "*"]) {
			const same = await get({ "if-none-match": value });
			assert.equal(same.status, 304, value);
			assert.equal(same.headers.get("etag"), tag);
			assert.match(same.headers.get("cache-control") ?? "", /private, no-cache/);
			assert.equal(same.body, null);
		}
		assert.equal((await get({ "if-none-match": '"stale"' })).status, 200);
	});

	it("answers a single satisfiable range with 206 and the slice", async () => {
		const cases: [string, number, number][] = [
			["bytes=0-99", 0, 99],
			["bytes=100-", 100, SIZE - 1],
			["bytes=-50", SIZE - 50, SIZE - 1],
			[`bytes=10-${SIZE + 1000}`, 10, SIZE - 1],
			[`bytes=-${SIZE * 2}`, 0, SIZE - 1],
		];
		for (const [range, start, end] of cases) {
			const part = await get({ range });
			assert.equal(part.status, 206, range);
			assert.equal(part.headers.get("content-range"), `bytes ${start}-${end}/${SIZE}`, range);
			assert.equal(part.headers.get("content-length"), String(end - start + 1), range);
			assert.equal(part.headers.get("accept-ranges"), "bytes");
			assert.ok(part.headers.get("etag"));
			assert.equal(part.headers.get("content-encoding"), null);
			assert.deepEqual(await bytes(part), new Uint8Array(PDF.subarray(start, end + 1)), range);
		}
	});

	it("honours If-Range: the current tag gives the slice, any other value the whole file", async () => {
		const tag = (await get()).headers.get("etag")!;
		const matched = await get({ range: "bytes=0-9", "if-range": tag });
		assert.equal(matched.status, 206);
		assert.equal((await bytes(matched)).length, 10);
		for (const other of ['"stale"', `W/${tag}`, "Wed, 21 Oct 2015 07:28:00 GMT"]) {
			const whole = await get({ range: "bytes=0-9", "if-range": other });
			assert.equal(whole.status, 200, other);
			assert.equal((await bytes(whole)).length, SIZE, other);
		}
	});

	it("sends the whole file for several ranges or a malformed one", async () => {
		for (const range of ["bytes=0-1,5-6", "bytes=5-3", "bytes=-", "bytes=a-b", "items=0-1", "bytes=0x-1", "bytes = 0-1-2"]) {
			const whole = await get({ range });
			assert.equal(whole.status, 200, range);
			assert.equal(whole.headers.get("content-range"), null, range);
			assert.equal((await bytes(whole)).length, SIZE, range);
		}
	});

	it("answers 416 for an unsatisfiable range", async () => {
		for (const range of [`bytes=${SIZE}-`, `bytes=${SIZE + 5}-${SIZE + 9}`, "bytes=-0"]) {
			const refused = await get({ range });
			assert.equal(refused.status, 416, range);
			assert.equal(refused.headers.get("content-range"), `bytes */${SIZE}`, range);
			await refused.body?.cancel();
		}
	});

	it("keeps ?download=1 an attachment, in full and in ranges", async () => {
		const down = await get({}, "?download=1");
		assert.equal(down.status, 200);
		assert.match(down.headers.get("content-disposition") ?? "", /^attachment; filename\*=UTF-8''doc\.pdf$/);
		assert.equal((await bytes(down)).length, SIZE);
		const part = await get({ range: "bytes=0-9" }, "?download=1");
		assert.equal(part.status, 206);
		assert.match(part.headers.get("content-disposition") ?? "", /^attachment/);
		await part.body?.cancel();
	});

	it("changes the tag when the stored file is rewritten, so a cached copy is never reused", async () => {
		const first = (await get()).headers.get("etag")!;
		const file = stored("u_ranges", "doc.pdf");
		fs.writeFileSync(file, Buffer.concat([PDF, Buffer.from("\n% appended\n")]));
		fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
		const after = await get({ "if-none-match": first });
		assert.equal(after.status, 200);
		assert.notEqual(after.headers.get("etag"), first);
		assert.equal((await bytes(after)).length, SIZE + 12);
		// Same size, new mtime: still a new tag.
		const second = after.headers.get("etag")!;
		fs.utimesSync(file, new Date(), new Date(Date.now() + 10000));
		const touched = await get({ "if-none-match": second });
		assert.equal(touched.status, 200);
		assert.notEqual(touched.headers.get("etag"), second);
		await touched.body?.cancel();
		fs.writeFileSync(file, PDF);
	});

	it("keeps tenants apart: another tenant's id is a 404, with or without a range", async () => {
		await asUser("u_other", async () => {
			for (const headers of [{}, { range: "bytes=0-9" }, { "if-none-match": "*" }] as Record<string, string>[]) {
				const response = await libraryContentResponse(new Request(`http://localhost/x`, { headers }), id);
				assert.equal(response.status, 404);
				assert.equal(response.headers.get("cache-control"), "no-store");
			}
		});
	});
});

describe("library content versioned chunks", () => {
	const tagNow = async () => (await get({ range: "bytes=0-0" })).headers.get("etag")!.replace(/"/g, "");
	const chunk = (v: string, n: number | string, size: number | string) => get({}, `?v=${encodeURIComponent(v)}&chunk=${n}&size=${size}`);

	it("answers a chunk with exactly its bytes and immutable private caching", async () => {
		const v = await tagNow();
		for (const size of [16384, 32768, 65536]) {
			const last = Math.ceil(SIZE / size) - 1;
			for (const n of [0, 1, last]) {
				const response = await chunk(v, n, size);
				assert.equal(response.status, 200, `${size}/${n}`);
				const start = n * size;
				const end = Math.min(start + size, SIZE);
				assert.equal(response.headers.get("content-length"), String(end - start));
				assert.match(response.headers.get("cache-control") ?? "", /^private, max-age=31536000, immutable\b/);
				assert.equal(response.headers.get("etag"), `"${v}"`);
				assert.equal(response.headers.get("content-encoding"), null);
				assert.equal(response.headers.get("content-type"), "application/pdf");
				assert.deepEqual(await bytes(response), new Uint8Array(PDF.subarray(start, end)), `${size}/${n}`);
			}
		}
	});

	it("ignores a Range header on a chunk URL", async () => {
		const v = await tagNow();
		const response = await get({ range: "bytes=0-9" }, `?v=${v}&chunk=0&size=16384`);
		assert.equal(response.status, 200);
		assert.equal((await bytes(response)).length, Math.min(16384, SIZE));
	});

	it("refuses a stale version with 412 and no-store, so a new file is never mixed with an old one", async () => {
		const stale = await chunk("not-the-tag", 0, 16384);
		assert.equal(stale.status, 412);
		assert.equal(stale.headers.get("cache-control"), "no-store");
		const v = await tagNow();
		const file = stored("u_ranges", "doc.pdf");
		fs.utimesSync(file, new Date(), new Date(Date.now() + 20000));
		const after = await chunk(v, 0, 16384);
		assert.equal(after.status, 412);
		assert.equal(after.body === null || (await after.json()).error.length > 0, true);
		assert.notEqual(await tagNow(), v);
	});

	it("answers 400 for a bad chunk or size and 416 past the end", async () => {
		const v = await tagNow();
		for (const [n, size] of [["x", 16384], ["-1", 16384], ["1.5", 16384], [0, 1000], [0, "abc"], [0, 1048576], ["", 16384]] as const) {
			const response = await chunk(v, n, size);
			assert.equal(response.status, 400, `${n}/${size}`);
			assert.equal(response.headers.get("cache-control"), "no-store");
		}
		const missingV = await get({}, "?chunk=0&size=16384");
		assert.equal(missingV.status, 400);
		const past = await chunk(v, Math.ceil(SIZE / 16384), 16384);
		assert.equal(past.status, 416);
		assert.equal(past.headers.get("content-range"), `bytes */${SIZE}`);
	});

	it("keeps tenants apart on chunk URLs", async () => {
		const v = await tagNow();
		await asUser("u_other", async () => {
			const response = await libraryContentResponse(new Request(`http://localhost/x?v=${v}&chunk=0&size=16384`), id);
			assert.equal(response.status, 404);
		});
	});
});
