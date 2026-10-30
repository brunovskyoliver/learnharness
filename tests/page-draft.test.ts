/** T051 and SC-002: the draft reducer, then whole scenarios through the
 *  controller against the real store. Reload is a new controller on the same
 *  backup, navigation is close then reopen, a tab is its own controller. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-page-draft-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore: store } = await import("../src/store/library.ts");
const { isPageStale, isRefusal } = await import("../src/core/library.ts");
const { PageDraftController, initialPageDraft, pageDraftReducer, SAVE_STATE_LABEL } = await import("../components/library/page-draft.ts");
type Api = import("../components/library/page-draft.ts").PageApi;
type Backup = import("../components/library/page-draft.ts").PageBackup;
after(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

/** The routes' contract, straight onto the store. `down` makes writes fail. */
function storeApi(flags: { down?: boolean } = {}): Api {
	const staleOf = <T extends object>(r: T | "missing" | "too-large" | import("../src/core/library.ts").PageStale) => {
		if (r === "missing" || r === "too-large") return null;
		return isPageStale(r) ? { stale: { head: r.head, draft: r.draft } } : r;
	};
	const live = () => { if (flags.down) throw new Error("offline"); };
	return {
		read: async (id) => store.readPage(id),
		putDraft: async (id, input) => { live(); return staleOf(await store.savePageDraft(id, input)); },
		commit: async (id, input) => { live(); return staleOf(await store.commitPageVersion(id, input as never)); },
		restore: async (id, n) => { live(); const r = await store.restorePageVersion(id, n); return r === "missing" ? null : r; },
	};
}
function memoryBackup() {
	let held: Backup | null = null;
	return { read: () => held, write: (b: Backup) => { held = b; }, clear: () => { held = null; }, peek: () => held };
}
const makePage = async (content = "start") => {
	const made = await store.createPage("Notes", content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item.id;
};
async function tab(id: string, api: Api = storeApi(), backup = memoryBackup()) {
	const c = new PageDraftController({ id, api, backup, draftDelayMs: 100_000, backupDelayMs: 100_000 });
	assert.ok(await c.load());
	return Object.assign(c, { backupStore: backup });
}
const allTexts = async (id: string) => {
	const versions = (await store.listPageVersions(id))!;
	return Promise.all(versions.map(async (v) => (await store.readPageVersion(id, v.n))!.content));
};

const page = (head: string, n = 1, draft: { base: number; rev: number; content: string } | null = null) => ({
	item: {} as never,
	head: { n, content: head, author: "learner" as const, at: "2026-10-30T00:00:00Z" },
	draft,
});
const loaded = (head = "h") => pageDraftReducer(initialPageDraft, { type: "loaded", page: page(head), backup: null });

describe("the draft reducer", () => {
	it("restores a backup the server never got, on the same base", () => {
		const s = pageDraftReducer(initialPageDraft, { type: "loaded", page: page("h"), backup: { text: "typed", base: 1, rev: 0, at: 1 } });
		assert.equal(s.text, "typed");
		assert.equal(s.conflict, null);
	});
	it("a backup from an older base comes back with the conflict line", () => {
		const s = pageDraftReducer(initialPageDraft, { type: "loaded", page: page("newer", 2), backup: { text: "typed", base: 1, rev: 0, at: 1 } });
		assert.equal(s.text, "typed");
		assert.equal(s.conflict?.head.n, 2);
	});
	it("a failed save keeps the text and says so", () => {
		const s = pageDraftReducer(pageDraftReducer(loaded(), { type: "edited", text: "x" }), { type: "failed" });
		assert.equal(s.text, "x");
		assert.equal(SAVE_STATE_LABEL[s.status], "Not saved. Your text is kept in this browser.");
	});
	it("a clean tab follows an update and names the agent", () => {
		const s = pageDraftReducer(loaded(), { type: "remote", page: page("agent text", 2), author: "agent", version: 2 });
		assert.equal(s.text, "agent text");
		assert.equal(s.agentUpdate, 2);
		assert.equal(s.conflict, null);
		assert.equal(s.loadKey, loaded().loadKey + 1, "the editor reloads");
	});
	it("a dirty tab keeps its text and shows the conflict", () => {
		const dirty = pageDraftReducer(loaded(), { type: "edited", text: "mine" });
		const s = pageDraftReducer(dirty, { type: "remote", page: page("theirs", 2), author: "agent", version: 2 });
		assert.equal(s.text, "mine");
		assert.equal(s.conflict?.head.content, "theirs");
		assert.equal(s.loadKey, dirty.loadKey, "the editor is not reloaded");
	});
	it("a dirty tab whose text became the head goes clean with no conflict", () => {
		const dirty = pageDraftReducer(loaded(), { type: "edited", text: "mine" });
		const s = pageDraftReducer(dirty, { type: "remote", page: page("mine", 2), author: "learner", version: 2 });
		assert.equal(s.conflict, null);
		assert.equal(s.base, 2);
		assert.equal(s.status, "saved");
	});
	it("typing back to the saved text says Saved", () => {
		const a = pageDraftReducer(loaded(), { type: "edited", text: "x" });
		assert.equal(pageDraftReducer(a, { type: "edited", text: "h" }).status, "saved");
	});
});

describe("SC-002: a late load", () => {
	it("a second load call doesn't overwrite text typed after the first", async () => {
		const id = await makePage();
		const base = storeApi();
		let reads = 0;
		const api: Api = { ...base, read: async (i) => { reads++; return base.read(i); } };
		const c = new PageDraftController({ id, api, backup: memoryBackup(), draftDelayMs: 100_000, backupDelayMs: 100_000 });
		const first = c.load();
		const second = c.load();
		await Promise.all([first, second]);
		assert.equal(reads, 1);
	});
});

describe("SC-002: reload", () => {
	it("keeps text typed before the draft reached the server", async () => {
		const id = await makePage();
		const backup = memoryBackup();
		const a = await tab(id, storeApi(), backup);
		a.edit("start plus unsent");
		a.pageHide();
		assert.equal((await store.readPage(id))!.draft, null, "nothing reached the server");
		const reloaded = await tab(id, storeApi(), backup);
		assert.equal(reloaded.state.text, "start plus unsent");
		await reloaded.saveDraft();
		assert.equal((await store.readPage(id))!.draft!.content, "start plus unsent");
		assert.equal(backup.peek(), null, "the backup goes once the server has it");
	});
	it("closing before the first load finished leaves the backup alone", async () => {
		const id = await makePage();
		const backup = memoryBackup();
		backup.write({ text: "from before the reload", base: 1, rev: 0, at: 1 });
		const c = new PageDraftController({ id, api: storeApi(), backup, draftDelayMs: 100_000, backupDelayMs: 100_000 });
		const loading = c.load();
		await c.close();
		c.reopened();
		await loading;
		assert.equal(c.state.text, "from before the reload");
	});
	it("keeps text that reached the server as a draft", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("drafted");
		await a.saveDraft();
		const reloaded = await tab(id);
		assert.equal(reloaded.state.text, "drafted");
		assert.equal(reloaded.state.status, "draft-saved");
	});
	it("keeps text when every save failed, across reloads", async () => {
		const id = await makePage();
		const backup = memoryBackup();
		const flags = { down: true };
		const a = await tab(id, storeApi(flags), backup);
		a.edit("offline text");
		await a.saveDraft();
		assert.equal(a.state.status, "failed");
		await a.commit("save");
		assert.equal(a.state.status, "failed");
		const b = await tab(id, storeApi(flags), backup);
		assert.equal(b.state.text, "offline text");
		flags.down = false;
		await b.saveDraft();
		assert.equal(b.state.status, "draft-saved");
	});
});

