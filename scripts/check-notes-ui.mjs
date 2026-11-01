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

/** A held edit through the real store, as page_revise stores one in a selection's turn. */
async function agentPropose(pageId, version, text) {
	const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tests/helpers/agent-propose-cli.ts", data, pageId, String(version), JSON.stringify(text)], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, LH_HOSTED: "0" } });
	let out = "";
	child.stdout.on("data", (chunk) => { out += chunk; });
	await new Promise((resolve) => child.once("exit", resolve));
	const result = JSON.parse(out.trim().split("\n").at(-1));
	assert.equal(result.outcome, "proposed", out);
	return result.id;
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
	// Wide screens use the session's context view; phones reach it by the palette.
	const namedNotes = `Study notes: ${p} Linear maps`;
	if (mobile) {
		await page.keyboard.down("Control");
		await page.keyboard.press("k");
		await page.keyboard.up("Control");
		await page.waitForSelector('input[placeholder="Search or run an action…"]');
		await page.keyboard.type("Turn this lesson");
		await pause(300);
		await page.keyboard.press("Enter");
	} else {
		await page.click(id("page-close"));
		await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
		await page.click(id("right-pane-toggle"));
		await page.waitForSelector(id("session-note"));
		assert.ok((await page.$eval(id("session-note"), (el) => el.textContent)).includes("1 saved passage"));
		if (shots) await page.screenshot({ path: path.join(shots, `session-notes-${width}.png`) });
		await page.click(id("session-study-notes"));
	}
	await page.waitForFunction((name) => document.querySelector('[data-testid="page-name"]')?.textContent === name, { timeout: 60000 }, namedNotes);
	await page.waitForFunction(() => document.querySelector('[data-testid="page-editor"]')?.textContent.includes("The last paragraph of the lesson."), { timeout: 60000 });
	assert.equal(await page.$eval(id("page-name"), (el) => el.textContent), namedNotes);
	await page.click(id(mobile ? "page-back" : "page-close"));
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));

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

/** A held edit from an ordinary turn, not a selection's action: the row, its Review, the page
 *  and the Library all show it, so he can't miss it. No model: the row is the tool's own result. */
async function checkOrdinaryTurnProposal(width) {
	const { page, errors, close } = await newPage(width);
	const name = `w${width} Ordinary`;
	const original = "A line to tidy.\n";
	const note = await createPage(name, original);
	const proposalId = await agentPropose(note.id, 1, "A tidier line.\n");
	const golden = JSON.parse(await readFile(path.join("tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json"), "utf8"));
	const reply = golden.messages.find((m) => m.role === "assistant" && m.stopReason === "stop");
	const chatId = `ordinary-${width}`;
	await writeFile(path.join(data, "chats", `${chatId}.json`), JSON.stringify({
		...structuredClone(golden), id: chatId, title: name, settings: { model: { provider: "openrouter", id: "openai/gpt-4o" } },
		messages: [
			{ id: "m_user", role: "user", content: "Can you tidy my notes?", timestamp: 1 },
			{ ...reply, id: "a_rev", stopReason: "toolUse", content: [{ type: "toolCall", id: "rev", name: "page_revise", arguments: { item: name, baseVersion: 1, content: "x" } }] },
			{ id: "r_rev", role: "toolResult", toolCallId: "rev", toolName: "page_revise", content: [{ type: "text", text: "{}" }], details: { outcome: "proposed", proposalId, itemId: note.id, name, target: "page" }, isError: false, timestamp: 3 },
			{ ...reply, id: "m_done", content: [{ type: "text", text: "It is waiting for you." }] },
		],
	}));
	await page.goto(`${base}/chat/${chatId}`, { waitUntil: "domcontentloaded" });
	// Review shows with no click on the row. It must not need one.
	await page.waitForFunction((sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length > 0 && Object.keys(el).some((key) => key.startsWith("__reactProps")); }, { timeout: 60000 }, id("page-row-review"));
	assert.equal(await page.$eval(`${id("page-row")} summary`, (el) => el.innerText.trim()), `Page · proposed a change to ${name}, waiting for your review`);
	if (shots) await page.screenshot({ path: path.join(shots, `held-ordinary-row-${width}.png`) });
	await noOverflow(page, width, "ordinary proposal row");
	await page.click(id("page-row-review"));
	await page.waitForSelector(id("page-proposal-diff"), { timeout: 60000 });
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-proposal-dialog"]'));
	assert.equal((await api(`/api/library/pages/${note.id}`)).body.head.content, original, "nothing changed");
	// The Library, in any session or none.
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction((text) => [...document.querySelectorAll('[data-testid="page-proposal-row"]')].some((el) => el.textContent.includes(text)), { timeout: 60000 }, name);
	// The page itself, opened beside the list.
	await openInLibrary(page, name);
	await page.waitForSelector(`${id("page-pane")} ${id("page-proposal-row")}`, { timeout: 60000 });
	assert.deepEqual(errors, [], "no browser exceptions");
	// The Library lists every waiting edit, so this one mustn't stay for the next width's check.
	assert.equal((await api(`/api/library/page-proposals/${proposalId}/reject`, "POST", {})).status, 200);
	await close();
	console.log(`ok ${width} a held edit from an ordinary turn shows on its row without a click, in the Library and on the page`);
}

