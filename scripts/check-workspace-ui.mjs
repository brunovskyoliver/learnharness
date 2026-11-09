/** Isolated browser regression for workspace navigation and the command palette
 * (features 014-015): tabs persist, drafts and the demo iframe survive, palette
 * search/navigate/Escape, the editor keeps Ctrl+K, panes collapse, the lesson
 * column's measure and gutters, and no page overflow at 1440, 390 and 320 px. Makes no model requests.
 * CHROME_PATH=/path/to/chrome node scripts/check-workspace-ui.mjs
 * Set TMPDIR under the home folder for a snap Chromium, whose /tmp is private.
 * Optional LH_UI_SCREENSHOT_DIR saves evidence.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const port = Number(process.env.LH_UI_PORT ?? 3106);
const base = `http://127.0.0.1:${port}`;
const root = await mkdtemp(path.join(os.tmpdir(), "learning-workspace-ui-"));
const data = path.join(root, "data");
const shots = process.env.LH_UI_SCREENSHOT_DIR;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = async (url, method, body) => {
	const response = await fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	return { status: response.status, body: await response.json() };
};
const tabTitles = (page) => page.$$eval('[data-testid="workspace-tab"]', (tabs) => tabs.map((tab) => tab.innerText.trim()));
const selectedTab = (page) => page.$eval('[data-testid="workspace-tab"][aria-selected="true"]', (tab) => tab.innerText.trim());
const waitTabs = (page, count) => page.waitForFunction((n) => document.querySelectorAll('[data-testid="workspace-tab"]').length === n, {}, count);
const activeTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
const noOverflow = async (page, label) => {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	assert.ok(overflow <= 0, `no page overflow, ${label}: ${overflow}`);
};
async function chord(page, ...keys) {
	for (const key of keys) await page.keyboard.down(key);
	for (const key of [...keys].reverse()) await page.keyboard.up(key);
}
/** The lesson column (feature 025, T033): Notebook's 660px measure where it fits, 22px gutters on phones,
 *  and the tutor's prose on the column's left edge. */
const readingColumn = async (page, width) => {
	await page.waitForSelector('[data-testid="lesson-content"] [data-answer-part-id]');
	const box = await page.evaluate(() => {
		const column = document.querySelector('[data-testid="lesson-content"]');
		const style = getComputedStyle(column);
		const rect = column.getBoundingClientRect();
		const left = rect.left + parseFloat(style.paddingLeft);
		const prose = document.querySelector('[data-testid="lesson-content"] [data-answer-part-id] .lh-prose').getBoundingClientRect();
		return { gutter: parseFloat(style.paddingLeft), measure: rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), proseLeft: prose.left - left };
	});
	if (width >= 768) assert.equal(Math.round(box.measure), 660, `660px lesson column at ${width}: ${JSON.stringify(box)}`);
	else assert.equal(box.gutter, 22, `22px phone gutter at ${width}: ${JSON.stringify(box)}`);
	assert.ok(Math.abs(box.proseLeft) < 1, `tutor prose on the column's edge at ${width}: ${JSON.stringify(box)}`);
};
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };
const composer = '[data-testid="composer"] textarea';
const palette = '[data-testid="command-palette"]';
const paletteInput = '[data-testid="command-palette-input"]';
let submissions = 0;

async function openPage(width, options = {}) {
	const page = await browser.newPage();
	page.setDefaultTimeout(30000);
	await page.setViewport({ width, height: 800, ...options });
	page.errors = [];
	page.on("pageerror", (error) => page.errors.push(error.message));
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") {
			submissions++;
			void request.respond({ status: 503, body: "No model requests in this check" });
		} else void request.continue();
	});
	return page;
}

