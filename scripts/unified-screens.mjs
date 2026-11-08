/**
 * Whole-app screenshots for the unified redesign (feature 025): the same run
 * before and after, so the two sets compare shot for shot.
 *
 * Makes a throwaway data dir, seeds the UI review chats (scripts/seed-review.mjs)
 * and, through the app's own APIs, Library pages, a folder, a diagram, cards,
 * drafts, a held edit and a Notebook note with margin threads; starts its own
 * `next dev`; then, for each theme (Study dark/light, Notebook dark/light) and
 * viewport (1440x900, 390x844), captures every surface into
 *   OUT_DIR/<theme>-<width>/<NN-name>.png
 * and writes OUT_DIR/index.md (each shot, its route and steps, and a FAILED
 * section). A failing step is logged and the run moves to the next shot.
 *
 * Steps find things by route, role and visible text first, with test ids only
 * as a fallback, so the run survives markup changes.
 *
 * Run: node scripts/unified-screens.mjs
 *   OUT_DIR      output (default ~/agent-runs/2026-11-07-unified-redesign/before)
 *   CHROME_PATH  browser (default: the repo's chrome-headless-shell)
 *   PORT         dev server port (default: a free one)
 *   ONLY         comma list of combos (study-dark-1440,...) to run
 *   SHOTS        comma list of shot-name substrings to run
 *   KEEP_DATA=1  keep the data dir
 *   RETRIES      retries per failed shot (default 1)
 *   DEBUG=1      log each step
 *   HOLD=1       seed, start the server, print its URL and wait (for probing)
 *   SERVER=start `next start` on an existing `next build` instead of `next dev`
 *                (an 8 GB machine thrashes under dev compiles)
 * Stop any other `next dev` in this checkout first (Next allows one per dir).
 *
 * Themes: Study combos write the shared appearance (notebook.appearance, feature
 * 025) and the old Study appearance.mode too, so the same script runs against
 * the tree before 025 (whichever section the tree lacks is refused and ignored).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HOME = os.homedir();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(process.env.OUT_DIR ?? path.join(HOME, "agent-runs/2026-11-07-unified-redesign/before"));
const CHROME = process.env.CHROME_PATH ?? path.join(HOME, ".t3/tools/chrome-headless-shell/linux64/156.0.8078.70/chrome-headless-shell");
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const SHOTS = process.env.SHOTS ? process.env.SHOTS.split(",") : null;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const snapCommon = path.join(HOME, "snap", "chromium", "common");
const tmpRoot = process.env.PW_TMPDIR ?? (existsSync(snapCommon) ? snapCommon : os.tmpdir());
mkdirSync(tmpRoot, { recursive: true });
process.env.TMPDIR = tmpRoot;
const DATA = mkdtempSync(path.join(tmpRoot, "lh-screens-"));
const ENV = {
	...process.env,
	LH_DATA_DIR: DATA,
	LH_AUTH_FILE: path.join(DATA, "auth.json"),
	LH_HOSTED: "0",
	LH_IGNORE_ENV_KEYS: "1",
	NEXT_TELEMETRY_DISABLED: "1",
	TMPDIR: tmpRoot,
};

// ─── dev server ─────────────────────────────────────────────────────────────

/** Another `next dev` from this checkout holds the project lock: report it, never kill it. */
function otherDevServer() {
	for (const pid of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
		try {
			const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
			// A `next dev` (node …/next dev, npx next dev) or its next-server child; never a shell that merely mentions one.
			const isNext = args[0]?.startsWith("next-server") || (args.includes("dev") && args.some((a) => /(^|\/)next$/.test(a) || /next\/dist\/bin\/next$/.test(a)));
			if (!isNext) continue;
			const cmd = args.join(" ");
			const cwd = execFileSync("readlink", [`/proc/${pid}/cwd`], { encoding: "utf8" }).trim();
			if (cwd === ROOT) return `${pid} ${cmd.trim()}`;
		} catch { /* gone or not ours */ }
	}
	return null;
}

const freePort = () => new Promise((resolve, reject) => {
	const probe = net.createServer();
	probe.once("error", reject);
	probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

let server;
let serverLog = "";
let BASE;
async function startServer() {
	const port = Number(process.env.PORT) || await freePort();
	BASE = `http://127.0.0.1:${port}`;
	const mode = process.env.SERVER === "start" ? "start" : "dev";
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", mode, "-p", String(port), "-H", "127.0.0.1"], {
		cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true, env: ENV,
	});
	server.stdout.on("data", (chunk) => { serverLog = (serverLog + chunk).slice(-20000); });
	server.stderr.on("data", (chunk) => { serverLog = (serverLog + chunk).slice(-20000); });
	let exited = false;
	server.once("exit", () => { exited = true; });
	for (let i = 0; i < 480; i++) {
		if (exited) throw new Error(`next dev exited:\n${serverLog.slice(-2000)}`);
		try { if ((await fetch(`${BASE}/api/settings`)).ok) return; } catch { /* not up yet */ }
		await pause(500);
	}
	throw new Error(`next dev did not answer on ${BASE}:\n${serverLog.slice(-2000)}`);
}
function stopServer() {
	if (server?.pid) try { process.kill(-server.pid, "SIGTERM"); } catch { /* gone */ }
}

// ─── seeding ────────────────────────────────────────────────────────────────

async function api(url, method = "GET", body) {
	const response = await fetch(`${BASE}${url}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
	const text = await response.text();
	if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${text.slice(0, 300)}`);
	return text ? JSON.parse(text) : null;
}
const seedNotes = [];
async function trySeed(label, run) {
	try { await run(); seedNotes.push(`- ${label}: ok`); } catch (error) { seedNotes.push(`- ${label}: FAILED ${error.message}`); console.log(`seed ${label} failed: ${error.message}`); }
}

const RICH_PAGE = `# Gradient descent notes

A short page with every block the editor knows. See [[Linear algebra basics]] for the background.

## The update rule

Each step moves against the gradient:

$$\\theta_{t+1} = \\theta_t - \\eta \\nabla L(\\theta_t)$$

Inline math works too: $\\eta \\approx 0.1$ is a common start.

> [!note] Why the minus sign
> The gradient points uphill, so we step the other way.

## Learning rates compared

| Rate | Behaviour | Steps to converge |
| --- | --- | --- |
| 0.01 | slow and steady | 400 |
| 0.1 | quick | 40 |
| 1.0 | diverges | never |

## To do

- [x] Derive the update rule
- [ ] Try momentum
- [ ] Compare with Adam

Plain closing paragraph so there is something to select.
`;

