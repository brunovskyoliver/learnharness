/** Isolated browser regression for the Library (feature 009), through the real
 * proxy: upload, clash, rename, open and delete at 320, 390 and 1440 px, plus
 * the 50 MiB limit. Makes no model requests.
 * CHROME_PATH=/path/to/chrome node scripts/check-library-ui.mjs
 * Then the @ list in every field and the sent labels, with model submissions
 * intercepted, and "New page" in every @ field (T096). Optional: LH_UI_SCREENSHOT_DIR saves evidence, LH_UI_PORT picks
 * the port, LH_UI_MENTIONS_ONLY=1 runs only the @ part, LH_UI_PAGES_ONLY=1 only
 * the page pane (real editor corpus, reload, two tabs, restore, phone layer).
 * LH_UI_FIXES_ONLY=1 only the page-editing-fixes checks; LH_UI_TOOLS_ONLY=1 only
 * the feature 010 editor tools.
 * LH_UI_SETTINGS_ONLY=1 runs only Settings: search, row jump, Escape layers,
 * deep link, persistence after reload, failed load and failed save.
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
const pageApi = {
	create: async (name, content) => {
		const r = await fetch(`${base}/api/library/pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content }) });
		assert.equal(r.status, 201, name);
		return (await r.json()).item;
	},
	read: async (id) => (await fetch(`${base}/api/library/pages/${id}`)).json(),
	versions: async (id) => (await (await fetch(`${base}/api/library/pages/${id}/versions`)).json()).versions,
	text: async (id, n) => (await (await fetch(`${base}/api/library/pages/${id}/versions/${n}`)).json()).content,
};
const SAVE = process.platform === "darwin" ? "Meta" : "Control";
const saveKeys = async (page) => {
	await page.keyboard.down(SAVE);
	await page.keyboard.press("s");
	await page.keyboard.up(SAVE);
};
const editor = '[data-testid="page-editor"]';
const openPage = async (page, name) => {
	await page.waitForSelector(`[aria-label="Open ${name}"]`);
	await page.click(`[aria-label="Open ${name}"]`);
	await page.waitForSelector(editor, { timeout: 60000 });
};
/** Save state text, once it settles on one of `wanted`. */
const waitSave = (page, ...wanted) => page.waitForFunction((list) => list.some((text) => document.querySelector('[data-testid="page-save-state"]')?.textContent.startsWith(text)), {}, wanted);
const hiddenScrollbars = (page) => page.$eval(editor, (el) => {
	const host = el.closest(".lh-page-editor-host");
	return [getComputedStyle(host).scrollbarWidth, getComputedStyle(el).scrollbarWidth];
});

const MATH_PAGE = "# Title with $x^2$\n\nLet $f(x) = x^2$ and **Gradient descent and step size**.\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n\n| A | B |\n|---|---|\n| $a$ | `$b` |\n\n- one\n  - two\n\n```bash\necho \"$HOME @notes.pdf\"\n```\n";