describe("SC-002: navigation", () => {
	it("closing makes a version; reopening shows it", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("left the route");
		await a.close();
		assert.deepEqual((await store.listPageVersions(id))!.map((v) => [v.n, v.cause]), [[2, "autosave-close"], [1, "save"]]);
		const again = await tab(id);
		assert.equal(again.state.text, "left the route");
		assert.equal(again.state.status, "saved");
	});
	it("opening and closing without an edit makes no version and no request", async () => {
		const id = await makePage("# Title\n\n* star\n");
		let writes = 0;
		const base = storeApi();
		const counted: Api = { ...base, putDraft: (...a) => { writes++; return base.putDraft(...a); }, commit: (...a) => { writes++; return base.commit(...a); } };
		const a = await tab(id, counted);
		await a.commit("save");
		await a.close();
		assert.equal(writes, 0);
		assert.deepEqual((await store.listPageVersions(id))!.map((v) => v.n), [1]);
		assert.equal((await store.readPage(id))!.head.content, "# Title\n\n* star\n");
	});
	it("a failed close keeps the text for the next open", async () => {
		const id = await makePage();
		const backup = memoryBackup();
		const flags = { down: true };
		const a = await tab(id, storeApi(flags), backup);
		a.edit("closing offline");
		await a.close();
		flags.down = false;
		assert.equal((await tab(id, storeApi(), backup)).state.text, "closing offline");
	});
});

