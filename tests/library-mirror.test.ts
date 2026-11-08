/** Feature 026 (research R1-R4, data-model.md): a staged snapshot becomes the
 *  linked folder, its mirror folders and its items in one catalog write.
 *  This file holds the first-pull ("apply") part; the update part follows
 *  with US2 (T024). */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-mirror-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore } = await import("../src/store/library.ts");
const { classifyEntry, repoKeyOf } = await import("../src/core/repo-link.ts");
const { subscribe } = await import("../src/core/events.ts");
type MirrorFile = import("../src/core/ports.ts").MirrorFile;
type FirstLink = import("../src/core/ports.ts").FirstLink;
after(() => fs.rmSync(dir, { recursive: true, force: true }));

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

const enc = (text: string) => new TextEncoder().encode(text);
const PDF = enc("%PDF-1.4\n%fake\n");
/** What a fixture repo's tip holds: nested notes, a PDF, unsupported files and an unsupported-only directory. */
const TREE: Record<string, Uint8Array> = {
	"README.md": enc("# notes\n"),
	"week1/notes.md": enc("# week 1\n"),
	"week2/notes.md": enc("# week 2\n"),
	"week2/deep/er/proof.txt": enc("qed\n"),
	"papers/paper.pdf": PDF,
	"bin/tool.exe": enc("MZ"),
	"bin/data.bin": enc("\x00\x01"),
	"cover.xyz": enc("?"),
};
const oidOf = (p: string) => Buffer.from(p).toString("hex").padEnd(40, "0").slice(0, 40);

const repoKey = repoKeyOf("github.com/oliver/notes", "main");
const first = (over: Partial<FirstLink> = {}): FirstLink => ({
	link: { id: "rpl_a", url: "https://github.com/oliver/notes", display: "github.com/oliver/notes", repoKey, branch: "main", branchGiven: false, hasToken: false, createdAt: "2026-11-08T10:00:00.000Z" },
	folderName: "Lecture notes",
	parentId: null,
	...over,
});

/** Stage the supported files the way a pull does and return them. */
async function stage(linkId: string, tree = TREE) {
	const stager = await libraryStore.stageSnapshot(linkId);
	const files: MirrorFile[] = [];
	for (const [p, bytes] of Object.entries(tree)) {
		const verdict = classifyEntry({ path: p, mode: "100644" }, bytes);
		if (verdict.action !== "keep") continue;
		await stager.put(p, oidOf(p), bytes);
		files.push({ path: p, oid: oidOf(p), size: bytes.length, kind: verdict.kind });
	}
	return { snapshot: stager.snapshot, files };
}
const synced = { state: "synced" as const, lastAttemptAt: "2026-11-08T10:00:00.000Z", lastSuccessAt: "2026-11-08T10:00:00.000Z", commit: "c".repeat(40) };

