/** Held page edits (feature 023): the turn that holds, the merge onto what he kept
 *  typing, the store's refusals and order of writes, and the real tool registries.
 *  No model. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-page-proposals-")));
process.env.LH_DATA_DIR = dir;
const { isHeldEditRequest, isHeldEditTurn, mergeProposal } = await import("../src/core/page-proposals.ts");
const { TUTOR_ACTIONS, TUTOR_EDIT_ACTIONS, tutorMessage } = await import("../components/library/page-tutor-actions.ts");
const { pageProposalStore: proposals } = await import("../src/store/page-proposals.ts");
const { libraryStore: store } = await import("../src/store/library.ts");
const { isRefusal, CATALOG_VERSION } = await import("../src/core/library.ts");
const { pageTools, pageEditHeld } = await import("../src/agent/tools/pages.ts");
const { createTeacherTools } = await import("../src/agent/tools.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { deleteChatSession } = await import("../src/server/chats.ts");
const { pageProposalAcceptResponse, pageProposalEditResponse, pageProposalRejectResponse, pageProposalResponse, pageProposalsResponse } = await import("../src/server/page-proposals.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

let names = 0;
async function page(content: string) {
	const made = await store.createPage(`Note ${++names}`, content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item.id;
}
const propose = async (pageId: string, text: string, baseVersion = 1, extra: { chatId?: string; toolCallId?: string } = {}) => {
	const result = await proposals.propose({ pageId, baseVersion, apply: () => text, ...extra });
	assert.equal(result.outcome, "proposed");
	return (result as { proposal: { id: string } }).proposal.id;
};
const snapshot = async (pageId: string) => {
	const state = (await store.readPage(pageId))!;
	return { head: state.head.n, text: state.head.content, draft: state.draft?.content ?? null, versions: (await store.listPageVersions(pageId))!.length };
};

describe("which turns hold", () => {
	it("every edit action's own message holds, and no other action's does", () => {
		for (const action of TUTOR_ACTIONS) {
			const message = tutorMessage(action, "Week 3: waves (draft)", "A line.\n\nAnother line.");
			assert.equal(isHeldEditRequest(message), TUTOR_EDIT_ACTIONS.has(action), action);
		}
	});

	it("an ordinary message asking to rewrite doesn't hold", () => {
		assert.equal(isHeldEditRequest("Rewrite my page on waves"), false);
		assert.equal(isHeldEditRequest("Please Rewrite this part of @x more simply, in the page:\n\n> y"), false);
	});

	const request = { role: "user", content: [{ type: "text", text: tutorMessage("rewrite", "P", "x") }] };
	it("holds through tool calls in the same turn, steers included", () => {
		const toolUse = { role: "assistant", stopReason: "toolUse", content: [] };
		const result = { role: "toolResult", content: [] };
		assert.equal(isHeldEditTurn([request]), true);
		assert.equal(isHeldEditTurn([request, toolUse, result]), true);
		assert.equal(isHeldEditTurn([request, toolUse, result, { role: "user", content: "also the title" }]), true);
	});
	it("a finished reply ends it, so the next message is its own turn", () => {
		const finished = { role: "assistant", stopReason: "stop", content: [] };
		assert.equal(isHeldEditTurn([request, finished, { role: "user", content: "now fix the title" }]), false);
		assert.equal(isHeldEditTurn([]), false);
	});
});

describe("mergeProposal", () => {
	const base = "One.\n\nTwo.\n\nThree.\n";
	const proposed = "One.\n\nTwo, clearer.\n\nThree.\n";
	it("nothing typed: the proposal", () => assert.equal(mergeProposal(base, proposed, base), proposed));
	it("typing before the change keeps both", () => assert.equal(mergeProposal(base, proposed, "One, mine.\nmore\n\nTwo.\n\nThree.\n"), "One, mine.\nmore\n\nTwo, clearer.\n\nThree.\n"));
	it("typing after the change keeps both", () => assert.equal(mergeProposal(base, proposed, "One.\n\nTwo.\n\nThree, mine.\n"), "One.\n\nTwo, clearer.\n\nThree, mine.\n"));
	it("the same line refuses", () => assert.equal(mergeProposal(base, proposed, "One.\n\nTwo, mine.\n\nThree.\n"), null));
	it("the very next line refuses, since the two can't be told apart", () => assert.equal(mergeProposal("a\nb\n", "A\nb\n", "a\nB\n"), null));
	it("edits on both sides of the change refuse rather than guess", () => assert.equal(mergeProposal(base, proposed, "One!\n\nTwo.\n\nThree!\n"), null));
	it("already the same text", () => assert.equal(mergeProposal(base, proposed, proposed), proposed));
});

describe("the store", () => {
	it("proposing touches neither the head nor the draft", async () => {
		const id = await page("One.\n\nTwo.\n");
		await store.savePageDraft(id, { base: 1, rev: 0, content: "One, typed.\n\nTwo.\n" });
		const before = await snapshot(id);
		await propose(id, "One.\n\nTwo, clearer.\n");
		assert.deepEqual(await snapshot(id), before);
	});

	it("accepting saves his draft first, then makes one AI-authored version holding both", async () => {
		const id = await page("One.\n\nTwo.\n\nThree.\n");
		const proposalId = await propose(id, "One.\n\nTwo.\n\nThree, clearer.\n", 1, { chatId: "chat_a" });
		const draft = await store.savePageDraft(id, { base: 1, rev: 0, content: "One, typed.\n\nTwo.\n\nThree.\n" });
		assert.ok(typeof draft === "object" && "rev" in draft);
		const review = (await proposals.review(proposalId))!;
		assert.equal(review.current!.merged, "One, typed.\n\nTwo.\n\nThree, clearer.\n");
		const result = await proposals.accept(proposalId, review.current!.expected);
		assert.equal(result.outcome, "accepted");
		assert.equal((result as { savedLearnerVersion: number }).savedLearnerVersion, 2);
		const versions = (await store.listPageVersions(id))!;
		assert.deepEqual(versions.map((v) => [v.n, v.author, v.cause]), [[3, "agent", "proposal-approved"], [2, "learner", "before-agent"], [1, "learner", "save"]]);
		assert.equal(versions[0]!.proposalId, proposalId);
		assert.equal(versions[0]!.chatId, "chat_a");
		assert.equal((await store.readPageVersion(id, 2))!.content, "One, typed.\n\nTwo.\n\nThree.\n", "his text is its own version");
		const state = (await store.readPage(id))!;
		assert.equal(state.head.content, "One, typed.\n\nTwo.\n\nThree, clearer.\n");
		assert.equal(state.draft, null);
		const seen = await store.readPageSeen(id);
		assert.ok(seen !== "missing");
		assert.deepEqual(seen.unseen, [], "he already reviewed it, so the review bar has nothing to add");
		assert.equal((await proposals.proposal(proposalId))!.status, "accepted");
	});

	it("a page that moved on refuses, and nothing is lost", async () => {
		const id = await page("One.\n\nTwo.\n");
		const proposalId = await propose(id, "One.\n\nTwo, clearer.\n");
		const expected = (await proposals.review(proposalId))!.current!.expected;
		const committed = await store.commitPageVersion(id, { base: 1, rev: 0, content: "One.\n\nTwo.\n\nThree, mine.\n" });
		assert.ok(typeof committed === "object" && "version" in committed);
		await store.savePageDraft(id, { base: 2, rev: 0, content: "One.\n\nTwo.\n\nThree, mine.\n\nFour.\n" });
		const before = await snapshot(id);
		const review = (await proposals.review(proposalId))!;
		assert.equal(review.current!.moved, true);
		assert.equal(review.current!.merged, null);
		for (const asked of [expected, review.current!.expected]) {
			const result = await proposals.accept(proposalId, asked);
			assert.equal(result.outcome, "moved");
		}
		assert.deepEqual(await snapshot(id), before);
		const kept = (await proposals.proposal(proposalId))!;
		assert.equal(kept.status, "pending", "still there to read, copy or reject");
		assert.equal(kept.text, "One.\n\nTwo, clearer.\n");
	});

	it("typing on the same lines refuses, and nothing is lost", async () => {
		const id = await page("One.\n\nTwo.\n");
		const proposalId = await propose(id, "One.\n\nTwo, clearer.\n");
		await store.savePageDraft(id, { base: 1, rev: 0, content: "One.\n\nTwo, mine.\n" });
		const before = await snapshot(id);
		const review = (await proposals.review(proposalId))!;
		assert.equal(review.current!.merged, null);
		assert.equal((await proposals.accept(proposalId, review.current!.expected)).outcome, "overlap");
		assert.deepEqual(await snapshot(id), before);
	});

	it("a draft newer than the comparison refuses", async () => {
		const id = await page("One.\n\nTwo.\n\nThree.\n");
		const proposalId = await propose(id, "One.\n\nTwo.\n\nThree, clearer.\n");
		const expected = (await proposals.review(proposalId))!.current!.expected;
		await store.savePageDraft(id, { base: 1, rev: 0, content: "One, typed after he compared.\n\nTwo.\n\nThree.\n" });
		const before = await snapshot(id);
		assert.equal((await proposals.accept(proposalId, expected)).outcome, "compared-stale");
		assert.deepEqual(await snapshot(id), before);
	});

	it("Edit first changes only the proposal, and the version says so", async () => {
		const id = await page("One.\n");
		const proposalId = await propose(id, "One, clearer.\n");
		const before = await snapshot(id);
		const edited = await proposals.edit(proposalId, "One, in my words.\n");
		assert.ok(typeof edited === "object" && edited.edited);
		assert.deepEqual(await snapshot(id), before);
		const result = await proposals.accept(proposalId, (await proposals.review(proposalId))!.current!.expected);
		assert.equal(result.outcome, "accepted");
		const head = (await store.listPageVersions(id))![0]!;
		assert.equal(head.editedByLearner, true);
		assert.equal((await store.readPage(id))!.head.content, "One, in my words.\n");
	});

	it("Reject leaves the page alone, and a decided proposal stays decided", async () => {
		const id = await page("One.\n");
		const proposalId = await propose(id, "One, clearer.\n");
		const before = await snapshot(id);
		assert.equal((await proposals.reject(proposalId)).outcome, "rejected");
		assert.deepEqual(await snapshot(id), before);
		assert.equal((await proposals.accept(proposalId, { head: 1, rev: 0 })).outcome, "resolved");
		assert.equal(await proposals.edit(proposalId, "x"), "resolved");
		assert.equal((await proposals.reject(proposalId)).outcome, "resolved");
	});

	it("a repeated call is the same proposal; a read of an old head and no-op text refuse", async () => {
		const id = await page("One.\n");
		const first = await propose(id, "One, clearer.\n", 1, { toolCallId: "call-1" });
		assert.equal(await propose(id, "One, clearer again.\n", 1, { toolCallId: "call-1" }), first);
		const stale = await proposals.propose({ pageId: id, baseVersion: 9, apply: () => "x" });
		assert.deepEqual(stale, { outcome: "stale", head: 1 });
		assert.equal((await proposals.propose({ pageId: id, baseVersion: 1, apply: (head) => head })).outcome, "refused");
		assert.equal((await proposals.propose({ pageId: "missing", baseVersion: 1, apply: () => "x" })).outcome, "missing");
	});

	it("a crash between the version and the status repairs on the next accept", async () => {
		const id = await page("One.\n");
		const proposalId = await propose(id, "One, clearer.\n");
		const expected = (await proposals.review(proposalId))!.current!.expected;
		await proposals.accept(proposalId, expected);
		const file = path.join(dir, "library", "page-proposals", id, `${proposalId}.json`);
		const stored = JSON.parse(fs.readFileSync(file, "utf8"));
		fs.writeFileSync(file, JSON.stringify({ ...stored, status: "pending", version: undefined }));
		const again = await proposals.accept(proposalId, expected);
		assert.equal(again.outcome, "accepted");
		assert.equal((await store.listPageVersions(id))!.length, 2, "no second version");
		assert.equal((await proposals.proposal(proposalId))!.status, "accepted");
	});

	it("nothing here changes the catalog's version or puts anything in it", async () => {
		const id = await page("One.\n");
		await propose(id, "One, clearer.\n");
		const catalog = JSON.parse(fs.readFileSync(path.join(dir, "library", "catalog.json"), "utf8"));
		assert.equal(catalog.version, CATALOG_VERSION);
		assert.doesNotMatch(JSON.stringify(catalog), /proposal/i);
	});

	it("a page deleted for good takes its proposals along", async () => {
		const id = await page("One.\n");
		const proposalId = await propose(id, "One, clearer.\n");
		assert.equal(await store.remove(id), true);
		assert.equal(await proposals.proposal(proposalId), null);
	});
});

describe("page_revise", () => {
	const library = { store, pageProposals: proposals, pdfOverview: async () => null, visionAvailable: () => false };
	const tools = (chatId: string) => createTeacherTools({ chatId, chatStore, jobStore, spawn: () => {}, library });
	const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;
	const details = (r: unknown) => (r as { details: Record<string, unknown> }).details;
	const run = (tool: { execute: (...args: never[]) => Promise<unknown> }, id: string, args: unknown) => (tool.execute as unknown as (i: string, a: unknown) => Promise<unknown>)(id, args);

	it("from a selection's action: held, under the same call, and the page doesn't move", async () => {
		const id = await page("Keep.\n\nRewrite me.\n");
		const chatId = chatStore.createChat("Action").id;
		chatStore.saveMessages(chatId, [newUserMessage(tutorMessage("rewrite", "Note", "Rewrite me."))]);
		const before = await snapshot(id);
		const out = await run(tools(chatId).page_revise as never, "c1", { item: id, baseVersion: 1, edits: [{ find: "Rewrite me.", replace: "Clearer." }] });
		assert.equal(details(out).outcome, "proposed");
		assert.equal(details(out).target, "page");
		assert.match(text(out), /Held for his review/);
		assert.deepEqual(await snapshot(id), before);
		const stored = (await proposals.proposal(details(out).proposalId as string))!;
		assert.equal(stored.text, "Keep.\n\nClearer.\n");
		assert.equal(stored.chatId, chatId);
	});

	it("an edit that can't apply says why, and stores nothing", async () => {
		const id = await page("Keep.\n");
		const chatId = chatStore.createChat("Action").id;
		chatStore.saveMessages(chatId, [newUserMessage(tutorMessage("expand", "Note", "Keep."))]);
		const out = await run(tools(chatId).page_revise as never, "c2", { item: id, baseVersion: 1, edits: [{ find: "absent", replace: "x" }] });
		assert.equal(details(out).outcome, "failed");
		assert.deepEqual(await proposals.proposals({ pageId: id }), []);
	});

	it("an ordinary turn is held too: no AI edit reaches a page before review", async () => {
		const id = await page("Keep.\n");
		const chatId = chatStore.createChat("Plain").id;
		chatStore.saveMessages(chatId, [newUserMessage("Tidy that page please.")]);
		const out = await run(tools(chatId).page_revise as never, "c3", { item: id, baseVersion: 1, content: "Kept.\n" });
		assert.equal(details(out).outcome, "proposed");
		assert.equal((await store.readPage(id))!.head.content, "Keep.\n");
	});

	it("and so is one over an edit already waiting on that page", async () => {
		const id = await page("Keep.\n");
		await propose(id, "Keep, waiting.\n");
		const chatId = chatStore.createChat("Plain").id;
		chatStore.saveMessages(chatId, [newUserMessage("Make it shorter.")]);
		const out = await run(tools(chatId).page_revise as never, "c4", { item: id, baseVersion: 1, content: "K.\n" });
		assert.equal(details(out).outcome, "proposed");
		assert.equal((await store.readPage(id))!.head.n, 1);
		assert.equal((await proposals.proposals({ pageId: id, status: "pending" })).length, 2);
	});

	it("without the store wired in, the contract is what it was", async () => {
		const id = await page("Keep.\n");
		const direct = pageTools({ store, chatId: "c", blocked: () => null });
		const out = await run(direct.page_revise as never, "c5", { item: id, baseVersion: 1, content: "Kept.\n" });
		assert.equal(details(out).outcome, "revised");
	});

	it("deleting a session keeps its proposal and drops the link", async () => {
		const id = await page("Keep.\n");
		const chatId = chatStore.createChat("Gone").id;
		const proposalId = await propose(id, "Kept.\n", 1, { chatId });
		const deleted = await deleteChatSession(chatId, "preserve-graph");
		assert.ok(deleted);
		const kept = (await proposals.proposal(proposalId))!;
		assert.equal(kept.chatId, undefined);
		assert.equal(kept.status, "pending");
	});

	it("the sentence names the page", () => assert.match(pageEditHeld("Week 3"), /nothing on Week 3 changed/));
});

describe("the routes", () => {
	const put = (body: unknown) => new Request("http://x/", { method: "PUT", body: JSON.stringify(body) });
	it("list without texts, read with the comparison, edit, refuse without what was compared, accept", async () => {
		const id = await page("One.\n");
		const proposalId = await propose(id, "One, clearer.\n");
		const list = await (await pageProposalsResponse(new Request(`http://x/?page=${id}`))).json() as { proposals: Record<string, unknown>[] };
		assert.equal(list.proposals.length, 1);
		assert.equal(list.proposals[0]!.text, undefined);
		assert.equal(list.proposals[0]!.baseText, undefined);
		const read = await (await pageProposalResponse(proposalId)).json() as { current: { merged: string; expected: { head: number; rev: number } } };
		assert.equal(read.current.merged, "One, clearer.\n");
		assert.equal((await pageProposalEditResponse(put({}), proposalId)).status, 400);
		assert.equal((await pageProposalEditResponse(put({ text: "One, edited.\n" }), proposalId)).status, 200);
		assert.equal((await pageProposalAcceptResponse(put({}), proposalId)).status, 400);
		assert.equal((await pageProposalAcceptResponse(put({ expected: read.current.expected }), proposalId)).status, 201);
		assert.equal((await pageProposalAcceptResponse(put({ expected: read.current.expected }), proposalId)).status, 409);
	});
	it("a moved page answers 409 with its code; unknown ids 404; reject works", async () => {
		const id = await page("One.\n");
		const proposalId = await propose(id, "One, clearer.\n");
		await store.commitPageVersion(id, { base: 1, rev: 0, content: "Mine.\n" });
		const refused = await pageProposalAcceptResponse(put({ expected: { head: 2, rev: 0 } }), proposalId);
		assert.equal(refused.status, 409);
		assert.equal((await refused.json() as { code: string }).code, "moved");
		for (const missing of ["nope", "pgp_nope", "../../x"]) {
			assert.equal((await pageProposalResponse(missing)).status, 404);
			assert.equal((await pageProposalRejectResponse(missing)).status, 404);
		}
		assert.equal((await pageProposalRejectResponse(proposalId)).status, 200);
	});
});