const AT = "2026-11-06T10:00:00.000Z";
let seq = 0;
const thread = (id, quote, side, texts) => ({
	id, anchor: { quote, prefix: "", suffix: "" }, placement: "margin", side, status: "open", origin: "read", createdAt: AT, updatedAt: AT,
	messages: texts.map((text, i) => ({ id: `msg_seed${seq++}`, author: i % 2 ? "user" : "ai", text, at: AT })),
});
const ids = {};

async function seed() {
	execFileSync(process.execPath, ["scripts/seed-review.mjs"], { cwd: ROOT, env: ENV, stdio: "inherit" });
	seedNotes.push("- UI review chats (scripts/seed-review.mjs): ok");
	// A real knowledge graph for Home (the checked-in golden ledgers, copied, never edited).
	const golden = path.join(ROOT, "tests/fixtures/golden-data/graph");
	if (existsSync(golden)) {
		mkdirSync(path.join(DATA, "graph"), { recursive: true });
		for (const file of readdirSync(golden)) writeFileSync(path.join(DATA, "graph", file), readFileSync(path.join(golden, file)));
		seedNotes.push("- knowledge graph (tests/fixtures/golden-data/graph): ok");
	} else seedNotes.push("- knowledge graph: FAILED golden graph fixture missing");
	// Drafts live in cards.json before the server reads it (as scripts/check-review-ui.mjs does).
	mkdirSync(path.join(DATA, "cards"), { recursive: true });
	const draft = (id, front) => ({ id, front, back: `${front} back`, source: null, conceptIds: [], status: "draft", schedule: null, suspended: false, contentHash: id, lastReviewId: null, runId: "run_seed", createdAt: AT, updatedAt: AT });
	writeFileSync(path.join(DATA, "cards", "cards.json"), JSON.stringify({ version: 1, runs: [{ id: "run_seed", label: "Gradient descent notes", status: "done", truncated: false, drafts: 2, createdAt: AT, updatedAt: AT }], cards: [draft("card_draft_a", "What does the learning rate control?"), draft("card_draft_b", "Why does a large step diverge?")] }));
	seedNotes.push("- 2 card drafts (cards.json): ok");
}

async function seedApi() {
	await trySeed("folder", async () => { ids.folder = (await api("/api/library/folders", "POST", { name: "Optimization" })).folder?.id; if (!ids.folder) throw new Error("no folder id"); });
	await trySeed("pages", async () => {
		ids.basics = (await api("/api/library/pages", "POST", { name: "Linear algebra basics", content: "# Linear algebra basics\n\nVectors, matrices and the dot product.\n" })).item.id;
		ids.rich = (await api("/api/library/pages", "POST", { name: "Gradient descent notes", content: RICH_PAGE })).item.id;
		ids.inFolder = (await api("/api/library/pages", "POST", { name: "Momentum", content: "# Momentum\n\nA running average of past gradients.\n", folderId: ids.folder ?? null })).item.id;
		ids.trashed = (await api("/api/library/pages", "POST", { name: "Old scratch page", content: "Nothing to keep.\n" })).item.id;
		await api("/api/library/trash", "POST", { itemId: ids.trashed });
		// A second version so History has two rows.
		const read = await api(`/api/library/pages/${ids.rich}`);
		await api(`/api/library/pages/${ids.rich}/versions`, "POST", { base: read.head?.n ?? 1, rev: read.draft?.rev ?? 0, content: `${RICH_PAGE}\nOne more line added later.\n` })
			.catch((error) => seedNotes.push(`- second version: FAILED ${error.message}`));
	});
	await trySeed("diagram", async () => { ids.diagram = (await api("/api/library/diagrams", "POST", { name: "Optimizer map", form: "concept-map", folderId: null })).item?.id; });
	await trySeed("cards", async () => {
		await api("/api/cards", "POST", { front: "What is the gradient descent update rule?", back: "$\\theta \\leftarrow \\theta - \\eta \\nabla L$" });
		await api("/api/cards", "POST", { front: "What does momentum add?", back: "A running average of past gradients." });
	});
	await trySeed("held edit", async () => {
		const page = await api(`/api/library/pages/${ids.basics}`);
		const head = page.head ?? page.page?.head ?? page;
		const n = head.n ?? head.version ?? 1, content = head.content;
		if (typeof content !== "string") throw new Error(`no head content in ${JSON.stringify(page).slice(0, 200)}`);
		const dir = path.join(DATA, "library", "page-proposals", ids.basics);
		mkdirSync(dir, { recursive: true });
		const id = "pgp_seedheld";
		writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, pageId: ids.basics, name: "Linear algebra basics", baseVersion: n, baseText: content, text: `${content}\nThe dot product measures how aligned two vectors are.\n`, status: "pending", createdAt: AT }));
	});
	await trySeed("notebook note", async () => {
		ids.note = (await api("/api/library/pages", "POST", { name: "Why gradient descent works", content: "The gradient points in the direction of steepest ascent, so stepping against it lowers the loss.\n\nA learning rate that is too large overshoots the minimum.\n" })).item.id;
		const dir = path.join(DATA, "library", "notebook");
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, `${ids.note}.json`), JSON.stringify({
			v: 1, pageId: ids.note, mode: "thinks", instruction: "", chat: [],
			threads: [
				thread("thr_seed_a", "stepping against it lowers the loss", "left", [
					"Only locally. What happens on a saddle point, where the gradient is zero but you are not at a minimum?",
					"I guess it just stops there?",
					"It stalls, yes. That is one reason momentum helps.",
				]),
				thread("thr_seed_b", "A learning rate that is too large overshoots the minimum.", "right", ["How would you notice that from the loss curve alone?"]),
			],
		}, null, 2));
	});
}


// ─── themes and viewports ───────────────────────────────────────────────────

async function writeSection(section, patch) {
	const record = (await api("/api/settings")).settings ?? {};
	const current = record[section] && typeof record[section] === "object" ? record[section] : {};
	await api(`/api/settings/${section}`, "PUT", { ...current, ...patch });
}
/** Study's theme: the shared appearance (025) and the old appearance.mode (before 025); a section the tree lacks is skipped. */
async function studyTheme(mode) {
	await writeSection("general", { interface: "study" });
	const wrote = [];
	for (const [section, patch] of [["notebook", { appearance: mode }], ["appearance", { mode }]]) {
		try { await writeSection(section, patch); wrote.push(section); } catch { /* not in this tree */ }
	}
	if (!wrote.length) throw new Error(`no appearance section took ${mode}`);
}
const THEMES = [
	{ name: "study-dark", apply: () => studyTheme("dark") },
	{ name: "study-light", apply: () => studyTheme("light") },
	{ name: "notebook-dark", apply: async () => { await writeSection("general", { interface: "notebook" }); await writeSection("notebook", { appearance: "dark" }); } },
	{ name: "notebook-light", apply: async () => { await writeSection("general", { interface: "notebook" }); await writeSection("notebook", { appearance: "light" }); } },
];
const VIEWPORTS = [
	{ width: 1440, height: 900, phone: false },
	{ width: 390, height: 844, phone: true },
];