const mentionsOnly = process.env.LH_UI_MENTIONS_ONLY === "1";
const pagesOnly = process.env.LH_UI_PAGES_ONLY === "1";
const fixesOnly = process.env.LH_UI_FIXES_ONLY === "1";
const toolsOnly = process.env.LH_UI_TOOLS_ONLY === "1";
const settingsOnly = process.env.LH_UI_SETTINGS_ONLY === "1";
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

	// Text opens read-only in the pane.
	await page.click('[aria-label="Open notes.md"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="library-read-only"] pre')?.textContent.includes("first bytes"));
	assert.ok((await page.$eval('[data-testid="library-read-only"]', (el) => el.innerText)).includes("This is your original; it can't be edited here."));
	await assertLayout("read-only");
	await shot(page, "read-only");
	await page.click(mobile ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));

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
async function checkMentionField(page, posts, width, name, selector, { sends = true, escapeDialog = false, hasPane = true } = {}) {
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

	// "New page" is the last option with or without a match, and needs an arrow
	// when nothing matched. It creates, opens, inserts, and sends nothing.
	const newRow = '[data-testid="mention-new-page"]';
	const isActive = () => page.$eval(selector, (el) => {
		const active = el.getAttribute("aria-activedescendant");
		return !!active && document.getElementById(active)?.dataset.testid === "mention-new-page";
	});
	const closePane = async () => {
		await page.click(width < 768 ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
	};
	const newItem = async (before) => {
		for (let i = 0; i < 100; i++) {
			const added = (await (await fetch(`${base}/api/library`)).json()).items.filter((item) => !before.includes(item.id));
			if (added.length === 1) return added[0];
			await pause(50);
		}
		assert.fail(`${name}: one page created`);
	};
	const libraryIds = async () => (await (await fetch(`${base}/api/library`)).json()).items.map((item) => item.id);
	await clear();
	await page.keyboard.type("keep this @zzzz");
	await page.waitForFunction((row, sel) => document.querySelector(row) && document.querySelector(sel)?.querySelector('[role="status"]')?.textContent === "Nothing matched", {}, newRow, menu);
	assert.equal(await isActive(), false, `${name}: no match activates nothing`);
	if (width < 768) {
		const height = await page.$eval(newRow, (el) => el.getBoundingClientRect().height);
		assert.ok(height >= 44, `${name}: the row is at least 44px (${height})`);
	}
	assert.equal((await page.$eval(menu, (el) => el.lastElementChild.dataset.testid)), "mention-new-page", `${name}: last in the list`);
	await page.keyboard.press("ArrowDown");
	assert.equal(await isActive(), true, `${name}: an arrow reaches it`);
	if (shots) await page.screenshot({ path: path.join(shots, `mention-${width}-${name}-new-page.png`) });
	const before = await libraryIds();
	await page.keyboard.press("Enter");
	const created = await newItem(before);
	assert.equal(created.kind, "page", `${name}: a page`);
	assert.match(created.name, /^Untitled page( \(\d+\))?$/, `${name}: the default name, stepping past a clash`);
	await waitValue(`keep this @${created.name} `);
	assert.equal(posts.length, 0, `${name}: New page sends nothing`);
	assert.equal((await pageApi.read(created.id)).head.content, "", `${name}: blank`);
	await page.waitForFunction((label) => document.querySelector('[data-testid="attaching-line"]')?.textContent === label, {}, `Attaching ${created.name}`);
	if (hasPane) {
		await page.waitForSelector('[data-testid="page-pane"]', { visible: true });
		await page.waitForFunction((text) => document.querySelector('[data-testid="page-name"]')?.textContent === text, {}, created.name);
		if (shots) await page.screenshot({ path: path.join(shots, `mention-${width}-${name}-new-page-open.png`) });
		const overflowPane = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		assert.ok(overflowPane <= 0, `${name} ${width}px: no overflow with the pane (${overflowPane}px)`);
		if (width >= 768) assert.ok(await focused(), `${name}: focus stays in the field beside the pane`);
		await closePane();
		await waitValue(`keep this @${created.name} `);
		// The phone layer hands focus back; desktop's close keeps its own rule.
		if (width < 768) assert.ok(await focused(), `${name}: focus returns to the field`);
	} else {
		assert.equal(await page.$('[data-testid="page-pane"]'), null, `${name}: no pane on this screen`);
		assert.ok(await focused(), `${name}: focus stays in the field`);
	}

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
	let failPageCreate = false;
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (failPageCreate && request.method() === "POST" && url.pathname === "/api/library/pages") {
			return void request.respond({ status: 500, contentType: "application/json", body: "{}" });
		}
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
	await checkMentionField(page, posts, width, "home", composer, { sends: false, hasPane: false });
	// No pane on Home: the page waits, and opens beside the next session.
	await open("/chat/mention-chat", composer);
	await page.waitForSelector('[data-testid="page-pane"]', { visible: true });
	if (shots) await page.screenshot({ path: path.join(shots, `mention-${width}-home-then-chat.png`) });
	await page.click(mobile ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
	await open("/chat/new", composer);
	await checkMentionField(page, posts, width, "new-session", composer, { sends: false, hasPane: false });
	await open("/chat/mention-chat", composer);
	await page.waitForSelector('[data-testid="page-pane"]', { visible: true });
	await page.click(mobile ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
	await open("/chat/mention-chat", composer);
	await checkMentionField(page, posts, width, "chat", composer);
	await open("/chat/mention-quiz", '[aria-label="Your thinking"]');
	await checkMentionField(page, posts, width, "question-thinking", '[aria-label="Your thinking"]', { sends: false, escapeDialog: true });
	await open("/chat/mention-explain", '[aria-label="Your answer"]');
	await checkMentionField(page, posts, width, "question-answer", '[aria-label="Your answer"]');
	await open("/chat/mention-practice", '[aria-label="Your thinking"]');
	await checkMentionField(page, posts, width, "practice", '[aria-label="Your thinking"]');

	// New page: the other ways in, and a failed create.
	await open("/chat/mention-chat", composer);
	const field = await page.waitForSelector(composer, { visible: true });
	await field.focus();
	const fieldValue = () => page.$eval(composer, (el) => el.value);
	const wipe = async () => {
		await page.$eval(composer, (el) => { el.focus(); el.select(); });
		await page.keyboard.press("Backspace");
	};
	const row = '[data-testid="mention-new-page"]';
	const activeRow = () => page.$eval(composer, (el) => document.getElementById(el.getAttribute("aria-activedescendant"))?.dataset.testid);
	const paneClosed = async () => {
		await page.click(mobile ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
	};
	// The long list: Up wraps to the row, which scrolls into view.
	await page.keyboard.type("@");
	await page.waitForFunction((sel) => document.querySelectorAll('[data-testid="mention-option"]').length >= 6 && document.querySelector(sel), {}, row);
	await page.keyboard.press("ArrowUp");
	assert.equal(await activeRow(), "mention-new-page", `${width}px: Up wraps to New page`);
	await page.waitForFunction((sel) => {
		const box = document.querySelector(sel).getBoundingClientRect();
		const list = document.querySelector('[data-testid="mention-menu"]').getBoundingClientRect();
		return box.top >= list.top - 1 && box.bottom <= list.bottom + 1;
	}, {}, row);
	if (shots) await page.screenshot({ path: path.join(shots, `mention-${width}-new-page-long-list.png`) });
	// Styled as the rows beside it: only the active treatment differs, and it isn't amber at rest.
	const compare = await page.evaluate((sel) => {
		const pick = (el) => { const c = getComputedStyle(el); return { height: Math.round(el.getBoundingClientRect().height) >= 44, radius: c.borderRadius, padding: c.paddingLeft, cursor: c.cursor }; };
		const text = (el) => { const c = getComputedStyle(el.firstElementChild); return { color: c.color, size: c.fontSize }; };
		const other = document.querySelector('[data-testid="mention-option"]');
		const own = document.querySelector(sel);
		return { own: pick(own), other: pick(other), ownText: text(own), otherText: text(other), restingBg: getComputedStyle(other).backgroundColor };
	}, row);
	assert.deepEqual(compare.own, compare.other, `${width}px: same row box`);
	assert.deepEqual(compare.ownText, compare.otherText, `${width}px: same row ink`);
	await page.keyboard.press("ArrowDown");
	const resting = await page.$eval(row, (el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).outlineStyle]);
	assert.deepEqual(resting, [compare.restingBg, "none"], `${width}px: at rest, no fill or outline`);
	// Tab takes it as Enter does.
	await page.keyboard.press("ArrowUp");
	const keys = async (key) => {
		const before = (await (await fetch(`${base}/api/library`)).json()).items.length;
		await page.keyboard.press(key);
		for (let i = 0; i < 100 && (await (await fetch(`${base}/api/library`)).json()).items.length === before; i++) await pause(50);
	};
	await keys("Tab");
	await page.waitForFunction((sel) => document.querySelector(sel).value.startsWith("@Untitled page"), {}, composer);
	assert.equal(posts.length, 0, `${width}px: Tab sends nothing`);
	await page.waitForSelector('[data-testid="page-pane"]', { visible: true });
	await paneClosed();
	// A tap or click keeps focus and takes the same path.
	await wipe();
	await page.keyboard.type("draft @zzzz");
	await page.waitForSelector(row);
	await page.click(row);
	await page.waitForFunction((sel) => /^draft @Untitled page/.test(document.querySelector(sel).value), {}, composer);
	await page.waitForSelector('[data-testid="page-pane"]', { visible: true });
	await paneClosed();
	assert.equal(posts.length, 0, `${width}px: a click sends nothing`);
	// A failed create refuses in words and leaves the draft and the pane alone.
	failPageCreate = true;
	await wipe();
	await page.keyboard.type("my long draft @zzzz");
	await page.waitForSelector(row);
	const countBefore = (await (await fetch(`${base}/api/library`)).json()).items.length;
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="mention-new-page-refusal"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="mention-new-page-refusal"]', (el) => el.textContent), "New page · The page could not be created.");
	assert.equal(await fieldValue(), "my long draft @zzzz", `${width}px: the draft is kept`);
	assert.equal(await page.$('[data-testid="page-pane"]'), null, `${width}px: nothing opened`);
	assert.equal((await (await fetch(`${base}/api/library`)).json()).items.length, countBefore, `${width}px: nothing created`);
	assert.equal(await page.$eval(composer, (el) => document.activeElement === el), true, `${width}px: focus kept`);
	assert.equal(posts.length, 0, `${width}px: a refusal sends nothing`);
	if (shots) await page.screenshot({ path: path.join(shots, `mention-${width}-new-page-refused.png`) });
	failPageCreate = false;
	// The list came back, so trying again needs only the arrow and Enter.
	await page.waitForSelector(row);
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="page-pane"]', { visible: true });
	await page.waitForFunction((sel) => /^my long draft @Untitled page/.test(document.querySelector(sel).value), {}, composer);
	assert.equal(await page.$('[data-testid="mention-new-page-refusal"]'), null, `${width}px: the refusal clears`);
	await paneClosed();
	// With no match, Enter is still the field's: it sends, and no page is made.
	await wipe();
	await page.keyboard.type("@zzzz");
	await page.waitForSelector(row);
	const countSend = (await (await fetch(`${base}/api/library`)).json()).items.length;
	await page.keyboard.press("Enter");
	for (let i = 0; i < 100 && posts.length === 0; i++) await pause(50);
	assert.equal(posts.length, 1, `${width}px: unarmed Enter is the field's normal action`);
	await pause(150);
	assert.equal((await (await fetch(`${base}/api/library`)).json()).items.length, countSend, `${width}px: unarmed Enter makes no page`);
	posts.length = 0;
	console.log(`PASS ${width}px New page: click, Tab, wrap, refusal, retry`);

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
	if (toolsOnly) {
		if (!process.env.LH_UI_SKIP_FORMAT) for (const width of [1440, 390, 320]) await checkEditorTools(width);
		if (!process.env.LH_UI_SKIP_ACTIONS) for (const width of [1440, 390]) await checkTutorActions(width);
		if (!process.env.LH_UI_SKIP_CHANGES) for (const width of [1440, 390]) await checkTutorChanges(width);
		for (const width of [1440, 390]) await checkOutlineExport(width);
	} else if (fixesOnly) {
		await checkPageFixes();
	} else if (settingsOnly) {
		for (const width of [1440, 390, 320]) await checkSettings(width);
	} else {
	for (const width of pagesOnly ? (process.env.LH_UI_PAGE_WIDTHS ?? "1440,390,320").split(",").filter(Boolean).map(Number) : []) await checkPages(width);
	if (process.env.LH_UI_ROWS_ONLY === "1") {
		await checkPageRows();
		await checkPageAndDemo();
	}
	else if (pagesOnly) {
		await checkPageCorpus();
		await checkPageFixes();
		for (const width of [1440, 390, 320]) await checkEditorTools(width);
		for (const width of [1440, 390]) await checkTutorActions(width);
		for (const width of [1440, 390]) await checkTutorChanges(width);
	}
	if (!mentionsOnly && !pagesOnly) {
		await checkLibrary();
		for (const width of [1440, 390, 320]) await checkPages(width);
		await checkPageCorpus();
		await checkPageFixes();
		for (const width of [1440, 390, 320]) await checkEditorTools(width);
		for (const width of [1440, 390]) await checkTutorActions(width);
		for (const width of [1440, 390]) await checkTutorChanges(width);
		await checkPageRows();
		await checkPageAndDemo();
	}
	// A clean folder, then the @ lists over known names.
	for (const name of pagesOnly ? [] : await readdir(files).catch(() => [])) await rm(path.join(files, name));
	for (const name of pagesOnly ? [] : ["notes.md", "Week 3 notes.md", "paper-one.md", "paper-two.md", "paper-three.md", "paper-four.md", "paper-five.md", "paper-six.md", "paper-seven.md"]) {
		const upload = await fetch(`${base}/api/library/upload?name=${encodeURIComponent(name)}`, { method: "POST", body: `# ${name}\n` });
		assert.equal(upload.status, 201, name);
	}
	for (const width of pagesOnly ? [] : process.env.LH_UI_WIDTHS?.split(",").map(Number) ?? [1440, 390, 320]) await checkMentions(width);
	if (!mentionsOnly && !pagesOnly) for (const width of [1440, 390, 320]) await checkSettings(width);
	}
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		server.kill("SIGTERM");
		await new Promise((resolve) => server.once("exit", resolve));
	}
	await rm(root, { recursive: true, force: true });
}

