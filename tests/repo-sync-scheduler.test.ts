/** Feature 026 (R9, FR-014/015, SC-010/011, T028): the pull schedule and later
 *  pulls, with a fake remote, a fake clock and timers ticked by hand. Local
 *  arms on the first window and never disarms; hosted pulls only while a
 *  window is open; "Sync now" joins a running pull; at most 2 pulls run per
 *  server, FIFO across tenants; an unchanged tip moves only the time; a
 *  failure or a limit keeps the last good mirror. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-repo-sched-")));
process.env.LH_DATA_DIR = dir;
const { runAsTenant } = await import("../config.ts");
const sync = await import("../src/server/repo-sync.ts");
const { libraryStore } = await import("../src/store/library.ts");
const { libraryTextIdle } = await import("../src/server/library-text.ts");
const { RepoRemoteError, REPO_MAX_FILES, REPO_SYNC_INTERVAL_MS } = await import("../src/core/repo-link.ts");
type RepoRemote = import("../src/core/ports.ts").RepoRemote;
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const enc = (text: string) => new TextEncoder().encode(text);
const oidOf = (text: string) => Buffer.from(text).toString("hex").padEnd(40, "0").slice(0, 40);

/** One repo per URL: its files, its commit, an optional failure and an optional gate on the snapshot. */
interface FakeRepo { files: Record<string, string>; commit: string; fail?: () => Error; gate?: Promise<void> }
const repos = new Map<string, FakeRepo>();
const calls = { tip: [] as string[], snapshot: [] as string[], active: 0, maxActive: 0 };
const fake: RepoRemote = {
	async tip(request) {
		calls.tip.push(request.url);
		const repo = repos.get(request.url)!;
		if (repo.fail) throw repo.fail();
		return { branch: request.branch ?? "main", commit: repo.commit };
	},
	async snapshot(request, visit) {
		calls.snapshot.push(request.url);
		calls.active++;
		calls.maxActive = Math.max(calls.maxActive, calls.active);
		try {
			const repo = repos.get(request.url)!;
			await repo.gate;
			for (const [p, text] of Object.entries(repo.files)) {
				await visit({ path: p, mode: "100644", oid: oidOf(text), type: "blob", read: async () => enc(text) });
			}
			return { branch: request.branch, commit: repo.commit };
		} finally {
			calls.active--;
		}
	},
};

let now = new Date("2026-11-08T10:00:00.000Z");
const advance = (ms: number) => { now = new Date(now.getTime() + ms); };
/** Timers ticked by hand. */
const ticking: { ms: number; run: () => void }[] = [];
const tick = () => { for (const t of [...ticking]) t.run(); };

let n = 0;
async function link(name: string, files: Record<string, string> = { "README.md": "# hi\n" }) {
	const url = `https://github.com/oliver/${name}`;
	repos.set(url, { files, commit: "a".repeat(40) });
	const outcome = await sync.linkRepo({ requestId: `req_${++n}`, url, display: `github.com/oliver/${name}`, repoBase: `github.com/oliver/${name}`, folderName: name, parentId: null });
	assert.ok(outcome.ok, JSON.stringify(outcome));
	// Text indexing of the new files runs in the background; let it land before comparing items.
	await libraryTextIdle();
	return { url, id: outcome.link.id, repo: repos.get(url)! };
}
const linkOf = async (id: string) => (await libraryStore.repoLinks()).find((l) => l.id === id)!;
const settled = async () => { await sync.repoSyncIdle(); await libraryTextIdle(); };
const gate = () => {
	let open!: () => void;
	const promise = new Promise<void>((resolve) => { open = resolve; });
	return { promise, open };
};
async function waitFor(check: () => boolean, label: string) {
	const until = Date.now() + 5000;
	while (!check() && Date.now() < until) await new Promise((r) => setTimeout(r, 5));
	assert.ok(check(), label);
}

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
	repos.clear();
	calls.tip = [];
	calls.snapshot = [];
	calls.maxActive = 0;
	ticking.length = 0;
	now = new Date("2026-11-08T10:00:00.000Z");
	sync.setRepoRemote(fake);
	sync.setRepoClock(() => now);
	sync.setRepoTimers({
		every(ms, run) {
			const entry = { ms, run };
			ticking.push(entry);
			return () => { ticking.splice(ticking.indexOf(entry), 1); };
		},
	});
});
afterEach(async () => {
	delete process.env.LH_HOSTED;
	await settled();
	sync.resetRepoSchedule();
	sync.setRepoRemote();
	sync.setRepoClock();
	sync.setRepoTimers();
});

