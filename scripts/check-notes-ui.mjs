/** Isolated browser regression for intelligent notes (features 016-018): wiki
 * link create, follow and rename; a backlink; a callout and a collapsed section
 * across a reload; saving a passage and jumping to its source; a deleted session;
 * an AI edit's review bar and Undo; at 1440, 390 and 320 px. Model submissions are
 * intercepted, and the AI edit goes through the real store as the tool does.
 * TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium node scripts/check-notes-ui.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const port = Number(process.env.LH_UI_PORT ?? 3106);
const base = `http://127.0.0.1:${port}`;
const root = await mkdtemp(path.join(os.tmpdir(), "learning-notes-ui-"));
const data = path.join(root, "data");
const shots = process.env.LH_UI_SCREENSHOT_DIR;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const editor = '[data-testid="page-editor"]';
const id = (name) => `[data-testid="${name}"]`;
let server;
let browser;

const api = async (url, method = "GET", body) => {
	const response = await fetch(`${base}${url}`, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
	return { status: response.status, body: await response.json() };
};
const createPage = async (name, content) => {
	const made = await api("/api/library/pages", "POST", { name, content });
	assert.equal(made.status, 201, JSON.stringify(made.body));
	return made.body.item;
};
const stored = async (pageId) => {
	const { body } = await api(`/api/library/pages/${pageId}`);
	return body.draft?.content ?? body.head.content;
};
const waitStored = async (pageId, check, label) => {
	let text = "";
	for (let i = 0; i < 80; i++) {
		text = await stored(pageId);
		if (check(text)) return text;
		await pause(250);
	}
	assert.fail(`${label}: stored text was ${JSON.stringify(text)}`);
};

/** A tutor revision written through the real store, as the agent's tool does. */
async function agentRevise(pageId, version, text) {
	const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tests/helpers/agent-revise-cli.ts", data, pageId, String(version), JSON.stringify(text)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, LH_HOSTED: "0" } });
	let out = "";
	child.stdout.on("data", (chunk) => { out += chunk; });
	await new Promise((resolve) => child.once("exit", resolve));
	const result = JSON.parse(out.trim().split("\n").at(-1));
	assert.equal(result.outcome, "revised", out);
	return result.version;
}

/** A lesson on disk, from the golden fixture's shape, so nothing calls a model. */
async function seedLesson(chatId, title) {
	const golden = JSON.parse(await readFile(path.join("tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json"), "utf8"));
	const reply = golden.messages.find((m) => m.role === "assistant" && m.stopReason === "stop");
	const prose = (mid, text) => ({ ...reply, id: mid, stopReason: "stop", content: [{ type: "text", text }] });
	const filler = Array.from({ length: 14 }, (_, i) => prose(`m_fill_${i}`, `Filler paragraph ${i} so the transcript has to scroll to reach the rest of the lesson.`));
	const chats = path.join(data, "chats");
	await mkdir(chats, { recursive: true });
	await writeFile(path.join(chats, `${chatId}.json`), JSON.stringify({
		...structuredClone(golden), id: chatId, title, settings: { model: { provider: "openrouter", id: "openai/gpt-4o" } },
		messages: [
			{ id: "m_user", role: "user", content: "Teach me.", timestamp: 1 },
			prose("m_first", "An eigenvector keeps its direction under the map, and $Av = \\lambda v$ says how far it stretches."),
			...filler,
			prose("m_last", "The last paragraph of the lesson."),
		],
	}));
}

async function newPage(width) {
	const mobile = width < 768;
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	page.setDefaultTimeout(30000);
	await page.setViewport({ width, height: 800, isMobile: mobile, hasTouch: mobile });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const posts = [];
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (request.method() === "POST" && url.pathname === "/api/chat") {
			posts.push(JSON.parse(request.postData() ?? "{}"));
			return void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
		}
		void request.continue();
	});
	return { page, errors, posts, mobile, close: () => context.close() };
}

async function openInLibrary(page, name) {
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	for (let i = 0; i < 40 && !(await page.$('[data-testid="page-pane"]')); i++) {
		await page.click(`[aria-label="Open ${name}"]`).catch(() => {});
		await pause(500);
	}
	await page.waitForSelector(editor, { timeout: 60000 });
}

const noOverflow = async (page, width, label) => {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	assert.ok(overflow <= 0, `no page overflow at ${width}, ${label}: ${overflow}`);
};