// ─── step helpers (roles and visible text first, test ids last) ─────────────

/** The first candidate that becomes visible, as a locator. */
async function pick(page, candidates, what, timeout = 12_000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		for (const make of candidates) {
			const all = make(page);
			const count = await all.count().catch(() => 0);
			for (let i = 0; i < count; i++) {
				const one = all.nth(i);
				if (await one.isVisible().catch(() => false)) return one;
			}
		}
		await page.waitForTimeout(250);
	}
	throw new Error(`not found: ${what}`);
}
const byRole = (role, name, extra = {}) => (page) => page.getByRole(role, { name, ...extra });
const byText = (text) => (page) => page.getByText(text);
const byTest = (id) => (page) => page.getByTestId(id);
/** Click the first visible candidate; if something covers it, scroll it in and force the click. */
async function click(page, candidates, what, opts = {}) {
	const target = await pick(page, candidates, what);
	try {
		await target.click({ timeout: 8000, ...opts });
	} catch {
		await target.scrollIntoViewIfNeeded().catch(() => {});
		await target.click({ timeout: 8000, force: true, ...opts });
	}
	return target;
}

async function settle(page, ms = 400) {
	await page.evaluate(() => document.fonts.ready).catch(() => {});
	await page.waitForTimeout(ms);
}
async function go(page, route, { wait = 1500, notes = [] } = {}) {
	await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
	// Something rendered: a main landmark, a dialog, or any visible text.
	await page.waitForFunction(() => document.querySelector("main, [role=main], [role=dialog]") || (document.body?.innerText ?? "").trim().length > 0, null, { timeout: 60_000 });
	// Past any loading skeleton the route shows first.
	await page.waitForFunction(() => !document.querySelector('[role="status"][aria-label^="Loading"]'), null, { timeout: 30_000 }).catch(() => {});
	await settle(page, wait);
	// Some sessions open the model setup dialog on arrival (no key configured); close it so the session shows.
	if (route.startsWith("/chat/")) {
		const setup = page.getByRole("dialog", { name: /set up/i });
		if (await setup.isVisible().catch(() => false)) {
			await page.keyboard.press("Escape");
			await setup.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
			notes.push("the setup dialog opened on arrival; closed with Escape");
			await settle(page);
		}
	}
}
/** Scroll the transcript (or whatever scrolls) to its top. */
const scrollTranscriptTop = (page) => page.evaluate(() => {
	for (const el of document.querySelectorAll("[role=log], main *")) {
		if (el.scrollHeight > el.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { el.scrollTop = 0; return true; }
	}
	return false;
});
async function openSidebarOnPhone(page, phone) {
	// Before 025 the desktop sidebar was a column; since 025 it is an overlay at every width behind ☰.
	if (!phone) {
		const opener = page.getByRole("button", { name: "Open sidebar", exact: true }).filter({ visible: true });
		const open = await page.getByTestId("nb-sidebar").filter({ visible: true }).count();
		if (open || !(await opener.count())) return;
	}
	await click(page, [byRole("button", "Open sidebar"), byRole("button", /open (the )?(sidebar|menu|notes)/i)], "the sidebar opener");
	await settle(page);
}
async function openSettings(page, phone) {
	await openSidebarOnPhone(page, phone);
	await click(page, [byTest("settings-entry"), byRole("button", "Settings", { exact: true }), byRole("button", /^settings$/i), byRole("menuitem", /settings/i)], "Settings");
	await pick(page, [byRole("dialog", /settings/i), byRole("dialog")], "the Settings dialog");
	await settle(page);
}
async function openLibraryPage(page, name) {
	await click(page, [byRole("button", `Open ${name}`), byRole("link", `Open ${name}`), byRole("link", name), byText(name)], `Library item ${name}`);
	await pick(page, [byRole("complementary", new RegExp(name)), byRole("textbox", new RegExp(`Page ${name}`)), byRole("dialog", new RegExp(name))], `the open page ${name}`, 30_000);
	await settle(page, 1200);
}
/** The pending check: since 025 a thread beside the lesson (reveal or Go to it), before it the prompt bar's Your turn. */
async function openPendingCheck(page) {
	await click(page, [byTest("teach-check-reveal"), byTest("check-go-to"), byRole("button", /^your turn/i), byRole("button", /^answer$/i)], "the pending check");
	await page.getByTestId("check-thread").filter({ visible: true }).first().waitFor({ timeout: 3000 }).catch(() => {});
}
/** A throwaway copy of the rich page for shots that type into the editor, so no draft leaks into later shots. */
const SCRATCH = "Editing sample";
let scratchId = null;
async function makeScratch() {
	scratchId = (await api("/api/library/pages", "POST", { name: SCRATCH, content: RICH_PAGE })).item.id;
}
async function dropScratch() {
	if (!scratchId) return;
	const id = scratchId;
	scratchId = null;
	await api(`/api/library/items/${id}`, "DELETE");
}
const pageEditor = (name) => [byRole("textbox", new RegExp(`^Page ${name}`)), byRole("textbox", new RegExp(name)), (page) => page.locator("[contenteditable=true]")];

// ─── the shots ──────────────────────────────────────────────────────────────

/** name, route, steps (for index.md), run(page, env) → after it, a viewport shot (plus fullPage when `full`). */
const SHOTS_LIST = [
	{ name: "home-top", route: "/", steps: "open Home", full: true },
	{ name: "home-waiting", route: "/", steps: "scroll to Waiting for you", run: async (page) => { await (await pick(page, [byRole("region", /waiting/i), byRole("heading", /waiting/i)], "Waiting for you")).scrollIntoViewIfNeeded(); } },
	{ name: "home-calibration", route: "/", steps: "scroll to Calibration", run: async (page) => { await (await pick(page, [byRole("region", /calibration/i), byRole("heading", /calibration/i)], "Calibration")).scrollIntoViewIfNeeded(); } },
	{ name: "home-graph", route: "/", steps: "scroll to Knowledge graph", run: async (page) => { await (await pick(page, [byRole("region", /knowledge graph/i), byRole("heading", /knowledge graph/i)], "Knowledge graph")).scrollIntoViewIfNeeded(); await settle(page, 2500); } },
	{ name: "home-graph-expanded", route: "/", steps: "Knowledge graph → Expand", run: async (page) => { await click(page, [byRole("button", /^expand/i)], "Expand"); await settle(page, 2500); } },
	{ name: "sidebar-open", route: "/chat/review-gradient-descent", steps: "open a lesson; on phones tap Open sidebar", run: async (page, { phone }) => { await openSidebarOnPhone(page, phone); } },
	{ name: "session-filter", route: "/library", steps: "sidebar → Filter sessions (from /library: / is the note in Notebook mode)", run: async (page, { phone }) => { await openSidebarOnPhone(page, phone); await click(page, [byRole("button", /filter/i)], "Filter sessions"); } },
	{ name: "new-menu", route: "/library", steps: "sidebar → New (from /library)", run: async (page, { phone }) => { await openSidebarOnPhone(page, phone); await click(page, [byRole("button", "New", { exact: true }), byRole("button", /^new( session)?$/i)], "New"); } },
	{ name: "tabs-row", route: "/chat/review-gradient-descent", steps: "open Gradient descent, then Knowledge check and Practice history from the sidebar", run: async (page, { phone }) => {
		for (const title of [/Knowledge check/, /Practice history/]) {
			await openSidebarOnPhone(page, phone);
			await click(page, [byRole("link", title)], `session ${title}`);
			await page.waitForURL(/\/chat\//);
			await settle(page, 2000);
		}
	} },
	{ name: "palette-empty", route: "/", steps: "Ctrl+K (or Command palette)", run: async (page) => {
		await page.keyboard.press("ControlOrMeta+k");
		await pick(page, [byRole("dialog"), byRole("combobox", /command|search/i), byTest("command-palette-input")], "the palette", 3000).catch(async () => {
			await click(page, [byRole("button", /command palette/i)], "Command palette");
		});
	} },
	{ name: "palette-query", route: "/", steps: "Ctrl+K, type \"grad\"", run: async (page) => {
		await page.keyboard.press("ControlOrMeta+k");
		await pick(page, [byRole("dialog")], "the palette", 3000).catch(() => click(page, [byRole("button", /command palette/i)], "Command palette"));
		await page.waitForTimeout(400);
		await page.keyboard.type("grad", { delay: 30 });
		await settle(page, 800);
	} },
	{ name: "lesson-gradient-demo", route: "/chat/review-gradient-descent", steps: "open the gradient lesson; the demo opens in the right pane", run: async (page) => {
		await page.waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => f.getBoundingClientRect().width > 200), null, { timeout: 20_000 }).catch(() => {});
		await settle(page, 4000);
	} },
	{ name: "lesson-belief-bottom", route: "/chat/review-belief-check", steps: "open Knowledge check (opens at the bottom: answered checks, pending check)", run: async (page) => { await settle(page, 1500); } },
	{ name: "lesson-belief-top", route: "/chat/review-belief-check", steps: "scroll the transcript to the top (prose, plan, math)", run: async (page) => { if (!(await scrollTranscriptTop(page))) throw new Error("no scrolling transcript"); await settle(page, 1200); } },
	{ name: "lesson-belief-math", route: "/chat/review-belief-check", steps: "scroll to the first block of display or inline math", run: async (page) => { await (await pick(page, [(p) => p.locator("[role=log] math, [role=log] .katex")], "math")).scrollIntoViewIfNeeded(); await settle(page, 800); } },
	{ name: "lesson-plan", route: "/chat/review-belief-check", steps: "Open the full plan", run: async (page) => { await click(page, [byRole("button", /plan/i)], "the plan"); await settle(page, 800); } },
	{ name: "check-answered", route: "/chat/review-belief-check", steps: "scroll to an answered check (\"Question correct\")", run: async (page) => { await (await pick(page, [byText(/Question\s*correct/), byText(/^Question$/)], "an answered check")).scrollIntoViewIfNeeded(); await settle(page, 800); } },
	{ name: "check-pending-expanded", route: "/chat/review-belief-check", steps: "open the pending check (025: Check your understanding opens its thread; before: prompt bar → Your turn)", run: async (page) => { await openPendingCheck(page); await settle(page, 800); } },
	{ name: "check-pending-chosen", route: "/chat/review-belief-check", steps: "open the pending check → choose the first option, then Fairly sure", run: async (page) => {
		await openPendingCheck(page);
		await click(page, [(p) => p.getByTestId("check-thread").locator('[data-kbdrow="0"]'), (p) => p.getByRole("radiogroup").first().getByRole("radio")], "a choice");
		await click(page, [(p) => p.getByRole("radio", { name: "Fairly sure" })], "Fairly sure").catch(() => {});
		await settle(page, 800);
	} },
	{ name: "prompt-compact", route: "/chat/review-ml-panels", steps: "open ML panels (prompt bar idle)", run: async (page) => { await pick(page, [byRole("combobox", /./), byRole("textbox", /message|ask|reply|thinking/i)], "the prompt"); } },
	{ name: "prompt-expanded", route: "/chat/review-ml-panels", steps: "focus the prompt and type a long multi-line message", run: async (page) => {
		const box = await pick(page, [byRole("combobox", /./), byRole("textbox", /message|ask|reply|thinking/i)], "the prompt");
		await box.click();
		await page.keyboard.type("Why does the loss surface look like a bowl here?", { delay: 5 });
		for (let i = 0; i < 4; i++) { await page.keyboard.press("Shift+Enter"); await page.keyboard.type(`Line ${i + 2} of a longer question.`, { delay: 2 }); }
		await settle(page);
	} },
	{ name: "practice-active", route: "/chat/review-practice", steps: "open Active practice", run: async (page) => { await settle(page, 1200); } },
	{ name: "practice-active-problem", route: "/chat/review-practice", steps: "open the active problem (025: Go to it; before: prompt bar → Your turn / Solve)", run: async (page) => { await click(page, [byTest("check-go-to"), byRole("button", /^your turn/i), byRole("button", /^(solve|answer)$/i)], "the problem"); await settle(page, 800); } },
	{ name: "practice-history", route: "/chat/review-practice-history", steps: "open Practice history", run: async (page) => { await settle(page, 1200); } },
	{ name: "practice-history-top", route: "/chat/review-practice-history", steps: "scroll the transcript to the top", run: async (page) => { await scrollTranscriptTop(page); await settle(page, 1000); } },
	{ name: "ml-panels", route: "/chat/review-ml-panels", steps: "open ML panels", run: async (page) => { await settle(page, 3000); } },
	{ name: "ml-panels-top", route: "/chat/review-ml-panels", steps: "scroll the transcript to the top", run: async (page) => { await scrollTranscriptTop(page); await settle(page, 3000); } },
	{ name: "ml-lookups", route: "/chat/review-ml-lookups", steps: "open ML lookups (tool rows)", run: async (page) => { await settle(page, 1500); } },
	{ name: "ml-lookups-expanded", route: "/chat/review-ml-lookups", steps: "expand the first collapsed tool row", run: async (page) => {
		const row = await pick(page, [(p) => p.getByRole("button", { name: /^(hub_search|hub_model|paper_search|paper_read|tokenize)\b/i }), (p) => p.getByText(/^(hub_search|hub_model|paper_search)$/), (p) => p.locator("[role=log] [aria-expanded=false]")], "a collapsed tool row");
		await row.scrollIntoViewIfNeeded();
		await row.click();
		await settle(page, 800);
	} },
	{ name: "math-check-rows", route: "/chat/review-ml-lookups", steps: "scroll to a Wolfram math check row (if any in the seed)", run: async (page) => { await (await pick(page, [byText(/Wolfram ·/)], "a math check row (none in the UI review seed)", 5000)).scrollIntoViewIfNeeded(); } },
	{ name: "thinking-block", route: "/chat/review-belief-check", steps: "expand the last Agent’s thinking", run: async (page) => {
		const all = page.getByRole("button", { name: /thinking/i });
		const n = await all.count();
		if (!n) throw new Error("no thinking block");
		const last = all.nth(n - 1);
		await last.scrollIntoViewIfNeeded();
		await last.click();
		await settle(page, 800);
	} },
	{ name: "phase-heads", route: "/chat/review-gradient-descent", steps: "scroll to the Teaching phase head", run: async (page) => { await (await pick(page, [byText(/^Teaching$/), byText(/^Planning$/)], "a phase head")).scrollIntoViewIfNeeded(); await settle(page, 800); } },
	{ name: "right-pane-context", route: "/chat/review-belief-check", steps: "Show right pane", run: async (page) => { await click(page, [byRole("button", /show right pane/i), byRole("button", /right pane|context/i)], "Show right pane"); await settle(page, 1200); } },
	{ name: "library-list", route: "/library", steps: "open Library (list view)", full: true, run: async (page) => { await click(page, [byRole("button", /^list view$/i)], "List view").catch(() => {}); await settle(page); } },
	{ name: "library-grid", route: "/library", steps: "Library → Grid view", full: true, run: async (page) => { await click(page, [byRole("button", /^grid view$/i), byTest("library-grid")], "Grid view"); await settle(page); } },
	{ name: "library-folder", route: "/library", steps: "Library → open folder Optimization", run: async (page) => { await click(page, [byRole("link", /Optimization/), byText("Optimization")], "folder Optimization"); await page.waitForURL(/folder=/).catch(() => {}); await settle(page, 1000); } },
	{ name: "library-trash", route: "/library?view=trash", steps: "Library → Trash", run: async (page) => { await pick(page, [byText("Old scratch page")], "the trashed page"); } },
	{ name: "library-held-edit", route: "/library", steps: "Library: the held-edit line (Changes the tutor proposed)", run: async (page) => { await (await pick(page, [byRole("region", /proposed|change/i), byText(/proposed by the tutor/i)], "the held-edit line")).scrollIntoViewIfNeeded(); } },
	{ name: "held-edit-dialog", route: "/library", steps: "held-edit line → Review", run: async (page) => { await click(page, [byRole("button", /review the change/i), (p) => p.getByRole("region", { name: /proposed/i }).getByRole("button")], "Review the change"); await pick(page, [byRole("dialog")], "the change dialog"); await settle(page, 800); } },
	{ name: "page-editor", route: "/library", steps: "Library → open Gradient descent notes (editor in the pane, toolbar)", run: async (page) => { await openLibraryPage(page, "Gradient descent notes"); } },
	{ name: "page-slash-menu", route: null, steps: `a fresh copy of the rich page ("${SCRATCH}", removed after), open it, caret at the end of the last paragraph, Enter, type /`, cleanup: dropScratch, run: async (page) => {
		await makeScratch();
		await go(page, "/library");
		await openLibraryPage(page, SCRATCH);
		const editor = await pick(page, pageEditor(SCRATCH), "the editor");
		// The caret at the end of the last top-level paragraph, then a new empty line.
		await editor.evaluate((el) => {
			const paragraphs = el.querySelectorAll(":scope > p");
			const last = paragraphs[paragraphs.length - 1] ?? el.lastElementChild;
			last.scrollIntoView({ block: "start" });
			el.focus();
			const range = document.createRange();
			range.selectNodeContents(last);
			range.collapse(false);
			const selection = getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		});
		await page.waitForTimeout(300);
		await page.keyboard.press("End");
		await page.keyboard.press("Enter");
		await page.keyboard.type("/");
		await pick(page, [byRole("listbox"), byRole("menu"), (p) => p.locator("[role=option]")], "the slash menu", 5000);
		await settle(page);
	} },
	{ name: "page-selection-bubble", route: null, steps: `a fresh copy of the rich page, double-click the word "gradient" in a paragraph`, cleanup: dropScratch, run: async (page) => {
		await makeScratch();
		await go(page, "/library");
		await openLibraryPage(page, SCRATCH);
		const editor = await pick(page, pageEditor(SCRATCH), "the editor");
		await editor.getByText(/Each step moves against the gradient/).first().dblclick();
		await pick(page, [byRole("toolbar", /selection/i), byTest("page-bubble")], "the selection bubble", 5000);
		await settle(page);
	} },
	{ name: "page-history", route: "/library", steps: "open the page → History (versions and changes)", run: async (page) => { await openLibraryPage(page, "Gradient descent notes"); await click(page, [byRole("button", /^history$/i)], "History"); await pick(page, [byRole("dialog", /history|version/i), byText(/^Version \d/)], "the page history"); await settle(page, 1000); } },
	{ name: "page-links", route: "/library", steps: "open the page → Links", run: async (page) => { await openLibraryPage(page, "Gradient descent notes"); await click(page, [byRole("button", /^links$/i)], "Links"); await settle(page, 1200); } },
	{ name: "page-held-edit", route: "/library", steps: "open Linear algebra basics (its held-edit line in the pane)", run: async (page) => { await openLibraryPage(page, "Linear algebra basics"); } },
	{ name: "diagram-open", route: "/library", steps: "Library → open Optimizer map", run: async (page) => { await click(page, [byRole("button", "Open Optimizer map"), byText("Optimizer map")], "Optimizer map"); await settle(page, 3000); } },
	{ name: "review-queue", route: "/review", steps: "open Review (due queue, front)", run: async (page) => { await pick(page, [byRole("button", /show answer/i)], "Show answer"); } },
	{ name: "review-answer", route: "/review", steps: "Review → Show answer", run: async (page) => { await click(page, [byRole("button", /show answer/i)], "Show answer"); await settle(page, 800); } },
	{ name: "review-all-cards", route: "/review?view=cards", steps: "Review → All cards", run: async (page) => { await pick(page, [byText(/gradient descent update rule/i)], "a card row"); } },
	{ name: "review-drafts", route: "/review?view=drafts", steps: "Review → Drafts", run: async (page) => { await pick(page, [byText(/learning rate control/i)], "a draft"); } },
	{ name: "card-editor", route: "/review", steps: "Review → New card", run: async (page) => { await click(page, [byRole("button", /new card/i)], "New card"); await pick(page, [byRole("dialog")], "the card editor"); await settle(page); } },
	{ name: "empty-review", route: "/review?view=deleted", steps: "Review → Deleted (empty)", run: async (page) => { await settle(page, 800); } },
	{ name: "empty-library-search", route: "/library", steps: "Library search \"zzzz-no-match\"", run: async (page) => { const box = await pick(page, [byRole("searchbox", /library/i), byRole("searchbox")], "Library search"); await box.fill("zzzz-no-match"); await pick(page, [byText(/nothing matched|no match/i)], "the empty result"); await settle(page); } },
	...["Customize", "Reviewers", "Providers", "Agent", "Graph", "Keyboard", "General"].map((category) => ({
		name: `settings-${category.toLowerCase()}`, route: "/library", steps: `sidebar → Settings → ${category} (from /library)`, run: async (page, { phone }) => {
			await openSettings(page, phone);
			const dialog = page.getByRole("dialog").last();
			await click(page, [() => dialog.getByRole("button", { name: category, exact: true }), () => dialog.getByRole("tab", { name: category }), () => dialog.getByText(category, { exact: true })], `Settings ${category}`);
			await settle(page, 800);
		},
	})),
	{ name: "settings-search", route: "/library", steps: "Settings → search \"font\" (from /library)", run: async (page, { phone }) => { await openSettings(page, phone); const box = await pick(page, [byRole("searchbox", /settings/i), byRole("searchbox")], "Search settings"); await box.fill("font"); await settle(page, 800); } },
	{ name: "setup-dialog", route: "/chat/review-belief-check", steps: "a lesson's prompt bar → Add a provider key", run: async (page) => { await click(page, [byRole("button", /add a provider key/i), byRole("button", /provider key|set ?up/i)], "Add a provider key"); await pick(page, [byRole("dialog")], "the setup dialog"); await settle(page, 800); } },
	{ name: "delete-session-dialog", route: "/chat/review-gradient-descent", steps: "sidebar → right-click Practice history → Delete… (then Cancel)", run: async (page, { phone }) => {
		await openSidebarOnPhone(page, phone);
		const row = await pick(page, [byRole("link", /Practice history/)], "the session row");
		await row.click({ button: "right" });
		// Only the session menu's own item: Library rows have "Delete <name>" buttons of their own.
		await click(page, [byRole("menuitem", /^delete/i), byRole("button", /^delete(…|\.\.\.)?$/i)], "Delete… in the session menu");
		await pick(page, [byRole("alertdialog", /session/i), byRole("dialog", /delete session/i)], "the Delete session dialog");
		await settle(page);
	}, after: async (page) => { await click(page, [byRole("button", /^cancel$/i)], "Cancel").catch(() => page.keyboard.press("Escape")); } },
	{ name: "toast-copy", route: "/chat/review-belief-check", steps: "Copy response on the last reply (a copied notice, if any)", run: async (page) => {
		const copies = page.getByRole("button", { name: /copy response/i });
		const n = await copies.count();
		if (!n) throw new Error("no Copy response button");
		await copies.nth(n - 1).scrollIntoViewIfNeeded();
		await copies.nth(n - 1).click({ force: true });
		await page.waitForTimeout(250);
	} },
	{ name: "loading-library", route: null, steps: "/library with /api/library held 8 s (loading state)", run: async (page) => {
		await page.route(/\/api\/library(\?|$)/, async (route) => { await new Promise((r) => setTimeout(r, 8000)); await route.continue().catch(() => {}); });
		await page.goto(`${BASE}/library`, { waitUntil: "domcontentloaded" });
		await pick(page, [byRole("status", /loading/i), (p) => p.locator("[data-slot=skeleton], .animate-pulse")], "a loading state", 20_000);
		await page.waitForTimeout(400);
	} },
	{ name: "error-library", route: null, steps: "/library with /api/library answering 500 (error state)", run: async (page) => {
		await page.route(/\/api\/library(\?|$)/, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "screens: forced failure" }) }));
		await page.goto(`${BASE}/library`, { waitUntil: "domcontentloaded" });
		await pick(page, [byRole("button", /try again/i), byRole("alert")], "an error state", 30_000);
		await settle(page);
	} },
	{ name: "not-found-chat", route: "/chat/does-not-exist-screens", steps: "open a chat id that does not exist", run: async (page) => { await settle(page, 1500); } },
	{ name: "sign-in-route", route: "/sign-in", steps: "/sign-in in local mode (404 outside hosted mode)", run: async (page) => { await settle(page, 800); } },
	{ name: "notebook-note", route: "/notebook/{note}", steps: "open the Notebook note (margin threads)", run: async (page) => { await pick(page, [byRole("textbox", /^Note /), byTest("nb-editor")], "the note", 60_000); await settle(page, 1500); } },
	{ name: "notebook-thread-open", route: "/notebook/{note}", steps: "open the first margin thread", run: async (page) => {
		await pick(page, [byRole("textbox", /^Note /), byTest("nb-editor")], "the note", 60_000);
		await click(page, [byRole("button", /^open question about/i), (p) => p.getByRole("note").first().getByRole("button").first(), byTest("nb-thread-open")], "a margin thread (on phones its ? mark)");
		await settle(page, 1200);
	} },
	{ name: "notebook-sidebar", route: "/notebook/{note}", steps: "Notebook → Open notes", run: async (page) => { await click(page, [byRole("button", /open notes/i), byTest("nb-menu-button")], "Open notes"); await settle(page, 800); } },
	{ name: "notebook-settings", route: "/notebook/{note}", steps: "Notebook → Open notes → Settings", run: async (page) => {
		await click(page, [byRole("button", /open notes/i), byTest("nb-menu-button")], "Open notes");
		await click(page, [(p) => p.getByRole("dialog", { name: /notes/i }).getByRole("button", { name: /^settings$/i }), byTest("nb-side-settings")], "Settings");
		await settle(page, 800);
	} },
	{ name: "notebook-chat", route: "/notebook/{note}", steps: "Notebook → Ask about this note", run: async (page) => { await click(page, [byRole("button", /ask about this note/i), byTest("nb-chat")], "Ask about this note"); await settle(page, 1000); } },
	{ name: "notebook-export", route: "/notebook/{note}", steps: "Notebook → Export", run: async (page) => { await click(page, [byRole("button", /^export$/i), byTest("nb-export")], "Export"); await pick(page, [byRole("dialog", /export/i), byRole("dialog")], "the export dialog"); await settle(page, 600); } },
	{ name: "notebook-links", route: "/notebook/{note}", steps: "Notebook → Open notes → Links", run: async (page) => {
		await click(page, [byRole("button", /open notes/i), byTest("nb-menu-button")], "Open notes");
		await click(page, [(p) => p.getByRole("dialog", { name: /notes/i }).getByRole("button", { name: /^links$/i })], "Links");
		await settle(page, 1000);
	} },
];