/** Feature 023: Simpler, Rewrite and Expand are held. Their send is one click and changes
 *  nothing; the page and draft wait through the review, by keyboard, with reduced motion. */
async function checkHeldEdit(width) {
	const { page, errors, posts, close } = await newPage(width);
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	const p = `w${width}`;
	const original = "Keep this line.\n\nA middle line.\n\nA sentence to rewrite.\n";
	const note = await createPage(`${p} Held`, original);
	await openInLibrary(page, `${p} Held`);

	// The action itself: one message, in the words the server holds on.
	const proposed = original.replace("A sentence to rewrite.", "A clearer sentence.");
	const id1 = await agentPropose(note.id, 1, proposed);
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector(id("page-proposal-row"), { timeout: 60000 });
	assert.equal((await api(`/api/library/pages/${note.id}`)).body.head.n, 1, "the head waits");
	assert.ok(!await page.$(id("page-change-bar")), "not the after-the-fact bar");
	await noOverflow(page, width, "proposal row");
	if (width < 768) {
		const size = await page.$eval(id("page-proposal-open"), (el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
		assert.ok(size[0] >= 44 && size[1] >= 44, `coarse target ${size}`);
	}

	// The review opens by keyboard, draws no motion and hides its scrollbars.
	await page.waitForSelector(id("page-editor"));
	await pause(300);
	await page.focus(id("page-proposal-open"));
	await page.keyboard.press("Enter");
	await page.waitForSelector(id("page-proposal-diff"), { timeout: 60000 });
	if (shots) await page.screenshot({ path: path.join(shots, `held-review-${width}.png`) });
	const diff = await page.$$eval(`${id("page-proposal-diff")} [data-change]`, (els) => els.map((el) => [el.dataset.change, el.textContent]));
	assert.deepEqual(diff, [["removed", "removedA sentence to rewrite."], ["added", "addedA clearer sentence."]]);
	const look = await page.$eval(id("page-proposal-dialog"), (el) => {
		const style = getComputedStyle(el);
		return { width: el.offsetWidth - el.clientWidth, duration: parseFloat(style.animationDuration) * (style.animationDuration.endsWith("ms") ? 0.001 : 1), name: style.animationName, right: el.getBoundingClientRect().right };
	});
	assert.equal(look.width, 0, "no visible scrollbar");
	assert.ok(look.name === "none" || look.duration <= 0.01, `reduced motion: ${look.name} ${look.duration}`);
	assert.ok(look.right <= width, "fits");
	assert.ok(await page.evaluate(() => document.querySelector('[data-testid="page-proposal-dialog"]').contains(document.activeElement)), "focus moved in");

	// Escape closes the review only, and focus returns to Review.
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-proposal-dialog"]'));
	assert.ok(await page.$(id("page-pane")), "the page stays open");
	await page.waitForFunction(() => document.activeElement?.dataset?.testid === "page-proposal-open");

	// Typing elsewhere since: Accept keeps it, his draft going in first.
	await page.click(`${editor} p`);
	await page.keyboard.press("End");
	await page.keyboard.type(" Typed.");
	await waitStored(note.id, (text) => text.includes("Typed."), "the draft");
	assert.equal((await api(`/api/library/pages/${note.id}`)).body.head.n, 1, "typing only drafts");
	await page.click(id("page-proposal-open"));
	await page.waitForSelector(id("page-proposal-edit"));
	// Edit first changes only the proposal.
	await page.click(id("page-proposal-edit"));
	await page.waitForSelector(`${id("page-proposal-dialog")} ${id("page-editor")}`, { timeout: 60000 });
	if (shots) await page.screenshot({ path: path.join(shots, `held-edit-${width}.png`) });
	await pause(300);
	await page.keyboard.press("Escape");
	await page.waitForSelector(id("page-proposal-diff"));
	await page.click(id("page-proposal-accept"));
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-proposal-dialog"]'), { timeout: 30000 });
	const final = "Keep this line. Typed.\n\nA middle line.\n\nA clearer sentence.\n";
	const accepted = (await api(`/api/library/pages/${note.id}`)).body;
	assert.equal(accepted.head.content, final, "both his typing and the change");
	assert.equal(accepted.draft, null);
	const versions = (await api(`/api/library/pages/${note.id}/versions`)).body.versions;
	assert.deepEqual(versions.map((v) => [v.author, v.cause]), [["agent", "proposal-approved"], ["learner", "before-agent"], ["learner", "save"]]);
	assert.equal(versions[0].proposalId, id1);
	await page.waitForFunction((text) => document.querySelector('[data-testid="page-editor"]')?.textContent.includes(text), {}, "A clearer sentence.");
	assert.ok(!await page.$(id("page-conflict")), "his own decision is no conflict");
	assert.ok(!await page.$(id("page-proposal-row")), "the row goes");

	// A page that moved on: refused, nothing lost, the proposed text can be copied, Reject ends it.
	const id2 = await agentPropose(note.id, accepted.head.n, final.replace("A middle line.", "A better middle."));
	const moved = await api(`/api/library/pages/${note.id}/versions`, "POST", { base: accepted.head.n, rev: 0, content: `${final}\nAnother.\n` });
	assert.equal(moved.status, 201, JSON.stringify(moved.body));
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector(id("page-proposal-row"), { timeout: 60000 });
	await pause(300);
	await page.click(id("page-proposal-open"));
	await page.waitForSelector(id("page-proposal-blocked"));
	assert.ok(!await page.$(id("page-proposal-accept")), "no Accept to press");
	assert.ok(await page.$(id("page-proposal-copy")));
	if (shots) await page.screenshot({ path: path.join(shots, `held-moved-${width}.png`) });
	const refused = await api(`/api/library/page-proposals/${id2}/accept`, "POST", { expected: { head: moved.body.version.n, rev: 0 } });
	assert.equal(refused.status, 409);
	assert.equal(refused.body.code, "moved");
	const still = (await api(`/api/library/pages/${note.id}`)).body;
	assert.equal(still.head.content, `${final}\nAnother.\n`, "the page is untouched");
	await page.click(id("page-proposal-reject"));
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-proposal-dialog"]') && !document.querySelector('[data-testid="page-proposal-row"]'), { timeout: 30000 });
	assert.equal((await api(`/api/library/pages/${note.id}`)).body.head.n, still.head.n, "Reject writes nothing to the page");

	// The bubble's Rewrite is one click, and the message is the held one.
	await page.click(`${editor} p`);
	await pause(150);
	await page.keyboard.press("Home");
	await page.keyboard.down("Shift");
	await page.keyboard.press("End");
	await page.keyboard.up("Shift");
	await page.waitForSelector(id("page-bubble"), { visible: true });
	await pause(300);
	await page.evaluate(() => {
		window.__urls = [];
		for (const name of ["pushState", "replaceState"]) {
			const original = history[name].bind(history);
			history[name] = (state, title, url) => { window.__urls.push(String(url)); return original(state, title, url); };
		}
	});
	await page.$$eval(`${id("page-bubble")} button`, (els) => els.find((el) => el.textContent === "Rewrite").click());
	const sentTo = await page.waitForFunction(() => window.__urls.find((url) => url.includes("send=")), { timeout: 30000 }).then((handle) => handle.jsonValue());
	const sent = new URL(sentTo, base).searchParams.get("send");
	assert.match(sent, /^Rewrite this part of @.* Held more clearly, in the page:\n\n> /, `the held message: ${sent}`);
	assert.deepEqual(errors, [], "no page errors");
	await close();
	console.log(`ok ${width} held AI edit`);
}

/** Feature 023: the session's Notes on a phone, as a layer that is left with Escape or Back. */
async function checkPhoneNotes(width) {
	const { page, errors, close } = await newPage(width);
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	const chatId = `phone-notes-${width}`;
	await seedLesson(chatId, `w${width} Phone notes`);
	await page.goto(`${base}/chat/${chatId}`, { waitUntil: "domcontentloaded" });
	// A click on server HTML before hydration is lost.
	await page.waitForFunction((sel) => { const el = document.querySelector(sel); return el && el.getClientRects().length > 0 && Object.keys(el).some((key) => key.startsWith("__reactProps")); }, { timeout: 60000 }, id("right-pane-toggle"));
	const size = await page.$eval(id("right-pane-toggle"), (el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
	assert.ok(size[0] >= 44 && size[1] >= 44, `coarse target ${size}`);
	await page.click(id("right-pane-toggle"));
	await page.waitForSelector(id("session-study-notes"), { visible: true, timeout: 60000 });
	await page.waitForFunction(() => document.activeElement?.dataset?.testid === "page-back");
	assert.ok(await page.$(id("session-make-cards")));
	await noOverflow(page, width, "phone notes");
	if (shots) await page.screenshot({ path: path.join(shots, `phone-notes-${width}.png`) });
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="context-pane"]'));
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector(id("right-pane-toggle"), { visible: true, timeout: 60000 });
	assert.ok(!await page.$(id("context-pane")), "not saved across a visit");
	await page.click(id("right-pane-toggle"));
	await page.waitForSelector(id("page-back"), { visible: true, timeout: 60000 });
	await page.click(id("page-back"));
	await page.waitForFunction(() => !document.querySelector('[data-testid="context-pane"]'));
	assert.deepEqual(errors, [], "no page errors");
	await close();
	console.log(`ok ${width} phone notes`);
}

/** A pane wide enough for columns: the panel sits beside the text, not above it. */
async function checkWideColumn() {
	const { page, errors, close } = await newPage(2560);
	await createPage("Wide note", "Text.\n");
	await openInLibrary(page, "Wide note");
	// The pane's own divider, dragged wide.
	const handle = await page.$eval('[aria-label="Resize page panel"]', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
	await page.mouse.move(handle.x, handle.y);
	await page.mouse.down();
	await page.mouse.move(handle.x - 500, handle.y, { steps: 8 });
	await page.mouse.up();
	await pause(300);
	await page.click(id("page-links-toggle"));
	await page.waitForSelector(id("note-connections"));
	await page.waitForSelector('[data-testid="note-connections"] h3');
	const boxes = await page.evaluate(() => {
		const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; };
		return { pane: box(document.querySelector('[data-testid="page-pane"]')), text: box(document.querySelector('[data-testid="page-editor"]')), panel: box(document.querySelector('[data-testid="note-connections"]')) };
	});
	assert.ok(boxes.panel.left >= boxes.text.right - 1 && boxes.panel.right <= boxes.pane.right + 1, JSON.stringify(boxes));
	if (shots) await page.screenshot({ path: path.join(shots, "links-column-2560.png") });
	assert.deepEqual(errors, [], "no page errors");
	await close();
	console.log("ok 2560 links column");
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
		await checkHeldEdit(width);
		await checkOrdinaryTurnProposal(width);
		if (width < 768) await checkPhoneNotes(width);
	}
	await checkWideColumn();
	console.log("Notes browser checks passed.");
} finally {
	await browser?.close();
	server?.kill();
	await rm(root, { recursive: true, force: true });
}