/** At the end of the editor, on a line of its own. */
const typeAtEnd = async (page, text) => {
	await page.click(`${editor} > :last-child`);
	await pause(150);
	await page.keyboard.press("End");
	await pause(60);
	if (await page.$eval(`${editor} > :last-child`, (el) => el.textContent.length > 0)) await page.keyboard.press("Enter");
	await pause(80);
	await page.keyboard.type(text);
};

async function checkLinks(width) {
	const { page, errors, mobile, close } = await newPage(width);
	const p = `w${width}`;
	const target = await createPage(`${p} Waves`, "Target text.\n");
	const home = await createPage(`${p} Index`, "Start.\n");
	await openInLibrary(page, `${p} Index`);

	// Create: [[ opens the list; it filters; Enter inserts; the Markdown is plain.
	await typeAtEnd(page, "See [[");
	await page.waitForSelector(id("page-wiki-menu"));
	await page.keyboard.type(`${p} Wa`);
	await page.waitForFunction((text) => document.querySelector('[data-testid="page-wiki-option"]')?.textContent.includes(text), {}, `${p} Waves`);
	if (shots) await page.screenshot({ path: path.join(shots, `wiki-menu-${width}.png`) });
	await page.keyboard.press("Enter");
	await page.waitForSelector(id("page-wiki-link"));
	await waitStored(home.id, (text) => text === `Start.\n\nSee [[${p} Waves]]\n`, "a chosen link");

	// Escape closes only the list, and the pane stays open with the caret in the text.
	await page.keyboard.type(" and [[Nope");
	await page.waitForSelector(id("page-wiki-menu"));
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-wiki-menu"]'));
	assert.ok(await page.$('[data-testid="page-pane"]'), "Escape closed only the list");
	await page.keyboard.type("]]");
	await waitStored(home.id, (text) => text === `Start.\n\nSee [[${p} Waves]] and [[Nope]]\n`, "typing a whole link");
	const states = await page.$$eval(id("page-wiki-link"), (els) => els.map((el) => [el.textContent, el.dataset.state]));
	assert.deepEqual(states, [[`${p} Waves`, "live"], ["Nope", "missing"]], "a dangling link shows as one");

	// A dangling link says so when followed, and is kept; the page can be made from it.
	await page.evaluate(() => [...document.querySelectorAll('[data-testid="page-wiki-link"]')].at(-1).click());
	await page.waitForSelector(id("page-wiki-dangling"));
	assert.ok((await page.$eval(id("page-wiki-dangling"), (el) => el.textContent)).includes("Nothing in your Library is called Nope yet."));
	await page.evaluate(() => [...document.querySelectorAll('[data-testid="page-wiki-dangling"] button')].at(-1).click());

	// Links panel: backlink on the target; here, the outgoing links.
	await page.click(id("page-links-toggle"));
	await page.waitForSelector('[data-testid="note-link"]');
	const rows = await page.$$eval('[data-testid="note-link"]', (els) => els.map((el) => [el.dataset.state, el.textContent]));
	assert.deepEqual(rows[0], ["live", `${p} Waves`]);
	assert.deepEqual(rows[1], ["missing", "NopeNo such page yet"]);
	if (shots) await page.screenshot({ path: path.join(shots, `links-panel-${width}.png`) });
	await noOverflow(page, width, "links panel");

	// Follow the link to its page; the panel there shows the backlink.
	await page.evaluate(() => document.querySelector('[data-testid="page-wiki-link"]').click());
	await page.waitForFunction((name) => document.querySelector('[data-testid="page-name"]')?.textContent === name, {}, `${p} Waves`);
	await page.waitForSelector(editor);
	await page.click(id("page-links-toggle"));
	await page.waitForSelector(id("note-backlink"));
	assert.ok((await page.$eval(id("note-backlink"), (el) => el.textContent)).includes(`${p} Index`));

	// Rename the target: the backlink stays, and the link shows the new name while its bytes stay.
	await page.click(id("page-name"));
	await page.waitForSelector(id("page-name-input"));
	await page.keyboard.type(`${p} Oscillations`);
	await page.keyboard.press("Enter");
	await page.waitForFunction((name) => document.querySelector('[data-testid="page-name"]')?.textContent === name, {}, `${p} Oscillations`);
	await page.waitForSelector(id("note-backlink"));
	await page.click(id("note-backlink"));
	await page.waitForFunction((name) => document.querySelector('[data-testid="page-name"]')?.textContent === name, {}, `${p} Index`);
	await page.waitForFunction((name) => document.querySelector('[data-testid="page-wiki-link"]')?.textContent === name, {}, `${p} Oscillations`);
	assert.ok((await stored(home.id)).includes(`[[${p} Waves]]`), "the stored link is what was written");

	// A new page with the old name doesn't capture the link.
	await createPage(`${p} Waves`, "A different page.\n");
	await pause(600);
	assert.equal(await page.$eval(id("page-wiki-link"), (el) => el.textContent), `${p} Oscillations`);
	const seen = (await api(`/api/library/pages/${target.id}/connections`)).body;
	assert.deepEqual(seen.backlinks.map((row) => row.id), [home.id]);

	// Keyboard: Ctrl+Enter beside a link follows it, like a click.
	await page.evaluate(() => {
		const link = document.querySelector('[data-testid="page-wiki-link"]');
		const range = document.createRange();
		range.setStartAfter(link);
		range.collapse(true);
		const selection = getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
	});
	await page.focus(editor);
	await pause(150);
	await page.keyboard.down("Control");
	await page.keyboard.press("Enter");
	await page.keyboard.up("Control");
	await page.waitForFunction((name) => document.querySelector('[data-testid="page-name"]')?.textContent === name, {}, `${p} Oscillations`);
	assert.deepEqual(errors, [], "no page errors");
	if (mobile) await noOverflow(page, width, "after following");
	await close();
	console.log(`ok ${width} wiki links`);
}