// ─── the run ────────────────────────────────────────────────────────────────

const SHOT_TIMEOUT = Number(process.env.SHOT_TIMEOUT_MS) || 180_000;
const RETRIES = process.env.RETRIES === undefined ? 1 : Number(process.env.RETRIES);
const HIDE_DEV = "nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }";
const results = [];
let browser;

async function shoot(combo, viewport, index, shot) {
	const dir = path.join(OUT, combo);
	const file = `${String(index + 1).padStart(2, "0")}-${shot.name}.png`;
	const route = shot.route?.replace("{note}", ids.note ?? "missing");
	const row = { combo, file, name: shot.name, route: route ?? "(see steps)", steps: shot.steps, ok: false, landed: null, error: null, errors: [], notes: [] };
	const ctx = await browser.newContext({
		viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, reducedMotion: "reduce",
		hasTouch: viewport.phone, isMobile: viewport.phone,
	});
	await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }).catch(() => {});
	ctx.setDefaultNavigationTimeout(120_000);
	ctx.setDefaultTimeout(30_000);
	const page = await ctx.newPage();
	page.on("pageerror", (error) => row.errors.push(error.message.slice(0, 200)));
	const step = (label) => { if (process.env.DEBUG) console.log(`  · ${shot.name}: ${label}`); };
	let timer;
	const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`shot took over ${SHOT_TIMEOUT / 1000} s`)), SHOT_TIMEOUT); });
	try {
		await Promise.race([limit, captureShot(page, row, shot, route, viewport, dir, file, step)]);
	} catch (error) {
		row.error = error.message.split("\n")[0].slice(0, 300);
		row.landed ??= (() => { try { const u = new URL(page.url()); return u.pathname + u.search; } catch { return null; } })();
		// Keep what the screen showed when it failed, for diagnosis.
		await page.screenshot({ path: path.join(dir, "failed", file), style: HIDE_DEV, timeout: 15_000 }).catch(() => {});
	} finally {
		clearTimeout(timer);
		if (shot.cleanup) await shot.cleanup().catch((error) => row.notes.push(`cleanup failed: ${error.message}`));
		await Promise.race([ctx.close().catch(() => {}), pause(10_000)]);
	}
	return row;
}

