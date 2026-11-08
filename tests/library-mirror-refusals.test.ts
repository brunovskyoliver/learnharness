/** Feature 026, T034 (FR-012, research R11): a mirror is read-only in content
 *  and place, refused in the store so routes, bulk actions, drops and agent
 *  tools all get the same answer. Marks still work; the linked folder can be
 *  renamed and moved but not trashed; nothing is added, moved or restored into
 *  a mirror; a folder holding a linked folder can't be trashed or deleted. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-mirror-refusals-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore } = await import("../src/store/library.ts");
const { classifyEntry, repoKeyOf } = await import("../src/core/repo-link.ts");
const { isRefusal } = await import("../src/core/library.ts");
const server = await import("../src/server/library.ts");
type LibraryFolder = import("../src/core/library.ts").LibraryFolder;
type LibraryItem = import("../src/core/library.ts").LibraryItem;
type MirrorFile = import("../src/core/ports.ts").MirrorFile;
after(() => fs.rmSync(dir, { recursive: true, force: true }));

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

const enc = (text: string) => new TextEncoder().encode(text);
const TREE: Record<string, Uint8Array> = {
	"README.md": enc("# notes\n"),
	"week1/notes.md": enc("# week 1\n"),
};
const oidOf = (p: string) => Buffer.from(p).toString("hex").padEnd(40, "0").slice(0, 40);
const synced = { state: "synced" as const, lastAttemptAt: "2026-11-08T10:00:00.000Z", lastSuccessAt: "2026-11-08T10:00:00.000Z", commit: "c".repeat(40) };

/** Links a fixture repo as "Lecture notes" under `parentId`. */
async function link(parentId: string | null = null, linkId = "rpl_a", folderName = "Lecture notes") {
	const stager = await libraryStore.stageSnapshot(linkId);
	const files: MirrorFile[] = [];
	for (const [p, bytes] of Object.entries(TREE)) {
		const verdict = classifyEntry({ path: p, mode: "100644" }, bytes);
		if (verdict.action !== "keep") continue;
		await stager.put(p, oidOf(p), bytes);
		files.push({ path: p, oid: oidOf(p), size: bytes.length, kind: verdict.kind });
	}
	const repoKey = repoKeyOf(`github.com/oliver/${linkId}`, "main");
	const result = await libraryStore.applyMirror(linkId, { snapshot: stager.snapshot, files, sync: synced }, {
		link: { id: linkId, url: `https://github.com/oliver/${linkId}`, display: `github.com/oliver/${linkId}`, repoKey, branch: "main", branchGiven: false, hasToken: false, createdAt: "2026-11-08T10:00:00.000Z" },
		folderName,
		parentId,
	});
	assert.ok("link" in result, JSON.stringify(result));
	const folders = await libraryStore.folders();
	const items = await libraryStore.list();
	return {
		linked: result.folder,
		week1: folders.find((f) => f.mirror?.linkId === linkId && f.mirror.path === "week1")!,
		readme: items.find((i) => i.mirror?.linkId === linkId && i.mirror.path === "README.md")!,
		notes: items.find((i) => i.mirror?.linkId === linkId && i.mirror.path === "week1/notes.md")!,
	};
}

const upload = async (name: string, folderId?: string | null) => {
	const bytes = enc(`# ${name}\n`);
	const result = await libraryStore.writeUpload(name, (async function* () { yield bytes; })(), bytes.length, folderId);
	return result;
};
const refusedWith = (value: unknown, code: string, message?: string) => {
	assert.ok(value && typeof value === "object" && isRefusal(value as object), `expected a refusal, got ${JSON.stringify(value)}`);
	const refusal = value as { refused: string; message: string };
	assert.equal(refusal.refused, code);
	if (message) assert.equal(refusal.message, message);
};
const jsonRequest = (method: string, body: unknown) => new Request("http://app.test/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("a mirrored item", () => {
	it("can't be renamed, moved, trashed or deleted: repo_file with the contract's sentence", async () => {
		const { readme } = await link();
		const sentence = "README.md comes from the repo. Change it there.";
		refusedWith(await libraryStore.rename(readme.id, "other.md"), "repo_file", sentence);
		refusedWith(await libraryStore.moveItem(readme.id, null), "repo_file", sentence);
		refusedWith(await libraryStore.trashItem(readme.id), "repo_file", sentence);
		refusedWith(await libraryStore.remove(readme.id), "repo_file", sentence);
		const still = await libraryStore.get(readme.id);
		assert.equal(still?.name, "README.md");
		assert.equal(still?.folderId, readme.folderId);
		assert.ok(fs.existsSync(libraryStore.documentPath(still!)), "the bytes stay where they are");
	});

	it("takes favorite, pin, tags and archive", async () => {
		const { readme } = await link();
		const marked = await libraryStore.markItem(readme.id, { favorite: true, pinned: true, tags: ["physics"], archived: true });
		assert.equal(marked?.favorite, true);
		assert.equal(marked?.pinned, true);
		assert.deepEqual(marked?.tags, ["physics"]);
		assert.ok(marked?.archivedAt);
		assert.equal(marked?.mirror?.path, "README.md");
	});
});

