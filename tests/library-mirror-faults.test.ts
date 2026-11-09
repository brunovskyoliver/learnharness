/** Feature 026 (R4, FR-011, SC-005, T026): a pull that fails or is cut off at
 *  any step leaves the last good mirror or the new one whole, never a mix;
 *  `sweepMirrors()` removes what a crash left behind; a pull marked syncing
 *  when the process stopped reads as interrupted. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-mirror-faults-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore, mirrorFaults } = await import("../src/store/library.ts");
const { classifyEntry, repoKeyOf } = await import("../src/core/repo-link.ts");
type MirrorFile = import("../src/core/ports.ts").MirrorFile;
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const enc = (text: string) => new TextEncoder().encode(text);
const oid = (bytes: Uint8Array) => createHash("sha1").update(bytes).digest("hex");
const OLD: Record<string, Uint8Array> = { "README.md": enc("# old\n"), "week1/notes.md": enc("# week 1\n") };
const NEW: Record<string, Uint8Array> = { "README.md": enc("# new\n"), "week2/notes.md": enc("# week 2\n") };
const repoKey = repoKeyOf("github.com/oliver/notes", "main");
const mirrors = () => path.join(dir, "files", ".mirrors", "rpl_a");

async function stage(tree: Record<string, Uint8Array>) {
	const stager = await libraryStore.stageSnapshot("rpl_a");
	const files: MirrorFile[] = [];
	for (const [p, bytes] of Object.entries(tree)) {
		const verdict = classifyEntry({ path: p, mode: "100644" }, bytes);
		if (verdict.action !== "keep") continue;
		await stager.put(p, oid(bytes), bytes);
		files.push({ path: p, oid: oid(bytes), size: bytes.length, kind: verdict.kind });
	}
	return { snapshot: stager.snapshot, files };
}
const sync = (commit: string) => ({ state: "synced" as const, lastAttemptAt: "2026-11-08T10:00:00.000Z", lastSuccessAt: "2026-11-08T10:00:00.000Z", commit });

/** The live mirror read through each item's path: path → text. */
async function mirrorTree() {
	const out: Record<string, string> = {};
	for (const item of await libraryStore.list()) if (item.mirror) out[item.mirror.path] = fs.readFileSync(libraryStore.documentPath(item), "utf8");
	return out;
}
const text = (tree: Record<string, Uint8Array>) => Object.fromEntries(Object.entries(tree).map(([p, b]) => [p, new TextDecoder().decode(b)]));

async function linkOld() {
	const a = await stage(OLD);
	const result = await libraryStore.applyMirror("rpl_a", { ...a, sync: sync("a".repeat(40)) }, {
		link: { id: "rpl_a", url: "https://github.com/oliver/notes", display: "github.com/oliver/notes", repoKey, branch: "main", branchGiven: false, hasToken: false, createdAt: "2026-11-08T10:00:00.000Z" },
		folderName: "Notes",
		parentId: null,
	});
	assert.ok("link" in result);
	return a.snapshot;
}

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});
afterEach(() => { mirrorFaults.at = null; });

