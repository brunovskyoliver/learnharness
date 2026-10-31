/** The Library routes' handlers, per contracts/library-api.md, with hosted mode
 *  on and off. The real proxy path is covered by scripts/check-library-ui.mjs. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-library-api-")));
process.env.LH_DATA_DIR = dir;
const { runAsTenant } = await import("../config.ts");
const {
	libraryContentResponse, libraryDeleteResponse, libraryListResponse, libraryPatchResponse, libraryUploadResponse,
} = await import("../src/server/library.ts");
const { libraryTextIdle } = await import("../src/server/library-text.ts");
const { MAX_FILE_BYTES } = await import("../src/core/library.ts");
after(async () => {
	delete process.env.LH_HOSTED;
	await runAsTenant("user_on", () => libraryTextIdle());
	await runAsTenant("user_off_pdf", () => libraryTextIdle());
	fs.rmSync(dir, { recursive: true, force: true });
});

function post(name: string | null, body: BodyInit | null, length?: number | null): Request {
	const url = `http://localhost/api/library/upload${name === null ? "" : `?name=${encodeURIComponent(name)}`}`;
	const size = body instanceof Uint8Array ? body.length : typeof body === "string" ? Buffer.byteLength(body) : 0;
	const headers = new Headers();
	if (length !== null) headers.set("content-length", String(length ?? size));
	return new Request(url, { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);
}
const list = async () => (await (await libraryListResponse()).json()) as { items: { id: string; name: string; kind: string; textState?: string }[]; limits: Record<string, unknown> };
const upload = async (name: string, text: string | Uint8Array) => libraryUploadResponse(post(name, text as BodyInit));
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const untouchedBody = () => {
	let read = false;
	return { stream: new ReadableStream<Uint8Array>({ pull() { read = true; throw new Error("read"); } }, { highWaterMark: 0 }), wasRead: () => read };
};

for (const hosted of [false, true]) {
	const scope = <T,>(fn: () => T): T => (hosted ? runAsTenant("user_on", fn) : fn());
	const stored = (name: string) => path.join(dir, ...(hosted ? ["users", "user_on"] : []), "files", name);
	describe(`library API, LH_HOSTED ${hosted ? "on" : "off"}`, () => {
		const on = () => { if (hosted) process.env.LH_HOSTED = "1"; else delete process.env.LH_HOSTED; };

		it("uploads, lists and marks JSON as no-store", async () => {
			on();
			await scope(async () => {
				const made = await upload("notes.md", "# hi");
				assert.equal(made.status, 201);
				assert.equal(made.headers.get("cache-control"), "no-store");
				assert.equal((await made.json()).item.name, "notes.md");
				const listing = await libraryListResponse();
				assert.equal(listing.headers.get("cache-control"), "no-store");
				const body = await listing.json();
				assert.ok(body.items.some((i: { name: string }) => i.name === "notes.md"));
				assert.equal(body.limits.maxFileBytes, MAX_FILE_BYTES);
				assert.equal(body.limits.inlineItemBytes, 32768);
				assert.ok(body.limits.accepted.pdf.includes("pdf"));
			});
		});

		it("409s a same-name upload with a free name and keeps the original", async () => {
			on();
			await scope(async () => {
				await upload("clash.md", "first");
				const clash = await upload("clash.md", "second");
				assert.equal(clash.status, 409);
				const body = await clash.json();
				assert.equal(body.code, "name_taken");
				assert.equal(body.name, "clash.md");
				assert.equal(body.suggestedName, "clash (2).md");
				assert.match(body.error, /clash\.md is already in your Library\./);
				assert.equal(fs.readFileSync(stored("clash.md"), "utf8"), "first");
			});
		});

		it("411s a missing or unusable length", async () => {
			on();
			await scope(async () => {
				assert.equal((await libraryUploadResponse(post("a.md", "x", null))).status, 411);
				const bad = new Headers({ "content-length": "abc" });
				assert.equal((await libraryUploadResponse(new Request("http://localhost/x?name=a.md", { method: "POST", body: "x", headers: bad }))).status, 411);
			});
		});

		it("413s before reading a single byte", async () => {
			on();
			await scope(async () => {
				const { stream, wasRead } = untouchedBody();
				const response = await libraryUploadResponse(post("big.md", stream, MAX_FILE_BYTES + 1));
				assert.equal(response.status, 413);
				assert.equal(wasRead(), false);
				assert.equal(fs.existsSync(stored("big.md")), false);
			});
		});

		it("415s by extension before reading, and by content after", async () => {
			on();
			await scope(async () => {
				const { stream, wasRead } = untouchedBody();
				assert.equal((await libraryUploadResponse(post("a.exe", stream, 10))).status, 415);
				assert.equal(wasRead(), false);
				const fake = await upload("fake.pdf", "not a pdf");
				assert.equal(fake.status, 415);
				assert.match((await fake.json()).error, /contents/);
				assert.equal(fs.existsSync(stored("fake.pdf")), false);
			});
		});

		it("400s a bad name, an empty file and a length mismatch, storing nothing", async () => {
			on();
			await scope(async () => {
				for (const name of [null, "", "../x.md", ".env"]) assert.equal((await libraryUploadResponse(post(name, "x"))).status, 400, String(name));
				assert.equal((await libraryUploadResponse(post("empty.md", null, 0))).status, 400);
				const cut = await libraryUploadResponse(post("cut.md", "short", 500));
				assert.equal(cut.status, 400);
				assert.match((await cut.json()).error, /whole/);
				assert.equal(fs.existsSync(stored("cut.md")), false);
				assert.equal(fs.existsSync(stored("empty.md")), false);
			});
		});

		it("leaves one winner among concurrent same-name uploads", async () => {
			on();
			await scope(async () => {
				const results = await Promise.all([upload("race.md", "aaaa"), upload("race.md", "bbbb"), upload("race.md", "cccc")]);
				assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
				assert.equal((await list()).items.filter((i) => i.name === "race.md").length, 1);
			});
		});

		it("gives a conflict for a symlink at the target and leaves the outside file alone", async () => {
			on();
			await scope(async () => {
				const outside = path.join(dir, `outside-${hosted}.txt`);
				fs.writeFileSync(outside, "keep");
				fs.mkdirSync(path.dirname(stored("x")), { recursive: true });
				fs.symlinkSync(outside, stored("link.md"));
				assert.equal((await upload("link.md", "new")).status, 409);
				assert.equal(fs.readFileSync(outside, "utf8"), "keep");
				assert.equal(fs.lstatSync(stored("link.md")).isSymbolicLink(), true);
			});
		});

		it("serves nothing as HTML, with nosniff and the right disposition", async () => {
			on();
			await scope(async () => {
				const page = await (await upload("page.html", "<script>alert(1)</script>")).json();
				const viewed = await libraryContentResponse(new Request("http://localhost/x"), page.item.id);
				assert.equal(viewed.status, 200);
				assert.equal(viewed.headers.get("content-type"), "text/plain; charset=utf-8");
				assert.equal(viewed.headers.get("x-content-type-options"), "nosniff");
				assert.equal(viewed.headers.get("content-disposition"), null);
				assert.equal(await viewed.text(), "<script>alert(1)</script>");
				const down = await libraryContentResponse(new Request("http://localhost/x?download=1"), page.item.id);
				assert.match(down.headers.get("content-disposition") ?? "", /^attachment; filename\*=UTF-8''page\.html$/);
				await down.body?.cancel();

				const image = await (await upload("a.png", png)).json();
				const shown = await libraryContentResponse(new Request("http://localhost/x"), image.item.id);
				assert.equal(shown.headers.get("content-type"), "image/png");
				assert.match(shown.headers.get("content-disposition") ?? "", /^inline/);
				assert.equal(shown.headers.get("x-content-type-options"), "nosniff");
				assert.deepEqual(new Uint8Array(await shown.arrayBuffer()), png);
			});
		});

		it("renames, refuses clashes and bad names, and 404s unknown ids", async () => {
			on();
			await scope(async () => {
				const made = await (await upload("rename.md", "x")).json();
				const patch = (id: string, body: unknown) => libraryPatchResponse(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), id);
				const renamed = await patch(made.item.id, { name: "renamed.md" });
				assert.equal(renamed.status, 200);
				assert.equal((await renamed.json()).item.name, "renamed.md");
				await upload("taken.md", "x");
				const clash = await patch(made.item.id, { name: "taken.md" });
				assert.equal(clash.status, 409);
				assert.equal((await clash.json()).code, "name_taken");
				assert.equal((await patch(made.item.id, { name: "a/b.md" })).status, 400);
				assert.equal((await patch(made.item.id, {})).status, 400);
				assert.equal((await patch(made.item.id, { name: "renamed.exe" })).status, 400);
				assert.equal((await libraryPatchResponse(new Request("http://localhost/x", { method: "PATCH", body: "{ torn" }), made.item.id)).status, 400);
				assert.equal((await patch("lib_none", { name: "a.md" })).status, 404);
			});
		});

		it("deletes, then 404s", async () => {
			on();
			await scope(async () => {
				const made = await (await upload("delete.md", "x")).json();
				const gone = await libraryDeleteResponse(made.item.id);
				assert.equal(gone.status, 200);
				assert.deepEqual(await gone.json(), { ok: true });
				assert.equal(fs.existsSync(stored("delete.md")), false);
				assert.equal((await libraryDeleteResponse(made.item.id)).status, 404);
				assert.equal((await libraryContentResponse(new Request("http://localhost/x"), made.item.id)).status, 404);
				assert.ok(!(await list()).items.some((i) => i.name === "delete.md"));
			});
		});

		it("answers 500 for an unusable catalog and leaves it", async () => {
			on();
			await scope(async () => {
				const catalog = path.join(path.dirname(path.dirname(stored("x"))), "library", "catalog.json");
				const saved = fs.readFileSync(catalog, "utf8");
				fs.writeFileSync(catalog, "{ torn");
				const response = await libraryListResponse();
				assert.equal(response.status, 500);
				assert.equal((await response.json()).error, "Your Library could not be loaded.");
				assert.equal(fs.readFileSync(catalog, "utf8"), "{ torn");
				fs.writeFileSync(catalog, saved);
			});
		});
	});
}

describe("text state after upload", () => {
	it("marks a text file ok and an unparsable PDF failed, without a model", async () => {
		process.env.LH_HOSTED = "1";
		await runAsTenant("user_off_pdf", async () => {
			await upload("t.md", "# one\ntwo\n");
			await upload("broken.pdf", "%PDF-1.7 not really");
			await libraryTextIdle();
			const items = (await list()).items;
			assert.equal(items.find((i) => i.name === "t.md")!.textState, "ok");
			assert.equal(items.find((i) => i.name === "broken.pdf")!.textState, "failed");
		});
		delete process.env.LH_HOSTED;
	});
});
