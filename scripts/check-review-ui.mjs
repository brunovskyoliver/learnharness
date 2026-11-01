/** Isolated browser regression for flashcards (feature 021): write by hand, the
 * duplicate warning, the queue with no back in the DOM or first responses before
 * reveal, keyboard rating, undo, suspend, history, reload mid-queue, a surviving
 * draft, delete and restore, kept drafts, and overflow, at 1440, 390 and 320 px.
 * Model submissions are intercepted and fail the check, and it makes none.
 *   TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium node scripts/check-review-ui.mjs
 * Set TMPDIR under the home folder for a snap Chromium, whose /tmp is private.
 * Screenshots go to LH_UI_SCREENSHOT_DIR when set.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const port = Number(process.env.LH_UI_PORT ?? 3121);
const base = `http://127.0.0.1:${port}`;
const root = await mkdtemp(path.join(os.tmpdir(), "learning-review-ui-"));
const data = path.join(root, "data");
const shots = process.env.LH_UI_SCREENSHOT_DIR;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ok = (line) => console.log(`PASS ${line}`);
const SECRET = "BACKSECRET";
let server;
let browser;
const modelCalls = [];

const api = async (url, method = "GET", body) => {
	const response = await fetch(`${base}${url}`, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
	return { status: response.status, body: await response.json() };
};
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `review-${name}.png`) }); };
const text = (page, selector) => page.$eval(selector, (el) => el.textContent);
const waitText = (page, selector, wanted) => page.waitForFunction((s, w) => document.querySelector(s)?.textContent?.includes(w), { timeout: 15000 }, selector, wanted);
const typeInto = async (page, selector, value) => { await page.click(selector); await page.type(selector, value); };
const inDom = (page, needle) => page.evaluate((n) => document.documentElement.outerHTML.includes(n), needle);
async function noOverflow(page, label) {
	const out = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, scroller: (() => { const el = document.querySelector('[data-testid="review-scroll"]'); return el ? el.scrollWidth - el.clientWidth : 0; })() }));
	assert.ok(out.doc <= out.win, `${label}: page overflow ${out.doc} > ${out.win}`);
	assert.ok(out.scroller <= 0, `${label}: column overflow ${out.scroller}`);
}
async function hiddenScrollbars(page, label) {
	const bad = await page.evaluate(() => [...document.querySelectorAll("[data-testid=review-scroll], textarea")].filter((el) => el.offsetWidth - el.clientWidth - (parseFloat(getComputedStyle(el).borderLeftWidth) + parseFloat(getComputedStyle(el).borderRightWidth)) > 0).map((el) => el.tagName));
	assert.deepEqual(bad, [], `${label}: a visible scrollbar`);
}
async function coarseTargets(page, label) {
	// Emulated coarse pointer: every control on screen reaches 44px.
	const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="queue-"] button, [data-testid^="queue-"]:is(button), [data-testid="review-new"], [data-testid="review-views"] a')].filter((el) => el.offsetParent && el.getBoundingClientRect().height < 44).map((el) => `${el.textContent} ${el.getBoundingClientRect().height}`));
	assert.deepEqual(small, [], `${label}: small targets`);
}

async function newCard(page, front, back) {
	await page.click('[data-testid="review-new"]');
	await page.waitForSelector('[data-testid="card-front"]');
	await page.type('[data-testid="card-front"]', front);
	await page.type('[data-testid="card-back"]', back);
	await page.click('[data-testid="card-save"]');
}

async function checkWidth(width, coarse) {
	const prefix = `w${width}`;
	const page = await browser.newPage();
	await page.setViewport({ width, height: 800, hasTouch: coarse, isMobile: coarse });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const bodies = [];
	page.on("response", async (response) => {
		if (!response.url().startsWith(base)) return;
		if (response.url().includes("/reveal")) return;
		const type = response.headers()["content-type"] ?? "";
		if (type.includes("json") || type.includes("html") || type.includes("event-stream") === false && type.includes("text")) {
			try { bodies.push({ url: response.url(), body: await response.text() }); } catch { /* a body that's gone */ }
		}
	});
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		const url = request.url();
		if (/\/api\/cards\/generate/.test(url) && !(request.postData() ?? "").includes('"preview":true')) { modelCalls.push(url); request.abort(); return; }
		if (/\/api\/chat(\/|$)/.test(url) && request.method() === "POST") { modelCalls.push(url); request.abort(); return; }
		request.continue();
	});
	const seen = (needle) => bodies.some(({ body }) => body.includes(needle));

	// Empty state, then a card by hand with no model anywhere.
	await page.goto(`${base}/review`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="queue-empty"]');
	await noOverflow(page, `${prefix} empty`);
	await shot(page, `${prefix}-empty`);
	ok(`${prefix} no cards reads as empty`);
	const frontA = `${prefix} What is entropy?`, frontB = `${prefix} Second $x^2$`;
	await newCard(page, frontA, `${SECRET} one`);
	await page.waitForSelector('[data-testid="queue-card"]');
	await waitText(page, '[data-testid="queue-front"]', frontA);
	ok(`${prefix} a card by hand joins the queue`);

	// An empty side is said in words, next to the field.
	await page.click('[data-testid="review-new"]');
	await page.waitForSelector('[data-testid="card-save"]');
	await page.click('[data-testid="card-save"]');
	await waitText(page, '[data-testid="card-editor"] [role="alert"]', "Write the front first");
	assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "card-front");
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-editor"]'));

	// The duplicate warning: nothing is dropped, Skip and Keep both both work, Escape goes inner first.
	await newCard(page, `  ${prefix} what is **ENTROPY** `, "dup back");
	await page.waitForSelector('[data-testid="card-duplicate"]');
	await shot(page, `${prefix}-duplicate`);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-duplicate"]') && document.querySelector('[data-testid="card-editor"]'));
	ok(`${prefix} Escape closes the warning before the dialog`);
	await page.click('[data-testid="card-save"]');
	await page.waitForSelector('[data-testid="card-duplicate"]');
	await page.click('[data-testid="card-skip"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-editor"]'));
	assert.equal((await api("/api/cards")).body.cards.filter((row) => row.front.includes("ENTROPY")).length, 0);
	ok(`${prefix} Skip keeps nothing`);
	await newCard(page, `  ${prefix} what is **ENTROPY** `, "dup back");
	await page.waitForSelector('[data-testid="card-keep-both"]');
	await page.click('[data-testid="card-keep-both"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-editor"]'));
	const dupRow = (await api("/api/cards")).body.cards.find((row) => row.front.includes("ENTROPY"));
	assert.ok(dupRow, "Keep both keeps both");
	await api(`/api/cards/${dupRow.id}?forGood=1`, "DELETE").then(() => api(`/api/cards/${dupRow.id}`, "DELETE")).then(() => api(`/api/cards/${dupRow.id}?forGood=1`, "DELETE"));
	ok(`${prefix} Keep both keeps both`);

	await newCard(page, frontB, `${SECRET} two`);
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-editor"]'));
	await waitText(page, '[data-testid="queue-count"]', "2 cards due");

	// The back is nowhere before reveal: not the DOM, not the first responses.
	bodies.length = 0;
	await page.goto(`${base}/review`, { waitUntil: "networkidle2" });
	await page.waitForSelector('[data-testid="queue-reveal"]');
	assert.equal(await inDom(page, SECRET), false, "no back in the DOM");
	assert.equal(seen(SECRET), false, "no back in any response");
	assert.ok(bodies.some(({ url }) => url.includes("/api/cards/queue")), "the queue answered");
	if (coarse) await coarseTargets(page, prefix);
	await shot(page, `${prefix}-front`);
	ok(`${prefix} the back is absent from the DOM and responses before reveal`);

	// Keyboard: Space shows, 3 rates, the live region says so.
	await page.evaluate(() => document.activeElement?.blur());
	await page.keyboard.press("Space");
	await page.waitForSelector('[data-testid="queue-back"]');
	await waitText(page, '[data-testid="queue-back"]', SECRET);
	await waitText(page, '[data-testid="queue-live"]', "Answer shown");
	await page.waitForSelector('[data-testid="queue-rate-good"]');
	assert.match(await page.$eval('[data-testid="queue-rate-good"]', (el) => el.getAttribute("aria-label")), /Good, back in 10 min/);
	assert.notEqual(await page.$eval('[data-testid="queue-back"]', (el) => (document.activeElement === el ? getComputedStyle(el).outlineStyle : "not focused")), "none", "the answer shows focus");
	await noOverflow(page, `${prefix} revealed`);
	await shot(page, `${prefix}-back`);
	ok(`${prefix} Space reveals, with predicted intervals`);
	const firstFront = await text(page, '[data-testid="queue-front"]');
	await page.keyboard.press("3");
	await page.waitForFunction((f) => document.querySelector('[data-testid="queue-front"]')?.textContent !== f, {}, firstFront);
	await waitText(page, '[data-testid="queue-live"]', "Good, back in 10 min");
	await waitText(page, '[data-testid="queue-live"]', "1 card due");
	assert.equal(await inDom(page, `${SECRET} one`), false, "the back leaves with the card");
	ok(`${prefix} key 3 rates and the live region counts`);
	const hasFocus = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
	assert.equal(hasFocus, "queue-reveal", "focus lands on Show answer");

	// Undo brings the first card back, by button; then rate again.
	await page.click('[data-testid="queue-undo"]');
	await waitText(page, '[data-testid="queue-count"]', "2 cards due");
	await waitText(page, '[data-testid="queue-note"]', "Last rating undone");
	await waitText(page, '[data-testid="queue-live"]', "Last rating undone");
	await waitText(page, '[data-testid="queue-front"]', firstFront.trim().slice(0, 12));
	ok(`${prefix} undo restores the card`);
	await page.keyboard.press("Space");
	await page.waitForSelector('[data-testid="queue-rate-easy"]');
	await page.keyboard.press("4");
	await waitText(page, '[data-testid="queue-count"]', "1 card due");

	// Reload mid-queue: the next card, back hidden, undo still offered.
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="queue-reveal"]');
	await waitText(page, '[data-testid="queue-count"]', "1 card due");
	assert.equal(await inDom(page, SECRET), false);
	await page.waitForSelector('[data-testid="queue-undo"]');
	ok(`${prefix} reload lands on the next card, and undo survives`);

	// History, suspend, its Undo, unsuspend from All cards.
	await page.click('[data-testid="queue-history"]');
	await page.waitForSelector('[data-testid="card-history"]');
	await page.waitForFunction(() => /Not reviewed yet/.test(document.querySelector('[data-testid="card-history"]')?.textContent ?? ""));
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-history"]'));
	await page.click('[data-testid="queue-suspend"]');
	await waitText(page, '[data-testid="queue-note"]', "Card suspended");
	await waitText(page, '[data-testid="queue-count"]', "0 cards due");
	await page.waitForSelector('[data-testid="queue-done"]');
	await shot(page, `${prefix}-done`);
	ok(`${prefix} suspending takes it out of the queue, and all-done reads as itself`);
	await page.click('[data-testid="queue-put-back"]');
	await waitText(page, '[data-testid="queue-count"]', "1 card due");
	await page.click('[data-testid="queue-suspend"]');
	await waitText(page, '[data-testid="queue-count"]', "0 cards due");

	await page.goto(`${base}/review?view=cards`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[data-testid="card-row"]`);
	assert.equal(await inDom(page, SECRET), false, "the list has no backs");
	await waitText(page, '[data-testid="cards-list"]', "Suspended");
	await noOverflow(page, `${prefix} list`);
	await shot(page, `${prefix}-cards`);
	const rowIndex = await page.$$eval('[data-testid="card-row"]', (rows, f) => rows.findIndex((row) => row.textContent.includes(f)), frontA);
	assert.notEqual(rowIndex, -1);
	const menuFor = async (front, label) => {
		await page.evaluate((f) => { [...document.querySelectorAll('[data-testid="card-row"]')].find((row) => row.textContent.includes(f)).querySelector('[data-testid="library-more"]').dataset.go = "1"; }, front);
		await page.click('[data-testid="library-more"][data-go="1"]');
		await page.waitForSelector("[data-lh-menu] [role=menuitem]");
		await page.evaluate((t) => [...document.querySelectorAll("[data-lh-menu] [role=menuitem]")].find((el) => el.textContent === t).click(), label);
		await page.waitForFunction(() => !document.querySelector("[data-lh-menu] [role=menuitem]"));
		await page.evaluate(() => { for (const el of document.querySelectorAll('[data-go="1"]')) delete el.dataset.go; });
	};
	await menuFor(frontA, "History");
	await page.waitForSelector('[data-testid="card-history-row"]');
	const history = await text(page, '[data-testid="card-history"]');
	assert.match(history, /Easy/);
	assert.match(history, /Undone/);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-history"]'));
	ok(`${prefix} history lists the review and the undone one`);

	// A draft of an edit survives navigating away and a reload.
	await menuFor(frontA, "Edit");
	await page.waitForFunction(() => document.querySelector('[data-testid="card-back"]')?.value);
	await page.type('[data-testid="card-back"]', " TYPED-EDIT");
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="card-back"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="card-back"]')?.value.includes("TYPED-EDIT"));
	ok(`${prefix} an edit in progress survives a reload`);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-editor"]'));
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.goto(`${base}/review?view=cards`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="card-row"]');
	assert.equal(await page.$('[data-testid="card-editor"]'), null, "a closed editor stays closed");
	await menuFor(frontA, "Edit");
	await page.waitForFunction(() => document.querySelector('[data-testid="card-back"]')?.value.includes("TYPED-EDIT"));
	await page.click('[data-testid="card-save"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-editor"]'));
	ok(`${prefix} the kept draft comes back after navigating, and saves`);

	// Delete, with Restore, then for good behind a confirm; Unsuspend.
	await menuFor(`${prefix} Second`, "Unsuspend");
	await waitText(page, '[data-testid="review-note"]', "back in the schedule");
	await menuFor(`${prefix} Second`, "Delete");
	await waitText(page, '[data-testid="review-note"]', "moved to Deleted");
	await page.goto(`${base}/review?view=deleted`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="deleted-row"]');
	await shot(page, `${prefix}-deleted`);
	await page.click('[data-testid="deleted-restore"]');
	await page.waitForSelector('[data-testid="deleted-empty"]');
	const backRow = (await api("/api/cards")).body.cards.find((row) => row.front === frontB);
	assert.ok(backRow && !backRow.deletedAt, "restored");
	await api(`/api/cards/${backRow.id}`, "DELETE");
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="deleted-for-good"]');
	await page.click('[data-testid="deleted-for-good"]');
	await page.waitForSelector('[data-testid="card-delete-confirm"]');
	await shot(page, `${prefix}-confirm`);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-delete-dialog"]'));
	assert.ok(await page.$('[data-testid="deleted-row"]'), "Escape deletes nothing");
	await page.click('[data-testid="deleted-for-good"]');
	await page.waitForSelector('[data-testid="card-delete-confirm"]');
	await page.click('[data-testid="card-delete-confirm"]');
	await page.waitForSelector('[data-testid="deleted-empty"]');
	ok(`${prefix} delete restores, and goes for good only behind a confirm`);

	// Home: the due row, quiet. A card of this width is due: frontA was rated Easy,
	// so write a fresh one. It reads as a count and carries no card text.
	const fresh = (await api("/api/cards", "POST", { front: `${prefix} home card`, back: `${SECRET} home` })).body.card.id;
	await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="waiting-cards-row"]');
	const row = await text(page, '[data-testid="waiting-cards-row"]');
	assert.match(row, /Flashcards/);
	assert.match(row, /\d+ due/);
	assert.ok(!row.includes("home card"));
	await noOverflow(page, `${prefix} home`);
	await shot(page, `${prefix}-home`);
	await page.click('[data-testid="waiting-cards-row"] a');
	await page.waitForSelector('[data-testid="queue-card"]');
	ok(`${prefix} Home's row counts and opens the queue`);
	await api(`/api/cards/${fresh}`, "DELETE");
	await api(`/api/cards/${fresh}?forGood=1`, "DELETE");

	// Make flashcards with no model set: an honest refusal, and hand writing still works, with the source.
	const made = await api("/api/library/pages", "POST", { name: `${prefix} note`, content: "Entropy is disorder." });
	await page.goto(`${base}/review?make=${encodeURIComponent(`page:${made.body.item.id}`)}`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="make-panel"]');
	await page.waitForSelector('[data-testid="make-refusal"]');
	assert.equal(await page.$('[data-testid="make-generate"]'), null, "nothing to send without a model");
	await noOverflow(page, `${prefix} make`);
	await shot(page, `${prefix}-make`);
	await page.click('[data-testid="make-by-hand"]');
	await waitText(page, '[data-testid="card-source-line"]', `${prefix} note`);
	await page.type('[data-testid="card-front"]', `${prefix} sourced`);
	await page.type('[data-testid="card-back"]', "sourced back");
	await page.click('[data-testid="card-save"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="card-editor"]'));
	const sourced = (await api("/api/cards")).body.cards.find((c) => c.front === `${prefix} sourced`);
	assert.equal(sourced?.source?.label, `${prefix} note`);
	ok(`${prefix} no model is refused in words, and a card by hand keeps its source`);

	// Trashing that source marks it gone, and the card stays. The label shows on reveal.
	await fetch(`${base}/api/library/trash`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: made.body.item.id }) });
	await page.goto(`${base}/review`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="queue-reveal"]');
	await page.click('[data-testid="queue-reveal"]');
	await waitText(page, '[data-testid="queue-source"]', "this source is gone");
	await page.keyboard.press("1");
	await waitText(page, '[data-testid="queue-note"]', "Again");
	ok(`${prefix} a trashed source reads as gone, and the card stays`);

	// The palette and sidebar reach it.
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="library-new-folder"]');
	await page.keyboard.down("Control"); await page.keyboard.press("k"); await page.keyboard.up("Control");
	await page.waitForSelector('[data-testid="command-palette-input"]');
	await page.type('[data-testid="command-palette-input"]', "review flash");
	await page.waitForFunction(() => document.querySelector('[data-testid="command-palette-option"]')?.textContent?.includes("Review flashcards"));
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => location.pathname === "/review");
	await page.waitForSelector('[data-testid="queue-count"]');
	ok(`${prefix} the palette opens the queue`);
	await hiddenScrollbars(page, prefix);
	assert.deepEqual(errors, [], `${prefix} page errors`);
	await page.close();
}

