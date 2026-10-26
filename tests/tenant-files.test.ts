/**
 * Hosted file jail and uploads (2026-10-26): in hosted mode the agent's fs
 * tools resolve only inside the tenant's files/ folder — `..`, absolute
 * paths, symlinks and another tenant's paths cannot leave it — and the
 * upload route is the one way in, with a size cap and plain names only.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-tenant-files-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_HOSTED = "1";
const { runAsTenant, PATHS } = await import("../config.ts");
const { resolveSourcePath } = await import("../src/agent/tools/fs-shared.ts");
const { filesResponse, uploadName, UPLOAD_MAX_BYTES } = await import("../src/server/files.ts");
after(() => {
	delete process.env.LH_HOSTED;
	fs.rmSync(dir, { recursive: true, force: true });
});

const root = (user: string) => path.join(dir, "users", user, "files");
function upload(files: File[], length?: number) {
	const form = new FormData();
	for (const file of files) form.append("files", file);
	const request = new Request("http://localhost/api/files", { method: "POST", body: form });
	const headers = new Headers(request.headers);
	headers.set("content-length", String(length ?? 1000));
	return new Request(request, { headers });
}

describe("hosted file jail", () => {
	it("anchors every path in the tenant's files folder", () => {
		runAsTenant("user_a", () => {
			assert.equal(resolveSourcePath(), root("user_a"));
			assert.equal(resolveSourcePath("notes/a.md"), path.join(root("user_a"), "notes/a.md"));
			assert.equal(resolveSourcePath("/etc/passwd"), path.join(root("user_a"), "etc/passwd"), "absolute paths are read inside the folder");
			const full = path.join(root("user_a"), "x.md");
			assert.equal(resolveSourcePath(full), full, "a full path already inside is kept");
			assert.throws(() => resolveSourcePath("../../user_b/files"), /outside your files folder/);
		});
	});

	it("does not follow a symlink out of the folder", () => {
		runAsTenant("user_a", () => resolveSourcePath());
		fs.symlinkSync("/etc", path.join(root("user_a"), "escape"));
		runAsTenant("user_a", () => assert.throws(() => resolveSourcePath("escape/hosts"), /outside your files folder/));
	});

	it("another tenant's full path lands inside your own folder", () => {
		const other = path.join(root("user_a"), "x.md");
		runAsTenant("user_b", () => assert.equal(resolveSourcePath(other), path.join(root("user_b"), other)));
	});
});

describe("hosted uploads", () => {
	it("saves, lists and deletes plain files per tenant", async () => {
		const saved = await runAsTenant("user_c", () => filesResponse(upload([new File(["# hi"], "notes.md")])));
		assert.equal(saved.status, 200);
		assert.deepEqual((await saved.json()).files.map((f: { name: string }) => f.name), ["notes.md"]);
		assert.equal(fs.readFileSync(path.join(root("user_c"), "notes.md"), "utf8"), "# hi");
		const listedB = await runAsTenant("user_d", () => filesResponse(new Request("http://localhost/api/files")));
		assert.deepEqual((await listedB.json()).files, []);
		const removed = await runAsTenant("user_c", () => filesResponse(new Request("http://localhost/api/files?name=notes.md", { method: "DELETE" })));
		assert.deepEqual((await removed.json()).files, []);
	});

	it("refuses unsafe names and oversize uploads", async () => {
		for (const name of ["../x.md", ".env", "a/b.md", ""]) assert.equal(uploadName(name), null, name);
		const bad = await runAsTenant("user_c", () => filesResponse(upload([new File(["x"], "..")])));
		assert.equal(bad.status, 400);
		const big = await runAsTenant("user_c", () => filesResponse(upload([new File(["x"], "a.md")], UPLOAD_MAX_BYTES + 1)));
		assert.equal(big.status, 413);
	});

	it("replaces a planted symlink instead of writing through it", async () => {
		const outside = path.join(dir, "outside.txt");
		fs.writeFileSync(outside, "keep");
		runAsTenant("user_c", () => fs.mkdirSync(PATHS.files, { recursive: true }));
		fs.symlinkSync(outside, path.join(root("user_c"), "link.md"));
		await runAsTenant("user_c", () => filesResponse(upload([new File(["new"], "link.md")])));
		assert.equal(fs.readFileSync(outside, "utf8"), "keep");
		assert.equal(fs.lstatSync(path.join(root("user_c"), "link.md")).isSymbolicLink(), false);
	});

	it("is not there outside hosted mode", async () => {
		delete process.env.LH_HOSTED;
		try { assert.equal((await filesResponse(new Request("http://localhost/api/files"))).status, 404); }
		finally { process.env.LH_HOSTED = "1"; }
	});
});