/** Settings against the audit: search, row jump, Escape, deep link, persistence, failed states. */
async function checkSettings(width) {
	const page = await browser.newPage();
	page.setDefaultTimeout(20000);
	const phone = width < 768;
	await page.setViewport(phone ? { width, height: 844, isMobile: true, hasTouch: true } : { width, height: 900 });
	// A smooth row jump would move the targets under Puppeteer's clicks.
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	const failures = { load: false, save: false };
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (failures.load && url.pathname === "/api/settings" && request.method() === "GET") return request.respond({ status: 500, contentType: "application/json", body: "{}" });
		if (failures.save && url.pathname.startsWith("/api/settings/") && request.method() === "PUT") return request.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "raw internal" }) });
		return request.continue();
	});
	const id = (name) => `[data-testid="${name}"]`;
	const openSettings = async () => {
		await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
		if (phone) { await page.waitForSelector('[aria-label="Open sidebar"]', { visible: true }); for (let i = 0; i < 30 && !(await page.$("[data-mobile-navigation]")); i++) { await page.click('[aria-label="Open sidebar"]'); await pause(300); } }
		await page.waitForSelector(id("settings-entry"), { visible: true });
		await page.click(id("settings-entry"));
		await page.waitForSelector(id("settings-dialog"), { visible: true });
	};
	const type = async (text) => {
		await page.click(id("settings-search"));
		await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
		await page.keyboard.type(text);
	};
	const noOverflow = async (label) => {
		const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
		assert.ok(fits, `${label} fits at ${width}`);
	};
	try {
		await openSettings();
		await page.waitForSelector(id("section-keys"));
		// Search finds rows, not just categories.
		await type("thinking");
		await page.waitForSelector(id("settings-result-slot-strong"), { visible: true });
		await noOverflow("search results");
		await type("zzzqq");
		await page.waitForSelector(id("settings-search-empty"), { visible: true });
		// Escape clears the search and leaves the dialog open, then closes it.
		await page.keyboard.press("Escape");
		await page.waitForSelector(id("settings-nav-agent"), { visible: true });
		assert.ok(await page.$(id("settings-dialog")), "the first Escape only clears the search");
		// Jump: section changes and the row's control holds focus.
		await type("font");
		await page.waitForSelector(id("settings-result-font"), { visible: true });
		await page.click(id("settings-result-font"));
		await page.waitForSelector(id("row-font"), { visible: true });
		await page.waitForFunction(() => document.activeElement?.matches('[data-testid="font-trigger"]'));
		await type("thinking");
		await page.click(id("settings-result-slot-vision"));
		await page.waitForFunction(() => document.activeElement?.matches('[data-testid="slot-model-vision"]'));
		// Hidden scrollbars and no page overflow on the real section.
		await noOverflow("agent section");
		// Immediate persistence, and it survives a reload.
		await page.click(id("settings-nav-agent"));
		await page.waitForSelector(id("toggle-tool-demo"), { visible: true });
		const saved = page.waitForResponse((r) => r.url().endsWith("/api/settings/agent") && r.request().method() === "PUT");
		await page.click(id("toggle-tool-demo"));
		assert.equal((await saved).status(), 200);
		await page.reload({ waitUntil: "domcontentloaded" });
		await openSettings();
		await page.click(id("settings-nav-agent"));
		await page.waitForSelector(id("toggle-tool-demo"), { visible: true });
		assert.equal(await page.$eval(id("toggle-tool-demo"), (el) => el.getAttribute("aria-checked")), "false", "the switch persisted");
		// Failed save: words, details, Try again; the stored value stays.
		failures.save = true;
		await page.click(id("toggle-tool-demo"));
		await page.waitForSelector(id("settings-error"), { visible: true });
		assert.match(await page.$eval(id("settings-error"), (el) => el.textContent), /Your Agent settings could not be saved\./);
		await page.click(id("settings-error-details"));
		assert.match(await page.$eval(id("settings-error"), (el) => el.textContent), /500: raw internal/);
		assert.equal(await page.$eval(id("toggle-tool-demo"), (el) => el.getAttribute("aria-checked")), "false");
		failures.save = false;
		await page.click(id("settings-error-retry"));
		await page.waitForSelector(id("settings-error"), { hidden: true });
		await page.waitForFunction(() => document.querySelector('[data-testid="toggle-tool-demo"]').getAttribute("aria-checked") === "true");
		// Escape closes the dialog when nothing inside claims it.
		await page.evaluate(() => document.activeElement?.blur());
		await page.keyboard.press("Escape");
		await page.waitForSelector(id("settings-dialog"), { hidden: true });
		// A failed load, then a provider row that unfolds through the row jump.
		failures.load = true;
		await openSettings();
		await page.waitForSelector(id("settings-load-error"), { visible: true });
		failures.load = false;
		await page.click(id("settings-load-retry"));
		await page.waitForSelector(id("section-keys"), { visible: true });
		await type("tavily");
		await page.click(id("settings-result-TAVILY_API_KEY"));
		await page.waitForSelector(id("key-tavily_api_key-input"), { visible: true });
		assert.ok(await page.$eval(id("key-tavily_api_key-input"), (el) => el === document.activeElement), "the unfolded key field holds focus");
		await page.keyboard.press("Escape");
		await page.waitForSelector(id("key-tavily_api_key-input"), { hidden: true });
		assert.ok(await page.$(id("settings-dialog")), "Escape folds the key editor before the dialog");
		console.log(`PASS settings search, jump, Escape, persistence and failed states at ${width}`);
	} finally {
		await page.close();
	}
}