/** One shot, retried once on failure (a loaded machine makes the dev server slow); the last attempt is the one recorded. */
async function shootWithRetry(combo, viewport, index, shot) {
	let row = await shoot(combo, viewport, index, shot);
	if (!row.ok && RETRIES > 0) {
		console.log(`retry ${combo}/${row.file}  (${row.error})`);
		const first = row.error;
		row = await shoot(combo, viewport, index, shot);
		if (row.ok) { row.notes.push(`passed on retry (first try: ${first})`); rmSync(path.join(OUT, combo, "failed", row.file), { force: true }); }
	}
	results.push(row);
	console.log(`${row.ok ? "ok  " : "FAIL"} ${combo}/${row.file}${row.ok ? "" : `  ${row.error}`}`);
}

async function captureShot(page, row, shot, route, viewport, dir, file, step) {
	{
		step("goto");
		if (route) await go(page, route, { notes: row.notes });
		step("run");
		if (shot.run) await shot.run(page, { phone: viewport.phone });
		step("shoot");
		await settle(page);
		row.landed = new URL(page.url()).pathname + new URL(page.url()).search;
		await page.screenshot({ path: path.join(dir, file), style: HIDE_DEV, animations: "disabled", timeout: 30_000 });
		if (shot.full) await page.screenshot({ path: path.join(dir, file.replace(".png", "-full.png")), fullPage: true, style: HIDE_DEV, animations: "disabled", timeout: 30_000 });
		if (shot.after) await shot.after(page).catch(() => {});
		if (!row.error) row.ok = true;
	}
}

