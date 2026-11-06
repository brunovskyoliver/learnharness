/** Feature 024 routes (contracts/api.md) through the real route modules and
 *  stores, with the faux engine (LH_NOTEBOOK_FAUX=1) for runs. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-nb-api-")));
process.env.LH_DATA_DIR = dir;
delete process.env.LH_HOSTED;
process.env.LH_NOTEBOOK_FAUX = "1";
const { PATHS } = await import("../config.ts");
const { stores } = await import("../src/server/stores.ts");
const { isRefusal } = await import("../src/core/library.ts");
const { resolveNotebookNote, UNTITLED_NOTE } = await import("../src/server/notebook-api.ts");
const { notebookRunIdle } = await import("../src/server/notebook.ts");
const { writeSettings } = await import("../src/store/settings.ts");
const companionRoute = await import("../app/api/notebook/[pageId]/route.ts");
const threadsRoute = await import("../app/api/notebook/[pageId]/threads/route.ts");
const threadRoute = await import("../app/api/notebook/[pageId]/threads/[threadId]/route.ts");
const messagesRoute = await import("../app/api/notebook/[pageId]/threads/[threadId]/messages/route.ts");
const runsRoute = await import("../app/api/notebook/[pageId]/runs/route.ts");
const streamRoute = await import("../app/api/notebook/runs/[runId]/stream/route.ts");
const abortRoute = await import("../app/api/activity/abort/route.ts");
const activityRoute = await import("../app/api/activity/route.ts");
after(() => { delete process.env.LH_NOTEBOOK_FAUX; fs.rmSync(dir, { recursive: true, force: true }); });

const NOTE = "Entropy always rises in a closed system. So a cup of tea cools down.";
const req = (method: string, body?: unknown) => new Request("http://localhost/api/notebook/x", { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }) });
const ctx = <T extends object>(params: T) => ({ params: Promise.resolve(params) });
const ok = async (response: Response, status = 200) => {
	const text = await response.clone().text();
	assert.equal(response.status, status, text);
	return text ? JSON.parse(text) : null;
};
const page = async (name = `Heat ${Math.random().toString(36).slice(2, 7)}`, text = NOTE) => {
	const made = await stores.libraryStore.createPage(name, text, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item.id;
};
const anchor = { quote: "a cup of tea", prefix: "system. So ", suffix: " cools down." };

describe("companion", () => {
	it("GET reads an empty companion with the effective mode; unknown pages are 404, bad ids 400", async () => {
		const id = await page();
		const body = await ok(await companionRoute.GET(req("GET"), ctx({ pageId: id })));
		assert.deepEqual(body, { companion: { v: 1, pageId: id, instruction: "", threads: [], chat: [] }, effective: { mode: "thinks" }, readOnly: null, setAside: false });
		await ok(await companionRoute.GET(req("GET"), ctx({ pageId: "lib_nope" })), 404);
		await ok(await companionRoute.GET(req("GET"), ctx({ pageId: "a/b" })), 400);
	});

	it("PATCH sets mode, instruction and reviewer; null clears; bad bodies are 400", async () => {
		const id = await page();
		const set = await ok(await companionRoute.PATCH(req("PATCH", { mode: "ask", instruction: "Only hints.", reviewerId: "examiner" }), ctx({ pageId: id })));
		assert.equal(set.companion.mode, "ask");
		assert.equal(set.companion.instruction, "Only hints.");
		const read = await ok(await companionRoute.GET(req("GET"), ctx({ pageId: id })));
		assert.equal(read.effective.mode, "ask");
		const cleared = await ok(await companionRoute.PATCH(req("PATCH", { mode: null, reviewerId: null }), ctx({ pageId: id })));
		assert.equal(cleared.companion.mode, undefined);
		assert.equal(cleared.companion.reviewerId, undefined);
		await ok(await companionRoute.PATCH(req("PATCH", { mode: "loud" }), ctx({ pageId: id })), 400);
		await ok(await companionRoute.PATCH(req("PATCH", { instruction: "x".repeat(501) }), ctx({ pageId: id })), 400);
		await ok(await companionRoute.PATCH(req("PATCH", {}), ctx({ pageId: id })), 400);
		await ok(await companionRoute.PATCH(req("PATCH", "{bad"), ctx({ pageId: id })), 400);
		await ok(await companionRoute.PATCH(req("PATCH", { mode: "ask" }), ctx({ pageId: "lib_nope" })), 404);
	});

	it("a newer companion version reads empty and refuses writes with 409", async () => {
		const id = await page();
		fs.mkdirSync(path.join(PATHS.library, "notebook"), { recursive: true });
		fs.writeFileSync(path.join(PATHS.library, "notebook", `${id}.json`), JSON.stringify({ v: 9, pageId: id }));
		const read = await ok(await companionRoute.GET(req("GET"), ctx({ pageId: id })));
		assert.equal(read.readOnly, "future-version");
		const refused = await ok(await companionRoute.PATCH(req("PATCH", { mode: "ask" }), ctx({ pageId: id })), 409);
		assert.equal(refused.code, "future-version");
		await ok(await runsRoute.POST(req("POST", { kind: "read", text: NOTE, auto: true }), ctx({ pageId: id })), 409);
	});

	it("a trashed page still reads", async () => {
		const id = await page();
		const trashed = await stores.libraryStore.trashItem(id);
		assert.ok(trashed && !isRefusal(trashed));
		await ok(await companionRoute.GET(req("GET"), ctx({ pageId: id })));
	});
});

describe("threads", () => {
	it("Ask opens a thread with his question, write-ahead; he can write back; resolve, undo, dismiss", async () => {
		const id = await page();
		const { thread } = await ok(await threadsRoute.POST(req("POST", { anchor, origin: "ask", text: "Why does it cool?" }), ctx({ pageId: id })), 201);
		assert.equal(thread.origin, "ask");
		assert.equal(thread.status, "open");
		assert.deepEqual(thread.messages.map((m: { author: string; text: string }) => [m.author, m.text]), [["user", "Why does it cool?"]]);
		const { message } = await ok(await messagesRoute.POST(req("POST", { text: "And faster when hotter?" }), ctx({ pageId: id, threadId: thread.id })), 201);
		assert.equal(message.author, "user");
		const resolved = await ok(await threadRoute.PATCH(req("PATCH", { status: "resolved" }), ctx({ pageId: id, threadId: thread.id })));
		assert.equal(resolved.thread.status, "resolved");
		const undone = await ok(await threadRoute.PATCH(req("PATCH", { status: "open" }), ctx({ pageId: id, threadId: thread.id })));
		assert.equal(undone.thread.status, "open");
		await ok(await threadRoute.PATCH(req("PATCH", { status: "dismissed" }), ctx({ pageId: id, threadId: thread.id })));
		const read = await ok(await companionRoute.GET(req("GET"), ctx({ pageId: id })));
		assert.equal(read.companion.threads[0].status, "dismissed");
		assert.equal(read.companion.threads[0].messages.length, 2);
	});

	it("refuses bad input (400), unknown threads (404) and limits (409)", async () => {
		const id = await page();
		await ok(await threadsRoute.POST(req("POST", { anchor, origin: "read", text: "x" }), ctx({ pageId: id })), 400);
		await ok(await threadsRoute.POST(req("POST", { anchor: { quote: "" }, origin: "ask", text: "x" }), ctx({ pageId: id })), 400);
		await ok(await threadsRoute.POST(req("POST", { anchor, origin: "ask", text: "  " }), ctx({ pageId: id })), 400);
		await ok(await threadsRoute.POST(req("POST", { anchor, origin: "ask", text: "x".repeat(20_001) }), ctx({ pageId: id })), 409);
		await ok(await threadsRoute.POST(req("POST", { anchor, origin: "ask", text: "x" }), ctx({ pageId: "lib_nope" })), 404);
		await ok(await threadRoute.PATCH(req("PATCH", { status: "gone" }), ctx({ pageId: id, threadId: "thr_a" })), 400);
		await ok(await threadRoute.PATCH(req("PATCH", { status: "resolved" }), ctx({ pageId: id, threadId: "thr_a" })), 404);
		await ok(await messagesRoute.POST(req("POST", { text: "x" }), ctx({ pageId: id, threadId: "thr_a" })), 404);
		await stores.notebookStore.update(id, (c) => {
			for (let i = 0; i < 200; i++) c.threads.push({ id: `t${i}`, anchor, placement: "margin", side: "right", status: "open", origin: "read", createdAt: "x", updatedAt: "x", messages: [] });
			return { companion: c, result: null };
		});
		const full = await ok(await threadsRoute.POST(req("POST", { anchor, origin: "ask", text: "x" }), ctx({ pageId: id })), 409);
		assert.match(full.error, /200 notes/);
	});
});

describe("runs, stream and stop", () => {
	it("starts a faux read (202), streams it over SSE, and lists it in /api/activity while running", async () => {
		const id = await page();
		const started = await ok(await runsRoute.POST(req("POST", { kind: "read", text: NOTE, auto: true }), ctx({ pageId: id })), 202);
		assert.equal(started.run.kind, "read");
		assert.equal(started.run.status, "running");
		const feed = await ok(await activityRoute.GET());
		assert.deepEqual(feed.notebookRuns.map((r: { id: string }) => r.id), [started.run.id]);
		const stream = await streamRoute.GET(req("GET"), ctx({ runId: started.run.id }));
		assert.equal(stream.headers.get("Content-Type"), "text/event-stream");
		const text = await stream.text();
		assert.match(text, /^event: phase\ndata: \{"phase":"reading"\}\n\n/);
		assert.match(text, /event: done\ndata: \{"status":"done"/);
		await notebookRunIdle();
		await ok(await streamRoute.GET(req("GET"), ctx({ runId: "nbr_nope" })), 404);
		await ok(await streamRoute.GET(req("GET"), ctx({ runId: "a.b" })), 400);
	});

	it("Stop goes through the activity abort route with kind notebook", async () => {
		const id = await page();
		const started = await ok(await runsRoute.POST(req("POST", { kind: "chat", text: NOTE, message: "What should I do next?" }), ctx({ pageId: id })), 202);
		const abort = (body: unknown) => abortRoute.POST(new Request("http://localhost/api/activity/abort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
		await ok(await abort({ kind: "notebook", id: started.run.id }));
		await notebookRunIdle();
		await ok(await abort({ kind: "notebook", id: started.run.id }), 409);
		const read = await ok(await companionRoute.GET(req("GET"), ctx({ pageId: id })));
		assert.equal(read.companion.chat[0].text, "What should I do next?");
		assert.equal(read.companion.chat[1].state, "stopped");
	});
});

describe("the note Notebook opens", () => {
	it("a requested page, else the last note if live, else the newest page, else a new Untitled note", async () => {
		const { runAsTenant } = await import("../config.ts");
		// A tenant of its own gives an empty Library without touching the others.
		process.env.LH_HOSTED = "1";
		try {
			await runAsTenant("nb-open", async () => {
				const made = await resolveNotebookNote(undefined);
				assert.ok("redirectTo" in made);
				const pages = (await stores.libraryStore.list()).filter((item) => item.kind === "page");
				assert.deepEqual(pages.map((p) => p.name), [UNTITLED_NOTE]);
				assert.equal((made as { redirectTo: string }).redirectTo, `/notebook/${pages[0]!.id}`);
				const older = await page("Older");
				await new Promise((r) => setTimeout(r, 5));
				const newer = await page("Newer");
				assert.deepEqual(await resolveNotebookNote(undefined), { redirectTo: `/notebook/${newer}` });
				writeSettings({ version: 1, notebook: { lastNoteId: older } } as never);
				assert.deepEqual(await resolveNotebookNote(undefined), { redirectTo: `/notebook/${older}` });
				writeSettings({ version: 1, notebook: { lastNoteId: "lib_gone" } } as never);
				assert.deepEqual(await resolveNotebookNote(undefined), { redirectTo: `/notebook/${newer}` });
				assert.deepEqual(await resolveNotebookNote(older), { note: { id: older, name: "Older" } });
				assert.deepEqual(await resolveNotebookNote("lib_gone"), { missing: true });
				assert.deepEqual(await resolveNotebookNote("../etc"), { missing: true });
			});
		} finally {
			delete process.env.LH_HOSTED;
		}
	});
});
