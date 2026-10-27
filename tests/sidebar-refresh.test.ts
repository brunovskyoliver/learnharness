import assert from "node:assert/strict";
import test from "node:test";
import { createSidebarRefresh } from "../components/sidebar-refresh.ts";

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

test("invalidations during a read coalesce into a trailing read, including invalidation during that trailing read", async () => {
	const reads = [deferred(), deferred(), deferred()];
	let count = 0;
	const refresh = createSidebarRefresh(() => reads[count++]!.promise);
	const done = refresh();
	assert.equal(refresh(), done); assert.equal(refresh(), done); assert.equal(count, 1);
	reads[0]!.resolve(); await Promise.resolve();
	assert.equal(count, 2);
	assert.equal(refresh(), done);
	reads[1]!.resolve(); await Promise.resolve();
	assert.equal(count, 3);
	reads[2]!.resolve(); await done;
});

test("a rejected read releases the queue so the next request can retry", async () => {
	let count = 0;
	const refresh = createSidebarRefresh(async () => { if (++count === 1) throw new Error("offline"); });
	await assert.rejects(refresh(), /offline/);
	await refresh(); assert.equal(count, 2);
});
