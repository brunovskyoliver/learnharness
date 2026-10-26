import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const data = mkdtempSync(join(tmpdir(), "lh-session-metadata-"));
process.env.LH_DATA_DIR = data;
after(() => { rmSync(data, { recursive: true, force: true }); });

describe("session metadata transport", () => {
	it("serves settings/usage/coverage without including transcript content", async () => {
		const { GET } = await import("../app/api/chats/[id]/metadata/route.ts");
		const { createChat } = await import("../src/server/chats.ts");
		const { chatStore } = await import("../src/store/chats.ts");
		const chat = createChat("Metadata regression");
		chatStore.saveMessages(chat.id, [{ id: "message-1", role: "user", content: "private transcript ".repeat(10000), timestamp: 1 }]);
		const res = await GET(new Request("http://local/api"), { params: Promise.resolve({ id: chat.id }) });
		assert.equal(res.status, 200);
		const body = await res.text();
		assert.ok(body.length < 2000);
		assert.ok(!body.includes("private transcript"));
		assert.ok(!("messages" in JSON.parse(body)));
		assert.ok("coverage" in JSON.parse(body));
		assert.deepEqual(JSON.parse(body).turns, []);
		assert.equal((await GET(new Request("http://local/api"), { params: Promise.resolve({ id: "missing" }) })).status, 404);
	});
	it("coalesces concurrent reads but revalidates after settlement", async () => {
		const { readSessionMetadata } = await import("../components/session-metadata.ts");
		const original = globalThis.fetch;
		let requests = 0;
		globalThis.fetch = async () => { requests++; return Response.json({ turns: [] }); };
		try {
			const first = readSessionMetadata("one");
			assert.equal(readSessionMetadata("one"), first);
			await first;
			await readSessionMetadata("one");
			assert.equal(requests, 2);
		} finally { globalThis.fetch = original; }
	});
	it("fresh post-write reads bypass older in-flight requests", async () => {
		const { readSessionMetadata } = await import("../components/session-metadata.ts");
		const original = globalThis.fetch;
		const replies: Array<(response: Response) => void> = [];
		globalThis.fetch = () => new Promise((resolve) => replies.push(resolve));
		try {
			const old = readSessionMetadata("racing");
			const fresh = readSessionMetadata("racing", true);
			assert.notEqual(fresh, old);
			assert.equal(readSessionMetadata("racing"), fresh);
			replies[0]!(Response.json({ turns: [] }));
			await old;
			assert.equal(readSessionMetadata("racing"), fresh, "older completion cannot evict the current read");
			replies[1]!(Response.json({ turns: [] }));
			await fresh;
		} finally { globalThis.fetch = original; }
	});
});