async function checkBlocks(width) {
	const { page, errors, close } = await newPage(width);
	const p = `w${width}`;
	const note = await createPage(`${p} Blocks`, "Start.\n");
	await openInLibrary(page, `${p} Blocks`);

	// Callout from the slash menu, with a kind and body.
	await typeAtEnd(page, "/callout");
	await page.waitForSelector(id("page-slash-menu"));
	await page.keyboard.press("Enter");
	await page.waitForSelector(id("page-callout"));
	await page.keyboard.type("Mind the sign.");
	await page.select(id("page-callout-kind"), "WARNING");
	await waitStored(note.id, (text) => text.includes("> [!WARNING]\n> Mind the sign."), "the callout's Markdown");

	// Collapsible section: title, Enter into the body, and a toggle.
	await typeAtEnd(page, "/collapsible");
	await page.waitForFunction(() => document.querySelector('[data-testid="page-slash-option"]')?.textContent === "Collapsible section");
	await page.keyboard.press("Enter");
	await page.waitForSelector(id("page-collapsible"));
	await page.keyboard.type("Proof");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Hidden body.");
	await waitStored(note.id, (text) => text.includes("<details open>\n<summary>Proof</summary>\n\nHidden body.\n\n</details>"), "the section's Markdown");
	if (shots) await page.screenshot({ path: path.join(shots, `blocks-open-${width}.png`) });
	await page.click(id("page-collapsible-toggle"));
	await page.waitForFunction(() => document.querySelector('[data-testid="page-collapsible"]').dataset.open === "false");
	await waitStored(note.id, (text) => text.includes("<details>\n<summary>Proof</summary>"), "collapsing is stored");
	assert.equal(await page.$eval(id("page-collapsible-toggle"), (el) => el.getAttribute("aria-expanded")), "false");
	assert.ok(await page.evaluate(() => {
		const body = [...document.querySelectorAll('.lh-collapsible-content > p')].find((el) => el.textContent === "Hidden body.");
		return body && getComputedStyle(body).display === "none";
	}), "the body is hidden while collapsed");
	const toggleBox = await page.$eval(id("page-collapsible-toggle"), (el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
	if (width < 768) assert.ok(toggleBox[0] >= 44 && toggleBox[1] >= 44, `coarse target ${toggleBox}`);

	// Both survive a reload, as they were left.
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector(id("page-callout"), { timeout: 60000 });
	assert.equal(await page.$eval(id("page-callout-kind"), (el) => el.value), "WARNING");
	assert.equal(await page.$eval(id("page-collapsible"), (el) => el.dataset.open), "false");
	assert.ok((await page.$eval(id("page-callout"), (el) => el.textContent)).includes("Mind the sign."));
	await page.click(id("page-collapsible-toggle"));
	await page.waitForFunction(() => document.querySelector('[data-testid="page-collapsible"]').dataset.open === "true");
	if (shots) await page.screenshot({ path: path.join(shots, `blocks-${width}.png`) });
	await noOverflow(page, width, "blocks");
	assert.deepEqual(errors, [], "no page errors");
	await close();
	console.log(`ok ${width} callout and collapsible`);
}

/** Selects the passage's first text, as a learner would by dragging. */
const selectPassage = (page, messageId) => page.evaluate((mid) => {
	const passage = document.querySelector(`[data-source-message-id="${mid}"]`);
	if (!passage) return false;
	const walker = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
	const first = walker.nextNode();
	const range = document.createRange();
	range.setStart(first, 0);
	const last = [...passage.querySelectorAll(".katex")].at(-1) ?? first;
	if (last === first) range.setEnd(first, first.length); else range.setEndAfter(last);
	const selection = window.getSelection();
	selection.removeAllRanges();
	selection.addRange(range);
	return true;
}, messageId);

async function checkPassages(width) {
	const { page, errors, mobile, close } = await newPage(width);
	const p = `w${width}`;
	const chatId = `lesson-${width}`;
	await seedLesson(chatId, `${p} Linear maps`);
	const note = await createPage(`${p} Reading`, "Mine.\n");
	await page.goto(`${base}/chat/${chatId}`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-source-message-id="m_first"]', { timeout: 60000 });

	// Select lesson text: the action appears; the formula comes through as TeX.
	// Hydration can replace the transcript's nodes, and a selection with them.
	for (let i = 0; i < 60 && !(await page.$(id("save-passage"))); i++) {
		await selectPassage(page, "m_first");
		await pause(500);
	}
	await page.waitForSelector(id("save-passage"));
	if (shots) await page.screenshot({ path: path.join(shots, `passage-trigger-${width}.png`) });
	await page.click(id("save-passage"));
	await page.waitForSelector(id("save-passage-dialog"));
	await page.waitForSelector(id("save-passage-page"));
	const preview = await page.$eval(id("save-passage-preview"), (el) => el.textContent);
	assert.ok(preview.includes("$Av = \\lambda v$") && !preview.includes("λ"), `the formula's TeX: ${preview}`);
	if (shots) await page.screenshot({ path: path.join(shots, `passage-dialog-${width}.png`) });
	await page.evaluate((name) => [...document.querySelectorAll('[data-testid="save-passage-page"]')].find((el) => el.textContent === name).click(), `${p} Reading`);
	await page.waitForSelector(id("save-passage-saved"));
	const text = await stored(note.id);
	assert.ok(text.startsWith("Mine.\n\n> An eigenvector keeps its direction"), text);
	assert.ok(text.includes(`[Lesson: ${p} Linear maps](/chat/${chatId}#message-m_first)`), text);
	await page.click(id("save-passage-open"));

	// In the page: the link is there, and following it jumps to the message.
	await page.waitForSelector(editor, { timeout: 60000 });
	await page.waitForSelector(id("page-source-link"));
	await page.evaluate(() => { document.querySelector('[data-testid="page-source-link"]').scrollIntoView({ block: "center" }); });
	if (shots) await page.screenshot({ path: path.join(shots, `passage-page-${width}.png`) });
	const box = await page.$eval(id("page-source-link"), (el) => { const r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width, 20) / 2, y: r.top + r.height / 2 }; });
	// From the bottom of the transcript, so the jump has somewhere to go.
	await page.evaluate(() => document.querySelector('[data-source-message-id="m_last"]')?.scrollIntoView({ block: "end" }));
	await pause(200);
	await page.mouse.click(box.x, box.y);
	await page.waitForFunction((mid) => decodeURIComponent(location.hash) === `#message-${mid}`, {}, "m_first");
	await page.waitForFunction(() => {
		const target = document.getElementById("message-m_first");
		if (!target) return false;
		const rect = target.getBoundingClientRect();
		return rect.top >= 0 && rect.top < innerHeight;
	});
	if (mobile) await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));

	// Both directions: the page lists the lesson; the API lists the page for the session.
	const pages = (await api(`/api/chats/${chatId}/pages`)).body.pages;
	assert.deepEqual(pages.map((row) => [row.id, row.passages]), [[note.id, 1]]);

	// Study notes: an explicit click, no model, a new page holding the lesson's text.
	const made = (await api(`/api/chats/${chatId}/study-notes`, "POST")).body.item;
	assert.equal(made.name, `Study notes: ${p} Linear maps`);
	assert.ok((await stored(made.id)).includes("The last paragraph of the lesson."));

	// The session goes: the text stays, and the page says the source is gone.
	const deleted = await fetch(`${base}/api/chats/${chatId}?mode=preserve-graph`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "preserve-graph" }) });
	assert.equal(deleted.status, 200, await deleted.clone().text());
	await openInLibrary(page, `${p} Reading`);
	await page.waitForSelector(id("page-source-gone"));
	assert.ok((await page.$eval(editor, (el) => el.textContent)).includes("An eigenvector keeps its direction"));
	await page.click(id("page-links-toggle"));
	await page.waitForSelector(id("note-source-gone"));
	if (shots) await page.screenshot({ path: path.join(shots, `source-gone-${width}.png`) });
	await noOverflow(page, width, "source gone");
	assert.deepEqual(errors, [], "no page errors");
	await close();
	console.log(`ok ${width} passages and sources`);
}

