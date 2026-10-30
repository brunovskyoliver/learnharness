/** Isolated browser regression for the Library (feature 009), through the real
 * proxy: upload, clash, rename, open and delete at 320, 390 and 1440 px, plus
 * the 50 MiB limit. Makes no model requests.
 * CHROME_PATH=/path/to/chrome node scripts/check-library-ui.mjs
 * Optional: LH_UI_SCREENSHOT_DIR saves evidence, LH_UI_PORT picks the port.
 * Set TMPDIR under the home folder for a snap Chromium, whose /tmp is private.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const MiB = 1024 * 1024;
const MAX_BYTES = 50 * MiB;
const port = Number(process.env.LH_UI_PORT ?? 3103);
const base = `http://127.0.0.1:${port}`;
const shots = process.env.LH_UI_SCREENSHOT_DIR;
const root = await mkdtemp(path.join(os.tmpdir(), "learning-library-ui-"));
const data = path.join(root, "data");
const fixtures = path.join(root, "fixtures");
const files = path.join(data, "files");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const row = (name) => `[data-testid="library-row"]:has([aria-label="Delete ${name}"])`;
let server;
let browser;

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
async function fixture(name, content) {
	const file = path.join(fixtures, name);
	await writeFile(file, content);
	return file;
}
/** A real HTTP request, so the body goes through the proxy's buffering. */
function rawUpload(name, size) {
	return new Promise((resolve, reject) => {
		const request = http.request(`${base}/api/library/upload?name=${encodeURIComponent(name)}`, {
			method: "POST",
			headers: { "Content-Length": size, "Content-Type": "application/octet-stream" },
		}, (response) => {
			const chunks = [];
			response.on("data", (chunk) => chunks.push(chunk));
			response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") }));
		});
		// The server may answer and close before the whole body is sent.
		request.on("error", (error) => (error.code === "EPIPE" || error.code === "ECONNRESET" ? resolve({ status: 0, body: {} }) : reject(error)));
		const chunk = Buffer.alloc(MiB, "%PDF-");
		let left = size;
		const send = () => {
			while (left > 0) {
				const part = chunk.subarray(0, Math.min(left, MiB));
				left -= part.length;
				if (!request.write(part)) return void request.once("drain", send);
			}
			request.end();
		};
		send();
	});
}

