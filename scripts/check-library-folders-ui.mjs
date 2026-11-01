/** Isolated browser regression for Library folders (feature 011): create, nest,
 * breadcrumbs, move by keyboard, cycle refusal, missing folder and overflow at
 * 320, 390 and 1440 px. Makes no model requests.
 * CHROME_PATH=/path/to/chrome node scripts/check-library-folders-ui.mjs
 * Set TMPDIR under the home folder for a snap Chromium, whose /tmp is private.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const port = Number(process.env.LH_UI_PORT ?? 3104);
const base = `http://127.0.0.1:${port}`;
const root = await mkdtemp(path.join(os.tmpdir(), "learning-folders-ui-"));
const data = path.join(root, "data");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = async (url, method, body) => {
	const response = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	return { status: response.status, body: await response.json() };
};
let server;
let browser;

/** Waits until React owns an element. On a cold dev server the HTML arrives well before the
 *  scripts compile, and a click before hydration is silently lost. */
const live = (page, selector) => page.waitForFunction((sel) => {
	const el = document.querySelector(sel);
	return el && el.getClientRects().length > 0 && Object.keys(el).some((key) => key.startsWith("__reactProps"));
}, { timeout: 120000 }, selector);

async function chooseMenu(page, name, label) {
	await live(page, `[aria-label="More actions for ${name}"]`);
	await page.click(`[aria-label="More actions for ${name}"]`);
	await page.waitForSelector("[data-lh-menu] [role=menuitem]");
	await page.evaluate((text) => [...document.querySelectorAll("[data-lh-menu] [role=menuitem]")].find((el) => el.textContent === text).click(), label);
	await page.waitForFunction(() => !document.querySelector("[data-lh-menu] [role=menuitem]"));
}