describe("applyMirror, first pull", () => {
	it("builds the linked folder, one mirror folder per directory with supported files, and one item per file", async () => {
		const events: string[] = [];
		const off = subscribe((event) => { if (event.type === "library-changed") events.push(String((event as { itemId?: string }).itemId)); });
		const { snapshot, files } = await stage("rpl_a");
		const result = await libraryStore.applyMirror("rpl_a", { snapshot, files, sync: synced }, first());
		off();
		assert.ok("link" in result, JSON.stringify(result));
		const { link, folder } = result;
		assert.equal(folder.name, "Lecture notes");
		assert.equal(folder.parentId, null);
		assert.deepEqual(folder.mirror, { linkId: "rpl_a", repoKey, path: "" });
		assert.equal(link.folderId, folder.id);
		assert.equal(link.sync.state, "synced");
		assert.deepEqual((await libraryStore.repoLinks()).map((l) => l.id), ["rpl_a"]);

		const folders = await libraryStore.folders();
		const byPath = new Map(folders.map((f) => [f.mirror?.path, f]));
		// bin/ holds only unsupported files: no folder for it.
		assert.deepEqual([...byPath.keys()].sort(), ["", "papers", "week1", "week2", "week2/deep", "week2/deep/er"]);
		assert.equal(byPath.get("week2/deep/er")!.parentId, byPath.get("week2/deep")!.id);
		assert.equal(byPath.get("week2/deep")!.name, "deep");
		assert.equal(byPath.get("week1")!.parentId, folder.id);

		const items = await libraryStore.list();
		assert.deepEqual(items.map((i) => i.mirror?.path).sort(), ["README.md", "papers/paper.pdf", "week1/notes.md", "week2/deep/er/proof.txt", "week2/notes.md"]);
		// Two notes.md, neither renamed.
		const notes = items.filter((i) => i.name === "notes.md");
		assert.equal(notes.length, 2);
		assert.deepEqual(notes.map((i) => i.folderId).sort(), [byPath.get("week1")!.id, byPath.get("week2")!.id].sort());
		for (const item of items) {
			assert.deepEqual(item.origin, { type: "repo", linkId: "rpl_a" });
			assert.equal(item.mirror!.snapshot, snapshot);
			assert.equal(item.mirror!.oid, oidOf(item.mirror!.path));
			assert.equal(item.size, TREE[item.mirror!.path]!.length);
			const bytes = fs.readFileSync(libraryStore.documentPath(item));
			assert.deepEqual(new Uint8Array(bytes), TREE[item.mirror!.path]);
			assert.ok(libraryStore.documentPath(item).startsWith(path.join(dir, "files", ".mirrors", "rpl_a", snapshot) + path.sep));
		}
		const pdf = items.find((i) => i.kind === "pdf")!;
		assert.equal(pdf.textState, "pending");
		assert.equal(items.find((i) => i.name === "README.md")!.kind, "markdown");
		assert.equal(items.find((i) => i.name === "proof.txt")!.kind, "text");
		assert.equal(items.find((i) => i.name === "README.md")!.textState, undefined);
		assert.ok(events.includes(folder.id), "library-changed for the linked folder");
		// Text reads go to the mirror.
		assert.equal(await libraryStore.readText(notes[0]!), new TextDecoder().decode(TREE[notes[0]!.mirror!.path]));
	});

	it("nests the linked folder under a normal folder and refuses a clash, a missing parent or a parent inside a mirror", async () => {
		const physics = await libraryStore.createFolder("Physics", null);
		assert.ok("id" in physics);
		await libraryStore.createFolder("Lecture notes", physics.id);
		const a = await stage("rpl_a");
		const clash = await libraryStore.applyMirror("rpl_a", { ...a, sync: synced }, first({ parentId: physics.id }));
		assert.ok("refused" in clash);
		assert.equal(clash.refused, "name_taken");
		assert.equal(clash.suggestedName, "Lecture notes (2)");

		const missing = await libraryStore.applyMirror("rpl_a", { ...a, sync: synced }, first({ parentId: "fld_gone" }));
		assert.ok("refused" in missing && missing.refused === "folder_missing");

		const ok = await libraryStore.applyMirror("rpl_a", { ...a, sync: synced }, first({ parentId: physics.id, folderName: "Notes repo" }));
		assert.ok("link" in ok);
		assert.equal(ok.folder.parentId, physics.id);
		const week1 = (await libraryStore.folders()).find((f) => f.mirror?.path === "week1")!;
		const b = await stage("rpl_b");
		const inside = await libraryStore.applyMirror("rpl_b", { ...b, sync: synced }, first({ link: { ...first().link, id: "rpl_b" }, parentId: week1.id }));
		assert.ok("refused" in inside);
		assert.equal(inside.refused, "repo_folder");
		assert.equal(inside.message, "Notes repo mirrors a repo. Add files in the repo instead.");
		assert.deepEqual((await libraryStore.repoLinks()).map((l) => l.id), ["rpl_a"]);
	});

	it("hard-links a blob whose oid the current snapshot holds, and discards a snapshot no write took", async () => {
		const a = await stage("rpl_a");
		const ok = await libraryStore.applyMirror("rpl_a", { ...a, sync: synced }, first());
		assert.ok("link" in ok);
		const again = await libraryStore.stageSnapshot("rpl_a");
		await again.put("README.md", oidOf("README.md"), enc("ignored: linked from the old one"));
		const target = path.join(dir, "files", ".mirrors", "rpl_a", again.snapshot, "README.md");
		const source = path.join(dir, "files", ".mirrors", "rpl_a", a.snapshot, "README.md");
		assert.equal(fs.statSync(target).ino, fs.statSync(source).ino);
		await libraryStore.discardSnapshot("rpl_a", again.snapshot);
		assert.equal(fs.existsSync(path.join(dir, "files", ".mirrors", "rpl_a", again.snapshot)), false);
		assert.equal(fs.existsSync(source), true);
	});

	it("never lets a repo path leave the mirror directory", async () => {
		const stager = await libraryStore.stageSnapshot("rpl_a");
		await assert.rejects(stager.put("../escape.md", "0".repeat(40), enc("x")), /damaged/);
		await assert.rejects(stager.put("a//b.md", "0".repeat(40), enc("x")), /damaged/);
	});
});