async function checkDesktop() {
	const page = await openPage(1440);
	const library = (await api("/api/library/pages", "POST", { name: "Wave notes", content: "# First heading\n\nSome words" })).body.item;
	const folder = (await api("/api/library/folders", "POST", { name: "Physics", parentId: null })).body.folder;
	const child = (await api("/api/library/folders", "POST", { name: "Waves", parentId: folder.id })).body.folder;

	// Visiting sessions opens their tabs; opening a page adds its own.
	await page.goto(`${base}/chat/tab-one`, { waitUntil: "domcontentloaded" });
	await waitTabs(page, 1);
	assert.equal(await selectedTab(page), "Vectors lesson");
	await readingColumn(page, 1440);
	await page.click('[aria-label="Open sidebar"]');
	await page.waitForSelector('[data-session-id="tab-two"]', { visible: true });
	await page.click('[data-session-id="tab-two"]');
	await waitTabs(page, 2);
	await page.waitForFunction(() => location.pathname === "/chat/tab-two");
	await page.waitForSelector(composer);

	// A draft survives switching tabs, by pointer there and by keyboard back.
	await page.goto(`${base}/chat/tab-one`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(composer);
	await page.click(composer);
	await page.keyboard.type("a draft I am keeping");
	await page.evaluate(() => [...document.querySelectorAll('[data-testid="workspace-tab"]')].find((tab) => tab.innerText.includes("Practice set")).click());
	await page.waitForFunction(() => location.pathname === "/chat/tab-two");
	await page.waitForSelector(composer);
	assert.equal(await page.$eval(composer, (el) => el.value), "", "the other session has its own draft");
	await chord(page, "Control", "Shift", "E");
	await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "workspace-tab");
	await page.keyboard.press("ArrowLeft");
	assert.equal(await page.evaluate(() => document.activeElement.innerText.trim()), "Vectors lesson", "arrows walk the strip");
	assert.equal(new URL(page.url()).pathname, "/chat/tab-two", "walking does not activate");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => location.pathname === "/chat/tab-one");
	await page.waitForFunction((selector) => document.querySelector(selector)?.value === "a draft I am keeping", {}, composer);
	console.log("PASS a composer draft survives switching tabs; the strip walks by keyboard");

	// One tab stop only.
	assert.equal(await page.$$eval('[role="tablist"] [role="tab"][tabindex="0"]', (tabs) => tabs.length), 1, "roving tab stop");

	// The page opens from the Library, then persists with the sessions across reload.
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[aria-label="Open Wave notes"]');
	await waitTabs(page, 2);
	await page.click('[aria-label="Open Wave notes"]');
	await waitTabs(page, 3);
	await page.waitForSelector('[data-testid="page-pane"] .ProseMirror');
	const before = await tabTitles(page);
	await page.reload({ waitUntil: "domcontentloaded" });
	await waitTabs(page, 3);
	assert.deepEqual(await tabTitles(page), before, "tabs persist across reload");
	await page.waitForSelector('[data-testid="page-pane"] .ProseMirror');
	console.log("PASS tabs persist across reload");
	await shot(page, "tabs-1440");

	// Editor: Ctrl+K is its link popover, and the palette stays shut, also in its field.
	await page.click('[data-testid="page-pane"] .ProseMirror');
	await page.keyboard.down("Shift");
	await page.keyboard.press("Home");
	await page.keyboard.up("Shift");
	await chord(page, "Control", "k");
	await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "page-link-input");
	assert.equal(await page.$(palette), null, "the palette does not open from the editor");
	await chord(page, "Control", "k");
	await pause(150);
	assert.equal(await page.$(palette), null, "nor from the link field");
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-link-popover"]'));
	assert.equal(await page.$(palette), null);
	console.log("PASS editor Ctrl+K stays the link popover");

	// Palette: search, walk, navigate.
	await page.goto(`${base}/chat/tab-one`, { waitUntil: "domcontentloaded" });
	// The server's composer can be replaced by a client render, and a handle to it detached.
	await page.waitForFunction((sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length > 0 && Object.keys(el).some((key) => key.startsWith("__reactProps")); }, { timeout: 60000 }, composer);
	await page.click(composer);
	await chord(page, "Control", "k");
	await page.waitForSelector(paletteInput);
	await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), {}, paletteInput);
	const combo = await page.$eval(paletteInput, (el) => ({ role: el.getAttribute("role"), controls: el.getAttribute("aria-controls"), listRole: document.getElementById(el.getAttribute("aria-controls"))?.getAttribute("role") }));
	assert.equal(combo.role, "combobox");
	assert.equal(combo.listRole, "listbox");
	await shot(page, "palette-1440");
	// Escape closes it, and focus returns to where it was; no turn was aborted.
	await page.keyboard.press("Escape");
	await page.waitForFunction((selector) => !document.querySelector(selector), {}, palette);
	await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), {}, composer);
	console.log("PASS palette Escape returns focus to the composer");

	const search = async (query) => {
		await chord(page, "Control", "k");
		await page.waitForSelector(paletteInput);
		await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), {}, paletteInput);
		await page.keyboard.type(query);
	};
	await search("practice set");
	await page.waitForFunction(() => document.querySelector('[data-testid="command-palette-option"][aria-selected="true"]')?.innerText.includes("Practice set"));
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => location.pathname === "/chat/tab-two");
	await page.waitForFunction((selector) => !document.querySelector(selector), {}, palette);
	console.log("PASS palette finds a session and navigates");

	// A folder and a Library item, then an action; arrows wrap around.
	await search("waves");
	await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="command-palette-option"]')].some((o) => o.innerText.includes("Folder")));
	await page.keyboard.press("Enter");
	await page.waitForFunction((id) => location.search.includes(id), {}, child.id);
	await search("wave notes");
	await page.waitForFunction(() => document.querySelector('[data-testid="command-palette-option"][aria-selected="true"]')?.innerText.includes("Wave notes"));
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="page-pane"]');
	await search("zzzznothing");
	await page.waitForSelector('[data-testid="command-palette-empty"]');
	await page.keyboard.press("Escape");
	await page.waitForFunction((selector) => !document.querySelector(selector), {}, palette);
	await search("new lesson");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => location.pathname === "/chat/new");
	await page.waitForSelector(composer);
	console.log("PASS palette finds folders, items and actions; an empty search says so");

	// The model selector moved off Mod+K and answers on its new key.
	await page.goto(`${base}/chat/tab-one`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(composer);
	await page.waitForFunction(() => document.querySelector('[data-testid="workspace-tab"]'));
	// (With no models set up the menu itself isn't mounted, so check its seam.)
	await page.evaluate(() => { window.addEventListener("lh:kbd-open-model-picker", () => { window.__modelPicker = true; }); });
	await page.click(composer);
	await chord(page, "Control", "Shift", "K");
	await page.waitForFunction(() => window.__modelPicker === true);
	assert.equal(await page.$(palette), null, "Mod+Shift+K is not the palette");
	console.log("PASS the model selector's event fires on Ctrl+Shift+K");

	// The sidebar (feature 025: the overlay): lessons and practice narrow the list; the Library opens its tree.
	await page.click('[aria-label="Open sidebar"]');
	await page.waitForSelector('[data-testid="nb-sidebar"] [data-testid="sidebar-practice"]', { visible: true });
	await page.click('[data-testid="sidebar-practice"]');
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="session-row"]').length === 1);
	assert.equal(await page.$eval('[data-testid="sidebar-practice"]', (el) => el.getAttribute("aria-pressed")), "true");
	await page.click('[data-testid="sidebar-practice"]');
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="session-row"]').length === 3);
	await page.click('[data-testid="sidebar-library-toggle"]');
	await page.waitForSelector('[data-testid="sidebar-folder"]');
	await page.focus('[data-testid="sidebar-folder"]');
	await page.keyboard.press("ArrowRight");
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="sidebar-folder"]').length === 2);
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ArrowLeft");
	assert.equal(await page.evaluate(() => document.activeElement.innerText.trim()), "Physics", "arrow left goes to the parent");
	await page.keyboard.press("ArrowUp");
	assert.equal(await page.evaluate(() => document.activeElement.getAttribute("data-testid")), "sidebar-library", "up leaves the tree for the Library row");
	await page.keyboard.press("ArrowLeft");
	await page.waitForFunction(() => !document.querySelector('[data-testid="sidebar-folder"]'));
	await page.keyboard.press("ArrowRight");
	await page.waitForSelector('[data-testid="sidebar-folder"]');
	await page.focus('[data-testid="sidebar-folder"]');
	await shot(page, "sidebar-tree-1440");
	await page.keyboard.press("Enter");
	await page.waitForFunction((id) => location.search.includes(id), {}, folder.id);
	await page.waitForFunction(() => !document.querySelector('[data-testid="nb-sidebar"]'));
	console.log("PASS sidebar entries, folder tree and its keyboard; a navigation closes the overlay");

	// Right pane: collapse keeps the page, and the width; context shows with nothing open.
	await page.goto(`${base}/chat/tab-one`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(composer);
	await page.waitForSelector('[data-testid="page-pane"] .ProseMirror');
	const pageWidth = await page.$eval('[data-testid="page-pane"]', (el) => el.getBoundingClientRect().width);
	await page.click('[data-testid="page-pane"] .ProseMirror');
	await page.keyboard.type("kept ");
	await page.click('[data-testid="right-pane-toggle"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="page-pane"]').getBoundingClientRect().width === 0);
	assert.ok(await page.$('[data-testid="page-pane"] .ProseMirror'), "the editor stays mounted while collapsed");
	await chord(page, "Control", "\\");
	await page.waitForFunction((w) => document.querySelector('[data-testid="page-pane"]').getBoundingClientRect().width === w, {}, pageWidth);
	assert.ok((await page.$eval('[data-testid="page-pane"] .ProseMirror', (el) => el.innerText)).includes("kept"));
	console.log("PASS the right pane collapses by button and shortcut, editor mounted, width kept");
	await page.click('[data-testid="page-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
	await chord(page, "Control", "\\");
	await page.waitForSelector('[data-testid="context-pane"]');
	await page.waitForSelector('[data-testid="session-outline"] button, [data-testid="context-pane"] p');
	await shot(page, "context-1440");
	await page.click('[data-testid="context-pane-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="context-pane"]'));

	// One live demo iframe: a note tab and a collapse don't reload it.
	await page.goto(`${base}/chat/tab-demo`, { waitUntil: "domcontentloaded" });
	const live = '[data-demo-live="steer_demo"] iframe';
	await page.waitForSelector(live);
	await page.waitForFunction(() => document.querySelector('[data-demo-live="steer_demo"] iframe')?.getAttribute("src") || document.querySelector('[data-demo-live="steer_demo"] iframe')?.getAttribute("srcdoc"));
	const liveFrame = async () => (await page.$(live)).contentFrame();
	await page.waitForFunction(() => document.querySelectorAll("iframe").length === 1);
	let frame = await liveFrame();
	await frame.waitForSelector("input");
	await frame.$eval("input", (el) => { el.value = "42"; });
	const identity = await frame.evaluate(() => window.identity);
	// In the workspace, then collapsed: still the same document, off screen, its size kept.
	await page.evaluate(() => document.querySelector('[aria-label="Open in side panel"]').click());
	await page.waitForSelector("[data-demo-slot]");
	const dialog = '[data-demo-live="steer_demo"]';
	const box = () => page.$eval(dialog, (el) => { const r = el.getBoundingClientRect(); return { left: r.left, width: r.width }; });
	await page.waitForFunction((selector) => { const slot = document.querySelector("[data-demo-slot]").getBoundingClientRect(); return Math.abs(document.querySelector(selector).getBoundingClientRect().left - slot.left) < 2; }, {}, dialog);
	const shown = await box();
	await page.click('[data-testid="right-pane-toggle"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="demo-panel"]').getBoundingClientRect().width === 0);
	await page.waitForFunction((selector) => document.querySelector(selector).getBoundingClientRect().left >= innerWidth, {}, dialog);
	assert.equal((await box()).width, shown.width, "a collapsed demo keeps its size");
	frame = await liveFrame();
	assert.equal(await frame.evaluate(() => window.identity), identity, "collapse does not reload the demo");
	assert.equal(await frame.$eval("input", (el) => el.value), "42", "demo state survives collapse");
	await noOverflow(page, "collapsed demo");
	await page.click('[data-testid="right-pane-toggle"]');
	await page.waitForFunction((left, selector) => Math.abs(document.querySelector(selector).getBoundingClientRect().left - left) < 2, {}, shown.left, dialog);
	console.log("PASS collapsing the workspace keeps the one live demo");
	await page.evaluate(() => [...document.querySelectorAll('[data-testid="workspace-tab"]')].find((tab) => tab.innerText.includes("Wave notes")).click());
	await page.waitForSelector('[data-testid="page-pane"]');
	frame = await liveFrame();
	assert.equal(await frame.evaluate(() => window.identity), identity, "a note tab does not reload the demo");
	assert.equal(await frame.$eval("input", (el) => el.value), "42", "demo state survives a note tab");
	assert.equal(await page.$$eval("iframe", (frames) => frames.length), 1, "one live iframe");
	await page.click('[data-testid="page-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
	console.log("PASS the demo iframe stays one document through a note tab");

	// Closing: Delete by keyboard keeps focus in the strip; the session on screen moves on.
	const count = (await tabTitles(page)).length;
	await chord(page, "Control", "Shift", "E");
	await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "workspace-tab");
	await page.keyboard.press("Home");
	await page.keyboard.press("Delete");
	await waitTabs(page, count - 1);
	await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "workspace-tab");
	await page.keyboard.press("Escape");
	assert.notEqual(await activeTestId(page), "workspace-tab", "Escape leaves the strip");
	await page.click('[data-testid="workspace-tab"][aria-selected="true"] + [data-testid="workspace-tab-close"]');
	await waitTabs(page, count - 2);
	await page.waitForFunction(() => !location.pathname.includes("tab-demo"));
	console.log("PASS tabs close by Delete and by button, and the session on screen moves on");

	await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="home-scroll"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="workspace-tab"]'));
	await noOverflow(page, "home 1440");
	await shot(page, "home-1440");
	// Home has no room for the pane, so a note's tab goes where it can show.
	await page.evaluate(() => [...document.querySelectorAll('[data-testid="workspace-tab"]')].find((tab) => tab.innerText.includes("Wave notes")).click());
	await page.waitForFunction(() => location.pathname === "/library");
	await page.waitForSelector('[data-testid="page-pane"]');
	assert.deepEqual(page.errors, []);
	await page.close();
}

