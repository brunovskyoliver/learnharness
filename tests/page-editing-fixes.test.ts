/** .specify/bugs/page-editing-fixes: each fix through the controller on the
 *  real store, the routes, the page tool and the formula field, with no model. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-page-fixes-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore: store } = await import("../src/store/library.ts");
const { isPageStale, isRefusal } = await import("../src/core/library.ts");
const { PAGE_MISSING, PageDraftController } = await import("../components/library/page-draft.ts");
const { pageTooLongForContent, pageTools } = await import("../src/agent/tools/pages.ts");
const { fitMathSource } = await import("../components/library/page-math-view.ts");
const api = await import("../src/server/library.ts");
type Api = import("../components/library/page-draft.ts").PageApi;
type Backup = import("../components/library/page-draft.ts").PageBackup;
after(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

/** The routes' contract onto the store; a page that is gone answers PAGE_MISSING like a 404. */
function storeApi(flags: { down?: boolean; restoreFails?: boolean } = {}): Api {
	const shape = <T extends object>(r: T | "missing" | "too-large" | import("../src/core/library.ts").PageStale) => {
		if (r === "missing") return PAGE_MISSING;
		if (r === "too-large") return null;
		return isPageStale(r) ? { stale: { head: r.head, draft: r.draft } } : r;
	};
	const live = () => { if (flags.down) throw new Error("offline"); };
	return {
		read: async (id) => store.readPage(id),
		putDraft: async (id, input) => { live(); return shape(await store.savePageDraft(id, input)); },
		commit: async (id, input) => { live(); return shape(await store.commitPageVersion(id, input as never)); },
		restore: async (id, n) => {
			live();
			if (flags.restoreFails) return null;
			const r = await store.restorePageVersion(id, n);
			return r === "missing" ? null : r;
		},
	};
}
function memoryBackup() {
	let held: Backup | null = null;
	return { read: () => held, write: (b: Backup) => { held = b; }, clear: () => { held = null; }, peek: () => held };
}
const makePage = async (content = "start", name = "Notes") => {
	const made = await store.createPage(name, content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item.id;
};
async function tab(id: string, apiImpl: Api = storeApi(), backup = memoryBackup()) {
	const c = new PageDraftController({ id, api: apiImpl, backup, draftDelayMs: 100_000, backupDelayMs: 100_000 });
	assert.ok(await c.load());
	return Object.assign(c, { backupStore: backup });
}
const allTexts = async (id: string) => {
	const versions = (await store.listPageVersions(id))!;
	return Promise.all(versions.map(async (v) => (await store.readPageVersion(id, v.n))!.content));
};
const revise = (id: string, baseVersion: number, text: string) => store.revisePageAsAgent(id, { baseVersion, chatId: "c", toolCallId: `t-${text}-${baseVersion}`, apply: () => text });

describe("own typing is no conflict when the agent's pre-save moves the head", () => {
	it("the next draft rebases and keeps saving", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("draft one");
		await a.saveDraft();
		a.edit("draft one and more");
		assert.equal((await revise(id, 1, "agent")).outcome, "stale");
		await a.saveDraft();
		assert.equal(a.state.conflict, null);
		assert.equal(a.state.text, "draft one and more");
		assert.equal(a.state.base, 2);
		// The 409 rebased the tab; its next draft goes on the new base.
		await a.saveDraft();
		const page = (await store.readPage(id))!;
		assert.equal(page.draft?.content, "draft one and more");
		assert.equal(page.draft?.base, 2);
	});
	it("the event path rebases too", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("draft one");
		await a.saveDraft();
		a.edit("draft one and more");
		assert.equal((await revise(id, 1, "agent")).outcome, "stale");
		await a.remoteChanged("learner", 2);
		assert.equal(a.state.conflict, null);
		assert.equal(a.state.status, "saving");
		await a.commit("save");
		assert.equal((await store.readPage(id))!.head.content, "draft one and more");
	});
});

describe("restore", () => {
	it("does nothing when the text before it could not be saved", async () => {
		const id = await makePage();
		await store.commitPageVersion(id, { base: 1, rev: 0, content: "second" });
		const flags = { down: false };
		const a = await tab(id, storeApi(flags));
		a.edit("unsaved");
		flags.down = true;
		assert.equal(await a.restore(1), "not-saved");
		assert.equal(a.state.text, "unsaved");
		assert.equal(a.backupStore.peek()?.text, "unsaved");
		flags.down = false;
		assert.equal((await store.readPage(id))!.head.content, "second");
	});
	it("a failed restore keeps the text", async () => {
		const id = await makePage();
		const a = await tab(id, storeApi({ restoreFails: true }));
		a.edit("mine");
		assert.equal(await a.restore(1), "failed");
		assert.equal(a.state.text, "mine");
		assert.equal((await store.readPage(id))!.head.content, "mine");
	});
	it("restores after saving the text as a version", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("mine");
		assert.equal(await a.restore(1), "restored");
		assert.equal(a.state.text, "start");
		assert.deepEqual(await allTexts(id), ["start", "mine", "start"]);
	});
	it("restoring the text that is already newest adds no version", async () => {
		const id = await makePage();
		await store.commitPageVersion(id, { base: 1, rev: 0, content: "second" });
		const before = (await store.listPageVersions(id))!.length;
		const r = await store.restorePageVersion(id, 2);
		assert.ok(r !== "missing");
		assert.equal(r.version.n, 2);
		assert.equal((await store.listPageVersions(id))!.length, before);
	});
});