async function checkWidth(width) {
	const prefix = `w${width}`;
	const page = await browser.newPage();
	await page.setViewport({ width, height: 800 });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const sourcePage = (await api("/api/library/pages", "POST", { name: `${prefix} note`, content: "first" })).body.item;
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });

	// New folder by keyboard: Enter submits, focus comes back.
	await live(page, '[data-testid="library-new-folder"]');
	await page.click('[data-testid="library-new-folder"]');
	await page.waitForSelector('[data-testid="library-folder-name"]');
	await page.keyboard.type(`${prefix} Physics`);
	await page.keyboard.press("Enter");
	await page.waitForSelector(`[aria-label="Open folder ${prefix} Physics"]`);
	await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "library-new-folder");

	// A duplicate stays in the dialog with the reason.
	await page.click('[data-testid="library-new-folder"]');
	await page.waitForSelector('[data-testid="library-folder-name"]');
	await page.keyboard.type(`${prefix} Physics`);
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="library-folder-dialog"] [role="alert"]');
	await page.keyboard.press("Escape");

	// Move the page into the folder through the dialog; its row leaves this level.
	await chooseMenu(page, `${prefix} note`, "Move to…");
	await page.waitForSelector('[data-testid="library-move-dialog"]');
	await page.evaluate((label) => {
		[...document.querySelectorAll('[data-testid="library-move-target"]')].find((el) => el.textContent.includes(label)).click();
	}, `${prefix} Physics`);
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Open ${name}"]`), {}, `${prefix} note`);

	// Into the folder: breadcrumbs, the page, and a subfolder.
	await live(page, `[aria-label="Open folder ${prefix} Physics"]`);
	await page.click(`[aria-label="Open folder ${prefix} Physics"]`);
	await page.waitForSelector('[data-testid="library-breadcrumbs"]');
	await page.waitForSelector(`[aria-label="Open ${prefix} note"]`);
	assert.ok(page.url().includes("folder=fld_"), "the URL names the folder");
	await page.click('[data-testid="library-new-folder"]');
	await page.waitForSelector('[data-testid="library-folder-name"]');
	await page.keyboard.type("Waves");
	await page.keyboard.press("Enter");
	await page.waitForSelector('[aria-label="Open folder Waves"]');

	// Reload keeps the place; versions survive the move.
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector('[aria-label="Open folder Waves"]');
	const versions = await (await fetch(`${base}/api/library/pages/${sourcePage.id}/versions`)).json();
	assert.equal(versions.versions.length, 1);

	// The folder can't be a target inside its own move dialog.
	const up = await page.$eval('[data-testid="library-breadcrumbs"] a', (a) => a.getAttribute("href"));
	assert.equal(up, "/library");
	await live(page, '[data-testid="library-breadcrumbs"] a');
	await page.click('[data-testid="library-breadcrumbs"] a');
	await page.waitForSelector(`[aria-label="More actions for ${prefix} Physics"]`);
	await chooseMenu(page, `${prefix} Physics`, "Move to…");
	await page.waitForSelector('[data-testid="library-move-dialog"]');
	const targets = await page.$$eval('[data-testid="library-move-target"]', (els) => els.map((el) => el.textContent));
	assert.ok(!targets.some((t) => t.includes(`${prefix} Physics`)), `targets: ${targets}`);
	await page.keyboard.press("Escape");

	// Favorite and tag, then the views and tag filter find it (feature 012).
	const item = await api("/api/library/pages", "POST", { name: `${prefix} mark`, content: "x" });
	await page.waitForSelector(`[aria-label="More actions for ${prefix} mark"]`);
	await chooseMenu(page, `${prefix} mark`, "Add to favorites");
	await page.waitForSelector(`[data-testid="library-row"]:has([aria-label="Open ${prefix} mark"]) [aria-label="Favorite"]`);
	await chooseMenu(page, `${prefix} mark`, "Tags…");
	await page.waitForSelector('[data-testid="library-folder-name"]');
	await page.keyboard.type(`${prefix}exam, waves`);
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="library-tags"]');
	await page.goto(`${base}/library?view=favorites`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Open ${prefix} mark"]`);
	await page.goto(`${base}/library?tag=${prefix}exam`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Open ${prefix} mark"]`);
	assert.equal(await page.$(`[aria-label="Open folder ${prefix} Physics"]`), null, "a tag narrows the list");

	// Archive hides it from All and shows it in Archive.
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="More actions for ${prefix} mark"]`);
	await chooseMenu(page, `${prefix} mark`, "Archive");
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Open ${name}"]`), {}, `${prefix} mark`);
	await page.goto(`${base}/library?view=archive`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Open ${prefix} mark"]`);
	await chooseMenu(page, `${prefix} mark`, "Unarchive");
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Open ${name}"]`), {}, `${prefix} mark`);

	// Drag the row onto a folder, with real drag events (feature 013).
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Open ${prefix} mark"]`);
	await page.evaluate((itemName, folderName) => {
		const data = new DataTransfer();
		const from = document.querySelector(`[aria-label="Open ${itemName}"]`).closest("li");
		const to = document.querySelector(`[aria-label="Open folder ${folderName}"]`).closest("li");
		from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }));
		to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data }));
		to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
	}, `${prefix} mark`, `${prefix} Physics`);
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Open ${name}"]`), {}, `${prefix} mark`);
	const dragged = (await (await fetch(`${base}/api/library`)).json()).items.find((i) => i.id === item.body.item.id);
	assert.ok(dragged.folderId?.startsWith("fld_"), "the drop moved it");

	// Select, then bulk trash; Grid view; restore (features 012-013).
	const a = `${prefix} bulk one`, b = `${prefix} bulk two`;
	await api("/api/library/pages", "POST", { name: a, content: "x" });
	await api("/api/library/pages", "POST", { name: b, content: "x" });
	await page.waitForSelector(`[aria-label="Open ${b}"]`);
	await live(page, '[data-testid="library-grid"]');
	await page.click('[data-testid="library-grid"]');
	await page.click('[data-testid="library-select-mode"]');
	await page.click(`[aria-label="Select ${a}"]`);
	await page.click(`[aria-label="Select ${b}"]`);
	assert.ok((await page.$eval('[data-testid="library-bulk"]', (el) => el.innerText)).includes("2 selected"));
	await page.click('[data-testid="library-bulk-trash"]');
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Open ${name}"]`), {}, a);
	await page.goto(`${base}/library?view=trash`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Restore ${a}"]`);
	await live(page, `[aria-label="Restore ${a}"]`);
	await page.click(`[aria-label="Restore ${a}"]`);
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Restore ${name}"]`), {}, a);
	await page.click(`[aria-label="Delete ${b} for good"]`);
	await page.waitForSelector('[data-testid="library-purge-confirm"]');
	await page.click('[data-testid="library-purge-confirm"]');
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Delete ${name} for good"]`), {}, b);
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Open ${a}"]`);
	const gridOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	assert.ok(gridOverflow <= 0, `no overflow in grid at ${width}: ${gridOverflow}`);
	if (process.env.LH_UI_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.LH_UI_SCREENSHOT_DIR, `grid-${width}.png`) });
	await page.evaluate(() => window.localStorage.removeItem("lh-library-view"));

	// A folder goes to the trash with what's in it (replaces the 011 refusal).
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Delete folder ${prefix} Physics"]`);
	await live(page, `[aria-label="Delete folder ${prefix} Physics"]`);
	await page.click(`[aria-label="Delete folder ${prefix} Physics"]`);
	await page.waitForSelector('[data-testid="library-folder-delete-confirm"]');
	await page.click('[data-testid="library-folder-delete-confirm"]');
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Open folder ${name}"]`), {}, `${prefix} Physics`);
	await page.goto(`${base}/library?view=trash`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Restore ${prefix} Physics"]`);
	await live(page, `[aria-label="Restore ${prefix} Physics"]`);
	await page.click(`[aria-label="Restore ${prefix} Physics"]`);
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Restore ${name}"]`), {}, `${prefix} Physics`);

	// A missing folder says so.
	await page.goto(`${base}/library?folder=fld_missing`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="library-folder-missing"]');

	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="library-folder-row"]');
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	assert.ok(overflow <= 0, `no page overflow at ${width}: ${overflow}`);
	if (process.env.LH_UI_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.LH_UI_SCREENSHOT_DIR, `folders-${width}.png`) });
	assert.deepEqual(errors, []);
	await page.close();
	console.log(`ok ${width}`);
}

try {
	await mkdir(data, { recursive: true });
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		env: { ...process.env, OPENROUTER_API_KEY: "test-key-never-used", LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
		stdio: ["ignore", "ignore", "ignore"],
	});
	let ready = false;
	for (let i = 0; i < 240 && !ready; i++) {
		ready = await fetch(`${base}/api/library`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
		if (!ready) await pause(250);
	}
	assert.ok(ready, "isolated server starts");
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
	for (const width of [1440, 390, 320]) await checkWidth(width);
	console.log("Library folders browser checks passed.");
} finally {
	await browser?.close();
	server?.kill();
	await rm(root, { recursive: true, force: true });
}