async function checkPages(width) {
	const mobile = width < 768;
	const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `page-${width}-${name}.png`) }); };
	const page = await browser.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width, height: mobile ? 800 : 900 });
	const tag = `w${width}`;
	const noOverflow = async (label) => {
		const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		assert.ok(over <= 0, `${width}px ${label}: page overflow ${over}`);
	};
	const closePane = async () => {
		await page.click(mobile ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
	};
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });

	// New page: it opens beside the list, and the first load of the editor is on demand.
	await page.waitForSelector('[data-testid="library-new-page"]');
	assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").some((r) => /tiptap|prosemirror/i.test(r.name))), false);
	// A click before hydration does nothing on a cold dev server, so retry it.
	for (let i = 0; i < 40 && !(await page.$('[data-testid="page-pane"]')); i++) {
		await page.click('[data-testid="library-new-page"]');
		await pause(500);
	}
	await page.waitForSelector(editor, { timeout: 60000 });
	const created = await page.$eval('[data-testid="page-name"]', (el) => el.textContent);
	assert.ok(created.startsWith("Untitled page"), created);
	await shot(page, "new");
	await noOverflow("new page");

	// Typing: reload before the save shows.
	await page.click(editor);
	await page.keyboard.type(`typed before reload ${tag}`);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForFunction((text) => document.querySelector('[data-testid="page-editor"]')?.textContent.includes(text), { timeout: 60000 }, `typed before reload ${tag}`);
	console.log(`PASS ${width}px reload with unsaved text keeps it, and reopens the page`);

	// Cmd/Ctrl+S makes a version.
	await page.click(editor);
	await saveKeys(page);
	await waitSave(page, "Saved");
	await closePane();

	// A page with math: formatted in place, and opening then saving changes nothing.
	const item = await pageApi.create(`Maths ${tag}`, MATH_PAGE);
	if (mobile && !(await page.$(`[aria-label="Open Maths ${tag}"]`))) await page.reload({ waitUntil: "domcontentloaded" });
	await openPage(page, `Maths ${tag}`);
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="page-editor"] .katex').length >= 4);
	assert.ok(await page.$(`${editor} table`), "a table renders");
	assert.ok(await page.$(`${editor} pre code`), "a code block renders");
	assert.ok(await page.$(`${editor} [data-type="block-math"] .katex-display`), "display math renders as display");
	await shot(page, "math");
	await noOverflow("math page");
	await page.click(`${editor} h1`, { offset: { x: 4, y: 12 } });
	await saveKeys(page);
	await pause(1400);
	assert.deepEqual((await pageApi.versions(item.id)).map((v) => v.n), [1], "opening and saving makes no version");
	assert.equal((await pageApi.read(item.id)).head.content, MATH_PAGE);
	assert.equal((await pageApi.read(item.id)).draft, null);
	assert.deepEqual(await hiddenScrollbars(page), ["none", "none"].map((v, i) => (i === 0 ? v : v)), "hidden tracks");
	assert.equal(await page.evaluate(() => {
		const el = document.querySelector('[data-testid="page-editor"]');
		el.focus();
		return el.getAttribute("aria-label");
	}), `Page Maths ${tag}`);

	// A math edit in place, between its delimiters, changes that TeX and leaves every other byte.
	// Dispatched on the formula: at 320 px it can wrap, and its box's centre is then outside the glyphs.
	await page.$eval(`${editor} p .tiptap-mathematics-render`, (el) => el.click());
	await page.waitForSelector('[data-testid="page-math-source"]');
	assert.equal(await page.$eval('[data-testid="page-math-source"]', (el) => el.value), "f(x) = x^2");
	assert.equal(await page.$eval('[data-testid="page-math-source"]', (el) => el.parentElement.firstChild.textContent), "$");
	assert.ok(!(await page.$('[role="dialog"]')), "no pop-up");
	await shot(page, "math-source");
	await page.$eval('[data-testid="page-math-source"]', (el) => el.select());
	await page.keyboard.type("g(y)");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-math-source"]'));
	await pause(300);
	await saveKeys(page);
	await waitSave(page, "Saved");
	await page.waitForFunction(async (id) => (await (await fetch(`/api/library/pages/${id}`)).json()).head.n === 2, {}, item.id);
	assert.equal((await pageApi.read(item.id)).head.content, MATH_PAGE.replace("$f(x) = x^2$", "$g(y)$"), "only the edited formula changed");

	// Restore: one more version, none erased.
	await page.click('[data-testid="page-history-toggle"]');
	await page.waitForSelector('[data-testid="page-history"]');
	await page.waitForFunction(() => /Version 2 · You/.test(document.querySelector('[data-testid="page-history"]').innerText));
	const row1 = await page.evaluateHandle(() => [...document.querySelectorAll('[data-testid="page-history"] li button')].find((b) => b.textContent.startsWith("Version 1")));
	await row1.click();
	await page.waitForFunction(() => document.querySelector('[data-testid="page-preview"] .katex'));
	await shot(page, "history");
	await noOverflow("history");
	await page.click('[data-testid="page-restore"]');
	await page.waitForFunction(async (id) => (await (await fetch(`/api/library/pages/${id}/versions`)).json()).versions.length === 3, {}, item.id);
	await page.waitForSelector(editor);
	assert.equal((await pageApi.read(item.id)).head.content, MATH_PAGE);
	assert.equal((await pageApi.versions(item.id))[0].restoredFrom, 1);
	console.log(`PASS ${width}px math rendered, no-op save stored nothing, formula edit exact, restore adds one`);

	// Two real tabs.
	const other = await browser.newPage();
	await other.setViewport({ width, height: mobile ? 800 : 900 });
	await other.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await other.waitForSelector(editor, { timeout: 60000 });
	await page.bringToFront();
	await page.click(`${editor} h1`, { offset: { x: 4, y: 12 } });
	await page.keyboard.type("A");
	await waitSave(page, "Draft saved");
	await other.bringToFront();
	await other.click(`${editor} h1`, { offset: { x: 4, y: 12 } });
	await other.keyboard.type("B");
	await other.waitForSelector('[data-testid="page-conflict"]', { timeout: 15000 });
	assert.ok((await other.$eval('[data-testid="page-conflict"]', (el) => el.innerText)).includes("This page changed elsewhere. Your text is safe here."));
	const otherText = await other.$eval(editor, (el) => el.textContent);
	assert.ok(otherText.includes("B"));
	if (shots) await other.screenshot({ path: path.join(shots, `page-${width}-conflict.png`) });
	await other.click('[data-testid="page-keep-mine"]');
	await other.waitForFunction(() => !document.querySelector('[data-testid="page-conflict"]'));
	const heads = await Promise.all((await pageApi.versions(item.id)).map((v) => pageApi.text(item.id, v.n)));
	assert.ok(heads.some((text) => /^# .*A/.test(text) && !/^# .*B/.test(text)), "tab A's text is in history");
	assert.ok(heads[0].split("\n")[0].includes("B"), "tab B's text is newest");
	// Tab A sees an update while it holds what became a version: nothing is lost.
	await page.bringToFront();
	await page.waitForFunction(() => document.querySelector('[data-testid="page-editor"]').textContent.length > 0);
	await other.close();
	await page.waitForSelector('[data-testid="page-conflict"], [data-testid="page-save-state"]');
	console.log(`PASS ${width}px two tabs: conflict line, text kept, both in history`);
	if (await page.$('[data-testid="page-keep-mine"]')) {
		await page.click('[data-testid="page-use-latest"]');
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-conflict"]'));
	}
	await waitSave(page, "Saved", "Draft saved");

	if (mobile) {
		// A full-screen layer, with chat one action away and focus held in.
		const box = await page.$eval('[data-testid="page-pane"]', (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
		assert.deepEqual(box, [0, 0, width, 800]);
		await shot(page, "phone-layer");
		await page.focus('[data-testid="page-back"]');
		for (let i = 0; i < 12; i++) {
			await page.keyboard.press("Tab");
			assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="page-pane"]')), `focus stays in the layer, tab ${i}`);
		}
		const coarse = await page.$eval('[data-testid="page-back"]', (el) => el.getBoundingClientRect().height);
		assert.ok(coarse > 0);
		await page.focus('[data-testid="page-history-toggle"]');
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
		await openPage(page, `Maths ${tag}`);
	} else {
		// The pane resizes from the keyboard and stays beside the list.
		const before = await page.$eval('[data-testid="page-pane"]', (el) => el.getBoundingClientRect().width);
		await page.focus('[aria-label="Resize page panel"]');
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("ArrowLeft");
		await page.waitForFunction((w) => document.querySelector('[data-testid="page-pane"]').getBoundingClientRect().width === w + 32, {}, before);
		assert.ok(await page.$eval('[data-testid="library-view"]', (el) => el.getBoundingClientRect().width >= 420), "the list keeps its room");
		await shot(page, "resized");
		await page.focus(editor);
		await page.keyboard.press("Escape");
		assert.ok(await page.evaluate(() => !document.activeElement?.closest('[data-testid="page-pane"]')), "Escape leaves the page on desktop");
		assert.ok(await page.$('[data-testid="page-pane"]'), "and the pane stays");
	}

	// Leaving the route commits a version; coming back shows it.
	await page.click(`${editor} h1`, { offset: { x: 4, y: 12 } });
	await page.keyboard.type("L");
	await pause(200);
	const count = (await pageApi.versions(item.id)).length;
	await page.evaluate(() => window.next.router.push("/"));
	await page.waitForFunction(() => !document.querySelector('[data-testid="library-view"]'), { timeout: 30000 });
	await page.waitForFunction(async ([id, n]) => (await (await fetch(`/api/library/pages/${id}/versions`)).json()).versions.length === n + 1, {}, [item.id, count]);
	const last = await pageApi.versions(item.id);
	assert.equal(last[0].cause, "autosave-close");
	await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => document.querySelector('[data-testid="page-editor"]'), { timeout: 60000 });
	console.log(`PASS ${width}px ${mobile ? "phone layer, focus contained, Escape closes" : "resize, Escape"}, leaving the route makes a version`);

	await closePane();
	assert.deepEqual(errors, [], `${width}px: no browser exceptions`);
	await page.close();
}

/** .specify/bugs/page-editing-fixes, in a real editor at 1440 px: a version
 *  that fails to preview, a multi-line formula and a page deleted while open,
 *  plus two guards that already held before the fixes (keystrokes just before
 *  History, rename Escape and Enter). */
async function checkPageFixes() {
	const page = await browser.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width: 1440, height: 900 });
	const made = await pageApi.create("Fixes page", "# Fixes\n\nstart\n\n$$\na\n$$\n");
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	for (let i = 0; i < 40 && !(await page.$('[data-testid="page-pane"]')); i++) {
		await page.click('[aria-label="Open Fixes page"]').catch(() => {});
		await pause(500);
	}
	await page.waitForSelector(editor, { timeout: 60000 });

	// Guard: typing, then History at once; the keystrokes still in the 120 ms wait arrive.
	await page.click(`${editor} p`);
	await page.keyboard.press("End");
	await page.keyboard.type("Z");
	await page.click('[data-testid="page-history-toggle"]');
	await page.waitForSelector('[data-testid="page-history"]');
	await page.click('[data-testid="page-history-toggle"]');
	await page.waitForSelector(editor);
	assert.ok((await page.$eval(editor, (el) => el.textContent)).includes("startZ"), "the last keystroke survives History");
	await page.waitForFunction(async (id) => (await (await fetch(`/api/library/pages/${id}`)).json()).draft?.content.includes("startZ"), { timeout: 15000 }, made.id);
	console.log("PASS keystrokes typed just before History are kept and saved");

	// Guard: rename Escape sends nothing; Enter sends once.
	const patches = [];
	page.on("request", (request) => { if (request.method() === "PATCH") patches.push(request.url()); });
	await page.click('[data-testid="page-name"]');
	await page.keyboard.type("Not this");
	await page.keyboard.press("Escape");
	await pause(500);
	assert.equal(patches.length, 0, "Escape renames nothing");
	assert.equal(await page.$eval('[data-testid="page-name"]', (el) => el.textContent), "Fixes page");
	await page.click('[data-testid="page-name"]');
	await page.keyboard.type("Fixes renamed");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => document.querySelector('[data-testid="page-name"]')?.textContent === "Fixes renamed");
	await pause(500);
	assert.equal(patches.length, 1, "Enter renames once");
	console.log("PASS rename: Escape sends nothing, Enter sends once");

	// A multi-line formula shows every line of its source.
	await page.$eval(`${editor} [data-type="block-math"]`, (el) => el.click());
	await page.waitForSelector('[data-testid="page-math-source"]');
	await page.keyboard.press("Enter");
	await page.keyboard.type("b");
	await page.keyboard.press("Enter");
	await page.keyboard.type("c");
	const fit = await page.$eval('[data-testid="page-math-source"]', (el) => [el.rows, el.scrollHeight <= el.clientHeight + 1]);
	assert.deepEqual(fit, [3, true], "three lines, none hidden");
	await page.keyboard.press("Escape");
	console.log("PASS a multi-line formula's source shows every line");

	// A version whose preview fails: the line says so and the list stays.
	await page.setRequestInterception(true);
	const failVersion = (request) => {
		if (/\/versions\/\d+$/.test(request.url())) void request.respond({ status: 500, contentType: "application/json", body: "{}" });
		else void request.continue();
	};
	page.on("request", failVersion);
	await page.click('[data-testid="page-history-toggle"]');
	await page.waitForSelector('[data-testid="page-version-failed"]');
	assert.match(await page.$eval('[data-testid="page-version-failed"]', (el) => el.innerText), /^Version \d+ could not be loaded\./);
	assert.ok(await page.$('[data-testid="page-history"] li button'), "the list stays");
	page.off("request", failVersion);
	await page.setRequestInterception(false);
	await page.click('[data-testid="page-history-toggle"]');
	await page.waitForSelector(editor);
	console.log("PASS a failed version preview leaves the list in place");

	// Deleted while open with unsaved text: it says so and offers the text.
	await page.click(`${editor} p`);
	await page.keyboard.press("End");
	await page.keyboard.type(" kept");
	await pause(300);
	const gone = await fetch(`${base}/api/library/items/${made.id}`, { method: "DELETE" });
	assert.ok(gone.ok, `delete: ${gone.status}`);
	await page.waitForSelector('[data-testid="page-deleted"]', { timeout: 15000 });
	assert.ok((await page.$eval('[data-testid="page-deleted"]', (el) => el.innerText)).startsWith("Fixes renamed was deleted."));
	assert.ok(await page.$('[data-testid="page-copy-text"]'), "unsaved text can be copied");
	assert.equal(await page.$eval(editor, (el) => el.getAttribute("contenteditable")), "false");
	if (shots) await page.screenshot({ path: path.join(shots, "page-1440-deleted.png") });
	console.log("PASS a page deleted while open says so and offers its unsaved text");

	await page.click('[data-testid="page-close"]');
	assert.deepEqual(errors, [], "no browser exceptions");
	await page.close();
}