describe("a mirror folder", () => {
	it("can't be renamed, moved, trashed or deleted; marks work", async () => {
		const { week1 } = await link();
		const sentence = "week1 comes from the repo. Change it there.";
		refusedWith(await libraryStore.renameFolder(week1.id, "Week one"), "repo_file", sentence);
		refusedWith(await libraryStore.moveFolder(week1.id, null), "repo_file", sentence);
		refusedWith(await libraryStore.trashFolder(week1.id), "repo_file", sentence);
		refusedWith(await libraryStore.removeFolder(week1.id), "repo_file", sentence);
		const marked = await libraryStore.markFolder(week1.id, { favorite: true, pinned: true, archived: true });
		assert.equal(marked?.favorite, true);
		assert.equal(marked?.name, "week1");
	});
});

describe("the linked folder", () => {
	it("renames and moves; trash and delete say unlink instead (repo_linked)", async () => {
		const physics = await libraryStore.createFolder("Physics", null) as LibraryFolder;
		const { linked } = await link();
		const renamed = await libraryStore.renameFolder(linked.id, "Notes");
		assert.equal((renamed as LibraryFolder).name, "Notes");
		const moved = await libraryStore.moveFolder(linked.id, physics.id);
		assert.equal((moved as LibraryFolder).parentId, physics.id);
		const sentence = "Notes is linked to a repo. Unlink it to remove it.";
		refusedWith(await libraryStore.trashFolder(linked.id), "repo_linked", sentence);
		refusedWith(await libraryStore.removeFolder(linked.id), "repo_linked", sentence);
	});

	it("can't move into another mirror (repo_folder) or into itself (folder_cycle)", async () => {
		const a = await link(null, "rpl_a", "A notes");
		const b = await link(null, "rpl_b", "B notes");
		refusedWith(await libraryStore.moveFolder(a.linked.id, b.week1.id), "repo_folder", "B notes mirrors a repo. Add files in the repo instead.");
		refusedWith(await libraryStore.moveFolder(a.linked.id, b.linked.id), "repo_folder");
		refusedWith(await libraryStore.moveFolder(a.linked.id, a.week1.id), "folder_cycle");
	});

	it("T059: renaming or moving it, or a folder above it, keeps the old @ names in previousNames", async () => {
		const physics = await libraryStore.createFolder("Physics", null) as LibraryFolder;
		const { linked, notes } = await link(physics.id);
		await libraryStore.renameFolder(linked.id, "Notes");
		await libraryStore.renameFolder(physics.id, "Science");
		const top = await libraryStore.createFolder("Top", null) as LibraryFolder;
		await libraryStore.moveFolder(physics.id, top.id);
		const after = await libraryStore.get(notes.id);
		assert.deepEqual(after?.previousNames, [
			"Physics/Lecture notes/week1/notes.md",
			"Physics/Notes/week1/notes.md",
			"Science/Notes/week1/notes.md",
		]);
		assert.equal(after?.name, "notes.md", "the display name stays the file name");
	});
});

