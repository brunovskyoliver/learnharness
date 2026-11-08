/** Feature 026 (research R1-R4, data-model.md): a staged snapshot becomes the
 *  linked folder, its mirror folders and its items in one catalog write: the
 *  first pull ("apply", T014) and every later one ("update", T024). */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

/** Stage the supported files the way a pull does and return them. `oid` defaults to one per path. */
async function stage(linkId: string, tree = TREE, oid: (p: string, bytes: Uint8Array) => string = oidOf) {
	const stager = await libraryStore.stageSnapshot(linkId);
	const files: MirrorFile[] = [];
	for (const [p, bytes] of Object.entries(tree)) {
		const verdict = classifyEntry({ path: p, mode: "100644" }, bytes);
		if (verdict.action !== "keep") continue;
		await stager.put(p, oid(p, bytes), bytes);
		files.push({ path: p, oid: oid(p, bytes), size: bytes.length, kind: verdict.kind });
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

// ── Later pulls (T024) ──

/** A content oid, so a changed file gets a new one and a moved one keeps it. */
const contentOid = (_p: string, bytes: Uint8Array) => createHash("sha1").update(bytes).digest("hex");
const at = (minute: number) => `2026-11-08T10:${String(minute).padStart(2, "0")}:00.000Z`;
const syncedAt = (minute: number, commit: string) => ({ state: "synced" as const, lastAttemptAt: at(minute), lastSuccessAt: at(minute), commit });
const catalogFile = () => path.join(dir, "library", "catalog.json");
const readDisk = () => JSON.parse(fs.readFileSync(catalogFile(), "utf8")) as Record<string, unknown> & { items: { id: string }[] };

async function linked(tree: Record<string, Uint8Array> = TREE) {
	const a = await stage("rpl_a", tree, contentOid);
	const result = await libraryStore.applyMirror("rpl_a", { ...a, sync: synced }, first());
	assert.ok("link" in result, JSON.stringify(result));
	return { ...result, snapshot: a.snapshot };
}
async function pull(tree: Record<string, Uint8Array>, minute: number) {
	const next = await stage("rpl_a", tree, contentOid);
	const result = await libraryStore.applyMirror("rpl_a", { ...next, sync: syncedAt(minute, `c${minute}`.padEnd(40, "0")) });
	assert.ok("link" in result, JSON.stringify(result));
	return { ...result, snapshot: next.snapshot };
}
/** The live mirror as path → bytes, read through each item's documentPath. */
async function mirrorTree() {
	const out: Record<string, string> = {};
	for (const item of await libraryStore.list()) if (item.mirror) out[item.mirror.path] = fs.readFileSync(libraryStore.documentPath(item), "utf8");
	return out;
}
const supported = (tree: Record<string, Uint8Array>) => Object.fromEntries(Object.entries(tree)
	.filter(([p, bytes]) => classifyEntry({ path: p, mode: "100644" }, bytes).action === "keep")
	.map(([p, bytes]) => [p, new TextDecoder().decode(bytes)]));
const byPath = async () => new Map((await libraryStore.list()).filter((i) => i.mirror).map((i) => [i.mirror!.path, i]));

describe("applyMirror, later pulls", () => {
	it("follows adds, changes, deletes and moves upstream; unchanged files keep id, updatedAt and annotations (SC-004)", async () => {
		const { folder, snapshot: firstSnap } = await linked();
		const before = await byPath();
		const readme = before.get("README.md")!;
		const week1 = before.get("week1/notes.md")!;
		const proof = before.get("week2/deep/er/proof.txt")!;
		fs.mkdirSync(path.join(dir, "library", "annotations"), { recursive: true });
		fs.writeFileSync(path.join(dir, "library", "annotations", `${readme.id}.json`), "{\"highlights\":[1]}");
		fs.writeFileSync(path.join(dir, "library", "annotations", `${week1.id}.json`), "{\"highlights\":[2]}");
		await libraryStore.writeDerived(week1.id, { size: week1.size, mtime: week1.updatedAt, text: "# week 1" });

		const events: string[] = [];
		const off = subscribe((event) => { if (event.type === "library-changed") events.push(String((event as { itemId?: string }).itemId)); });
		const tree: Record<string, Uint8Array> = { ...TREE };
		delete tree["week1/notes.md"];                         // delete
		tree["README.md"] = enc("# notes, edited\n");           // change
		tree["week3/new.md"] = enc("# week 3\n");               // add
		delete tree["week2/deep/er/proof.txt"];                 // move
		tree["proofs/proof.txt"] = enc("qed\n");
		const { link, snapshot } = await pull(tree, 15);
		off();

		assert.deepEqual(await mirrorTree(), supported(tree));
		const after = await byPath();
		// Changed: same id, new updatedAt.
		assert.equal(after.get("README.md")!.id, readme.id);
		assert.notEqual(after.get("README.md")!.updatedAt, readme.updatedAt);
		// Unchanged: everything the same but the snapshot.
		const unchanged = after.get("week2/notes.md")!;
		const was = before.get("week2/notes.md")!;
		assert.deepEqual({ ...unchanged, mirror: { ...unchanged.mirror, snapshot: "" } }, { ...was, mirror: { ...was.mirror, snapshot: "" } });
		assert.equal(unchanged.mirror!.snapshot, snapshot);
		// A move is a removal and an add: a new id at the new path.
		assert.notEqual(after.get("proofs/proof.txt")!.id, proof.id);
		assert.deepEqual(link.sync.counts, { files: Object.keys(supported(tree)).length, bytes: Object.values(supported(tree)).reduce((n, t) => n + enc(t).length, 0), added: 2, changed: 1, removed: 2, revived: 0 });
		assert.equal(link.sync.commit, "c15".padEnd(40, "0"));

		// The deleted file is a removed entry that keeps its annotations and derived text.
		const removed = (readDisk().mirrored as { items: Record<string, unknown>[] }).items.find((i) => i.id === week1.id)!;
		assert.equal(removed.removedBecause, "repo");
		assert.ok(removed.deletedAt);
		assert.deepEqual(removed.mirror, { linkId: "rpl_a", repoKey, path: "week1/notes.md", oid: week1.mirror!.oid });
		assert.equal(await libraryStore.get(week1.id), null);
		assert.ok(fs.existsSync(path.join(dir, "library", "annotations", `${week1.id}.json`)));
		assert.ok(await libraryStore.readDerived(week1.id));
		assert.ok(fs.existsSync(path.join(dir, "library", "annotations", `${readme.id}.json`)));

		// Mirror folders: week1 and week2/deep/er gone, week3 and proofs new; the old snapshot removed.
		const dirs = (await libraryStore.folders()).filter((f) => f.mirror).map((f) => f.mirror!.path).sort();
		assert.deepEqual(dirs, ["", "papers", "proofs", "week2", "week3"]);
		assert.equal(fs.existsSync(path.join(dir, "files", ".mirrors", "rpl_a", firstSnap)), false);
		assert.deepEqual(fs.readdirSync(path.join(dir, "files", ".mirrors", "rpl_a")), [snapshot]);
		for (const id of [readme.id, week1.id, proof.id, after.get("week3/new.md")!.id, folder.id]) assert.ok(events.includes(id), `library-changed for ${id}`);
		assert.ok(!events.includes(unchanged.id), "no event for an unchanged file");
	});

	it("revives a returning path with the same id, annotations and marks; marks on items and mirror folders survive pulls (SC-009)", async () => {
		await linked();
		const week1 = (await byPath()).get("week1/notes.md")!;
		const week1Folder = (await libraryStore.folders()).find((f) => f.mirror?.path === "week1")!;
		await libraryStore.markItem(week1.id, { favorite: true, tags: ["waves"], pinned: true });
		await libraryStore.markFolder(week1Folder.id, { pinned: true });
		const readme = (await byPath()).get("README.md")!;
		await libraryStore.markItem(readme.id, { archived: true });
		fs.mkdirSync(path.join(dir, "library", "annotations"), { recursive: true });
		fs.writeFileSync(path.join(dir, "library", "annotations", `${week1.id}.json`), "{}");

		await pull(TREE, 5);
		assert.ok((await byPath()).get("README.md")!.archivedAt, "marks survive an ordinary pull");

		const without = { ...TREE };
		delete without["week1/notes.md"];
		await pull(without, 15);
		assert.equal((await libraryStore.folders()).some((f) => f.id === week1Folder.id), false);

		const { link } = await pull(TREE, 30);
		const back = (await byPath()).get("week1/notes.md")!;
		assert.equal(back.id, week1.id);
		assert.equal(back.favorite, true);
		assert.equal(back.pinned, true);
		assert.deepEqual(back.tags, ["waves"]);
		assert.equal(back.createdAt, week1.createdAt);
		const folderBack = (await libraryStore.folders()).find((f) => f.mirror?.path === "week1")!;
		assert.equal(folderBack.id, week1Folder.id);
		assert.equal(folderBack.pinned, true);
		assert.equal(back.folderId, week1Folder.id);
		assert.ok(fs.existsSync(path.join(dir, "library", "annotations", `${week1.id}.json`)));
		assert.equal(link.sync.counts!.revived, 1);
		// No duplicate entries for the path: one live item, no removed one left behind.
		const disk = readDisk().mirrored as { items: { mirror: { path: string } }[]; removedFolders?: unknown[] };
		assert.equal(disk.items.filter((i) => i.mirror.path === "week1/notes.md").length, 1);
		assert.equal(disk.removedFolders, undefined);
	});

	it("follows a force-push to a new tip and empties the linked folder for an empty tree", async () => {
		const { folder } = await linked();
		const rewritten = { "fresh.md": enc("# rewritten history\n") };
		await pull(rewritten, 15);
		assert.deepEqual(await mirrorTree(), supported(rewritten));
		const { link } = await pull({}, 30);
		assert.deepEqual(await mirrorTree(), {});
		const left = (await libraryStore.folders()).filter((f) => f.mirror);
		assert.deepEqual(left.map((f) => f.id), [folder.id]);
		assert.equal(link.sync.counts!.files, 0);
		assert.equal(link.sync.state, "synced");
	});

	it("leaves uploads, pages, diagrams and plain folders byte- and record-identical (FR-013)", async () => {
		const plain = await libraryStore.createFolder("Mine", null);
		assert.ok("id" in plain);
		const upload = await libraryStore.writeUpload("notes.md", (async function* () { yield enc("# my own\n"); })(), 9, plain.id);
		assert.ok("id" in upload, JSON.stringify(upload));
		const page = await libraryStore.createPage("Plan", "# plan", { author: "learner" });
		assert.ok("item" in page);
		const { diagramStore } = await import("../src/store/diagrams.ts");
		const { blankDiagram } = await import("../src/core/diagram.ts");
		const diagram = await diagramStore.create("Map", blankDiagram("diagram"), { author: "learner" });
		assert.ok("item" in diagram);
		await linked();
		const outside = () => {
			const disk = readDisk();
			const { mirrored: _m, repoLinks: _r, ...rest } = disk;
			assert.ok(Array.isArray(rest.diagrams) && rest.diagrams.length === 1);
			return JSON.stringify(rest);
		};
		const uploadBytes = () => fs.readFileSync(path.join(dir, "files", "notes.md"));
		const before = outside();
		const bytes = uploadBytes();
		const tree: Record<string, Uint8Array> = { ...TREE, "README.md": enc("# changed\n") };
		delete tree["week2/notes.md"];
		await pull(tree, 15);
		assert.equal(outside(), before);
		await pull({}, 30);
		assert.equal(outside(), before);
		assert.deepEqual(uploadBytes(), bytes);
	});

	it("refuses a pull for a link that is gone and changes nothing", async () => {
		const next = await stage("rpl_gone", TREE, contentOid);
		const result = await libraryStore.applyMirror("rpl_gone", { ...next, sync: synced });
		assert.ok("refused" in result);
		assert.equal(fs.existsSync(catalogFile()), false);
	});
});