/** Feature 010 US1 in a real editor: a page built only from the toolbar, the
 *  slash menu and shortcuts, then stored as Markdown. */
async function checkEditorTools(width) {
	const page = await browser.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width, height: width < 768 ? 800 : 900 });
	const made = await pageApi.create(`Tools ${width}`, "");
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	for (let i = 0; i < 40 && !(await page.$('[data-testid="page-pane"]')); i++) {
		await page.click(`[aria-label="Open Tools ${width}"]`).catch(() => {});
		await pause(500);
	}
	await page.waitForSelector(editor, { timeout: 60000 });
	await page.waitForSelector('[data-testid="page-toolbar"]');
	assert.equal(await page.$eval(`${editor} .lh-page-placeholder`, (el) => el.dataset.placeholder), "Start writing, or type / for headings, lists, tables and formulas.");
	const mod = SAVE;
	const chord = async (...keys) => {
		for (const key of keys) await page.keyboard.down(key);
		for (const key of [...keys].reverse()) await page.keyboard.up(key);
	};
	// The editor reads keyboard selection changes on selectionchange; a key
	// pressed before that acts on the old selection, which no person types fast enough to hit.
	const key = async (name) => {
		await page.keyboard.press(name);
		await pause(60);
	};
	const selectLineStart = async () => {
		await page.keyboard.down("Shift");
		await page.keyboard.press("Home");
		await page.keyboard.up("Shift");
		// The editor reads a keyboard selection on the next selectionchange.
		await pause(100);
	};
	await page.click(editor);
	// Heading through the slash menu.
	await page.keyboard.type("/head");
	await page.waitForSelector('[data-testid="page-slash-menu"]');
	assert.deepEqual(await page.$$eval('[data-testid="page-slash-option"]', (els) => els.map((el) => el.textContent)), ["Heading 1", "Heading 2", "Heading 3"]);
	await key("Enter");
	await page.keyboard.type("Title");
	await key("Enter");
	// Bold by shortcut, then the toolbar shows it pressed.
	await page.keyboard.type("bold");
	await selectLineStart();
	await chord(mod, "b");
	await page.waitForFunction(() => document.querySelector('[data-testid="page-toolbar"] [aria-label^="Bold"]')?.getAttribute("aria-pressed") === "true", { timeout: 5000 });
	await key("End");
	await chord(mod, "b");
	await key("Enter");
	// A link through Ctrl/Cmd+K.
	await page.keyboard.type("link");
	await selectLineStart();
	await chord(mod, "k");
	await page.waitForFunction(() => document.activeElement?.dataset?.testid === "page-link-input");
	await page.keyboard.type("not a link");
	await key("Enter");
	await page.waitForSelector('[data-testid="page-link-popover"] [role="alert"]');
	await page.$eval('[data-testid="page-link-input"]', (el) => el.select());
	await page.keyboard.type("example.com");
	await key("Enter");
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-link-popover"]'));
	await key("End");
	await key("Enter");
	// A formula from the toolbar shortcut.
	await page.keyboard.type("area ");
	await chord(mod, "Shift", "m");
	await page.waitForSelector('[data-testid="page-math-source"]');
	await page.keyboard.type("r^2");
	await key("Enter");
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-math-source"]'));
	await key("End");
	await key("Enter");
	// A checklist, then a table with an added row.
	await page.keyboard.type("/check");
	await key("Enter");
	await page.keyboard.type("task");
	await key("Enter");
	await key("Enter");
	await page.keyboard.type("/zzz");
	assert.equal(await page.$eval('[data-testid="page-slash-menu"] [role="status"]', (el) => el.textContent), 'No block matches "zzz"');
	await key("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-slash-menu"]'));
	assert.ok(await page.$('[data-testid="page-pane"]'), "Escape closed the menu, not the pane");
	for (let i = 0; i < 4; i++) await key("Backspace");
	await page.keyboard.type("/tab");
	await key("Enter");
	await page.waitForSelector('[data-testid="page-table-controls"]');
	await page.click('[data-testid="page-table-controls"] button');
	assert.equal(await page.$$eval(`${editor} table tr`, (rows) => rows.length), 4);
	await saveKeys(page);
	await page.waitForFunction(async (id) => (await (await fetch(`/api/library/pages/${id}`)).json()).head.n >= 2, {}, made.id);
	const stored = (await pageApi.read(made.id)).head.content;
	for (const part of ["# Title", "**bold**", "[link](https://example.com)", "area $r^2$", "- [ ] task"]) assert.ok(stored.includes(part), `stored ${part}: ${stored}`);
	assert.equal(stored.split("\n").filter((line) => line.startsWith("|")).length, 5, "a header, a rule and three rows");
	assert.ok(!stored.includes("Start writing"), "the placeholder is never stored");
	const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	assert.ok(over <= 0, `${width}px overflow ${over}`);
	if (shots) await page.screenshot({ path: path.join(shots, `editor-tools-${width}.png`) });
	console.log(`PASS ${width}px editor tools: slash heading, bold, Ctrl K link, formula, checklist, table and row, stored as Markdown`);
	await page.click(width < 768 ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
	assert.deepEqual(errors, [], `${width}px: no browser exceptions`);
	await page.close();
}

/** Feature 010 US2: tutor actions from a page beside a chat, a blocked chat
 *  and the Library. Sends are intercepted; no model runs. */