describe("local and Electron schedule", () => {
	it("the first window pulls links older than 15 min, then every 15 min, and never disarms", async () => {
		const old = await link("old");
		advance(10 * 60_000);
		const recent = await link("recent");
		advance(6 * 60_000);
		calls.tip = [];
		const close = sync.openWindow();
		await settled();
		assert.deepEqual(calls.tip, [old.url], "only the link whose last attempt is over 15 min old");
		assert.equal(ticking.length, 1);
		assert.equal(ticking[0]!.ms, REPO_SYNC_INTERVAL_MS);

		// A second window shares the timer.
		const closeSecond = sync.openWindow();
		assert.equal(ticking.length, 1);
		close();
		closeSecond();
		calls.tip = [];
		advance(REPO_SYNC_INTERVAL_MS);
		tick();
		await settled();
		assert.deepEqual(calls.tip.sort(), [old.url, recent.url].sort(), "every link, with no window open");
		assert.equal(ticking.length, 1, "never disarms");
	});
});

describe("hosted schedule (SC-011)", () => {
	it("pulls once when the first window opens, every 15 min while open, and stops with the last window", async () => {
		process.env.LH_HOSTED = "1";
		await runAsTenant("user_sched", async () => {
			const a = await link("a");
			calls.tip = [];
			// No window: no timer and no pull, however long.
			advance(60 * 60_000);
			tick();
			await settled();
			assert.equal(calls.tip.length, 0);

			const close = sync.openWindow();
			const closeSecond = sync.openWindow();
			await settled();
			assert.deepEqual(calls.tip, [a.url], "once on open, not once per window");
			assert.equal(ticking.length, 1);
			advance(REPO_SYNC_INTERVAL_MS);
			tick();
			await settled();
			assert.equal(calls.tip.length, 2);

			// The last window closes while a pull runs: the pull finishes, the ticks stop.
			a.repo.commit = "b".repeat(40);
			a.repo.files = { "README.md": "# changed\n" };
			const held = gate();
			a.repo.gate = held.promise;
			tick();
			await waitFor(() => calls.snapshot.includes(a.url), "the pull reached the snapshot");
			close();
			assert.equal(ticking.length, 1, "one window still open");
			closeSecond();
			assert.equal(ticking.length, 0);
			held.open();
			await settled();
			assert.equal((await linkOf(a.id)).sync.commit, "b".repeat(40));
			assert.equal(await libraryStore.readText((await libraryStore.list()).find((i) => i.mirror)!), "# changed\n");
			sync.resetRepoSchedule();
		});
	});
});

