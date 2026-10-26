import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	firstSourceTextParts, messageAnchorId, messageIdFromHash, propositionSessionHref, textPartMessageId, sessionTurnEntries,
} from "../src/core/session-navigation.ts";
import { projectView } from "../src/core/view.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

function teacher(id: string, content: unknown[]): LhMessage {
	return { id, role: "assistant", content, stopReason: "stop", timestamp: 0, provider: "openrouter", model: "test" } as LhMessage;
}

describe("proposition source-session links (owner, 2026-10-13)", () => {
	it("chooses the first recorded non-empty anchor for that source", () => {
		const node = { provenance: [
			{ chatId: "other", messageId: "unrelated" },
			{ chatId: "chat_a", messageId: "" },
			{ chatId: "chat_a", messageId: "msg_first" },
			{ chatId: "chat_a", messageId: "msg_latest" },
		] };
		assert.equal(propositionSessionHref(node, "chat_a"), "/chat/chat_a#message-msg_first");
		assert.equal(propositionSessionHref(node, "other"), "/chat/other#message-unrelated");
	});

	it("legacy chat-only/missing provenance remains an ordinary session link", () => {
		assert.equal(propositionSessionHref({ provenance: [{ chatId: "c", messageId: "" }] }, "c"), "/chat/c");
		assert.equal(propositionSessionHref({ provenance: [] }, "c"), "/chat/c");
	});

	it("encodes path/hash values and round-trips the actual message ID", () => {
		const node = { provenance: [{ chatId: "chat /a", messageId: "msg /%#a" }] };
		const href = propositionSessionHref(node, "chat /a");
		assert.equal(href, "/chat/chat%20%2Fa#message-msg%20%2F%25%23a");
		assert.equal(messageIdFromHash(href.slice(href.indexOf("#"))), "msg /%#a");
	});

	it("recognizes only non-empty, well-formed message hashes", () => {
		assert.equal(messageAnchorId("msg_a"), "message-msg_a");
		assert.equal(messageIdFromHash("#message-msg_a"), "msg_a");
		for (const hash of ["", "#", "#message-", "#other-msg_a", "#message-%ZZ"]) {
			assert.equal(messageIdFromHash(hash), null, hash);
		}
	});
});

describe("session turn rail destinations", () => {
	it("keeps tool steps together and separates recorded turns inside one assistant group", () => {
		const native = [
			{ id: "user", role: "user", content: "Explain **gradients**.", timestamp: 0 } as LhMessage,
			teacher("first_step", [{ type: "thinking", thinking: "Private reasoning" }]),
			teacher("answer_step", [{ type: "text", text: "## First answer\n\nA **gradient**." }]),
			teacher("next_turn", [{ type: "text", text: "Second answer." }, { type: "toolCall", id: "check", name: "quiz", arguments: {} }]),
			{ id: "answer", role: "toolResult", toolName: "quiz", toolCallId: "check", content: [{ type: "text", text: "Answer" }], isError: false, timestamp: 1 } as LhMessage,
			teacher("continuation", [{ type: "text", text: "Feedback after the check." }]),
		];
		const view = projectView(native);
		assert.equal(view.filter((message) => message.role === "assistant").length, 1, "projection merges these invocations");
		assert.deepEqual(sessionTurnEntries(view, native, [{ id: "turn1", messageId: "first_step" }, { id: "turn2", messageId: "next_turn" }]), [
			{ id: "first_step", partId: "answer_step-t0", prompt: "Explain gradients.", answer: "First answer A gradient." },
			{ id: "next_turn", partId: "next_turn-t0", prompt: "Explain gradients.", answer: "Second answer." },
			{ id: "continuation", partId: "continuation-t0", prompt: "Explain gradients.", answer: "Feedback after the check." },
		]);
	});
	it("handles live turns without usage, leaving reasoning and tools out of previews", () => {
		const native = [
			teacher("silent", [{ type: "thinking", thinking: "Hidden" }]),
			{ id: "user", role: "user", content: "Show code.", timestamp: 0 } as LhMessage,
			teacher("live", [{ type: "thinking", thinking: "Hidden too" }, { type: "text", text: "Try this:\n\n```python\nx = 1\n```" }]),
		];
		assert.deepEqual(sessionTurnEntries(projectView(native), native, []), [{ id: "live", partId: "live-t0", prompt: "Show code.", answer: "Try this: x = 1" }]);
	});
});

describe("native message anchors survive assistant grouping", () => {
	it("anchors each native teacher message, not only the group's first ID", () => {
		const messages = [
			teacher("msg_a", [{ type: "text", text: "First passage." }]),
			teacher("msg_b", [{ type: "thinking", thinking: "Noise" }, { type: "text", text: "Second passage." }]),
			teacher("msg_c", [{ type: "text", text: "Third passage." }]),
		];
		const view = projectView(messages);
		assert.equal(view.length, 1, "three native messages form one assistant group");
		assert.deepEqual([...firstSourceTextParts(view)], [
			["msg_a", "msg_a-t0"], ["msg_b", "msg_b-t0"], ["msg_c", "msg_c-t0"],
		]);
	});

	it("empty prose and tools do not steal the first non-empty prose anchor", () => {
		const view = projectView([teacher("msg_a", [
			{ type: "text", text: " \n " },
			{ type: "toolCall", id: "tool_a", name: "probe", arguments: {} },
			{ type: "text", text: "Actual source passage." },
			{ type: "text", text: "Later prose from the same message." },
		])]);
		assert.deepEqual([...firstSourceTextParts(view)], [["msg_a", "msg_a-t1"]]);
	});

	it("learner text and teacher messages without prose acquire no source anchor", () => {
		const view = projectView([
			{ id: "user_a", role: "user", content: "Learner text", timestamp: 1 } as LhMessage,
			teacher("msg_a", [{ type: "thinking", thinking: "Private reasoning" }]),
			teacher("msg_b", [{ type: "text", text: "\n\t" }]),
		]);
		assert.equal(firstSourceTextParts(view).size, 0);
	});

	it("reads the suffix only, preserving IDs containing hyphens or -t themselves", () => {
		assert.equal(textPartMessageId("msg_a-t12"), "msg_a");
		assert.equal(textPartMessageId("msg-a-t4-t12"), "msg-a-t4");
		for (const id of [undefined, "", "-t0", "msg_a-r0", "msg_a-twat"]) assert.equal(textPartMessageId(id), null);
	});
});
