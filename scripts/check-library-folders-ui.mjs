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

async function checkWidth(width) {
	const prefix = `w${width}`;
	const page = await browser.newPage();
	await page.setViewport({ width, height: 800 });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const sourcePage = (await api("/api/library/pages", "POST", { name: `${prefix} note`, content: "first" })).body.item;
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });

	// New folder by keyboard: Enter submits, focus comes back.
	await page.waitForSelector('[data-testid="library-new-folder"]');
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
	await page.click(`[aria-label="Move ${prefix} note"]`);
	await page.waitForSelector('[data-testid="library-move-dialog"]');
	await page.evaluate((label) => {
		[...document.querySelectorAll('[data-testid="library-move-target"]')].find((el) => el.textContent.includes(label)).click();
	}, `${prefix} Physics`);
	await page.waitForFunction((name) => !document.querySelector(`[aria-label="Open ${name}"]`), {}, `${prefix} note`);

	// Into the folder: breadcrumbs, the page, and a subfolder.
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
	await page.click('[data-testid="library-breadcrumbs"] a');
	await page.waitForSelector(`[aria-label="Move folder ${prefix} Physics"]`);
	await page.click(`[aria-label="Move folder ${prefix} Physics"]`);
	await page.waitForSelector('[data-testid="library-move-dialog"]');
	const targets = await page.$$eval('[data-testid="library-move-target"]', (els) => els.map((el) => el.textContent));
	assert.ok(!targets.some((t) => t.includes(`${prefix} Physics`)), `targets: ${targets}`);
	await page.keyboard.press("Escape");

	// A folder with something in it refuses, in the dialog.
	await page.click(`[aria-label="Delete folder ${prefix} Physics"]`);
	await page.waitForSelector('[data-testid="library-folder-delete-confirm"]');
	await page.click('[data-testid="library-folder-delete-confirm"]');
	await page.waitForSelector('[data-testid="library-folder-delete-dialog"] [role="alert"]');
	await page.keyboard.press("Escape");

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