async function checkNarrow(width) {
	const page = await openPage(width, { hasTouch: true, isMobile: true });
	await page.goto(`${base}/chat/tab-one`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(composer);
	await page.waitForFunction(() => document.querySelector('[data-testid="workspace-tab"][aria-selected="true"]')?.innerText.includes("Vectors lesson"));
	await noOverflow(page, `session ${width}`);
	await readingColumn(page, width);
	const sizes = await page.$eval('[data-testid="workspace-tab-close"]', (el) => { const box = el.getBoundingClientRect(); return { w: box.width, h: box.height }; });
	assert.ok(sizes.w >= 44 && sizes.h >= 44, `coarse close target ${JSON.stringify(sizes)}`);
	const tab = await page.$eval('[data-testid="workspace-tab"]', (el) => el.getBoundingClientRect().height);
	assert.ok(tab >= 44, `coarse tab target ${tab}`);
	const toggleHidden = await page.$eval('[data-testid="right-pane-toggle"]', (el) => getComputedStyle(el).display === "none");
	assert.ok(toggleHidden, "phones have no right pane toggle");
	await shot(page, `session-${width}`);

	// The palette through its touch path, from the sidebar overlay.
	await page.evaluate(() => [...document.querySelectorAll('[aria-label="Open sidebar"]')].find((el) => el.checkVisibility({ visibilityProperty: true })).click());
	await page.waitForSelector('[data-testid="nb-sidebar"] [data-testid="sidebar-lessons"]');
	await shot(page, `sidebar-${width}`);
	await page.evaluate(() => document.querySelector('[data-testid="command-palette-entry"]').click());
	await page.waitForSelector(paletteInput);
	await page.waitForFunction(() => !document.querySelector('[data-testid="nb-sidebar"]'));
	const panel = await page.$eval(palette, (el) => { const box = el.getBoundingClientRect(); return { left: box.left, right: box.right }; });
	assert.ok(panel.left >= 0 && panel.right <= width, `palette fits ${JSON.stringify(panel)}`);
	const option = await page.$eval('[data-testid="command-palette-option"]', (el) => el.getBoundingClientRect().height);
	assert.ok(option >= 44, `coarse option ${option}`);
	await noOverflow(page, `palette ${width}`);
	await shot(page, `palette-${width}`);
	await page.keyboard.press("Escape");
	await page.waitForFunction((selector) => !document.querySelector(selector), {}, palette);

	for (const route of ["/", "/library", "/chat/new"]) {
		await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.querySelector('[data-testid="workspace-tab"]'));
		await noOverflow(page, `${route} ${width}`);
	}
	await shot(page, `library-${width}`);
	assert.deepEqual(page.errors, []);
	await page.close();
	console.log(`PASS ${width}: targets, palette, overlay, no overflow`);
}