async function checkDrafts() {
	// Seed drafts on disk: the model call itself is covered by tests/cards.test.ts.
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 800 });
	await page.goto(`${base}/review?view=drafts`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="draft-row"]');
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="draft-row"]').length === 3);
	await waitText(page, '[data-testid="drafts-list"]', "You already have a card with this front");
	await waitText(page, '[data-testid="draft-runs"]', "3 drafts from Seeded notes");
	await shot(page, "drafts");
	const before = (await api("/api/cards/queue?tz=UTC")).body.queue;
	const countOf = async () => (await api("/api/cards")).body.drafts.length;
	await page.evaluate(() => [...document.querySelectorAll('[data-testid="draft-row"]')].find((row) => row.textContent.includes("Draft A")).querySelector('[data-testid="draft-skip"]').click());
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="draft-row"]').length === 2);
	await page.evaluate(() => [...document.querySelectorAll('[data-testid="draft-row"]')].find((row) => row.textContent.includes("Draft B")).querySelector('[data-testid="draft-keep"]').click());
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="draft-row"]').length === 1);
	assert.equal(await text(page, '[data-testid="draft-keep"]'), "Keep both");
	await page.click('[data-testid="draft-keep"]');
	await page.waitForSelector('[data-testid="drafts-empty"]');
	assert.equal(await countOf(), 0);
	const after = (await api("/api/cards/queue?tz=UTC")).body.queue;
	assert.equal(after.total, before.total + 2, "only kept drafts joined");
	ok("drafts wait, Skip removes one, Keep and Keep both join the queue");
	await page.close();
}

