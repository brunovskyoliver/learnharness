/**
 * Hosted file jail (2026-10-26): in hosted mode the agent's fs tools resolve
 * only inside the tenant's files/ folder — `..`, absolute paths, symlinks and
 * another tenant's paths cannot leave it. The Library (feature 009) is the
 * one way in; its route rules live in library-api.test.ts.
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
const { libraryPatchResponse, libraryUploadResponse } = await import("../src/server/library.ts");
const { readTool } = await import("../src/agent/tools/read.ts");
const { lsTool } = await import("../src/agent/tools/ls.ts");
after(() => {
	delete process.env.LH_HOSTED;
	fs.rmSync(dir, { recursive: true, force: true });
});

const root = (user: string) => path.join(dir, "users", user, "files");

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

describe("Library documents reach the jailed fs tools", () => {
	const send = (name: string, text: string) => libraryUploadResponse(new Request(
		`http://localhost/api/library/upload?name=${encodeURIComponent(name)}`,
		{ method: "POST", body: text, headers: { "content-length": String(Buffer.byteLength(text)) } },
	));
	const textOf = (result: { content: { type: string; text?: string }[] }) => result.content.map((part) => part.text ?? "").join("");

	it("a document uploaded through the Library resolves and reads", async () => {
		await runAsTenant("user_c", async () => {
			assert.equal((await send("notes.md", "# hi")).status, 201);
			assert.equal(resolveSourcePath("notes.md"), path.join(root("user_c"), "notes.md"));
			assert.equal(fs.readFileSync(resolveSourcePath("notes.md"), "utf8"), "# hi");
			assert.match(textOf(await readTool.execute("r", { path: "notes.md" })), /# hi/);
		});
	});

	it("ls sees a rename", async () => {
		await runAsTenant("user_e", async () => {
			const { item } = await (await send("before.md", "x")).json();
			const patch = new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ name: "after.md" }) });
			assert.equal((await libraryPatchResponse(patch, item.id)).status, 200);
			const listing = textOf(await lsTool.execute("l", {}));
			assert.match(listing, /after\.md/);
			assert.doesNotMatch(listing, /before\.md/);
		});
	});

	it("another tenant's fs tools do not see it", async () => {
		await runAsTenant("user_f", async () => {
			await send("private.md", "x");
		});
		await runAsTenant("user_g", async () => {
			await assert.rejects(Promise.resolve().then(() => readTool.execute("r", { path: "private.md" })));
		});
	});

	it("a planted symlink stays a conflict and the outside file is kept", async () => {
		const outside = path.join(dir, "outside.txt");
		fs.writeFileSync(outside, "keep");
		runAsTenant("user_c", () => fs.mkdirSync(PATHS.files, { recursive: true }));
		fs.symlinkSync(outside, path.join(root("user_c"), "link.md"));
		const response = await runAsTenant("user_c", () => send("link.md", "new"));
		assert.equal(response.status, 409);
		assert.equal(fs.readFileSync(outside, "utf8"), "keep");
	});

	it("the old upload route is gone", () => {
		assert.equal(fs.existsSync(path.join(import.meta.dirname, "..", "app", "api", "files")), false);
		assert.equal(fs.existsSync(path.join(import.meta.dirname, "..", "src", "server", "files.ts")), false);
	});
});