async function checkTutorActions(width) {
	const mobile = width < 768;
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width, height: mobile ? 800 : 900, isMobile: mobile, hasTouch: mobile });
	const posts = [];
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (request.method() === "POST" && url.pathname === "/api/chat") {
			posts.push(JSON.parse(request.postData() ?? "{}"));
			return void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
		}
		if (request.method() === "POST" && url.pathname === "/api/chats") {
			return void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "mention-chat" }) });
		}
		void request.continue();
	});
	const name = `Tutor page ${width}`;
	await pageApi.create(name, "An eigenvector keeps its direction.\n\nSecond paragraph.\n");
	const expected = (lead) => `${lead} @${name}:\n\n> An eigenvector keeps its direction.`;
	const openInLibrary = async () => {
		await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
		for (let i = 0; i < 40 && !(await page.$('[data-testid="page-pane"]')); i++) {
			await page.click(`[aria-label="Open ${name}"]`).catch(() => {});
			await pause(500);
		}
		await page.waitForSelector(editor, { timeout: 60000 });
	};
	const selectFirst = async () => {
		// The editor reads clicks and keyboard selection on selectionchange.
		await page.click(`${editor} p`);
		await pause(150);
		await page.keyboard.press("Home");
		await pause(60);
		await page.keyboard.down("Shift");
		await page.keyboard.press("End");
		await page.keyboard.up("Shift");
		await page.waitForSelector('[data-testid="page-bubble"]', { visible: true });
	};

	// Beside a chat: Explain sends at once; Ask… only fills the composer.
	await openInLibrary();
	await page.goto(`${base}/chat/mention-chat`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(editor, { timeout: 60000 });
	await selectFirst();
	if (shots) await page.screenshot({ path: path.join(shots, `tutor-bubble-${width}.png`) });
	await page.click('[data-testid="page-tutor-explain"]');
	await page.waitForFunction(() => true);
	for (let i = 0; i < 40 && posts.length === 0; i++) await pause(250);
	assert.equal(posts.length, 1, "Explain sent once");
	assert.equal(posts[0].input?.text, expected("Explain this part of"));
	if (mobile) {
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
		await openInLibrary();
	} else {
		// The sent message starts a turn: until it ends, the actions say so.
		await selectFirst();
		assert.equal(await page.$eval('[data-testid="page-bubble-blocked"]', (el) => el.textContent), "The tutor is still answering.");
	}
	await page.goto(`${base}/chat/mention-chat`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(editor, { timeout: 60000 });
	await selectFirst();
	await page.click('[data-testid="page-tutor-ask"]');
	await page.waitForFunction((text) => document.querySelector('[aria-label="Your message"], textarea')?.value === text, {}, `${expected("About this part of")}\n\n`);
	await pause(300);
	assert.equal(posts.length, 1, "Ask… sends nothing");
	console.log(`PASS ${width}px a page beside a chat: Explain sends the quote and reference, Ask… fills the composer`);

	// A waiting question: the tutor's actions say why they're unavailable.
	if (mobile) await openInLibrary();
	await page.goto(`${base}/chat/mention-quiz`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(editor, { timeout: 60000 });
	await selectFirst();
	assert.equal(await page.$eval('[data-testid="page-bubble-blocked"]', (el) => el.textContent), "Answer the question in the chat first.");
	assert.equal(await page.$('[data-testid="page-tutor-explain"]'), null);
	console.log(`PASS ${width}px a waiting question keeps the tutor's actions unavailable, with the reason`);

	// The Library: a new session sends it.
	posts.length = 0;
	await openInLibrary();
	await selectFirst();
	await page.click('[data-testid="page-tutor-quiz"]');
	await page.waitForFunction(() => location.pathname.startsWith("/chat/"), { timeout: 60000 });
	for (let i = 0; i < 80 && posts.length === 0 && !(await page.$('[role="dialog"]')); i++) await pause(250);
	if (posts.length) assert.equal(posts[0].input?.text, expected("Quiz me on this part of"));
	else assert.equal(await page.$eval("textarea", (el) => el.value), expected("Quiz me on this part of"), "setup opened with the message kept");
	console.log(`PASS ${width}px from the Library, Quiz me starts a new session with the message (${posts.length ? "sent" : "kept for setup"})`);

	assert.deepEqual(errors, [], `${width}px: no browser exceptions`);
	await context.close();
}

/** A tutor revision written through the real store, as the agent's tool does. */
async function agentRevise(id, base, text) {
	const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tests/helpers/agent-revise-cli.ts", data, id, String(base), JSON.stringify(text)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, LH_HOSTED: "0" } });
	let out = "";
	child.stdout.on("data", (chunk) => { out += chunk; });
	await new Promise((resolve) => child.once("exit", resolve));
	const result = JSON.parse(out.trim().split("\n").at(-1));
	assert.equal(result.outcome, "revised", out);
	return result.version;
}

/** Feature 010 US3: the tutor's edit made while the page was closed is
 *  highlighted on open, stepped through, and undone around later typing. */
async function checkTutorChanges(width) {
	const page = await browser.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width, height: width < 768 ? 800 : 900 });
	const name = `Changed ${width}`;
	const start = "# Notes\n\nOne.\n\nTwo.\n\nThree.\n";
	const made = await pageApi.create(name, start);
	// Seen up to version 1, as an open does.
	assert.equal((await (await fetch(`${base_url(made.id)}/seen`)).json()).version, 1);
	const v = await agentRevise(made.id, 1, "# Notes\n\nOne, simpler.\n\nTwo.\n\nThree.\n\nA new check.\n");
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	for (let i = 0; i < 40 && !(await page.$('[data-testid="page-pane"]')); i++) {
		await page.click(`[aria-label="Open ${name}"]`).catch(() => {});
		await pause(500);
	}
	await page.waitForSelector('[data-testid="page-change-bar"]', { timeout: 60000 });
	assert.equal(await page.$eval('[data-testid="page-change-bar"] p', (el) => el.textContent), `The tutor changed 2 places · version ${v}`);
	assert.equal(await page.$$eval(`${editor} [data-tutor-change]`, (els) => els.map((el) => el.textContent).join("|")), "One, simpler.|A new check.");
	assert.equal(await page.$eval('[data-testid="page-tutor-removed"]', (el) => el.textContent), "Removed: One.");
	if (shots) await page.screenshot({ path: path.join(shots, `tutor-changes-${width}.png`) });
	// Typing elsewhere, then Undo: only the tutor's places go back.
	const two = await page.evaluateHandle(() => [...document.querySelectorAll('[data-testid="page-editor"] p')].find((p) => p.textContent === "Two."));
	await two.click();
	await page.keyboard.press("End");
	await page.keyboard.type(" Mine.");
	await pause(300);
	await page.click('[data-testid="page-undo-tutor"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-change-bar"]'));
	await page.waitForFunction(async (id) => (await (await fetch(`/api/library/pages/${id}`)).json()).head.content === "# Notes\n\nOne.\n\nTwo. Mine.\n\nThree.\n", {}, made.id);
	const versions = await pageApi.versions(made.id);
	assert.equal(versions[0].cause, "undo-agent");
	assert.equal((await (await fetch(`${base_url(made.id)}/seen`)).json()).unseen.length, 0, "seen after undo");
	assert.equal(await page.$(`${editor} [data-tutor-change]`), null, "no highlight left");
	console.log(`PASS ${width}px a tutor edit made while closed is highlighted on open and undone around later typing`);

	// History (US4): the undo compared with the tutor's version, then a name that survives reload.
	await page.click('[data-testid="page-history-toggle"]');
	await page.waitForSelector('[data-testid="page-version-changes"]');
	const changesText = await page.$eval('[data-testid="page-version-changes"]', (el) => el.innerText);
	assert.ok(/compared with version/.test(changesText), changesText);
	assert.deepEqual(await page.$$eval('[data-testid="page-version-changes"] [data-change]', (els) => els.map((el) => `${el.dataset.change}:${el.lastChild.textContent}`)), ["removed:One, simpler.", "removed:Two.", "added:One.", "added:Two. Mine.", "removed:A new check."]);
	await page.click('[data-testid="page-name-version"]');
	await page.waitForSelector('[data-testid="page-version-name-input"]');
	await page.keyboard.type("Before exam");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => document.querySelector('[data-testid="page-history"] li button[aria-current="true"]')?.textContent.endsWith("Before exam"));
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="page-history-toggle"]', { timeout: 60000 });
	if (!(await page.$('[data-testid="page-history"]'))) await page.click('[data-testid="page-history-toggle"]');
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="page-history"] li button')].some((b) => b.textContent.endsWith("· Before exam")));
	assert.ok((await pageApi.versions(made.id))[0].name === "Before exam");
	if (shots) await page.screenshot({ path: path.join(shots, `history-${width}.png`) });
	await page.click('[data-testid="page-history-toggle"]');
	await page.waitForSelector(editor);
	console.log(`PASS ${width}px History compares a version with the one before it, and a name survives reload`);
	await page.click(width < 768 ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
	assert.deepEqual(errors, [], `${width}px: no browser exceptions`);
	await page.close();
}
function base_url(id) { return `${base}/api/library/pages/${id}`; }

