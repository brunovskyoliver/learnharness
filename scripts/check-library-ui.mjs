/** Isolated browser regression for the Library (feature 009), through the real
 * proxy: upload, clash, rename, open and delete at 320, 390 and 1440 px, plus
 * the 50 MiB limit. Makes no model requests.
 * CHROME_PATH=/path/to/chrome node scripts/check-library-ui.mjs
 * Then the @ list in every field and the sent labels, with model submissions
 * intercepted. Optional: LH_UI_SCREENSHOT_DIR saves evidence, LH_UI_PORT picks
 * the port, LH_UI_MENTIONS_ONLY=1 runs only the @ part.
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
const mentionsOnly = process.env.LH_UI_MENTIONS_ONLY === "1";
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

const golden = async (name) => JSON.parse(await readFile(new URL(`../tests/fixtures/golden-data/chats/${name}.json`, import.meta.url), "utf8"));

/** Sessions for the @ fields and the sent labels, on the golden transcripts. */
async function seedMentionChats() {
	const chats = path.join(data, "chats");
	await mkdir(chats, { recursive: true });
	const settings = { model: { provider: "openrouter", id: "openai/gpt-4o" } };
	const write = (chat) => writeFile(path.join(chats, `${chat.id}.json`), JSON.stringify({ ...chat, settings }));
	const lesson = await golden("chat_mv27rrra_feff23b6");
	const plan = lesson.messages.findIndex((m) => m.role === "toolResult" && m.toolName === "plan_init" && m.details?.tree);
	const check = lesson.messages.findIndex((m, i) => i > plan && m.role === "assistant" && m.content?.some((p) => p.type === "toolCall" && p.name === "quiz" && p.arguments.type === "check"));
	const quiz = { ...structuredClone(lesson), id: "mention-quiz", messages: structuredClone(lesson.messages.slice(0, check + 1)) };
	await write(quiz);
	const explain = { ...structuredClone(quiz), id: "mention-explain" };
	const call = explain.messages.at(-1).content.find((p) => p.type === "toolCall" && p.name === "quiz");
	explain.messages.at(-1).content = [{ ...call, name: "explain", arguments: { type: "check", nodeId: call.arguments.nodeId, question: "Explain the step in your own words.", correctAnswer: "The committed answer." } }];
	await write(explain);
	const practiceSource = await golden("chat_mv293wv5_10656952");
	const problem = practiceSource.messages.findIndex((m) => m.role === "assistant" && m.content?.some((p) => p.type === "toolCall" && p.name === "problem"));
	await write({ ...practiceSource, id: "mention-practice", messages: practiceSource.messages.slice(0, problem + 2) });
	const ref = (over) => ({ itemId: `lib_gone_${over.name}`, name: "a.md", kind: "markdown", size: 3, mode: "inline", ...over });
	const references = [
		ref({ name: "in-full.md" }),
		ref({ name: "long.md", mode: "outline", reason: "too-long" }),
		ref({ name: "crowded.md", mode: "outline", reason: "message-limit" }),
		ref({ name: "roomless.md", mode: "outline", reason: "no-room" }),
		ref({ name: "book.pdf", kind: "pdf", mode: "outline", reason: "not-ready" }),
		ref({ name: "figure.png", kind: "image", mode: "image" }),
		ref({ name: "photo.png", kind: "image", mode: "unreadable", reason: "no-vision" }),
		ref({ name: "scan.pdf", kind: "pdf", mode: "unreadable", reason: "no-text" }),
		ref({ name: "archive.xyz", kind: "other", mode: "unreadable", reason: "unsupported" }),
		ref({ name: "ninth.md", mode: "missing", reason: "over-count" }),
		ref({ name: "deleted.md", mode: "missing", size: undefined }),
	];
	await write({
		...structuredClone(lesson),
		id: "mention-chat",
		messages: [
			{ id: "m_user", role: "user", content: "Use these, with @in-full.md first.", references, timestamp: 1 },
			{ ...lesson.messages.find((m) => m.role === "assistant" && m.stopReason === "stop"), id: "m_reply", content: [{ type: "text", text: "Read them." }] },
		],
	});
}

