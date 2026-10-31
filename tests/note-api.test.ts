/** Features 016-018 through the route handlers, with a real store and no model:
 *  connections, passages, study notes, the graph staying untouched, the review
 *  path for an AI edit, and tenant isolation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-note-api-")));
process.env.LH_DATA_DIR = dir;
process.env.LH_HOSTED = "1";
const { runAsTenant, PATHS } = await import("../config.ts");
const api = await import("../src/server/notes.ts");
const { stores } = await import("../src/server/stores.ts");
const { deleteChatSession } = await import("../src/server/chats.ts");
const { pageTools } = await import("../src/agent/tools/pages.ts");
const { revertTutorChanges, tutorHunks } = await import("../components/library/page-blocks.ts");
const { isRefusal } = await import("../src/core/library.ts");
after(() => { delete process.env.LH_HOSTED; fs.rmSync(dir, { recursive: true, force: true }); });

const store = stores.libraryStore;
const asUser = <T>(user: string, fn: () => Promise<T>) => runAsTenant(user, fn) as Promise<T>;
const page = async (name: string, content = "") => {
	const made = await store.createPage(name, content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item;
};
const lesson = (title = "Linear maps") => {
	const chat = stores.chatStore.createChat(title);
	const messages = [
		{ id: "u1", role: "user", content: [{ type: "text", text: "teach me" }], timestamp: 1 },
		{ id: "a1", role: "assistant", stopReason: "stop", timestamp: 2, content: [{ type: "text", text: "An eigenvector keeps its direction." }, { type: "toolCall", id: "q1", name: "quiz", arguments: { question: "Q", correctIndex: 1, explanation: "HIDDEN ANSWER" } }] },
	];
	stores.chatStore.saveMessages(chat.id, messages as never);
	return chat;
};
const body = async <T = Record<string, never>>(response: Response) => (await response.json()) as T;
const post = (data: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
type Connections = { links: { target: string; resolution: { state: string; name?: string } }[]; backlinks: { id: string; name: string }[]; related: { id: string }[]; sources: { chatId: string; gone: boolean; title: string | null; href: string }[]; sessions: { chatId: string; gone: boolean }[]; graph: { id: string; reason: string }[] };
const connections = async (id: string) => body<Connections>(await api.pageConnectionsResponse(id));

describe("connections", () => {
	it("shows a backlink, follows a rename, keeps a dangling link, and 404s an unknown page", () => asUser("u_links", async () => {
		const target = await page("Waves", "Target.");
		const linker = await page("Index", "See [[Waves]] and [[Nope]].");
		assert.deepEqual((await connections(target.id)).backlinks.map((b) => b.id), [linker.id]);
		await store.rename(target.id, "Oscillations");
		const after = await connections(linker.id);
		assert.deepEqual(after.links.map((l) => [l.target, l.resolution.state, l.resolution.name]), [["Waves", "live", "Oscillations"], ["Nope", "missing", undefined]]);
		assert.deepEqual((await connections(target.id)).backlinks.map((b) => b.id), [linker.id], "still a backlink after the rename");
		assert.equal((await api.pageConnectionsResponse("lib_none")).status, 404);
	}));
	it("counts the learner's draft, so a link typed a moment ago shows", () => asUser("u_draft", async () => {
		const target = await page("Target");
		const linker = await page("Linker", "x");
		await store.savePageDraft(linker.id, { base: 1, rev: 0, content: "[[Target]]" });
		assert.deepEqual((await connections(target.id)).backlinks.map((b) => b.id), [linker.id]);
	}));
	it("one tenant's backlinks never include another's", async () => {
		const [aTarget] = await asUser("tenant_a", async () => [await page("Shared name"), await page("A linker", "[[Shared name]]")]);
		const [bTarget, bLinker] = await asUser("tenant_b", async () => [await page("Shared name"), await page("B linker", "[[Shared name]]")]);
		const a = await asUser("tenant_a", () => connections(aTarget!.id));
		const b = await asUser("tenant_b", () => connections(bTarget!.id));
		assert.deepEqual(a.backlinks.map((row) => row.name), ["A linker"]);
		assert.deepEqual(b.backlinks.map((row) => row.id), [bLinker!.id]);
		assert.equal((await asUser("tenant_a", () => api.pageConnectionsResponse(bTarget!.id))).status, 404, "another tenant's page doesn't exist here");
		const catalog = await asUser("tenant_a", async () => body<{ entries: { name: string }[] }>(await api.wikiCatalogResponse(new Request("http://localhost/api/library/wiki"))));
		assert.ok(!catalog.entries.some((entry) => entry.name === "B linker"));
	});
	it("refuses a store read outside a tenant in hosted mode", async () => {
		await assert.rejects(() => api.pageConnectionsResponse("x"));
	});
});

describe("passages", () => {
	it("saves with the session's title and links both ways", () => asUser("u_pass", async () => {
		const chat = lesson();
		const note = await page("Notes", "Mine.\n");
		const response = await api.pagePassageResponse(post({ markdown: "Keeps its direction.", chatId: chat.id, messageId: "a1", title: "IGNORED" }), note.id);
		assert.equal(response.status, 201);
		const text = await store.readText(note);
		assert.equal(text, `Mine.\n\n> Keeps its direction.\n>\n> [Lesson: Linear maps](/chat/${chat.id}#message-a1)\n`);
		const seen = await connections(note.id);
		assert.deepEqual(seen.sources.map((s) => [s.chatId, s.gone, s.title]), [[chat.id, false, "Linear maps"]]);
		assert.equal(seen.sources[0]!.href, `/chat/${chat.id}#message-a1`);
		const pages = await body<{ pages: { id: string; passages: number }[] }>(await api.sessionPagesResponse(chat.id));
		assert.deepEqual(pages.pages.map((p) => [p.id, p.passages]), [[note.id, 1]]);
	}));
	it("is honest about bad input", () => asUser("u_bad", async () => {
		const chat = lesson();
		const note = await page("Notes");
		assert.equal((await api.pagePassageResponse(post({ markdown: " ", chatId: chat.id, messageId: "a1" }), note.id)).status, 400);
		assert.equal((await api.pagePassageResponse(post({ markdown: "x", chatId: "none", messageId: "a1" }), note.id)).status, 404);
		assert.equal((await api.pagePassageResponse(post({ markdown: "x", chatId: chat.id, messageId: "nope" }), note.id)).status, 404);
		assert.equal((await api.pagePassageResponse(post({ markdown: "x", chatId: chat.id, messageId: "a1" }), "lib_none")).status, 404);
		assert.equal((await api.pagePassageResponse(post({ markdown: "x".repeat(20_001), chatId: chat.id, messageId: "a1" }), note.id)).status, 413);
		assert.equal(await store.readText(note), "", "nothing was written");
		assert.equal((await api.sessionPagesResponse("none")).status, 404);
	}));
	it("a deleted session keeps the text and says the source is gone", () => asUser("u_gone", async () => {
		const chat = lesson();
		const note = await page("Notes");
		await api.pagePassageResponse(post({ markdown: "Kept.", chatId: chat.id, messageId: "a1" }), note.id);
		const outcome = await deleteChatSession(chat.id, "preserve-graph");
		assert.equal(outcome.ok, true);
		const text = await store.readText(note);
		assert.ok(text.includes("Kept."));
		assert.deepEqual((await connections(note.id)).sources.map((s) => [s.gone, s.title]), [[true, null]]);
		const catalog = await body<{ sources: { gone: boolean }[] }>(await api.wikiCatalogResponse(new Request(`http://localhost/api/library/wiki?page=${note.id}`)));
		assert.deepEqual(catalog.sources.map((s) => s.gone), [true]);
	}));
});

describe("study notes", () => {
	it("makes a new page from the lesson's own prose, stepping past a taken name, with no answers", () => asUser("u_notes", async () => {
		const chat = lesson("Waves");
		const first = await body<{ item: { id: string; name: string; kind: string } }>(await api.studyNotesResponse(chat.id));
		assert.deepEqual([first.item.name, first.item.kind], ["Study notes: Waves", "page"]);
		const text = await store.readPage(first.item.id);
		assert.equal(text!.head.content, `An eigenvector keeps its direction.\n\n[Lesson: Waves](/chat/${chat.id}#message-a1)\n`);
		assert.ok(!text!.head.content.includes("HIDDEN"));
		const second = await body<{ item: { name: string } }>(await api.studyNotesResponse(chat.id));
		assert.equal(second.item.name, "Study notes: Waves (2)");
		const pages = await body<{ pages: { name: string }[] }>(await api.sessionPagesResponse(chat.id));
		assert.equal(pages.pages.length, 2);
	}));
	it("refuses an unknown session, a practice session and an empty lesson, making nothing", () => asUser("u_refuse", async () => {
		assert.equal((await api.studyNotesResponse("none")).status, 404);
		const practice = stores.chatStore.createChat("P", "practice");
		assert.equal((await api.studyNotesResponse(practice.id)).status, 409);
		const empty = stores.chatStore.createChat("E");
		assert.equal((await api.studyNotesResponse(empty.id)).status, 409);
		assert.deepEqual(await store.pageTexts(), []);
	}));
});

describe("the knowledge graph stays read only", () => {
	const hashDir = (folder: string) => {
		if (!fs.existsSync(folder)) return "absent";
		const hash = createHash("sha256");
		for (const name of fs.readdirSync(folder).sort()) {
			const file = path.join(folder, name);
			if (fs.statSync(file).isFile()) hash.update(name).update(fs.readFileSync(file));
		}
		return hash.digest("hex");
	};
	it("shows related propositions and writes no ledger line", () => asUser("u_graph", async () => {
		const chat = lesson();
		stores.graphStore.appendNode({ id: "n_1", name: "Eigenvector", statement: "An eigenvector keeps its direction under the map.", aliases: [], createdAt: "2026-10-31", provenance: [{ chatId: chat.id, messageId: "a1" }] });
		stores.graphStore.appendNode({ id: "n_2", name: "Other", statement: "Nothing shared at all.", aliases: [], createdAt: "2026-10-31", provenance: [{ chatId: "elsewhere", messageId: "m" }] });
		const note = await page("Notes", "");
		const graphDir = PATHS.graph;
		const before = hashDir(graphDir);
		await api.pagePassageResponse(post({ markdown: "Keeps its direction.", chatId: chat.id, messageId: "a1" }), note.id);
		const made = await body<{ item: { id: string } }>(await api.studyNotesResponse(chat.id));
		const rows = (await connections(note.id)).graph;
		assert.deepEqual(rows.map((r) => [r.id, r.reason]), [["n_1", "source"]]);
		await connections(made.item.id);
		assert.equal(hashDir(graphDir), before);
		assert.equal(stores.graphStore.readNodes().length, 2);
		assert.equal(stores.graphStore.readChains().length, 0);
	}));
});

describe("an AI edit goes through review", () => {
	it("draft saved first, tutor version stored, and undo restores the learner's text", () => asUser("u_review", async () => {
		const note = await page("Notes", "Keep this.\n\nRewrite this.\n");
		await store.savePageDraft(note.id, { base: 1, rev: 0, content: "Keep this, typed.\n\nRewrite this.\n" });
		const tools = pageTools({ store, chatId: "chat_1", blocked: () => null });
		const result = await tools.page_revise!.execute("call_1", { item: note.id, baseVersion: 2, edits: [{ find: "Rewrite this.", replace: "Rewritten." }] } as never) as unknown as { details: { outcome: string; version: number; savedLearnerVersion: number } };
		assert.deepEqual([result.details.outcome, result.details.savedLearnerVersion, result.details.version], ["revised", 2, 3]);
		const seen = await store.readPageSeen(note.id);
		assert.ok(seen !== "missing");
		const before = (await store.readPageVersion(note.id, 2))!.content;
		const after = (await store.readPageVersion(note.id, 3))!.content;
		const hunks = tutorHunks(3, before, after);
		assert.equal(hunks.length, 1);
		const undone = revertTutorChanges(after, hunks);
		assert.equal(undone.text, "Keep this, typed.\n\nRewrite this.\n");
		assert.equal(undone.skipped, 0);
	}));
	it("a waiting question still refuses the edit, and nothing is written", () => asUser("u_blocked", async () => {
		const note = await page("Notes", "Text.");
		const tools = pageTools({ store, chatId: "chat_1", blocked: () => "Pages can't be written while a question is waiting for his answer." });
		const result = await tools.page_revise!.execute("call_2", { item: note.id, baseVersion: 1, content: "Changed." } as never) as unknown as { details: { outcome: string } };
		assert.equal(result.details.outcome, "failed");
		assert.equal(await store.readText(note), "Text.");
	}));
});