/** Feature 010 US5: outline jump, word count, copy, download and print. */
async function checkOutlineExport(width) {
	const context = await browser.createBrowserContext();
	await context.overridePermissions(base, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
	const page = await context.newPage();
	page.setDefaultTimeout(30000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width, height: width < 768 ? 800 : 900 });
	// Print: record what is on screen when the dialog would open, then close it.
	await page.evaluateOnNewDocument(() => {
		window.__printed = [];
		window.print = () => {
			const root = document.getElementById("lh-print-root");
			window.__printed.push({ text: root?.innerText ?? "", shown: root ? getComputedStyle(root).display : "none", title: document.title });
			setTimeout(() => window.dispatchEvent(new Event("afterprint")), 0);
		};
	});
	const downloads = path.join(root, `downloads-${width}`);
	await mkdir(downloads, { recursive: true });
	const cdp = await page.createCDPSession();
	await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
	const name = `Outline ${width}`;
	const text = "# First\n\nOne two three.\n\n## Second part\n\nFour five $x$.\n\n### Third\n\nSix.\n";
	await pageApi.create(name, text);
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	for (let i = 0; i < 40 && !(await page.$('[data-testid="page-pane"]')); i++) {
		await page.click(`[aria-label="Open ${name}"]`).catch(() => {});
		await pause(500);
	}
	await page.waitForSelector(editor, { timeout: 60000 });
	await page.waitForFunction(() => document.querySelector('[data-testid="page-word-count"]')?.textContent === "· 10 words");
	await page.click('[data-testid="page-outline-toggle"]');
	await page.waitForSelector('[data-testid="page-outline"]');
	assert.deepEqual(await page.$$eval('[data-testid="page-outline"] button', (els) => els.map((el) => el.textContent)), ["First", "Second part", "Third"]);
	if (shots) await page.screenshot({ path: path.join(shots, `outline-${width}.png`) });
	const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	assert.ok(over <= 0, `${width}px overflow ${over}`);
	const jumped = await page.evaluateHandle(() => [...document.querySelectorAll('[data-testid="page-outline"] button')].find((b) => b.textContent === "Third"));
	await jumped.click();
	await page.waitForFunction(() => window.getSelection()?.anchorNode?.parentElement?.closest("h3")?.textContent === "Third");
	console.log(`PASS ${width}px outline lists h1-h3 and jumps the caret, word count leaves out formulas`);

	await page.click('[data-testid="page-export"]');
	await page.waitForSelector('[data-testid="page-export-menu"]');
	await page.click('[data-testid="page-export-copy"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="page-export-copy"]')?.textContent === "Copied");
	assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text);
	await page.click('[data-testid="page-export-download"]');
	let file = null;
	for (let i = 0; i < 40 && !file; i++) {
		file = (await readdir(downloads)).find((f) => f.endsWith(".md"));
		if (!file) await pause(250);
	}
	assert.equal(file, `${name}.md`);
	assert.equal(await readFile(path.join(downloads, file), "utf8"), text);
	await page.click('[data-testid="page-export"]');
	await page.waitForSelector('[data-testid="page-export-print"]');
	await page.click('[data-testid="page-export-print"]');
	await page.waitForFunction(() => window.__printed.length === 1);
	const printed = await page.evaluate(() => window.__printed[0]);
	assert.equal(printed.title, name);
	assert.ok(printed.text.includes("Second part") && printed.text.includes("Six."), printed.text);
	await page.waitForFunction(() => !document.getElementById("lh-print-root"));
	console.log(`PASS ${width}px export: copy is the stored Markdown, download is "${name}.md", print shows only the page`);
	assert.deepEqual(errors, [], `${width}px: no browser exceptions`);
	await context.close();
}

/** The transcript rows, from a seeded tool result, since no model runs here. */
async function checkPageRows() {
	const made = await pageApi.create("Row page", "Agent text with $x$.\n");
	const lesson = await golden("chat_mv27rrra_feff23b6");
	const replyBase = lesson.messages.find((m) => m.role === "assistant" && m.stopReason === "stop");
	const call = (id, name, args) => ({ ...replyBase, id: `a_${id}`, stopReason: "toolUse", content: [{ type: "toolCall", id, name, arguments: args }] });
	const result = (id, name, details) => ({ id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: JSON.stringify(details) }], details, isError: false, timestamp: 3 });
	const steps = [
		["c1", "page_create", { name: "Row page", content: "SECRET" }, { outcome: "created", itemId: made.id, name: "Row page", version: 1 }],
		["c2", "page_revise", { item: "Row page", baseVersion: 1, content: "SECRET" }, { outcome: "revised", itemId: made.id, name: "Row page", version: 3, savedLearnerVersion: 2 }],
		["c3", "page_revise", { item: "Row page", baseVersion: 1, content: "SECRET" }, { outcome: "stale", reason: "The page is at version 3 (the learner's edits were saved). Read it and redo your edit.", itemId: made.id }],
		["c4", "page_create", { name: "x", content: "SECRET" }, { outcome: "failed", reason: "Pages can't be written while a question is waiting for his answer." }],
		["c5", "library_read", { item: "Row page" }, { outcome: "read", itemId: made.id, name: "Row page", kind: "page", size: 10 }],
		["c6", "library_read", { item: "gone" }, { outcome: "failed", reason: "That item was deleted from the Library." }],
	];
	const chats = path.join(data, "chats");
	await mkdir(chats, { recursive: true });
	await writeFile(path.join(chats, "page-rows.json"), JSON.stringify({
		...structuredClone(lesson), id: "page-rows", settings: { model: { provider: "openrouter", id: "openai/gpt-4o" } },
		messages: [
			{ id: "m_user", role: "user", content: "Make a page.", timestamp: 1 },
			...steps.flatMap(([id, name, args, details]) => [call(id, name, args), result(id, name, details)]),
			{ ...replyBase, id: "m_done", content: [{ type: "text", text: "Done." }] },
		],
	}));
	for (const width of [1440, 390, 320]) {
		const page = await browser.newPage();
		page.setDefaultTimeout(30000);
		await page.setViewport({ width, height: 900 });
		await page.goto(`${base}/chat/page-rows`, { waitUntil: "domcontentloaded" });
		await page.waitForSelector('[data-testid="page-row"]', { timeout: 60000 });
		await page.waitForFunction(() => document.querySelectorAll('[data-testid="page-row"]').length === 6);
		const headlines = await page.$$eval('[data-testid="page-row"] summary', (rows) => rows.map((el) => el.innerText.trim()));
		assert.deepEqual(headlines, ["Page · created Row page", "Page · revised Row page · version 3", "Page · couldn't revise, it changed", "Page · failed", "Library · read Row page", "Library · failed"]);
		assert.ok(!(await page.$eval("[data-chat-id]", (el) => el.innerText)).includes("SECRET"), "inputs never show");
		// Its open state is saved per session, so an earlier width may have left it open.
		if (!(await page.$eval('[data-testid="page-row"][data-tool="page_revise"]', (el) => el.open))) await page.click('[data-testid="page-row"][data-tool="page_revise"] summary');
		await page.waitForFunction(() => document.querySelector('[data-tool="page_revise"]')?.innerText.includes("Saved your edits first as version 2"));
		if (shots) await page.screenshot({ path: path.join(shots, `page-${width}-rows.png`) });
		// The row opens the pane beside the chat.
		await page.click('[data-testid="page-row"][data-tool="page_revise"] [aria-label="Open Row page"]');
		await page.waitForSelector(editor, { timeout: 60000 });
		await page.waitForFunction(() => document.querySelector('[data-testid="page-editor"] .katex'));
		if (shots) await page.screenshot({ path: path.join(shots, `page-${width}-beside-chat.png`) });
		const box = await page.$eval('[data-testid="page-pane"]', (el) => { const r = el.getBoundingClientRect(); return [r.left, r.width]; });
		if (width < 768) assert.deepEqual(box, [0, width]);
		else assert.ok(box[0] > 200 && box[1] < width - 200, `beside the chat: ${box}`);
		// An outside version while the page is open: clean tab follows; dirty one keeps its text.
		const before = await pageApi.read(made.id);
		const marker = `Outside ${width}`;
		await fetch(`${base}/api/library/pages/${made.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base: before.head.n, rev: 0, content: `${marker}\n` }) });
		await page.waitForFunction((text) => document.querySelector('[data-testid="page-editor"]')?.textContent.includes(text), {}, marker);
		await page.click(`${editor} p`, { offset: { x: 2, y: 6 } });
		await page.keyboard.type("Mine ");
		await pause(300);
		const now = await pageApi.read(made.id);
		await fetch(`${base}/api/library/pages/${made.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base: now.head.n, rev: now.draft?.rev ?? 0, content: `Revision ${width} with $x$.\n` }) });
		await page.waitForSelector('[data-testid="page-conflict"]');
		assert.ok((await page.$eval(editor, (el) => el.textContent)).includes("Mine "), "his text stays");
		if (shots) await page.screenshot({ path: path.join(shots, `page-${width}-revision-conflict.png`) });
		await page.click('[data-testid="page-use-latest"]');
		await page.waitForFunction((text) => document.querySelector('[data-testid="page-editor"]')?.textContent.includes(text), {}, `Revision ${width}`);
		const versions = await pageApi.versions(made.id);
		const texts = await Promise.all(versions.map((v) => pageApi.text(made.id, v.n)));
		assert.ok(texts.some((t) => t.includes("Mine ")), "his text is in history");
		await page.click(width < 768 ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
		await page.close();
		console.log(`PASS ${width}px rows read as agreed, open the pane, an outside revision follows or conflicts with no loss`);
	}
}