try {
	await mkdir(data, { recursive: true });
	await mkdir(path.join(data, "cards"), { recursive: true });
	const stamp = "2026-10-01T00:00:00.000Z";
	const hash = "seeded-dup";
	const draft = (id, front, contentHash) => ({ id, front, back: `${front} back`, source: null, conceptIds: [], status: "draft", schedule: null, suspended: false, contentHash, lastReviewId: null, runId: "run_seed", createdAt: stamp, updatedAt: stamp });
	await writeFile(path.join(data, "cards", "cards.json"), JSON.stringify({ version: 1, runs: [{ id: "run_seed", label: "Seeded notes", status: "done", truncated: false, drafts: 3, createdAt: stamp, updatedAt: stamp }], cards: [draft("card_a", "Draft A", "a"), draft("card_b", "Draft B", hash), draft("card_c", "Draft C", hash)] }));
	if (shots) await mkdir(shots, { recursive: true });
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port), "-H", "127.0.0.1"], { env: { ...process.env, LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), LH_HOSTED: "0", NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore" });
	for (let attempt = 0; ; attempt++) {
		try { if ((await fetch(`${base}/api/cards/queue`)).ok) break; } catch { /* still starting */ }
		if (attempt > 240) throw new Error("server did not start");
		await pause(500);
	}
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/snap/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
	await checkDrafts();
	const cleared = (await api("/api/cards")).body.cards;
	for (const row of cleared) { await api(`/api/cards/${row.id}`, "DELETE"); await api(`/api/cards/${row.id}?forGood=1`, "DELETE"); }
	for (const [width, coarse] of [[1440, false], [390, true], [320, true]]) {
		await checkWidth(width, coarse);
		for (const row of (await api("/api/cards")).body.cards) { await api(`/api/cards/${row.id}`, "DELETE"); await api(`/api/cards/${row.id}?forGood=1`, "DELETE"); }
	}
	assert.deepEqual(modelCalls, [], "nothing went to a model");
	ok("no model submission at any width");
	console.log("check-review-ui: all good");
} finally {
	await browser?.close().catch(() => {});
	server?.kill("SIGTERM");
	await pause(300);
	await rm(root, { recursive: true, force: true }).catch(() => {});
}
