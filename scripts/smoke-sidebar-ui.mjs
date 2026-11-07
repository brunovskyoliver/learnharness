/** Isolated browser regression for Study's overlay sidebar (feature 025, R6):
 * open/close paths, hover-open, focus return, the search walk, rows, the
 * header menus and keys that must not reach an active question.
 * CHROME_PATH=/path/to/chrome node scripts/smoke-sidebar-ui.mjs
 * Optional LH_UI_SCREENSHOT_DIR saves desktop and mobile evidence.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const data = await mkdtemp(path.join(os.tmpdir(), "learning-sidebar-ui-"));
const port = Number(process.env.LH_UI_PORT ?? 3102);
const base = `http://127.0.0.1:${port}`;
const toggle = '[aria-label="Open sidebar"]';
const sidebar = '[data-testid="nb-sidebar"]';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let browser;
try {
	const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", import.meta.url), "utf8"));
	await mkdir(path.join(data, "chats"));
	const sample = {
		...fixture,
		id: "sidebar-ui",
		title: "Updating a belief",
		messages: [{ ...fixture.messages.findLast((message) => message.role === "assistant"), content: [{ type: "text", text: "## How evidence changes an estimate\n\nA correct answer provides evidence that a learner understands a skill. It does not establish that understanding with certainty.\n\nThe estimate also depends on how likely a correct answer would be without understanding the skill.\n\n## Try the next step\n\nKeep the lesson's question cards aligned with the composer. Give the explanation room to read." }] }],
	};
	await writeFile(path.join(data, "chats", `${sample.id}.json`), JSON.stringify(sample));
	const plan = fixture.messages.findIndex((message) => message.role === "toolResult" && message.toolName === "plan_init" && message.details?.tree);
	const check = fixture.messages.findIndex((message, index) => index > plan && message.role === "assistant"
		&& message.content?.some((part) => part.type === "toolCall" && part.name === "quiz" && part.arguments.type === "check"));
	assert.ok(check > 0, "fixture has an active teaching question");
	const question = { ...fixture, id: "sidebar-question-ui", messages: fixture.messages.slice(0, check + 1) };
	await writeFile(path.join(data, "chats", `${question.id}.json`), JSON.stringify(question));
	for (let i = 0; i < 80; i++) {
		// One long title (feature 002): rows wrap whole titles instead of truncating.
		const title = i === 0 ? "Gradient descent and choosing a learning rate for a noisy, badly conditioned loss surface" : `Study session ${i}`;
		const chat = { ...sample, id: `sidebar-stress-${i}`, title, messages: [] };
		await writeFile(path.join(data, "chats", `${chat.id}.json`), JSON.stringify(chat));
	}
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		env: { ...process.env, LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	server.stdout.on("data", (chunk) => { output = (output + chunk).slice(-3000); });
	server.stderr.on("data", (chunk) => { output = (output + chunk).slice(-3000); });
	let ready = false;
	for (let i = 0; i < 120; i++) {
		if (server.exitCode !== null) throw new Error(`Dev server exited: ${output}`);
		try {
			const response = await fetch(`${base}/api/chats`, { signal: AbortSignal.timeout(1000) });
			if (response.ok) { ready = true; break; }
		} catch { /* server still starting */ }
		await pause(250);
	}
	assert.ok(ready, "isolated server starts");
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox", "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2"] }); // a fine pointer, as a desktop (headless reports none)
	const page = await browser.newPage();
	page.setDefaultTimeout(5000);
	// A route's first compile on a cold dev server takes far longer than any step this checks.
	page.setDefaultNavigationTimeout(180000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width: 1280, height: 800 });
	await page.goto(`${base}/chat/${sample.id}`, { waitUntil: "networkidle2" });
	await page.waitForFunction((sel) => { const el = document.querySelector(sel); return el && Object.keys(el).some((key) => key.startsWith("__reactProps")); }, { timeout: 180000 }, toggle);
	await page.evaluate(() => document.fonts.ready);
	const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const isOpen = () => page.evaluate((sel) => Boolean(document.querySelector(sel)), sidebar);
	const opened = () => page.waitForSelector(sidebar, { visible: true });
	const closed = () => page.waitForFunction((sel) => !document.querySelector(sel), {}, sidebar);
	const chord = async (...keys) => {
		for (const key of keys) await page.keyboard.down(key);
		for (const key of [...keys].reverse()) await page.keyboard.up(key);
	};

	// Feature 025 (R6): no persistent column, the overlay opens over the page.
	assert.equal(await page.$('[aria-label="Resize sidebar"]'), null, "the resizable column is gone");
	assert.equal(await isOpen(), false, "closed on load");
	const before = await page.$eval('[role="log"]', (element) => element.getBoundingClientRect().toJSON());
	await page.click(toggle);
	await opened();
	const overlay = await page.evaluate((sel) => {
		const panel = document.querySelector(sel);
		const dim = document.querySelector('[data-testid="nb-sidebar-dim"]');
		return { width: panel.getBoundingClientRect().width, inside: panel.contains(document.activeElement), dim: dim ? getComputedStyle(dim).backgroundColor : null, dimmed: dim?.hasAttribute("data-dim") };
	}, sidebar);
	assert.equal(overlay.width, 288, "the 288px shelf");
	assert.equal(overlay.inside, true, "focus moves into the sidebar");
	assert.equal(overlay.dimmed, true, "Study washes the page");
	assert.notEqual(overlay.dim, "rgba(0, 0, 0, 0)");
	assert.deepEqual(await page.$eval('[role="log"]', (element) => element.getBoundingClientRect().toJSON()), before, "the page does not slide aside (R6)");
	await page.keyboard.press("Escape");
	await closed();
	assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Open sidebar", "focus returns to the menu button");
	await chord("Control", "b");
	await opened();
	await chord("Control", "b");
	await closed();
	await page.click(toggle);
	await opened();
	await page.mouse.click(1200, 400);
	await closed();
	console.log("PASS overlay: opens on ☰ and Mod+B, closes on Escape, Mod+B and outside click; focus returns; the page stays put");

	// Hover-open from the left edge (fine pointer): a real move starts the wait; leaving closes it.
	await page.mouse.move(400, 300);
	await page.mouse.move(4, 300, { steps: 4 });
	await page.mouse.move(5, 320);
	await opened();
	await page.mouse.move(700, 320, { steps: 6 });
	await closed();
	await page.mouse.move(4, 300, { steps: 4 });
	await page.mouse.move(5, 320);
	await opened();
	await page.mouse.click(270, 40);
	await page.mouse.move(700, 320, { steps: 6 });
	await frames();
	assert.equal(await isOpen(), true, "a click inside keeps a hover-open sidebar");
	await page.keyboard.press("Escape");
	await closed();
	console.log("PASS hover-open at the left edge; leaving closes it until a click inside");

	// The search owns the walk: Ctrl+Shift+F opens on it, arrows walk, Enter opens.
	await chord("Control", "Shift", "KeyF");
	await opened();
	await page.waitForFunction(() => document.activeElement?.matches('[data-testid="session-search"]'));
	await page.keyboard.type("Study session 4");
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="session-row"]').length > 0 && !document.querySelector('[data-testid="session-group"]'));
	await page.keyboard.press("ArrowDown");
	await page.waitForSelector('[data-testid="session-row-kbd"]');
	const walked = await page.$eval('[data-testid="session-row-kbd"]', (element) => element.dataset.sessionId);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => document.querySelector('[data-testid="session-search"]').value === "");
	assert.equal(await isOpen(), true, "Escape with words clears the search first");
	await page.keyboard.type("Study session 4");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await page.waitForFunction((id) => location.pathname === `/chat/${id}`, {}, walked);
	await closed();
	console.log("PASS Ctrl+Shift+F, search filter, arrow walk, Escape clears, Enter opens and closes");

	await page.goto(`${base}/chat/${sample.id}`, { waitUntil: "networkidle2" });
	await page.waitForSelector(toggle, { visible: true });
	await page.click(toggle);
	await opened();
	await page.waitForSelector('[data-testid="session-row"]');
	const rows = await page.$$eval('[data-testid="session-row"]', (rows) => rows.map((element) => {
		const title = element.querySelector(".nb-side-title");
		return { id: element.dataset.sessionId, height: element.getBoundingClientRect().height, clipped: title.scrollWidth > title.clientWidth };
	}));
	assert.equal(rows.length, 82);
	const short = rows.filter((row) => row.id.startsWith("sidebar-stress-") && row.id !== "sidebar-stress-0");
	const shortHeight = short[0].height;
	assert.ok(shortHeight >= 28 && shortHeight <= 32, `short rows keep Notebook's row height: ${shortHeight}`);
	assert.ok(short.every((row) => row.height === shortHeight), "crowded short-title rows share one height");
	const long = rows.find((row) => row.id === "sidebar-stress-0");
	assert.ok(long.height > shortHeight, `a long title wraps onto more lines: ${JSON.stringify(long)}`);
	assert.ok(rows.every((row) => !row.clipped), "no title is truncated (feature 002)");
	const typography = await page.$eval(".lh-reading", (element) => {
		const prose = element.querySelector(".lh-prose");
		const heading = prose.querySelector("h2");
		return { measure: element.getBoundingClientRect().width, limit: getComputedStyle(element).maxWidth, parent: element.parentElement.getBoundingClientRect().width, size: getComputedStyle(prose).fontSize,
			note: getComputedStyle(document.documentElement).getPropertyValue("--note-size").trim(), heading: getComputedStyle(heading).fontWeight };
	});
	assert.equal(typography.size, typography.note, "prose follows the shared note size");
	assert.ok(Math.abs(typography.measure - Math.min(parseFloat(typography.limit), typography.parent)) < 1, `reading column reaches its cap or the shell: ${JSON.stringify(typography)}`);
	console.log(`PASS crowded rows and the reading column: ${JSON.stringify(typography)}`);

	// Feature 002 header on the overlay: Search with the filter inside, one labelled New menu.
	const header = await page.evaluate(() => {
		const search = document.querySelector('[data-testid="session-search"]');
		const filter = document.querySelector('[data-testid="kind-filter"]');
		const dot = document.querySelector('[data-session-id="sidebar-question-ui"] [role="img"][aria-label="Waiting for you"]');
		const bulb = document.createElement("span");
		bulb.style.color = "var(--bulb)";
		document.body.append(bulb);
		const bulbColor = getComputedStyle(bulb).color;
		bulb.remove();
		return {
			filterInsideSearch: search.parentElement.contains(filter),
			oldIcons: Boolean(document.querySelector('[aria-label="New practice"], [aria-label="New lesson"]')),
			newLabel: document.querySelector('[data-testid="new-menu"] span').textContent.trim(),
			shelfFont: getComputedStyle(document.querySelector('[data-testid="session-group"] span')).fontFamily,
			dot: dot ? getComputedStyle(dot).backgroundColor : null,
			bulbColor,
			footer: [...document.querySelectorAll('.nb-side-foot [data-testid]')].map((el) => el.dataset.testid),
		};
	});
	assert.equal(header.filterInsideSearch, true, "the filter sits inside the Search field");
	assert.equal(header.oldIcons, false, "the separate new-lesson and new-practice icons are gone");
	assert.equal(header.newLabel, "New");
	assert.match(header.shelfFont, /Instrument Sans/, "date shelves use the shared sans");
	assert.equal(header.dot, header.bulbColor, "a waiting session shows the bulb dot");
	assert.deepEqual(header.footer, ["settings-entry", "command-palette-entry", "switch-to-notebook"]);
	await page.focus('[data-testid="new-menu"]');
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="new-menu-list"] [role="menuitem"]', { visible: true });
	assert.deepEqual(await page.$$eval('[data-testid="new-menu-list"] [role="menuitem"]', (items) => items.map((item) => item.textContent.trim())), ["Lesson", "Practice"]);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="new-menu-list"]') && document.activeElement?.dataset.testid === "new-menu");
	assert.equal(await isOpen(), true, "Escape in a menu closes the menu, not the sidebar");
	await page.click('[data-testid="kind-filter"]');
	await page.click('[data-testid="kind-filter-practice"]');
	assert.equal(await page.$eval('[data-testid="kind-filter"]', (element) => element.dataset.active), "true", "a narrowing filter is visibly on");
	await page.click('[data-testid="kind-filter"]');
	await page.click('[data-testid="kind-filter-all"]');
	assert.equal(await page.$eval('[data-testid="kind-filter"]', (element) => element.dataset.active ?? null), null);
	// The row menu: Rename keeps the sidebar through its Escape.
	await page.click('[data-session-id="sidebar-stress-1"]', { button: "right" });
	await page.waitForSelector('[data-testid="session-context-menu"] [data-testid="ctx-rename"]', { visible: true });
	await page.click('[data-testid="ctx-rename"]');
	await page.waitForSelector('[data-testid="session-rename-input"]');
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="session-rename-input"]'));
	assert.equal(await isOpen(), true, "Escape discards the rename, not the sidebar");
	console.log("PASS sidebar header: filter inside Search, New menu (Lesson, Practice) by keyboard, bulb waiting dot, sans shelves, footer, row menu");
	if (process.env.LH_UI_SCREENSHOT_DIR) {
		await mkdir(process.env.LH_UI_SCREENSHOT_DIR, { recursive: true });
		await page.screenshot({ path: path.join(process.env.LH_UI_SCREENSHOT_DIR, "after-desktop.png") });
	}
	await page.keyboard.press("Escape");
	await closed();

	// Keep a real answer ready, but block any accidental submission from reaching a provider.
	let submissions = 0;
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") {
			submissions++;
			void request.respond({ status: 503, body: "Unexpected submission in sidebar regression" });
		} else void request.continue();
	});
	await page.goto(`${base}/chat/${question.id}`, { waitUntil: "networkidle2" });
	await page.waitForSelector('[data-testid="teach-check-reveal"]', { visible: true });
	await page.click('[data-testid="teach-check-reveal"]');
	await page.waitForSelector('[data-kbdrow="0"]', { visible: true });
	await page.click('[data-kbdrow="0"]');
	const confidence = () => page.$eval('[data-testid="confidence-segments"] [aria-checked="true"]', (element) => element.textContent);
	const initialConfidence = await confidence();
	await chord("Control", "Shift", "KeyF");
	await opened();
	await page.waitForFunction(() => document.activeElement?.matches('[data-testid="session-search"]'));
	await page.keyboard.type("zzzz no session");
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="session-row"]').length === 0);
	for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "Home", "End", "Enter"]) {
		await page.keyboard.press(key);
		await frames();
		assert.equal(await confidence(), initialConfidence, `${key} in the sidebar does not change question confidence`);
		assert.equal(submissions, 0, `${key} in the sidebar does not submit an answer`);
	}
	await page.focus('[data-testid="sidebar-lessons"]');
	await page.keyboard.press("ArrowDown");
	assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "sidebar-practice", "the nav keeps its arrow walk");
	assert.equal(await confidence(), initialConfidence);
	await page.keyboard.press("Escape");
	await closed();
	assert.equal(submissions, 0);
	assert.ok(await page.$('[data-testid="question-dock"]'), "question remains active");
	console.log("PASS keys inside the sidebar with an active dock do not change confidence or submit");

	await page.goto(`${base}/chat/${sample.id}`, { waitUntil: "networkidle2" });
	await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
	await page.reload({ waitUntil: "networkidle2" });
	await frames();
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
	await page.waitForFunction((sel) => {
		const button = [...document.querySelectorAll(sel)].find((el) => el.checkVisibility({ visibilityProperty: true }));
		if (!button) return false;
		const box = button.getBoundingClientRect();
		return box.width >= 44 && button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
	}, {}, toggle);
	await page.evaluate((sel) => [...document.querySelectorAll(sel)].find((el) => el.checkVisibility({ visibilityProperty: true })).click(), toggle);
	await opened();
	assert.equal(await page.$eval(sidebar, (element) => element.getBoundingClientRect().width), 288);
	const rowHeight = await page.$eval('[data-testid="session-row"]', (element) => element.getBoundingClientRect().height);
	assert.ok(rowHeight >= 44, `coarse rows are 44px: ${rowHeight}`);
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
	if (process.env.LH_UI_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.LH_UI_SCREENSHOT_DIR, "after-mobile.png") });
	await page.keyboard.press("Escape");
	await closed();
	assert.deepEqual(errors, []);
	console.log("PASS phone overlay, coarse targets, no horizontal overflow or browser exceptions");
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		server.kill("SIGTERM");
		await new Promise((resolve) => server.once("exit", resolve));
	}
	await rm(data, { recursive: true, force: true });
}
