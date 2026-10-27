import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const data = mkdtempSync(join(tmpdir(), "lh-client-messages-"));
process.env.LH_DATA_DIR = data;
after(() => rmSync(data, { recursive: true, force: true }));

describe("clientMessages — provider signatures stay server-side (2026-10-27)", () => {
	it("strips replay signatures from page props and transcript GETs, not from the record", async () => {
		const { clientMessages, createChat } = await import("../src/server/chats.ts");
		const { chatStore } = await import("../src/store/chats.ts");
		const { GET } = await import("../app/api/chats/[id]/route.ts");
		const assistant = {
			id: "msg_a", role: "assistant", stopReason: "stop", timestamp: 0, provider: "openai", model: "m",
			content: [
				{ type: "thinking", thinking: "plan", thinkingSignature: "enc".repeat(100) },
				{ type: "text", text: "hello", textSignature: "sig" },
				{ type: "toolCall", id: "call_1", name: "quiz", arguments: {}, thoughtSignature: "t" },
			],
		};
		const user = { id: "msg_u", role: "user", content: "hi", timestamp: 0 };
		const out = clientMessages([user, assistant] as never);
		assert.equal(out[0], user, "untouched messages keep identity");
		assert.deepEqual((out[1] as typeof assistant).content, [
			{ type: "thinking", thinking: "plan" },
			{ type: "text", text: "hello" },
			{ type: "toolCall", id: "call_1", name: "quiz", arguments: {} },
		]);
		assert.equal(assistant.content[0]!.thinkingSignature, "enc".repeat(100), "input not mutated");

		const chat = createChat("t", undefined, { messages: [user, assistant] as never });
		const body = await (await GET(new Request("http://x"), { params: Promise.resolve({ id: chat.id }) })).json();
		assert.ok(!JSON.stringify(body.messages).includes("Signature"));
		assert.ok(JSON.stringify(chatStore.getChat(chat.id)!.messages).includes("thinkingSignature"));
	});
});