describe("nothing goes into a mirror (repo_folder)", () => {
	const sentence = "Lecture notes mirrors a repo. Add files in the repo instead.";
	it("upload, new folder, new page and new diagram", async () => {
		const { linked, week1 } = await link();
		refusedWith(await upload("mine.md", linked.id), "repo_folder", sentence);
		refusedWith(await upload("mine.md", week1.id), "repo_folder", sentence);
		refusedWith(await libraryStore.createFolder("Mine", week1.id), "repo_folder", sentence);
		refusedWith(await libraryStore.createPage("Mine", "", { author: "learner", folderId: linked.id }), "repo_folder", sentence);
		const { diagramStore } = await import("../src/store/diagrams.ts");
		refusedWith(await diagramStore.create("Map", { version: 1, nodes: [], edges: [] } as never, { author: "learner", folderId: week1.id }), "repo_folder", sentence);
		assert.equal(fs.existsSync(path.join(dir, "files", "mine.md")), false, "a refused upload stores nothing");
	});

	it("moving an item or folder in, and restoring from the trash into one", async () => {
		const { week1 } = await link();
		const mine = await upload("mine.md") as LibraryItem;
		const box = await libraryStore.createFolder("Box", null) as LibraryFolder;
		refusedWith(await libraryStore.moveItem(mine.id, week1.id), "repo_folder", sentence);
		refusedWith(await libraryStore.moveFolder(box.id, week1.id), "repo_folder", sentence);
		// A trash entry whose folder is (now) inside a mirror can't come back there.
		const entry = await libraryStore.trashItem(mine.id);
		assert.ok(entry && !isRefusal(entry));
		const catalogPath = path.join(dir, "library", "catalog.json");
		const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
		catalog.trash[0].folderId = week1.id;
		fs.writeFileSync(catalogPath, JSON.stringify(catalog));
		refusedWith(await libraryStore.restoreTrash(entry.id), "repo_folder", sentence);
		assert.equal((await libraryStore.listTrash()).length, 1, "the entry stays in the trash");
	});
});

describe("a folder holding a linked folder (holds_linked)", () => {
	it("at any depth, can't be trashed or deleted; other folders still can", async () => {
		const top = await libraryStore.createFolder("Top", null) as LibraryFolder;
		const mid = await libraryStore.createFolder("Mid", top.id) as LibraryFolder;
		await link(mid.id);
		refusedWith(await libraryStore.trashFolder(top.id), "holds_linked", "Top holds the linked folder Lecture notes. Move it out or unlink it first.");
		refusedWith(await libraryStore.trashFolder(mid.id), "holds_linked", "Mid holds the linked folder Lecture notes. Move it out or unlink it first.");
		refusedWith(await libraryStore.removeFolder(top.id), "holds_linked");
		const other = await libraryStore.createFolder("Other", null) as LibraryFolder;
		const trashed = await libraryStore.trashFolder(other.id);
		assert.ok(trashed && !isRefusal(trashed));
	});
});

describe("route statuses (contracts/api.md)", () => {
	it("409 with the refusal code for each change the store refuses; marks 200", async () => {
		const top = await libraryStore.createFolder("Top", null) as LibraryFolder;
		const { linked, week1, readme } = await link(top.id);
		const status = async (response: Promise<Response>, expected: number, code?: string) => {
			const answer = await response;
			assert.equal(answer.status, expected);
			if (code) assert.equal((await answer.json() as { code: string }).code, code);
		};
		await status(server.libraryPatchResponse(jsonRequest("PATCH", { name: "x.md" }), readme.id), 409, "repo_file");
		await status(server.libraryPatchResponse(jsonRequest("PATCH", { folderId: null }), readme.id), 409, "repo_file");
		await status(server.libraryPatchResponse(jsonRequest("PATCH", { marks: { favorite: true } }), readme.id), 200);
		await status(server.libraryDeleteResponse(readme.id), 409, "repo_file");
		await status(server.libraryTrashResponse(jsonRequest("POST", { itemId: readme.id })), 409, "repo_file");
		await status(server.folderPatchResponse(jsonRequest("PATCH", { name: "w" }), week1.id), 409, "repo_file");
		await status(server.folderPatchResponse(jsonRequest("PATCH", { parentId: null }), week1.id), 409, "repo_file");
		await status(server.folderDeleteResponse(week1.id), 409, "repo_file");
		await status(server.libraryTrashResponse(jsonRequest("POST", { folderId: linked.id })), 409, "repo_linked");
		await status(server.folderDeleteResponse(linked.id), 409, "repo_linked");
		await status(server.libraryTrashResponse(jsonRequest("POST", { folderId: top.id })), 409, "holds_linked");
		await status(server.folderCreateResponse(jsonRequest("POST", { name: "Mine", parentId: week1.id })), 409, "repo_folder");
		await status(server.pageCreateResponse(jsonRequest("POST", { name: "Mine", folderId: linked.id })), 409, "repo_folder");
		const bytes = enc("# mine\n");
		await status(server.libraryUploadResponse(new Request(`http://app.test/api/library/upload?name=mine.md&folder=${week1.id}`, { method: "POST", headers: { "Content-Length": String(bytes.length) }, body: bytes })), 409, "repo_folder");
		await status(server.folderPatchResponse(jsonRequest("PATCH", { name: "Renamed" }), linked.id), 200);
	});
});