async function checkWidth(width) {
	const mobile = width < 768;
	const shot = async (page, name) => {
		if (shots) await page.screenshot({ path: path.join(shots, `library-${width}-${name}.png`) });
	};
	const page = await browser.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width, height: mobile ? 700 : 900, isMobile: mobile, hasTouch: mobile });
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => document.body.innerText.includes("Nothing here yet. Upload a document or start a page."));
	await shot(page, "empty");

	const assertLayout = async (label) => {
		const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, track: getComputedStyle(document.querySelector('[data-testid="library-scroll"]')).scrollbarWidth }));
		assert.ok(layout.overflow <= 0, `${width}px ${label}: no page overflow (${layout.overflow}px)`);
		assert.equal(layout.track, "none", `${width}px ${label}: hidden scrollbars`);
	};
	const count = () => page.$$eval('[data-testid="library-row"]', (rows) => rows.length);
	const pick = async (...paths) => (await page.$('[data-testid="library-file-input"]')).uploadFile(...paths);
	const waitRow = (name) => page.waitForSelector(row(name));

	// Upload and survive a reload.
	const long = `${"a-very-long-file-name-without-spaces-".repeat(4)}.md`;
	const notes = await fixture("notes.md", "# original\n\nfirst bytes\n");
	await pick(notes, await fixture(long, "long"));
	await waitRow("notes.md");
	await waitRow(long);
	assert.match(await page.$eval(row("notes.md"), (el) => el.innerText), /Markdown · \d+ B · /);
	await page.reload({ waitUntil: "domcontentloaded" });
	await waitRow("notes.md");
	await assertLayout("list");
	await shot(page, "list");
	if (mobile) {
		for (const label of ["Rename notes.md", "Delete notes.md"]) {
			const box = await page.$eval(`[aria-label="${label}"]`, (el) => el.getBoundingClientRect().toJSON());
			assert.ok(box.width >= 44 && box.height >= 44, `${width}px ${label} is at least 44px: ${JSON.stringify(box)}`);
		}
	}

	// A clash never overwrites: Escape and Cancel keep one, Keep both keeps two.
	const original = await readFile(path.join(files, "notes.md"));
	const againDir = path.join(fixtures, `again-${width}`);
	await mkdir(againDir, { recursive: true });
	const again = path.join(againDir, "notes.md");
	await writeFile(again, "# different\n");
	await pick(again);
	await page.waitForSelector('[data-testid="library-clash-dialog"]', { visible: true });
	const clashText = await page.$eval('[data-testid="library-clash-dialog"]', (el) => el.innerText);
	for (const text of ["notes.md is already in your Library.", "Keep both as notes (2).md", "Cancel"]) assert.ok(clashText.includes(text), text);
	await assertLayout("clash");
	await shot(page, "clash");
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="library-clash-dialog"]'));
	assert.equal(await count(), 2, "Escape cancels the clash");
	await pick(again);
	await page.waitForSelector('[data-testid="library-clash-keep"]', { visible: true });
	await page.click('[data-testid="library-clash-keep"]');
	await waitRow("notes (2).md");
	assert.deepEqual(await readFile(path.join(files, "notes.md")), original, "the original's bytes are unchanged");
	assert.equal(await readFile(path.join(files, "notes (2).md"), "utf8"), "# different\n");

	// Search filters names.
	await page.type('[data-testid="library-search"]', "(2)");
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="library-row"]').length === 1);
	await page.$eval('[data-testid="library-search"]', (el) => { el.focus(); el.select(); });
	await page.keyboard.type("zzz");
	await page.waitForFunction(() => document.body.innerText.includes("Nothing matched"));
	await page.$eval('[data-testid="library-search"]', (el) => { el.select(); });
	await page.keyboard.press("Backspace");
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="library-row"]').length === 3);

	// Rename moves the file; a taken name is refused in place.
	await page.click('[aria-label="Rename notes (2).md"]');
	await page.waitForSelector('[data-testid="library-rename-input"]', { visible: true });
	await page.keyboard.type("notes.md");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => document.querySelector('[data-testid="library-row"] [role="alert"]')?.textContent.includes("already in your Library"));
	await page.$eval('[data-testid="library-rename-input"]', (el) => el.select());
	await page.keyboard.type("renamed.md");
	await page.keyboard.press("Enter");
	await waitRow("renamed.md");
	assert.ok(existsSync(path.join(files, "renamed.md")));
	assert.ok(!existsSync(path.join(files, "notes (2).md")));

	// Text opens read-only in place.
	await page.click('[aria-label="Open notes.md"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="library-read-only"] pre')?.textContent.includes("first bytes"));
	assert.ok((await page.$eval('[data-testid="library-read-only"]', (el) => el.innerText)).includes("This is your original; it can't be edited here."));
	await assertLayout("read-only");
	await shot(page, "read-only");
	await page.click('[aria-label="Open notes.md"]');

	// Refusals name the file and stay until dismissed; nothing is stored.
	await pick(await fixture("program.exe", "binary"), await fixture("empty.md", ""), await fixture("fake.pdf", "not a pdf"));
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="library-refusal"]').length === 3);
	const refusals = await page.$$eval('[data-testid="library-refusal"]', (rows) => rows.map((el) => el.innerText).join("\n"));
	for (const text of ["program.exe", "isn't accepted", "empty.md", "is empty", "fake.pdf", "don't match"]) assert.ok(refusals.includes(text), text);
	for (const name of ["program.exe", "empty.md", "fake.pdf"]) assert.ok(!existsSync(path.join(files, name)), `${name} not stored`);
	await assertLayout("refusals");
	await shot(page, "refusals");
	for (const name of ["program.exe", "empty.md", "fake.pdf"]) await page.click(`[aria-label="Dismiss ${name}"]`);
	await page.waitForFunction(() => !document.querySelector('[data-testid="library-refusal"]'));

	// PDF opens in a new tab, not in place.
	await pick(await fixture("paper.pdf", "%PDF-1.7 fixture"));
	await waitRow("paper.pdf");
	assert.deepEqual(await page.$eval('[aria-label="Open paper.pdf"]', (el) => [el.tagName, el.target, el.rel]), ["A", "_blank", "noreferrer"]);

	// Delete: the dialog names the item; Escape keeps it and returns focus.
	await page.click(`[aria-label="Delete renamed.md"]`);
	await page.waitForSelector('[data-testid="library-delete-dialog"]', { visible: true });
	assert.ok((await page.$eval('[data-testid="library-delete-dialog"]', (el) => el.innerText)).includes("Delete renamed.md?"));
	await assertLayout("delete");
	await shot(page, "delete");
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Delete renamed.md");
	assert.ok(existsSync(path.join(files, "renamed.md")));
	for (const name of ["renamed.md", "notes.md", "paper.pdf", long]) {
		await page.click(`[aria-label="Delete ${name}"]`);
		await page.waitForSelector('[data-testid="library-delete-confirm"]', { visible: true });
		await page.click('[data-testid="library-delete-confirm"]');
		await page.waitForFunction((sel) => !document.querySelector(sel), {}, row(name));
		await page.waitForFunction(() => !document.querySelector('[data-testid="library-delete-dialog"]'));
	}
	assert.deepEqual(await readdir(files), []);
	await page.waitForFunction(() => document.body.innerText.includes("Nothing here yet."));

	// The sidebar reaches the view at this width.
	if (mobile) {
		await page.click('[aria-label="Open sidebar"]');
		await page.waitForSelector('[data-testid="sidebar-library"]', { visible: true });
		await shot(page, "sidebar");
	}
	const link = await page.$eval('[data-testid="sidebar-library"]', (el) => [el.getAttribute("href"), el.getAttribute("aria-current"), el.textContent.trim()]);
	assert.deepEqual(link, ["/library", "page", "Library"]);
	assert.deepEqual(errors, [], `${width}px: no browser exceptions`);
	await page.close();
	console.log(`PASS ${width}px upload, clash, search, rename, open, refusal, delete`);
}