let server;
let browser;
try {
	const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", import.meta.url), "utf8"));
	await mkdir(path.join(data, "chats"), { recursive: true });
	const assistant = fixture.messages.findLast((message) => message.role === "assistant");
	const textOnly = { ...assistant, content: [{ type: "text", text: "## A plain lesson\n\nSome reading to keep the transcript honest." }] };
	const seed = (id, title, kind, messages) => writeFile(path.join(data, "chats", `${id}.json`), JSON.stringify({ ...fixture, id, title, kind, messages }));
	await seed("tab-one", "Vectors lesson", "teach", [textOnly]);
	await seed("tab-two", "Practice set", "practice", [textOnly]);
	const demo = { id: "steer_demo", role: "custom", customType: "subagent-steer", content: "Demo delivered.", display: true, details: { jobId: "demo", kind: "demo", toolCallId: "demo-job", result: { title: "Live demo", html: '<html><body><input aria-label="Value" value="3"><script>window.identity=Math.random()</script></body></html>', tested: true } }, timestamp: Date.now() };
	await seed("tab-demo", "Demo lesson", "teach", [textOnly, demo]);
	if (shots) await mkdir(shots, { recursive: true });
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
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
	await checkDesktop();
	for (const width of [390, 320]) await checkNarrow(width);
	assert.equal(submissions, 0, "no model request was attempted");
	console.log("Workspace browser checks passed.");
} finally {
	await browser?.close();
	server?.kill();
	await rm(root, { recursive: true, force: true });
}
