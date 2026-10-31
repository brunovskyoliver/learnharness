/** Feature 018 through the real turn, with a scripted engine and no model
 *  requests: an action's message, its page wrapped as material, the edit stored
 *  as a tutor version the learner reviews, and questions staying off the page. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type FauxResponseStep } from "@earendil-works/pi-ai";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-note-ai-")));
process.env.LH_DATA_DIR = dir;
process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";
const { createTeacherAgent, bareQuestionTools } = await import("../src/agent/teacher-agent.ts");
const { pageTools } = await import("../src/agent/tools/pages.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { stores } = await import("../src/server/stores.ts");
const { tutorHunks, revertTutorChanges } = await import("../components/library/page-blocks.ts");
const { tutorMessage } = await import("../components/library/page-tutor-actions.ts");
const { isRefusal } = await import("../src/core/library.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const store = stores.libraryStore;

function chatWithModel(title: string) {
	const chat = stores.chatStore.createChat(title);
	stores.chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	stores.chatStore.saveTree(chat.id, { nodes: [{ id: "step", title: "Step" }], edges: [], version: 1 });
	return chat;
}

async function turn(chatId: string, text: string, steps: (seen: string[]) => FauxResponseStep[]) {
	const seen: string[] = [];
	const faux = createFauxCore({});
	faux.setResponses(steps(seen));
	const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
	const request = new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input: { type: "text", text } }) });
	const ack = await handleChatRequest(request, (opts) => createTeacherAgent(undefined, {
		engine, messages: opts.messages,
		tools: { ...bareQuestionTools(), ...pageTools({ store, chatId, blocked: () => null }) },
	}));
	assert.equal(ack.status, 200, await ack.clone().text());
	const handle = runningTurn(chatId);
	const wire = handle ? await new Response(handle.subscribe()).text() : "";
	return { wire, seen };
}

const contextText = (context: { messages: unknown[] }) => JSON.stringify(context.messages);

describe("contextual AI actions", () => {
	it("Rewrite: the page reaches the model as material, and the edit lands as a version to review and undo", async () => {
		const made = await store.createPage("Week 3", "Keep this.\n\nRewrite this.\n", { author: "learner" });
		assert.ok(!isRefusal(made));
		const id = made.item.id;
		await store.savePageDraft(id, { base: 1, rev: 0, content: "Keep this, typed.\n\nRewrite this.\n" });
		await store.readPageSeen(id);
		const chat = chatWithModel("Rewrite");
		const { seen } = await turn(chat.id, tutorMessage("rewrite", "Week 3", "Rewrite this."), (log) => [
			(context) => {
				log.push(contextText(context));
				return fauxAssistantMessage([fauxToolCall("page_revise", { item: id, baseVersion: 2, edits: [{ find: "Rewrite this.", replace: "Written more clearly." }] }, { id: "revise-1" })], { stopReason: "toolUse" });
			},
			() => fauxAssistantMessage([fauxText("Done.")]),
		]);
		assert.match(seen[0]!, /Library material/, "the page is wrapped as material");
		assert.match(seen[0]!, /library_item/);

		// The learner's draft went first, as his own version; the tutor's is unseen.
		const versions = (await store.listPageVersions(id))!;
		assert.deepEqual(versions.map((v) => [v.n, v.author, v.cause]), [[3, "agent", "agent-revise"], [2, "learner", "before-agent"], [1, "learner", "save"]]);
		const seenNow = await store.readPageSeen(id);
		assert.ok(seenNow !== "missing");
		assert.deepEqual(seenNow.unseen.map((v) => v.n), [3], "the review bar has it to show");

		// Undo puts his text back.
		const before = (await store.readPageVersion(id, 2))!.content;
		const after = (await store.readPageVersion(id, 3))!.content;
		assert.equal(after, "Keep this, typed.\n\nWritten more clearly.\n");
		assert.equal(revertTutorChanges(after, tutorHunks(3, before, after)).text, before);
	});

	it("Generate questions: posed through the question mechanics, and the page isn't touched", async () => {
		const made = await store.createPage("Week 4", "Claim.\n", { author: "learner" });
		assert.ok(!isRefusal(made));
		const chat = chatWithModel("Questions");
		await turn(chat.id, tutorMessage("questions", "Week 4", "Claim."), () => [
			() => fauxAssistantMessage([fauxToolCall("quiz", { question: "Why?", options: [{ label: "A" }, { label: "B" }], correctAnswer: "A", explanation: "Because.", type: "check", nodeId: "step" }, { id: "quiz-1" })], { stopReason: "toolUse" }),
		]);
		const record = stores.chatStore.getChat(chat.id)!;
		const last = record.messages.at(-1)! as { role: string; content: { type: string; name?: string }[] };
		assert.equal(last.role, "assistant");
		assert.ok(last.content.some((block) => block.type === "toolCall" && block.name === "quiz"), "it waits on the learner's answer");
		const page = await store.readPage(made.item.id);
		assert.equal(page!.head.content, "Claim.\n");
		assert.equal(page!.head.n, 1);
	});
});
