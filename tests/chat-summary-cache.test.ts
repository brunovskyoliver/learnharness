import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { after, test } from "node:test";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lh-summary-cache-"));
process.env.LH_DATA_DIR = directory;
const { chatStore } = await import("../src/store/chats.ts");
const { PATHS, runAsTenant } = await import("../config.ts");
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("unchanged sidebar refreshes do not reread full transcripts", (t) => {
	const chat = chatStore.createChat("Cached session");
	const file = path.join(PATHS.chats, `${chat.id}.json`);
	const original = fs.readFileSync;
	let reads = 0;
	const reader = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
		if (String(args[0]) === file) reads++;
		return original(...args);
	});
	syncBuiltinESMExports();
	t.after(() => { reader.mock.restore(); syncBuiltinESMExports(); });
	assert.equal(chatStore.listChats().find((row) => row.id === chat.id)?.title, "Cached session");
	assert.equal(reads, 1);
	reads = 0;
	chatStore.listChats();
	chatStore.listChats();
	assert.equal(reads, 0, "warm list reads metadata rather than the full chat record");
});

test("writes invalidate summaries and callers cannot mutate cached settings", () => {
	const chat = chatStore.createChat("Before rename");
	chatStore.saveSettings(chat.id, { model: { provider: "test", id: "original" } });
	const first = chatStore.listChats().find((row) => row.id === chat.id)!;
	first.title = "Caller mutation";
	first.settings!.model!.id = "mutated";
	assert.equal(chatStore.listChats().find((row) => row.id === chat.id)?.settings?.model?.id, "original");
	chatStore.renameChat(chat.id, "After rename");
	assert.equal(chatStore.listChats().find((row) => row.id === chat.id)?.title, "After rename");
	chatStore.saveMessages(chat.id, [{ id: "message", role: "user", content: "Hello", timestamp: 1 }]);
	assert.equal(chatStore.listChats().find((row) => row.id === chat.id)?.messageCount, 1);
	assert.equal(chatStore.deleteChat(chat.id), true);
	assert.equal(chatStore.listChats().some((row) => row.id === chat.id), false);
});

test("a failed initial read can recover without a file change", (t) => {
	const chat = chatStore.createChat("Retry read");
	const file = path.join(PATHS.chats, `${chat.id}.json`);
	const original = fs.readFileSync;
	let fail = true;
	const reader = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
		if (String(args[0]) === file && fail) { fail = false; throw new Error("Transient read failure"); }
		return original(...args);
	});
	syncBuiltinESMExports();
	t.after(() => { reader.mock.restore(); syncBuiltinESMExports(); });
	assert.equal(chatStore.listChats().some((row) => row.id === chat.id), false);
	assert.equal(chatStore.listChats().find((row) => row.id === chat.id)?.title, "Retry read");
});

test("external edits and replacements refresh summaries even when size and mtime match", () => {
	const chat = chatStore.createChat("Title A");
	const file = path.join(PATHS.chats, `${chat.id}.json`);
	chatStore.listChats();
	const before = fs.statSync(file);
	const contents = fs.readFileSync(file, "utf8");
	fs.writeFileSync(file, contents.replace("Title A", "Title B"));
	fs.utimesSync(file, before.atime, before.mtime);
	assert.equal(chatStore.listChats().find((row) => row.id === chat.id)?.title, "Title B");
	const replacement = `${file}.replacement`;
	fs.writeFileSync(replacement, contents.replace("Title A", "Title C"));
	fs.utimesSync(replacement, before.atime, before.mtime);
	fs.renameSync(replacement, file);
	assert.equal(chatStore.listChats().find((row) => row.id === chat.id)?.title, "Title C");
	fs.unlinkSync(file);
	assert.equal(chatStore.listChats().some((row) => row.id === chat.id), false);
});

test("summaries stay tenant scoped and malformed or future records do not hide valid sessions", () => {
	for (const tenant of ["user_cache_a", "user_cache_b"]) {
		runAsTenant(tenant, () => {
			fs.mkdirSync(PATHS.chats, { recursive: true });
			const record = { id: "same_id", title: tenant, messages: [], createdAt: "2026-10-27", updatedAt: "2026-10-27" };
			fs.writeFileSync(path.join(PATHS.chats, "same_id.json"), JSON.stringify(record));
			fs.writeFileSync(path.join(PATHS.chats, "broken.json"), "{");
			fs.writeFileSync(path.join(PATHS.chats, "null.json"), "null");
			fs.writeFileSync(path.join(PATHS.chats, "invalid name.json"), JSON.stringify(record));
			fs.writeFileSync(path.join(PATHS.chats, "future.json"), JSON.stringify({ ...record, id: "future", version: 99999 }));
			assert.deepEqual(chatStore.listChats().map((row) => row.title), [tenant]);
		});
	}
	runAsTenant("user_cache_a", () => assert.equal(chatStore.listChats()[0]!.title, "user_cache_a"));
});