describe("pulls", () => {
	it("Sync now during a pull joins it and starts nothing new (FR-015)", async () => {
		const a = await link("a");
		a.repo.commit = "b".repeat(40);
		const held = gate();
		a.repo.gate = held.promise;
		calls.tip = [];
		const first = sync.pullLink(a.id);
		const started = await first.started;
		assert.equal(started!.sync.state, "syncing");
		assert.equal((await linkOf(a.id)).sync.state, "syncing");
		const second = sync.pullLink(a.id);
		assert.equal(second, first);
		held.open();
		await first.done;
		assert.equal(calls.tip.length, 1);
		assert.equal((await linkOf(a.id)).sync.state, "synced");
		assert.equal(sync.pullLink("rpl_unknown") === sync.pullLink("rpl_unknown"), true);
		assert.equal(await sync.pullLink("rpl_nope").started, null);
	});

	it("at most 2 pulls per server across tenants; the third waits and they run in FIFO order", async () => {
		process.env.LH_HOSTED = "1";
		const users = ["user_p1", "user_p2", "user_p3", "user_p4"];
		const links = [];
		for (const user of users) links.push(await runAsTenant(user, () => link(user)));
		const gates = links.map((l) => {
			l.repo.commit = "b".repeat(40);
			const g = gate();
			l.repo.gate = g.promise;
			return g;
		});
		calls.snapshot = [];
		try {
			// One at a time, so the order they reach the pool is known.
			const pulls = [];
			for (const [i, l] of links.entries()) {
				pulls.push(runAsTenant(users[i]!, () => sync.pullLink(l.id)));
				if (i < 2) await waitFor(() => calls.snapshot.length === i + 1, `pull ${i + 1} running`);
				else await waitFor(() => sync.repoPoolState().waiting === i - 1, `pull ${i + 1} waiting`);
			}
			assert.deepEqual(sync.repoPoolState(), { active: 2, waiting: 2 });
			assert.deepEqual(calls.snapshot, [links[0]!.url, links[1]!.url]);
			gates[1]!.open();
			await waitFor(() => calls.snapshot.length === 3, "the third took the freed slot");
			assert.equal(calls.snapshot[2], links[2]!.url, "FIFO: the third queued runs before the fourth");
			for (const g of gates) g.open();
			await Promise.all(pulls.map((p) => p.done));
		} finally {
			for (const g of gates) g.open();
		}
		assert.equal(calls.maxActive, 2);
		assert.deepEqual(calls.snapshot, links.map((l) => l.url));
	});

	it("an unchanged tip moves only lastSuccessAt and changes no item (US2 #5)", async () => {
		const a = await link("a");
		const items = JSON.stringify(await libraryStore.list());
		const before = await linkOf(a.id);
		calls.snapshot = [];
		advance(15 * 60_000);
		await sync.pullLink(a.id).done;
		const afterLink = await linkOf(a.id);
		assert.equal(calls.snapshot.length, 0, "no fetch");
		assert.equal(JSON.stringify(await libraryStore.list()), items);
		assert.equal(afterLink.sync.state, "synced");
		assert.equal(afterLink.sync.lastSuccessAt, now.toISOString());
		assert.notEqual(afterLink.sync.lastSuccessAt, before.sync.lastSuccessAt);
		assert.equal(afterLink.sync.commit, before.sync.commit);
		assert.deepEqual(afterLink.sync.counts, before.sync.counts);
	});

	it("a changed tip updates the mirror, the commit and the time", async () => {
		const a = await link("a", { "README.md": "# hi\n", "week1/notes.md": "# w1\n" });
		a.repo.commit = "b".repeat(40);
		a.repo.files = { "README.md": "# hi\n", "week2/notes.md": "# w2\n" };
		advance(15 * 60_000);
		await sync.pullLink(a.id).done;
		const after = await linkOf(a.id);
		assert.equal(after.sync.commit, "b".repeat(40));
		assert.equal(after.sync.lastSuccessAt, now.toISOString());
		assert.deepEqual((await libraryStore.list()).map((i) => i.mirror!.path).sort(), ["README.md", "week2/notes.md"]);
	});

	it("a failure keeps the commit and the mirror and records why; the next good pull clears it", async () => {
		const a = await link("a");
		const items = JSON.stringify(await libraryStore.list());
		const before = await linkOf(a.id);
		a.repo.fail = () => new RepoRemoteError({ code: "auth", message: "The repo refused the token. Check that it can read this repo.", detail: "HTTP 401" });
		advance(15 * 60_000);
		await sync.pullLink(a.id).done;
		const failed = await linkOf(a.id);
		assert.equal(failed.sync.state, "failed");
		assert.equal(failed.sync.failure!.code, "auth");
		assert.equal(failed.sync.failure!.detail, "HTTP 401");
		assert.equal(failed.sync.commit, before.sync.commit);
		assert.equal(failed.sync.lastSuccessAt, before.sync.lastSuccessAt);
		assert.equal(failed.sync.lastAttemptAt, now.toISOString());
		assert.equal(JSON.stringify(await libraryStore.list()), items);
		delete a.repo.fail;
		await sync.pullLink(a.id).done;
		const back = await linkOf(a.id);
		assert.equal(back.sync.state, "synced");
		assert.equal(back.sync.failure, undefined);
	});

	it("a later pull over the file limit is refused with the overshoot and the mirror kept (SC-010)", async () => {
		const a = await link("a");
		const items = JSON.stringify(await libraryStore.list());
		a.repo.commit = "b".repeat(40);
		a.repo.files = Object.fromEntries(Array.from({ length: REPO_MAX_FILES + 3 }, (_, i) => [`n/${i}.md`, `# ${i}\n`]));
		await sync.pullLink(a.id).done;
		const failed = await linkOf(a.id);
		assert.equal(failed.sync.state, "failed");
		assert.equal(failed.sync.failure!.code, "limit-files");
		assert.equal(failed.sync.failure!.message, "The repo has 2,003 supported files, 3 over the 2,000 limit.");
		assert.deepEqual(failed.sync.failure!.limit, { kind: "files", limit: REPO_MAX_FILES, found: REPO_MAX_FILES + 3 });
		assert.equal(failed.sync.commit, "a".repeat(40));
		assert.equal(JSON.stringify(await libraryStore.list()), items);
		// Nothing staged is left behind.
		assert.equal(fs.readdirSync(path.join(dir, "files", ".mirrors", a.id)).length, 1);
	});
});