async function checkAiEdit(width) {
	const { page, errors, posts, close } = await newPage(width);
	const p = `w${width}`;
	const original = "Keep this line.\n\nA sentence to rewrite.\n";
	const note = await createPage(`${p} Review`, original);
	await openInLibrary(page, `${p} Review`);

	// Every action is in the bubble; Ask… sends nothing; each send is one click.
	await page.click(`${editor} p`);
	await pause(150);
	await page.keyboard.press("Home");
	await page.keyboard.down("Shift");
	await page.keyboard.press("End");
	await page.keyboard.up("Shift");
	await page.waitForSelector(id("page-bubble"), { visible: true });
	await pause(400);
	if (shots) await page.screenshot({ path: path.join(shots, `bubble-${width}.png`) });
	const labels = await page.$$eval(`${id("page-bubble")} button`, (els) => els.map((el) => el.textContent || el.getAttribute("aria-label")));
	assert.deepEqual(labels.slice(3), ["Explain", "Simpler", "Summarize", "Rewrite", "Expand", "Challenge", "Quiz me on this", "Generate questions", "Ask…"]);
	assert.equal(posts.length, 0, "nothing is sent by showing the bubble");
	const bubble = await page.$eval(id("page-bubble"), (el) => { const r = el.getBoundingClientRect(); return [r.left, r.right]; });
	assert.ok(bubble[0] >= 0 && bubble[1] <= width, `the bubble fits: ${bubble}`);
	await noOverflow(page, width, "bubble");

	// The tutor's edit, from another process as a tool's would be: the learner's
	// text is saved first (tests/note-api.test.ts covers an unsaved draft), and the
	// next open shows the review bar.
	await page.keyboard.press("End");
	await page.keyboard.type(" Typed.");
	await waitStored(note.id, (text) => text.includes("Typed."), "the draft");
	await page.keyboard.down("Control");
	await page.keyboard.press("s");
	await page.keyboard.up("Control");
	let head;
	for (let i = 0; i < 40; i++) {
		head = (await api(`/api/library/pages/${note.id}`)).body;
		if (!head.draft && head.head.content.includes("Typed.")) break;
		await pause(250);
	}
	const draft = head.head.content;
	const version = await agentRevise(note.id, head.head.n, draft.replace("A sentence to rewrite.", "A clearer sentence."));
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector(id("page-change-bar"), { timeout: 60000 });
	assert.equal(await page.$eval(`${id("page-change-bar")} p`, (el) => el.textContent), `The tutor changed 1 place · version ${version}`);
	assert.equal(await page.$$eval(`${editor} [data-tutor-change]`, (els) => els.map((el) => el.textContent).join("|")), "A clearer sentence.");
	if (shots) await page.screenshot({ path: path.join(shots, `review-bar-${width}.png`) });
	await noOverflow(page, width, "review bar");

	// Undo restores the learner's text, as a new version, and the bar goes.
	await page.click(id("page-undo-tutor"));
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-change-bar"]'));
	const restored = await waitStored(note.id, (text) => text.includes("A sentence to rewrite."), "undo");
	assert.equal(restored, draft, "the learner's own text is back, whole");
	const versions = (await api(`/api/library/pages/${note.id}/versions`)).body.versions;
	assert.equal(versions[0].cause, "undo-agent");
	assert.ok(versions.some((v) => v.author === "agent" && v.cause === "agent-revise"), "the tutor's version is kept in History");
	assert.deepEqual(errors, [], "no page errors");
	await close();
	console.log(`ok ${width} AI edit review`);
}

try {
	await mkdir(data, { recursive: true });
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
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
	for (const width of (process.env.LH_UI_WIDTHS ?? "1440,390,320").split(",").map(Number)) {
		await checkLinks(width);
		await checkBlocks(width);
		await checkPassages(width);
		await checkAiEdit(width);
	}
	console.log("Notes browser checks passed.");
} finally {
	await browser?.close();
	server?.kill();
	await rm(root, { recursive: true, force: true });
}