/** The keyboard path in one field, with model submissions intercepted. */
async function checkMentionField(page, posts, width, name, selector, { sends = true, escapeDialog = false } = {}) {
	const field = await page.waitForSelector(selector, { visible: true });
	const value = () => page.$eval(selector, (el) => el.value);
	const focused = () => page.$eval(selector, (el) => document.activeElement === el);
	const clear = async () => {
		await page.$eval(selector, (el) => { el.focus(); el.select(); });
		await page.keyboard.press("Backspace");
	};
	const waitValue = async (expected) => {
		for (let i = 0; i < 100; i++) {
			if (await value() === expected) return;
			await pause(50);
		}
		assert.equal(await value(), expected, `${name}: the field's text`);
	};
	const menu = '[data-testid="mention-menu"]';
	const menuGone = () => page.waitForFunction((sel) => !document.querySelector(sel), {}, menu);
	await field.focus();
	await clear();
	assert.equal(await page.$eval(selector, (el) => el.getAttribute("role")), "combobox", `${name}: combobox`);

	// A list opens, filters, moves, and Escape closes only it.
	await page.keyboard.type("@w");
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="mention-option"]')].some((o) => o.innerText.includes("Week 3 notes.md")));
	const open = await page.$eval(selector, (el) => [el.getAttribute("aria-expanded"), el.getAttribute("aria-controls"), el.getAttribute("aria-activedescendant")]);
	assert.equal(open[0], "true", `${name}: expanded`);
	assert.ok(open[1] && open[2], `${name}: controls and active option`);
	assert.equal(await page.$eval(menu, (el) => getComputedStyle(el).scrollbarWidth), "none", `${name}: hidden tracks`);
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	assert.ok(overflow <= 0, `${name} ${width}px: no page overflow (${overflow}px)`);
	const inside = await page.$eval(menu, (el) => {
		const box = el.getBoundingClientRect();
		const shell = el.closest(".prompt-shell")?.getBoundingClientRect();
		const area = document.querySelector(`[aria-controls="${el.id}"]`).getBoundingClientRect();
		return { above: box.bottom <= area.top + 1, within: !shell || (box.left >= shell.left && box.right <= shell.right), onScreen: box.top >= 0 };
	});
	assert.deepEqual(inside, { above: true, within: true, onScreen: true }, `${name} ${width}px: above the field, inside the shell`);
	if (width < 768) {
		const height = await page.$eval('[data-testid="mention-option"]', (el) => el.getBoundingClientRect().height);
		assert.ok(height >= 44, `${name}: coarse rows at least 44px (${height})`);
	}
	if (shots) await page.screenshot({ path: path.join(shots, `mention-${width}-${name}.png`) });
	await page.keyboard.press("Escape");
	await menuGone();
	assert.equal(await value(), "@w", `${name}: Escape keeps the draft`);
	assert.ok(await focused(), `${name}: Escape keeps focus`);
	assert.equal(await page.$('[role="alertdialog"], [data-testid="abort-turn-dialog"], [data-testid="dismiss-dialog"]'), null, `${name}: Escape opens nothing`);
	assert.equal(posts.length, 0, `${name}: Escape submits nothing`);
	if (escapeDialog) {
		// With the list closed, Escape is the field's own again.
		await page.keyboard.press("Escape");
		await page.waitForSelector('[role="alertdialog"], [role="dialog"]', { visible: true });
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => !document.querySelector('[role="alertdialog"], [role="dialog"]'));
		await field.focus();
	}

	// No match says so, and plain text stays.
	await clear();
	await page.keyboard.type("@zzzz");
	await page.waitForFunction((sel) => document.querySelector(sel)?.querySelector('[role="status"]')?.textContent === "Nothing matched", {}, menu);
	await page.keyboard.type(" ");
	await menuGone();
	assert.equal(await value(), "@zzzz ", `${name}: a space closes an unmatched query`);

	// An email and code never open it.
	await clear();
	await page.keyboard.type("me@w");
	await pause(150);
	assert.equal(await page.$(menu), null, `${name}: an email does not open it`);
	await clear();
	await page.keyboard.type("`@w");
	await pause(150);
	assert.equal(await page.$(menu), null, `${name}: code does not open it`);

	// Enter inserts and keeps focus; the pre-send line shows the name.
	await clear();
	await page.keyboard.type("see @no");
	await page.waitForSelector('[data-testid="mention-option"]');
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("Enter");
	await waitValue("see @notes.md ");
	assert.ok(await focused(), `${name}: Enter keeps focus`);
	assert.equal(posts.length, 0, `${name}: inserting submits nothing`);
	await page.waitForFunction(() => document.querySelector('[data-testid="attaching-line"]')?.textContent === "Attaching notes.md");

	// Tab inserts too, and a click keeps focus.
	await clear();
	await page.keyboard.type("@Week");
	await page.waitForSelector('[data-testid="mention-option"]');
	await page.keyboard.press("Tab");
	await waitValue("@Week 3 notes.md ");
	assert.ok(await focused(), `${name}: Tab keeps focus`);
	await clear();
	await page.keyboard.type("@no");
	await page.click('[data-testid="mention-option"]');
	await waitValue("@notes.md ");
	assert.ok(await focused(), `${name}: a click keeps focus`);
	if (shots) await page.screenshot({ path: path.join(shots, `mention-${width}-${name}-attaching.png`) });

	if (sends) {
		await page.keyboard.press("Enter");
		for (let i = 0; i < 100 && posts.length === 0; i++) await pause(50);
		assert.equal(posts.length, 1, `${name}: the next Enter submits`);
		assert.ok(JSON.stringify(posts[0]).includes("@notes.md"), `${name}: the text carries the token`);
		assert.ok(!JSON.stringify(posts[0]).includes('"references"'), `${name}: the client sends no references`);
		posts.length = 0;
	} else {
		await clear();
	}
	console.log(`PASS ${width}px @ list in ${name}`);
}