/** The shared column: a question's automatic demo doesn't replace an open page;
 *  an explicit open of either wins; the one iframe stays alive throughout. */
async function checkPageAndDemo() {
	const made = await pageApi.create("Beside demo", "Page beside a demo.\n");
	const lesson = await golden("chat_mv27rrra_feff23b6");
	const plan = lesson.messages.findIndex((m) => m.role === "toolResult" && m.toolName === "plan_init" && m.details?.tree);
	const check = lesson.messages.findIndex((m, i) => i > plan && m.role === "assistant" && m.content?.some((p) => p.type === "toolCall" && p.name === "quiz" && p.arguments.type === "check"));
	const html = '<html><body><input aria-label="Value" value="3"><script>window.identity=Math.random()</script></body></html>';
	const demo = { id: "steer_demo", role: "custom", customType: "subagent-steer", content: "Demo delivered.", display: true, details: { jobId: "d", kind: "demo", toolCallId: "demo-job", result: { title: "Page and demo", html, tested: true } }, timestamp: 2 };
	const replyBase = lesson.messages.find((m) => m.role === "assistant" && m.stopReason === "stop");
	const details = { outcome: "created", itemId: made.id, name: "Beside demo", version: 1 };
	const question = structuredClone(lesson.messages[check]);
	for (const part of question.content) if (part.type === "toolCall" && part.name === "quiz") part.arguments.demoRef = { messageId: demo.id };
	await writeFile(path.join(data, "chats", "page-demo.json"), JSON.stringify({
		...structuredClone(lesson), id: "page-demo", settings: { model: { provider: "openrouter", id: "openai/gpt-4o" } },
		messages: [
			...lesson.messages.slice(0, check),
			demo,
			{ ...replyBase, id: "a_pc", stopReason: "toolUse", content: [{ type: "toolCall", id: "pc", name: "page_create", arguments: { name: "Beside demo", content: "x" } }] },
			{ id: "r_pc", role: "toolResult", toolCallId: "pc", toolName: "page_create", content: [{ type: "text", text: "{}" }], details, isError: false, timestamp: 3 },
			question,
		],
	}));
	const page = await browser.newPage();
	page.setDefaultTimeout(30000);
	await page.setViewport({ width: 1440, height: 900 });
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await openPage(page, "Beside demo");
	// The open page is written after a short coalescing delay; a reload that fast is not what this step checks.
	await page.waitForFunction(() => Object.entries(localStorage).some(([key, value]) => key.includes("__page-pane") && value.includes("Beside demo")));
	await page.goto(`${base}/chat/page-demo`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="page-pane"]', { timeout: 60000 });
	await page.waitForSelector(".question-demo-reference button", { timeout: 60000 });
	await pause(800);
	assert.equal(await page.$('[data-testid="demo-panel"]'), null, "the automatic open leaves the page");
	assert.ok(await page.$('[data-testid="page-pane"]'));
	await page.click(".question-demo-reference button");
	await page.waitForSelector('[data-testid="demo-panel"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
	// The lesson fixture holds other demos; only this one's document counts.
	const thisDemo = async () => {
		const found = [];
		for (const frame of page.frames()) if (await frame.$('input[aria-label="Value"]').catch(() => null)) found.push(frame);
		return found;
	};
	for (let i = 0; i < 40 && (await thisDemo()).length === 0; i++) await pause(250);
	assert.equal((await thisDemo()).length, 1, "one live iframe");
	const identity = await (await thisDemo())[0].evaluate(() => window.identity);
	if (shots) await page.screenshot({ path: path.join(shots, "page-1440-demo-open.png") });
	await page.evaluate(() => { const row = document.querySelector('[data-testid="page-row"]'); row.open = true; });
	await page.waitForSelector('[data-testid="page-row"] [aria-label="Open Beside demo"]');
	await page.$eval('[data-testid="page-row"] [aria-label="Open Beside demo"]', (el) => el.click());
	await page.waitForSelector('[data-testid="page-pane"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="demo-panel"]'));
	if (shots) await page.screenshot({ path: path.join(shots, "page-1440-page-over-demo.png") });
	assert.equal((await thisDemo()).length, 1, "still one iframe, back in the transcript");
	assert.equal(await (await thisDemo())[0].evaluate(() => window.identity), identity, "the demo did not reload");
	await page.click('[data-testid="page-close"]');
	await page.close();
	console.log("PASS page and demo share the column: automatic open respected, explicit open wins, same iframe");
}

/** Every corpus entry through the real editor: open, save untouched, then type
 *  and undo by hand, save again. Node can't catch what ProseMirror itself does. */
async function checkPageCorpus() {
	const source = await readFile(new URL("../tests/fixtures/page-roundtrip-corpus.ts", import.meta.url), "utf8");
	const module = path.join(root, "corpus.mjs");
	await writeFile(module, source.replace(": readonly { name: string; md: string }[]", ""));
	const { PAGE_CORPUS } = await import(module);
	const page = await browser.newPage();
	page.setDefaultTimeout(30000);
	await page.setViewport({ width: 1440, height: 900 });
	const failures = [];
	let typedThenUndone = 0;
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	for (const [i, { name, md }] of PAGE_CORPUS.entries()) {
		const label = `Corpus ${i}`;
		const item = await pageApi.create(label, md);
		await page.reload({ waitUntil: "domcontentloaded" });
		await openPage(page, label);
		await page.focus(editor);
		await saveKeys(page);
		await pause(150);
		await page.keyboard.down("Control");
		await page.keyboard.press("End");
		await page.keyboard.up("Control");
		await page.keyboard.type("Z");
		await pause(200);
		// With a formula selected the key is refused, and Backspace would really delete it.
		if ((await page.$eval(editor, (el) => el.textContent)).includes("Z")) {
			typedThenUndone++;
			await page.keyboard.press("Backspace");
			await pause(200);
		}
		await saveKeys(page);
		await pause(250);
		await page.click('[data-testid="page-close"]');
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
		await pause(150);
		const state = await pageApi.read(item.id);
		const versions = await pageApi.versions(item.id);
		if (state.head.content !== md || versions.length !== 1 || state.draft) failures.push(`${name}: versions ${versions.length}, draft ${!!state.draft}, ${JSON.stringify(state.head.content)}`);
	}
	// A key pressed while a formula is selected doesn't overwrite it.
	const math = await pageApi.create("Corpus math first", "$$\nx\n$$\n\nAfter.\n");
	await page.reload({ waitUntil: "domcontentloaded" });
	await openPage(page, "Corpus math first");
	await page.focus(editor);
	await page.keyboard.type("Z");
	await pause(1400);
	assert.ok((await page.$eval(editor, (el) => el.textContent)).includes("After."));
	assert.ok(await page.$(`${editor} [data-type="block-math"]`), "the formula is still there");
	await page.click('[data-testid="page-close"]');
	await pause(300);
	assert.equal((await pageApi.read(math.id)).head.content, "$$\nx\n$$\n\nAfter.\n");
	await page.close();
	assert.deepEqual(failures, [], "the real editor changes no stored byte without an edit");
	console.log(`PASS ${PAGE_CORPUS.length} corpus pages through the real editor, ${typedThenUndone} also typed then undone: stored bytes identical, no version`);
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