describe("SC-002: agent revision while the learner has unsaved text", () => {
	const revise = (id: string, baseVersion: number, text: string) => store.revisePageAsAgent(id, { baseVersion, chatId: "c", toolCallId: `t-${text}`, apply: () => text });

	it("unsent text in the tab: the agent's version lands, the tab keeps its text and resolves either way", async () => {
		for (const choice of ["mine", "latest"] as const) {
			const made = await store.createPage(`Unsent ${choice}`, "start", { author: "learner" });
			assert.ok(!isRefusal(made));
			const id = made.item.id;
			const a = await tab(id);
			a.edit("learner only in the tab");
			const r = await revise(id, 1, "agent text");
			assert.equal(r.outcome, "revised");
			await a.remoteChanged("agent", 2);
			assert.equal(a.state.text, "learner only in the tab");
			assert.ok(a.state.conflict);
			if (choice === "mine") await a.keepMine(); else await a.useLatest();
			assert.equal(a.state.conflict, null);
			const texts = await allTexts(id);
			assert.ok(texts.includes("learner only in the tab"));
			assert.ok(texts.includes("agent text"));
			assert.ok(texts.includes("start"));
			assert.equal((await store.readPage(id))!.head.content, choice === "mine" ? "learner only in the tab" : "agent text");
			assert.equal(a.state.text, choice === "mine" ? "learner only in the tab" : "agent text");
		}
	});
	it("a saved draft: it becomes his version first; the stale agent call refuses and loses nothing", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("drafted text");
		await a.saveDraft();
		const r = await revise(id, 1, "agent text");
		assert.equal(r.outcome, "stale");
		assert.equal((await store.readPage(id))!.head.content, "drafted text");
		await a.remoteChanged("learner", 2);
		assert.equal(a.state.conflict, null);
		assert.equal(a.state.text, "drafted text");
		const again = await revise(id, 2, "agent again");
		assert.equal(again.outcome, "revised");
		await a.remoteChanged("agent", 3);
		assert.equal(a.state.text, "agent again");
		assert.equal(a.state.agentUpdate, 3);
		assert.deepEqual(await allTexts(id), ["agent again", "drafted text", "start"]);
	});
	it("typing after the draft was saved, before the agent's call: both survive", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("draft one");
		await a.saveDraft();
		a.edit("draft one and more");
		assert.equal((await revise(id, 1, "agent")).outcome, "stale");
		assert.equal((await revise(id, 2, "agent")).outcome, "revised");
		await a.remoteChanged("agent", 3);
		assert.equal(a.state.text, "draft one and more");
		await a.keepMine();
		const texts = await allTexts(id);
		for (const t of ["start", "draft one", "agent", "draft one and more"]) assert.ok(texts.includes(t), t);
	});
	it("a clean tab follows", async () => {
		const id = await makePage();
		const a = await tab(id);
		await revise(id, 1, "agent text");
		await a.remoteChanged("agent", 2);
		assert.equal(a.state.text, "agent text");
		assert.equal(a.state.agentUpdate, 2);
	});
});

describe("SC-002: two tabs", () => {
	it("two drafts: the later is stale, Keep mine keeps both", async () => {
		const id = await makePage();
		const [a, b] = [await tab(id), await tab(id)];
		a.edit("tab a");
		await a.saveDraft();
		b.edit("tab b");
		await b.saveDraft();
		assert.ok(b.state.conflict);
		assert.equal(b.state.text, "tab b");
		await b.keepMine();
		assert.equal((await store.readPage(id))!.head.content, "tab b");
		assert.deepEqual(await allTexts(id), ["tab b", "tab a", "start"]);
	});
	it("two drafts: Use latest keeps both and shows the other tab's", async () => {
		const id = await makePage();
		const [a, b] = [await tab(id), await tab(id)];
		a.edit("tab a");
		await a.saveDraft();
		b.edit("tab b");
		await b.saveDraft();
		await b.useLatest();
		assert.equal(b.state.text, "tab a");
		assert.equal((await store.readPage(id))!.head.content, "tab a");
		const texts = await allTexts(id);
		assert.ok(texts.includes("tab a") && texts.includes("tab b") && texts.includes("start"));
	});
	it("a version from one tab: the other's edit conflicts, its text kept", async () => {
		const id = await makePage();
		const [a, b] = [await tab(id), await tab(id)];
		a.edit("a saved");
		await a.commit("save");
		b.edit("b typed");
		await b.remoteChanged("learner", 2);
		assert.equal(b.state.text, "b typed");
		assert.ok(b.state.conflict);
	});
	it("a save racing its own event is not a conflict", async () => {
		const id = await makePage();
		const base = storeApi();
		let release: () => void = () => {};
		const held: Api = { ...base, commit: async (i, input) => { const out = await base.commit(i, input); await new Promise<void>((r) => { release = r; }); return out; } };
		const a = await tab(id, held);
		a.edit("mine");
		const saving = a.commit("save");
		await new Promise((r) => setTimeout(r, 20));
		// The event arrives while the response is still on its way, and he types on.
		void a.remoteChanged("learner", 2);
		a.edit("mine and more");
		release();
		await saving;
		await a.settled();
		await new Promise((r) => setTimeout(r, 20));
		assert.equal(a.state.conflict, null);
		assert.equal(a.state.text, "mine and more");
	});
	it("identical text in both tabs is no conflict", async () => {
		const id = await makePage();
		const [a, b] = [await tab(id), await tab(id)];
		a.edit("same");
		await a.commit("save");
		b.edit("same");
		await b.commit("save");
		assert.equal(b.state.conflict, null);
		assert.deepEqual((await store.listPageVersions(id))!.map((v) => v.n), [2, 1]);
	});
});
