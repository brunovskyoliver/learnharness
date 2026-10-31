/** The `pages` switch (T064), the refusal gates through the real registries
 *  (T063) and session deletion unlinking a page (T066). No model. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-page-registry-")));
process.env.LH_DATA_DIR = dir;
const { createProberTools, createTeacherTools } = await import("../src/agent/tools.ts");
const { practiceTools } = await import("../src/agent/tools/practice.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { libraryStore: store } = await import("../src/store/library.ts");
const { deleteChatSession } = await import("../src/server/chats.ts");
const { isRefusal } = await import("../src/core/library.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const library = { store, pdfOverview: async () => null, visionAvailable: () => false };
const teacherCtx = (chatId: string) => ({ chatId, chatStore, jobStore, spawn: () => {}, library });
const practiceCtx = (chatId: string) => ({ chatId, chatStore, library });
const fresh = () => chatStore.createChat("Pages").id;
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;
const assistantCall = (id: string, name: string, args: unknown) => ({
	id: `a_${id}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }],
	api: "x", provider: "x", model: "x", usage: {}, stopReason: "toolUse", timestamp: 1,
}) as never;
const resultFor = (id: string, name: string) => ({ id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: "ok" }], isError: false, timestamp: 2 }) as never;

describe("the pages switch", () => {
	it("on by default for teacher and practice; off removes only the page tools", () => {
		const id = fresh();
		assert.ok(createTeacherTools(teacherCtx(id)).page_create && createTeacherTools(teacherCtx(id)).page_revise);
		assert.ok(practiceTools(practiceCtx(id)).page_create && practiceTools(practiceCtx(id)).page_revise);
		for (const off of [createTeacherTools(teacherCtx(id), { pages: false }), practiceTools(practiceCtx(id), { pages: false })]) {
			assert.equal(off.page_create, undefined);
			assert.equal(off.page_revise, undefined);
			assert.ok(off.library_read && off.library_list, "reading stays");
		}
	});
	it("the prober never holds them", () => {
		const prober = createProberTools({ ...teacherCtx(fresh()), deliver: () => {} } as never);
		assert.equal(prober.page_create, undefined);
		assert.equal(prober.page_revise, undefined);
		assert.ok(prober.library_read);
	});
});

describe("refusals through the registries", () => {
	it("a waiting question refuses the teacher's page tools; nothing written", async () => {
		const id = fresh();
		chatStore.saveMessages(id, [newUserMessage("hi"), assistantCall("q1", "quiz", { type: "check", question: "2+2?", options: ["3", "4"], correctIndex: 1 })]);
		const r = await createTeacherTools(teacherCtx(id)).page_create!.execute("p1", { name: "Answer key", content: "It is 4" } as never);
		assert.equal(text(r), "Pages can't be written while a question is waiting for his answer.");
		assert.equal((await store.list()).some((i) => i.name === "Answer key"), false);
	});
	it("an active problem refuses practice's; after conclude in the same turn it is allowed", async () => {
		const id = fresh();
		chatStore.saveMessages(id, [newUserMessage("hi"), assistantCall("pr1", "problem", { statement: "Solve", mode: "recall", modelSolution: "secret" }), resultFor("pr1", "problem")]);
		const tools = practiceTools(practiceCtx(id));
		const refused = await tools.page_create!.execute("p2", { name: "Solution", content: "secret" } as never);
		assert.equal(text(refused), "Pages can't be written while a problem is active.");
		assert.equal((await store.list()).some((i) => i.name === "Solution"), false);
		const made = await store.createPage("Existing", "x", { author: "learner" });
		assert.ok(!isRefusal(made));
		const revise = await tools.page_revise!.execute("p3", { item: made.item.id, baseVersion: 1, content: "secret" } as never);
		assert.equal(text(revise), "Pages can't be written while a problem is active.");
		assert.equal((await store.readPage(made.item.id))!.head.n, 1);
		await tools.conclude!.execute("c1", { verdict: "correct", feedback: "ok", grade: "pass", outcome: "solved" } as never);
	});
	it("an answered question no longer blocks", async () => {
		const id = fresh();
		chatStore.saveMessages(id, [assistantCall("q2", "quiz", { type: "check" }), resultFor("q2", "quiz")]);
		const r = await createTeacherTools(teacherCtx(id)).page_create!.execute("p4", { name: "After answer", content: "x" } as never);
		assert.equal(JSON.parse(text(r)).name, "After answer");
	});
});

describe("deleting a session", () => {
	it("keeps its agent-made page and clears the link; other chats' links stay", async () => {
		const gone = fresh(), kept = fresh();
		const a = await store.createPage("From gone", "text", { author: "agent", chatId: gone });
		const b = await store.createPage("From kept", "text", { author: "agent", chatId: kept });
		assert.ok(!isRefusal(a) && !isRefusal(b));
		const outcome = await deleteChatSession(gone, "preserve-graph");
		assert.ok(outcome.ok, JSON.stringify(outcome));
		const items = await store.list();
		const pageA = items.find((i) => i.id === a.item.id)!;
		assert.deepEqual(pageA.origin, { type: "agent" });
		assert.equal(await store.readText(pageA), "text");
		assert.deepEqual(items.find((i) => i.id === b.item.id)!.origin, { type: "agent", chatId: kept });
	});
});