/** What the theme did: the computed page background on a Study route and on the note, per combo. */
async function themeCheck(combo, viewport) {
	const seen = {};
	for (const [label, route] of [["Study /library", "/library"], ["Notebook note", `/notebook/${ids.note}`]]) {
		const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
		try {
			const page = await ctx.newPage();
			await go(page, route, { wait: 800 });
			// The first opaque background under the middle of the screen: what is actually painted there.
			seen[label] = await page.evaluate(() => {
				for (let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); el; el = el.parentElement) {
					const bg = getComputedStyle(el).backgroundColor;
					if (bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== "transparent") return `${bg} (${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/)[0]}` : ""})`;
				}
				return getComputedStyle(document.documentElement).backgroundColor;
			});
		} catch (error) { seen[label] = `failed: ${error.message.split("\n")[0]}`; }
		await ctx.close().catch(() => {});
	}
	mkdirSync(path.join(OUT, combo), { recursive: true });
	writeFileSync(path.join(OUT, combo, "theme.json"), JSON.stringify(seen, null, 2));
}

/** Each combo's rows, saved beside its shots, so a later ONLY/SHOTS run keeps the rest of the index. */
function saveCombo(combo) {
	const file = path.join(OUT, combo, "results.json");
	const fresh = results.filter((r) => r.combo === combo);
	let rows = fresh;
	if (SHOTS && existsSync(file)) {
		const kept = JSON.parse(readFileSync(file, "utf8")).filter((old) => !fresh.some((r) => r.file === old.file));
		rows = [...kept, ...fresh].sort((a, b) => a.file.localeCompare(b.file));
	}
	writeFileSync(file, JSON.stringify(rows, null, 2));
}
function allRows() {
	const order = THEMES.flatMap((t) => VIEWPORTS.map((v) => `${t.name}-${v.width}`));
	return order.flatMap((combo) => {
		const file = path.join(OUT, combo, "results.json");
		if (existsSync(file)) try { return JSON.parse(readFileSync(file, "utf8")); } catch { /* unreadable: use this run's */ }
		return results.filter((r) => r.combo === combo);
	});
}

function writeIndex(started) {
	const results = allRows();
	const lines = [
		"# Unified redesign screenshots", "",
		`Run ${started} → ${new Date().toISOString()} from \`${path.relative(ROOT, fileURLToPath(import.meta.url))}\` at ${(() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return "?"; } })()}.${ONLY ? ` Combos this run: ${[...ONLY].join(", ")}.` : ""}${SHOTS ? ` Shots this run: ${SHOTS.join(", ")}.` : ""}`,
		`Viewports 1440x900 and 390x844 (touch), deviceScaleFactor 1, reduced motion. Files: \`<theme>-<width>/<NN-name>.png\`; \`-full.png\` is the full-page shot; failed shots keep the screen at failure under \`failed/\`.`,
		"Study themes set general.interface study and the shared notebook.appearance (and appearance.mode where the tree still has it); Notebook themes set general.interface notebook and notebook.appearance (Study routes other than Home still render in Study then).", "",
		"## Seed", "", ...seedNotes, "",
	];
	const combos = [...new Set(results.map((r) => r.combo))];
	lines.push("## Counts", "", "| combo | ok | failed |", "| --- | --- | --- |");
	for (const combo of combos) lines.push(`| ${combo} | ${results.filter((r) => r.combo === combo && r.ok).length} | ${results.filter((r) => r.combo === combo && !r.ok).length} |`);
	lines.push("", "## Theme check", "", "The painted background at the middle of the screen after the theme was written (a light theme that renders dark shows here).", "", "| combo | Study /library | Notebook note |", "| --- | --- | --- |");
	for (const combo of combos) {
		let seen = {};
		try { seen = JSON.parse(readFileSync(path.join(OUT, combo, "theme.json"), "utf8")); } catch { /* not recorded */ }
		lines.push(`| ${combo} | ${seen["Study /library"] ?? "—"} | ${seen["Notebook note"] ?? "—"} |`);
	}
	lines.push("", "## Shots", "", "| # | name | route | steps |", "| --- | --- | --- | --- |");
	SHOTS_LIST.forEach((shot, i) => { lines.push(`| ${String(i + 1).padStart(2, "0")} | ${shot.name}${shot.full ? " (+ full)" : ""} | \`${shot.route ?? "—"}\` | ${shot.steps} |`); });
	for (const combo of combos) {
		lines.push("", `### ${combo}`, "");
		for (const r of results.filter((x) => x.combo === combo)) {
			const where = r.landed && r.landed !== r.route ? ` (landed at \`${r.landed}\`)` : "";
			lines.push(`- ${r.ok ? `[${r.file}](${combo}/${r.file})` : `~~${r.file}~~ FAILED`}${where}${r.notes.length ? ` — ${r.notes.join("; ")}` : ""}${r.errors.length ? ` — page errors: ${[...new Set(r.errors)].join("; ")}` : ""}`);
		}
	}
	const failed = results.filter((r) => !r.ok);
	lines.push("", "## FAILED", "");
	if (!failed.length) lines.push("None.");
	for (const r of failed) lines.push(`- ${r.combo}/${r.file} — ${r.error} (route \`${r.route}\`, at \`${r.landed}\`)`);
	writeFileSync(path.join(OUT, "index.md"), `${lines.join("\n")}\n`);
}

async function main() {
	const other = otherDevServer();
	if (other) { console.error(`Another next dev runs in this checkout (it holds the project lock); stop it first:\n  ${other}`); process.exitCode = 2; return; }
	const started = new Date().toISOString();
	console.log(`data ${DATA}\nout  ${OUT}`);
	await seed();
	await startServer();
	console.log(`server ${BASE}`);
	await seedApi();
	console.log(seedNotes.join("\n"));
	if (process.env.HOLD) { console.log(`READY ${BASE}`); await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); }); return; }

	browser = await chromium.launch({ executablePath: CHROME, env: { ...process.env, TMPDIR: tmpRoot } });
	// Compile every route once so the first shot of each isn't a dev-compile spinner.
	for (const route of ["/", "/chat/review-gradient-descent", "/library", "/review", `/notebook/${ids.note}`, "/sign-in"]) {
		const warm = await browser.newPage();
		await warm.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 240_000 }).catch(() => {});
		await warm.waitForTimeout(1500);
		await warm.close();
	}
	for (const theme of THEMES) {
		for (const viewport of VIEWPORTS) {
			const combo = `${theme.name}-${viewport.width}`;
			if (ONLY && !ONLY.has(combo)) continue;
			try { await theme.apply(); } catch (error) { console.log(`theme ${theme.name} failed: ${error.message}`); }
			// A full run replaces the combo's folder (before the theme check writes into it); a SHOTS run only overwrites its own files.
			if (!SHOTS) rmSync(path.join(OUT, combo), { recursive: true, force: true });
			mkdirSync(path.join(OUT, combo), { recursive: true });
			await themeCheck(combo, viewport);
			for (const [index, shot] of SHOTS_LIST.entries()) {
				if (SHOTS && !SHOTS.some((s) => shot.name.includes(s))) continue;
				await shootWithRetry(combo, viewport, index, shot);
				saveCombo(combo);
			}
			writeIndex(started);
		}
	}
	writeIndex(started);
}

mkdirSync(OUT, { recursive: true });
// Interrupted (Ctrl+C, kill): still stop the server and drop the data dir. HOLD mode waits on these itself.
if (!process.env.HOLD) {
	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.once(signal, () => {
			console.log(`${signal}: stopping`);
			stopServer();
			if (!process.env.KEEP_DATA) rmSync(DATA, { recursive: true, force: true });
			if (results.length) try { writeIndex("(interrupted run)"); } catch { /* best effort */ }
			process.exit(130);
		});
	}
}
try {
	await main();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
} finally {
	await browser?.close().catch(() => {});
	stopServer();
	await pause(500);
	if (process.env.KEEP_DATA) console.log(`kept ${DATA}`);
	else rmSync(DATA, { recursive: true, force: true });
	const failed = results.filter((r) => !r.ok).length;
	if (results.length) console.log(`${results.length - failed}/${results.length} shots ok → ${path.join(OUT, "index.md")}`);
}