describe("a pull cut off at each step", () => {
	it("after staging, before any catalog work: the old mirror stays and the sweep removes the staged one", async () => {
		const oldSnap = await linkOld();
		const staged = await stage(NEW);
		// The process "stops" here: nothing applies the snapshot, and a restart forgets it was staging.
		assert.deepEqual(await mirrorTree(), text(OLD));
		await libraryStore.sweepMirrors();
		assert.ok(fs.existsSync(path.join(mirrors(), staged.snapshot)), "a snapshot this process is staging is never swept");
		await libraryStore.discardSnapshot("rpl_a", staged.snapshot);
		fs.mkdirSync(path.join(mirrors(), "snp_crashleft", "x"), { recursive: true });
		await libraryStore.sweepMirrors();
		assert.deepEqual(fs.readdirSync(mirrors()), [oldSnap]);
		assert.deepEqual(await mirrorTree(), text(OLD));
	});

	it("before the catalog write: the old mirror stays whole", async () => {
		const oldSnap = await linkOld();
		const staged = await stage(NEW);
		mirrorFaults.at = (point) => { if (point === "before-write") throw new Error("power cut"); };
		await assert.rejects(libraryStore.applyMirror("rpl_a", { ...staged, sync: sync("b".repeat(40)) }), /power cut/);
		assert.deepEqual(await mirrorTree(), text(OLD));
		assert.equal((await libraryStore.repoLinks())[0]!.sync.commit, "a".repeat(40));
		await libraryStore.discardSnapshot("rpl_a", staged.snapshot);
		assert.deepEqual(fs.readdirSync(mirrors()), [oldSnap]);
	});

	it("after the catalog write: the new mirror is whole and the old snapshot is a leftover for the sweep", async () => {
		const oldSnap = await linkOld();
		const staged = await stage(NEW);
		mirrorFaults.at = (point) => { if (point === "after-write" || point === "remove-old") throw new Error("power cut"); };
		const result = await libraryStore.applyMirror("rpl_a", { ...staged, sync: sync("b".repeat(40)) });
		assert.ok("link" in result);
		assert.deepEqual(await mirrorTree(), text(NEW));
		assert.deepEqual(fs.readdirSync(mirrors()).sort(), [oldSnap, staged.snapshot].sort());
		mirrorFaults.at = null;
		await libraryStore.sweepMirrors();
		assert.deepEqual(fs.readdirSync(mirrors()), [staged.snapshot]);
		assert.deepEqual(await mirrorTree(), text(NEW));
	});

	it("during the old snapshot's removal: the new mirror is whole; the sweep finishes the job", async () => {
		const oldSnap = await linkOld();
		const staged = await stage(NEW);
		mirrorFaults.at = (point) => { if (point === "remove-old") throw new Error("disk went away"); };
		const result = await libraryStore.applyMirror("rpl_a", { ...staged, sync: sync("b".repeat(40)) });
		assert.ok("link" in result);
		assert.deepEqual(await mirrorTree(), text(NEW));
		assert.ok(fs.existsSync(path.join(mirrors(), oldSnap)));
		mirrorFaults.at = null;
		await libraryStore.sweepMirrors();
		assert.deepEqual(fs.readdirSync(mirrors()), [staged.snapshot]);
	});

	it("sweeps git-work dirs over a day old and mirrors of links that are gone", async () => {
		await linkOld();
		const work = path.join(dir, "library", "git-work");
		fs.mkdirSync(path.join(work, "rpl_a-old"), { recursive: true });
		fs.mkdirSync(path.join(work, "rpl_a-new"), { recursive: true });
		const dayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
		fs.utimesSync(path.join(work, "rpl_a-old"), dayAgo, dayAgo);
		fs.mkdirSync(path.join(dir, "files", ".mirrors", "rpl_gone", "snp_x"), { recursive: true });
		await libraryStore.sweepMirrors();
		assert.deepEqual(fs.readdirSync(work), ["rpl_a-new"]);
		assert.deepEqual(fs.readdirSync(path.join(dir, "files", ".mirrors")), ["rpl_a"]);
	});
});

describe("a pull marked syncing when the process stopped", () => {
	it("reads as failed, interrupted, keeping the mirror; a pull of this process reads as syncing", async () => {
		await linkOld();
		const live = await libraryStore.setLinkSync("rpl_a", (s) => ({ ...s, state: "syncing", lastAttemptAt: "2026-11-08T10:15:00.000Z" }));
		assert.equal(live!.sync.state, "syncing");
		assert.equal((await libraryStore.repoLinks())[0]!.sync.state, "syncing");
		// A restart: the catalog says syncing, but no pull of this process holds the link.
		const catalogFile = path.join(dir, "library", "catalog.json");
		const disk = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
		assert.equal(disk.repoLinks[0].sync.state, "syncing");
		await libraryStore.setLinkSync("rpl_a", (s) => ({ ...s, state: "synced" }));
		disk.repoLinks[0].sync.state = "syncing";
		fs.writeFileSync(catalogFile, JSON.stringify(disk));
		const [link] = await libraryStore.repoLinks();
		assert.equal(link!.sync.state, "failed");
		assert.deepEqual(link!.sync.failure, { code: "server", message: "The last sync was interrupted.", detail: "The last sync was interrupted." });
		assert.equal(link!.sync.commit, "a".repeat(40));
		assert.deepEqual(await mirrorTree(), text(OLD));
	});
});