try {
	await mkdir(data, { recursive: true });
	await mkdir(fixtures, { recursive: true });
	if (shots) await mkdir(shots, { recursive: true });
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		env: { ...process.env, LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	server.stdout.on("data", (chunk) => { output = (output + chunk).slice(-3000); });
	server.stderr.on("data", (chunk) => { output = (output + chunk).slice(-3000); });
	let ready = false;
	for (let i = 0; i < 240 && !ready; i++) {
		if (server.exitCode !== null) throw new Error(`Dev server exited: ${output}`);
		ready = await fetch(`${base}/api/library`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
		if (!ready) await pause(250);
	}
	assert.ok(ready, "isolated server starts");
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
	for (const width of [1440, 390, 320]) await checkWidth(width);

	// The limit, through the real proxy. A body over the proxy's buffer would
	// be cut silently, so the handler must refuse on the declared length.
	const over = await rawUpload("over-proxy.pdf", 52 * MiB);
	assert.ok(over.status === 413 || over.status === 0, `above 51 MB is refused, got ${over.status}`);
	assert.ok(!existsSync(path.join(files, "over-proxy.pdf")), "nothing stored above the proxy's limit");
	const oneOver = await rawUpload("one-over.pdf", MAX_BYTES + 1);
	assert.ok(oneOver.status === 413 || oneOver.status === 0, `one byte over is refused, got ${oneOver.status}`);
	assert.ok(!existsSync(path.join(files, "one-over.pdf")));
	console.log(`PASS above the limit refused through the proxy (52 MiB: ${over.status}, one byte over: ${oneOver.status}; 0 means closed mid-send), nothing stored`);

	const exact = await rawUpload("exact.pdf", MAX_BYTES);
	assert.equal(exact.status, 201, JSON.stringify(exact.body));
	assert.equal(exact.body.item.size, MAX_BYTES);
	const expected = Buffer.alloc(MiB, "%PDF-");
	const hash = createHash("sha256");
	for (let i = 0; i < 50; i++) hash.update(expected);
	const stored = createHash("sha256");
	for await (const chunk of createReadStream(path.join(files, "exact.pdf"))) stored.update(chunk);
	assert.equal(stored.digest("hex"), hash.digest("hex"), "an exact 50 MiB file arrives whole");
	console.log("PASS exact 50 MiB through the proxy, checksum matches");

	// The learner's path for the same size: a real file through XHR, with percent.
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900 });
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(row("exact.pdf"));
	const browserFile = await fixture("browser.pdf", Buffer.alloc(MAX_BYTES, "%PDF-"));
	const browserSha = sha(await readFile(browserFile));
	await (await page.$('[data-testid="library-file-input"]')).uploadFile(browserFile);
	await page.waitForSelector('[data-testid="library-upload-row"] [role="progressbar"]');
	if (shots) await page.screenshot({ path: path.join(shots, "library-1440-uploading.png") });
	await page.waitForSelector(row("browser.pdf"), { timeout: 120000 });
	assert.equal(sha(await readFile(path.join(files, "browser.pdf"))), browserSha);
	const overFile = await fixture("over.pdf", Buffer.alloc(MAX_BYTES + 1, "%PDF-"));
	await (await page.$('[data-testid="library-file-input"]')).uploadFile(overFile);
	await page.waitForFunction(() => document.querySelector('[data-testid="library-refusal"]')?.innerText.includes("over the 50 MB limit"));
	assert.ok(!existsSync(path.join(files, "over.pdf")));
	await page.close();
	console.log("PASS 50 MiB through the browser with progress; one byte over refused");
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		server.kill("SIGTERM");
		await new Promise((resolve) => server.once("exit", resolve));
	}
	await rm(root, { recursive: true, force: true });
}