async function checkMentions(width) {
	const mobile = width < 768;
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const consoleErrors = new Set();
	if (process.env.LH_UI_LOG_CONSOLE) page.on("response", (response) => { if (response.status() >= 400) consoleErrors.add(`${response.status()} ${response.url()}`); });
	page.on("console", (message) => { if (message.type() === "error") consoleErrors.add(`${page.url()} ${message.text().slice(0, 400)}`); });
	await page.setViewport({ width, height: mobile ? 700 : 900, isMobile: mobile, hasTouch: mobile });
	const posts = [];
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (request.method() === "POST" && /^\/api\/chat(s\/[^/]+\/(steer|dismiss))?$/.test(url.pathname)) {
			posts.push(JSON.parse(request.postData() ?? "{}"));
			return void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
		}
		void request.continue();
	});
	const open = async (url, selector) => {
		await page.goto(`${base}${url}`, { waitUntil: "domcontentloaded" });
		await page.waitForFunction((sel) => {
			const field = document.querySelector(sel);
			const props = field && Object.keys(field).find((key) => key.startsWith("__reactProps$"));
			return typeof field?.[props]?.onChange === "function";
		}, {}, selector);
		const hidden = await page.$eval(selector, (el) => !el.offsetParent);
		if (hidden) await page.click('[data-testid="question-dock-bar"], [data-testid="practice-dock-bar"]');
	};
	const composer = '[data-testid="composer"] textarea';
	await open("/", composer);
	await checkMentionField(page, posts, width, "home", composer, { sends: false });
	await open("/chat/mention-chat", composer);
	await checkMentionField(page, posts, width, "chat", composer);
	await open("/chat/mention-quiz", '[aria-label="Your thinking"]');
	await checkMentionField(page, posts, width, "question-thinking", '[aria-label="Your thinking"]', { sends: false, escapeDialog: true });
	await open("/chat/mention-explain", '[aria-label="Your answer"]');
	await checkMentionField(page, posts, width, "question-answer", '[aria-label="Your answer"]');
	await open("/chat/mention-practice", '[aria-label="Your thinking"]');
	await checkMentionField(page, posts, width, "practice", '[aria-label="Your thinking"]');

	// Every label as sent, always visible, on the sender's card.
	await open("/chat/mention-chat", composer);
	await page.waitForSelector('[data-testid="references-card"]', { visible: true });
	await page.waitForFunction(() => document.querySelector('[data-testid="references-card"]').innerText.includes("Used in-full.md · in full · no longer in your Library"));
	const labels = await page.$eval('[data-testid="references-card"]', (el) => el.innerText);
	for (const text of [
		"Used long.md · outline only, too long to send whole",
		"Used crowded.md · outline only, too much attached at once",
		"Used roomless.md · outline only, not enough room in this session",
		"Used book.pdf · not read yet, the agent can open it",
		"Used figure.png · image, the agent can ask the vision model about it",
		"photo.png · no vision model set",
		"scan.pdf · no text could be read",
		"archive.xyz · this kind of file can't be read",
		"ninth.md · not attached, limit is 8 per message",
		"deleted.md · no longer in your Library",
	]) assert.ok(labels.includes(text), `${width}px label: ${text}`);
	assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${width}px labels: no page overflow`);
	const label = await page.$('[data-testid="references-card"]');
	await label.scrollIntoView();
	if (shots) await page.screenshot({ path: path.join(shots, `mention-${width}-labels.png`) });
	if (process.env.LH_UI_LOG_CONSOLE) console.log([...consoleErrors].join("\n"));
	assert.deepEqual(errors, [], `${width}px: no browser exceptions in the @ fields`);
	await context.close();
	console.log(`PASS ${width}px sent labels`);
}

try {
	await mkdir(data, { recursive: true });
	await mkdir(fixtures, { recursive: true });
	if (shots) await mkdir(shots, { recursive: true });
	await seedMentionChats();
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		env: { ...process.env, OPENROUTER_API_KEY: "test-key-never-used", LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
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
	if (!mentionsOnly) await checkLibrary();
	// A clean folder, then the @ lists over known names.
	for (const name of await readdir(files).catch(() => [])) await rm(path.join(files, name));
	for (const name of ["notes.md", "Week 3 notes.md", "paper-one.md", "paper-two.md", "paper-three.md", "paper-four.md", "paper-five.md", "paper-six.md", "paper-seven.md"]) {
		const upload = await fetch(`${base}/api/library/upload?name=${encodeURIComponent(name)}`, { method: "POST", body: `# ${name}\n` });
		assert.equal(upload.status, 201, name);
	}
	for (const width of process.env.LH_UI_WIDTHS?.split(",").map(Number) ?? [1440, 390, 320]) await checkMentions(width);
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		server.kill("SIGTERM");
		await new Promise((resolve) => server.once("exit", resolve));
	}
	await rm(root, { recursive: true, force: true });
}

async function checkLibrary() {
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
}