describe("conflicts", () => {
	it("Use latest brings back the newest version, not the one the conflict first showed", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("mine");
		await store.commitPageVersion(id, { base: 1, rev: 0, content: "other v2" });
		await a.remoteChanged("learner", 2);
		assert.ok(a.state.conflict);
		// A newer version lands and its event is missed.
		await store.commitPageVersion(id, { base: 2, rev: 0, content: "other v3" });
		await a.useLatest();
		assert.equal(a.state.text, "other v3");
		assert.equal((await store.readPage(id))!.head.content, "other v3");
		assert.ok((await allTexts(id)).includes("mine"));
	});
	it("closing in a conflict keeps both, the newer on top", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("mine");
		await store.commitPageVersion(id, { base: 1, rev: 0, content: "other" });
		await a.remoteChanged("learner", 2);
		assert.ok(a.state.conflict);
		await a.close();
		assert.equal((await store.readPage(id))!.head.content, "other");
		assert.ok((await allTexts(id)).includes("mine"));
		assert.equal(a.backupStore.peek(), null);
	});
});

describe("deleted while open", () => {
	it("the tab says so, keeps the text and stops writing", async () => {
		const id = await makePage();
		const a = await tab(id);
		a.edit("unsaved");
		assert.ok(await store.remove(id));
		await a.remoteChanged();
		assert.equal(a.state.deleted, true);
		assert.equal(a.state.text, "unsaved");
		a.edit("ignored");
		assert.equal(a.state.text, "unsaved");
		await a.close();
		assert.equal(a.backupStore.peek(), null);
	});
	it("a write that finds the page gone says so", async () => {
		const id = await makePage();
		const a = await tab(id);
		await store.remove(id);
		a.edit("typed");
		await a.saveDraft();
		assert.equal(a.state.deleted, true);
	});
});

describe("History lists a page at a time", () => {
	it("50 newest first, then the rest before the oldest shown", async () => {
		const id = await makePage("v1");
		for (let n = 2; n <= 60; n++) await store.commitPageVersion(id, { base: n - 1, rev: 0, content: `v${n}` });
		const first = await (await api.pageVersionsResponse(id, new Request("http://localhost/x"))).json() as { versions: { n: number }[]; more: boolean };
		assert.equal(first.versions.length, api.PAGE_VERSIONS_LIMIT);
		assert.equal(first.versions[0]!.n, 60);
		assert.equal(first.more, true);
		const oldest = first.versions.at(-1)!.n;
		const rest = await (await api.pageVersionsResponse(id, new Request(`http://localhost/x?before=${oldest}`))).json() as { versions: { n: number }[]; more: boolean };
		assert.deepEqual(rest.versions.map((v) => v.n), Array.from({ length: oldest - 1 }, (_, i) => oldest - 1 - i));
		assert.equal(rest.more, false);
	});
});

describe("page_revise on a page longer than one read", () => {
	const tools = pageTools({ store, chatId: "chat_1", blocked: () => null });
	type Result = { content: { text: string }[]; details: Record<string, unknown> };
	const revisePage = async (input: unknown, callId: string) => (await tools.page_revise!.execute(callId, input as never)) as unknown as Result;
	const long = `${"line\n".repeat(2500)}end`;

	it("refuses whole content and changes nothing", async () => {
		const id = await makePage(long, "Long notes");
		const r = await revisePage({ item: id, baseVersion: 1, content: "short" }, "long-1");
		assert.equal(r.content[0]!.text, pageTooLongForContent("Long notes"));
		assert.equal(r.details.outcome, "failed");
		assert.equal((await store.readPage(id))!.head.content, long);
	});
	it("still takes edits", async () => {
		const id = await makePage(long, "Long notes");
		const r = await revisePage({ item: id, baseVersion: 1, edits: [{ find: "end", replace: "the end" }] }, "long-2");
		assert.equal(r.details.outcome, "revised");
		assert.ok((await store.readPage(id))!.head.content.endsWith("the end"));
	});
	it("a short page still takes whole content", async () => {
		const id = await makePage("short page", "Short notes");
		const r = await revisePage({ item: id, baseVersion: 1, content: "new" }, "short-1");
		assert.equal(r.details.outcome, "revised");
	});
});

describe("the formula source fits its text", () => {
	it("one row per line, and inline width per longest line", () => {
		const field = { value: "a\nbb\nccccc", rows: 1, style: { width: "" } as CSSStyleDeclaration };
		fitMathSource(field, "block");
		assert.equal(field.rows, 3);
		assert.equal(field.style.width, "");
		fitMathSource(field, "inline");
		assert.equal(field.style.width, "6ch");
		field.value = "";
		fitMathSource(field, "inline");
		assert.equal(field.rows, 1);
		assert.equal(field.style.width, "3ch");
	});
});
