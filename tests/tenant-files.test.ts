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
const { grepTool } = await import("../src/agent/tools/grep.ts");
const { findTool } = await import("../src/agent/tools/find.ts");
const { libraryTools } = await import("../src/agent/tools/library.ts");
const { libraryStore } = await import("../src/store/library.ts");
const { pullTree } = await import("./fixtures/mirror.ts");
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

describe("feature 026: files synced from a linked repo reach the jailed tools (T040)", () => {
	const textOf = (result: { content: { type: string; text?: string }[] }) => result.content.map((part) => part.text ?? "").join("");
	const PDF = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "sample-3page.pdf"));
	const tools = () => libraryTools({ store: libraryStore, pdfOverview: async () => "3 pages", visionAvailable: () => false });

	it("library_list names the folder path and the readable file; read, ls, grep and find reach files/.mirrors", async () => {
		await runAsTenant("user_m", async () => {
			await pullTree(libraryStore, { "week1/notes.md": "# Week 1\nWaves carry energy.\n", "papers/sample.pdf": PDF });
			const listed = JSON.parse(String((await tools().library_list!.execute("l", {}) as { content: { text: string }[] }).content[0]!.text)) as { name: string; folder?: string; file?: string; fromRepo?: boolean }[];
			const notes = listed.find((row) => row.name === "notes.md")!;
			assert.equal(notes.folder, "Lecture notes / week1");
			assert.equal(notes.fromRepo, true);
			assert.ok(notes.file!.startsWith(path.join(root("user_m"), ".mirrors") + path.sep), notes.file);
			assert.ok(notes.file!.endsWith(path.join("week1", "notes.md")));
			assert.match(textOf(await readTool.execute("r", { path: notes.file! })), /Waves carry energy/);
			assert.match(textOf(await lsTool.execute("l", { path: ".mirrors" })), /rpl_fixture/);
			assert.match(textOf(await grepTool.execute("g", { pattern: "carry energy", literal: true })), /\.mirrors\/rpl_fixture\/snp_[^/]+\/week1\/notes\.md:2:/);
			assert.match(textOf(await findTool.execute("f", { pattern: "*.pdf" })), /\.mirrors\/rpl_fixture\/snp_[^/]+\/papers\/sample\.pdf/);
		});
	});

	it("library_read reads a synced Markdown file and PDF by id", async () => {
		await runAsTenant("user_n", async () => {
			await pullTree(libraryStore, { "notes.md": "# Notes\nfrom the repo\n", "sample.pdf": PDF });
			const items = await libraryStore.list();
			const read = (item: string, extra = {}) => tools().library_read!.execute("r", { item, ...extra }) as Promise<{ content: { text: string }[]; details: { outcome: string } }>;
			const md = await read(items.find((i) => i.name === "notes.md")!.id);
			assert.match(md.content[0]!.text, /<library_item [^>]*name="notes.md"[^>]*>\n# Notes\nfrom the repo/);
			const pdf = await read(items.find((i) => i.name === "sample.pdf")!.id, { pages: "1" });
			assert.equal(pdf.details.outcome, "read");
			assert.match(pdf.content[0]!.text, /^<library_item [^>]*name="sample.pdf"/);
		});
	});

	it("still refuses paths outside files/ and a symlink planted in a mirror", async () => {
		await runAsTenant("user_o", async () => {
			await pullTree(libraryStore, { "notes.md": "# n\n" });
			assert.throws(() => resolveSourcePath(".mirrors/../../outside.txt"), /outside your files folder/);
			const outside = path.join(dir, "outside-mirror.txt");
			fs.writeFileSync(outside, "secret");
			const snapshot = fs.readdirSync(path.join(root("user_o"), ".mirrors", "rpl_fixture"))[0]!;
			fs.symlinkSync(outside, path.join(root("user_o"), ".mirrors", "rpl_fixture", snapshot, "planted.md"));
			assert.throws(() => resolveSourcePath(`.mirrors/rpl_fixture/${snapshot}/planted.md`), /outside your files folder/);
			assert.doesNotMatch(textOf(await grepTool.execute("g", { pattern: "secret", literal: true })), /secret/);
		});
	});
});
