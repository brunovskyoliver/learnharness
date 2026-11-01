/** Isolated browser regression for document search and the PDF reader (features
 * 019-020): search finds a page and a PDF page with a snippet, filters narrow, jump
 * lands on the passage, a scanned PDF says it has no text, a highlight survives a
 * reload, and a citation opens the right page, at 1440, 390 and 320. Model
 * submissions are intercepted, so it makes no model requests.
 * TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium node scripts/check-documents-ui.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { blankPdf } from "../tests/fixtures/make-blank-pdf.mjs";

const port = Number(process.env.LH_UI_PORT ?? 3122);
const base = `http://127.0.0.1:${port}`;
const root = await mkdtemp(path.join(os.tmpdir(), "learning-documents-ui-"));
const data = path.join(root, "data");
const shots = process.env.LH_UI_SCREENSHOT_DIR;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SAMPLE = await readFile("tests/fixtures/sample-3page.pdf");
let server;
let browser;
let failing = null;

const api = async (url, method = "GET", body) => {
	const response = await fetch(`${base}${url}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
	return { status: response.status, body: await response.json() };
};
const upload = async (name, bytes) => {
	const response = await fetch(`${base}/api/library/upload?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Length": String(bytes.length) }, body: bytes });
	assert.equal(response.status, 201, name);
	return (await response.json()).item;
};
const createPage = async (name, content, extra = {}) => {
	const made = await api("/api/library/pages", "POST", { name, content, ...extra });
	assert.equal(made.status, 201, name);
	return made.body.item;
};

/** A lesson on disk, so a citation in the transcript needs no model. */
async function seedLesson(chatId, text) {
	const golden = JSON.parse(await readFile("tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", "utf8"));
	const reply = golden.messages.find((m) => m.role === "assistant" && m.stopReason === "stop");
	const chats = path.join(data, "chats");
	await mkdir(chats, { recursive: true });
	await writeFile(path.join(chats, `${chatId}.json`), JSON.stringify({
		...structuredClone(golden), id: chatId, title: `Lesson ${chatId}`, settings: { model: { provider: "openrouter", id: "openai/gpt-4o" } },
		messages: [{ id: "m_user", role: "user", content: "Teach me.", timestamp: 1 }, { ...reply, id: "m_cite", stopReason: "stop", content: [{ type: "text", text }] }],
	}));
}

async function newPage(width) {
	const mobile = width < 768;
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	page.setDefaultTimeout(45000);
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
		assert.ok(url.origin === base || url.protocol === "data:" || url.protocol === "blob:", `no outside request: ${url.href}`);
		void request.continue();
	});
	return { page, errors, posts, mobile, close: () => context.close() };
}

const noOverflow = async (page, label) => {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	assert.ok(overflow <= 0, `no page overflow, ${label}: ${overflow}`);
};
const noScrollbars = async (page, selector) => {
	const shown = await page.$eval(selector, (el) => el.offsetWidth - el.clientWidth);
	assert.equal(shown, 0, `no visible scrollbar on ${selector}`);
};
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name) }); };
const textOf = (page, selector) => page.$eval(selector, (el) => el.innerText);

async function openLibrarySearch(page) {
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="library-search-mode-text"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="library-search"]'));
	for (let i = 0; i < 40; i++) {
		await page.click('[data-testid="library-search-mode-text"]');
		if (await page.$('[data-testid="doc-search"]')) break;
		await pause(250);
	}
	await page.waitForSelector('[data-testid="doc-search"]');
}

async function typeQuery(page, query) {
	await page.$eval('[data-testid="library-search"]', (input) => { input.focus(); input.select(); });
	await page.keyboard.press("Backspace");
	await page.type('[data-testid="library-search"]', query);
}

const resultButton = (name, place) => `[aria-label="Open ${name}${place ? `, ${place}` : ""}"]`;

/** Waits until the index has read everything, through the status the UI shows. */
async function indexSettled() {
	for (let i = 0; i < 240; i++) {
		const { body } = await api("/api/library/search/status");
		if (body.counts.pending === 0 && !body.building) return body;
		await pause(250);
	}
	assert.fail("the index settled");
}

async function selectWord(page, pageNumber, word) {
	await page.waitForSelector(`[data-pdf-page="${pageNumber}"][data-text-ready]`);
	await page.evaluate((n, target) => {
		const layer = document.querySelector(`[data-pdf-page="${n}"] [data-testid="pdf-text-layer"]`);
		const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const at = node.data.indexOf(target);
			if (at === -1) continue;
			const range = document.createRange();
			range.setStart(node, at);
			range.setEnd(node, at + target.length);
			node.parentElement.scrollIntoView({ block: "center" });
			const selection = window.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
			return;
		}
		throw new Error(`${target} isn't on page ${n}`);
	}, pageNumber, word);
	await page.waitForSelector('[data-testid="pdf-bubble"]');
}

async function closePane(page, mobile) {
	await page.click(mobile ? '[data-testid="page-back"]' : '[data-testid="page-close"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="page-pane"]'));
}

async function checkWidth(width) {
	const p = `w${width}`;
	const word = `${p}quark`;
	const folder = (await api("/api/library/folders", "POST", { name: `${p} Physics`, parentId: null })).body.folder;
	const note = await createPage(`${p} note`, `# Start\n\n${"Filler paragraph that pushes the rest down the page.\n\n".repeat(30)}The ${word} is a *small* particle of matter.`, { folderId: folder.id });
	const pdfName = `${p} sample.pdf`;
	const pdf = await upload(pdfName, SAMPLE);
	const scanName = `${p} scan.pdf`;
	const scan = await upload(scanName, blankPdf());
	await upload(`${p} data.txt`, Buffer.from(`${Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n")}\nthe ${word}file is here\nlast`));
	const hostile = `${p}hostile`;
	await createPage(`${p} hostile`, `A <img src=x onerror="window.__xss=1"> ${hostile} word.`);
	await indexSettled();

	const { page, errors, posts, mobile, close } = await newPage(width);
	failing = { page, width };

	// Names mode is still the default, and still filters on the client.
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[aria-label="Open ${pdfName}"]`);
	assert.equal(await page.$eval('[data-testid="library-search-mode-names"]', (el) => el.getAttribute("aria-pressed")), "true");
	await page.type('[data-testid="library-search"]', `${p} sam`);
	await page.waitForFunction((name) => document.querySelector(`[aria-label="Open ${name}"]`) && !document.querySelector('[data-testid="doc-search"]'), {}, pdfName);

	// Full text: a page with a snippet; the match is marked; the count is announced.
	await openLibrarySearch(page);
	await typeQuery(page, word);
	await page.waitForSelector(resultButton(`${p} note`));
	await page.waitForFunction(() => /\d+ match/.test(document.querySelector('[data-testid="doc-search-count"]')?.innerText ?? ""));
	assert.ok((await page.$eval('[data-testid="doc-search-count"]', (el) => el.getAttribute("aria-live"))) === "polite");
	const snippetMark = await page.$eval(`${resultButton(`${p} note`)} mark`, (el) => el.textContent);
	assert.equal(snippetMark.toLowerCase(), word);
	await noOverflow(page, "results");
	await noScrollbars(page, '[data-testid="library-scroll"]');
	await shot(page, `documents-results-${width}.png`);

	// A document's markup is text in a snippet.
	await typeQuery(page, hostile);
	await page.waitForSelector(resultButton(`${p} hostile`));
	const hostileHtml = await page.$eval('[data-testid="doc-snippet"]', (el) => el.innerHTML);
	assert.ok(!hostileHtml.includes("<img"), hostileHtml);
	assert.equal(await page.evaluate(() => window.__xss), undefined);

	// A PDF page, with its page named.
	await typeQuery(page, "force equals mass");
	await page.waitForSelector(resultButton(pdfName, "Page 2"));

	// Filters narrow: by type, then by folder.
	await typeQuery(page, word);
	await page.waitForFunction((name) => document.querySelector(`[aria-label^="Open ${name}"]`), {}, `${p} data.txt`);
	const before = (await page.$$('[data-testid="doc-search-result"]')).length;
	assert.ok(before >= 2, `results for both: ${before}`);
	await page.select('[aria-label="Filter by type"]', "page");
	await page.waitForFunction((name) => !document.querySelector(`[aria-label^="Open ${name}"]`), {}, `${p} data.txt`);
	assert.ok(await page.$(resultButton(`${p} note`)), "the page stays");
	await page.select('[aria-label="Filter by type"]', "");
	await page.waitForFunction((name) => document.querySelector(`[aria-label^="Open ${name}"]`), {}, `${p} data.txt`);
	await page.select('[data-testid="doc-search-folder"]', folder.id);
	await page.waitForFunction((name) => !document.querySelector(`[aria-label^="Open ${name}"]`), {}, `${p} data.txt`);
	assert.ok(await page.$(resultButton(`${p} note`)), "the page's folder stays");
	await page.select('[data-testid="doc-search-folder"]', "");

	// A scanned PDF says it has no text: its row, the list and the reader.
	await typeQuery(page, scanName);
	await page.waitForSelector(resultButton(scanName));
	assert.ok((await textOf(page, '[data-testid="doc-search-meta"]')).includes("No text could be read"));
	assert.ok((await textOf(page, '[data-testid="doc-search-status"]')).includes("with no readable text"));
	await page.click('[data-testid="doc-search-which"]');
	await page.waitForSelector('[data-testid="doc-search-not-searched"]');
	assert.ok((await textOf(page, '[data-testid="doc-search-not-searched"]')).includes(scanName));
	await page.click(resultButton(scanName));
	await page.waitForSelector('[data-testid="pdf-no-text"]');
	assert.ok((await textOf(page, '[data-testid="pdf-no-text"]')).includes("No text could be read"));
	await page.waitForSelector('[data-pdf-page="1"] canvas');
	await noOverflow(page, "scan");
	await shot(page, `documents-scan-${width}.png`);
	await closePane(page, mobile);

	// Reindex is offered, runs, and search still answers afterwards.
	await typeQuery(page, word);
	await page.waitForSelector(resultButton(`${p} note`));
	await page.click('[data-testid="doc-search-reindex"]');
	await indexSettled();

	// Jump: a page at the matching block, in view.
	await page.click(resultButton(`${p} note`));
	await page.waitForSelector('[data-page-jump]');
	const landed = await page.evaluate(() => {
		const el = document.querySelector("[data-page-jump]");
		const rect = el.getBoundingClientRect();
		return { text: el.textContent, inView: rect.top >= 0 && rect.bottom <= window.innerHeight };
	});
	assert.ok(landed.text.includes(word), JSON.stringify(landed));
	assert.ok(landed.inView, JSON.stringify(landed));
	await shot(page, `documents-jump-page-${width}.png`);
	await closePane(page, mobile);

	// Jump: a text file at its line.
	await page.click(`[aria-label^="Open ${p} data.txt"]`);
	await page.waitForSelector('[data-testid="library-read-only-line"]');
	assert.ok((await textOf(page, '[data-testid="library-read-only-line"]')).includes(`${word}file`));
	await closePane(page, mobile);

	// Jump: a PDF at the page, opening in the pane with the quote marked.
	await typeQuery(page, "force equals mass");
	await page.waitForSelector(resultButton(pdfName, "Page 2"));
	await page.click(resultButton(pdfName, "Page 2"));
	await page.waitForSelector('[data-testid="pdf-reader"]');
	await page.waitForSelector('[data-pdf-page="2"] [data-testid="pdf-cite-mark"]');
	assert.equal(new URL(page.url()).pathname, "/library", "no new tab, no navigation");
	assert.ok(await page.$('[data-testid="pdf-download"]'), "Download stays");
	assert.ok(await page.$('[data-testid="pdf-open-new-tab"]'), "a new tab stays an option");
	await noOverflow(page, "pdf");
	await noScrollbars(page, '[data-testid="pdf-scroll"]');
	await shot(page, `documents-pdf-jump-${width}.png`);

	// Select, highlight, annotate.
	await selectWord(page, 1, "integral");
	await shot(page, `documents-bubble-${width}.png`);
	if (mobile) {
		const size = await page.$eval('[data-testid="pdf-highlight"]', (el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
		assert.ok(size[0] >= 44 && size[1] >= 44, `coarse target: ${size}`);
	}
	await noOverflow(page, "bubble");
	await page.click('[data-testid="pdf-highlight"]');
	await page.waitForSelector('[data-pdf-page="1"] [data-testid="pdf-mark"]');
	await selectWord(page, 1, "squared");
	await page.click('[data-testid="pdf-note"]');
	await page.waitForSelector('[data-testid="pdf-note-text"]');
	await page.type('[data-testid="pdf-note-text"]', "My note on this");
	await page.click('[data-testid="pdf-note-save"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="pdf-note-text"]'));
	const bytes = Buffer.from(await (await fetch(`${base}/api/library/items/${pdf.id}/content`)).arrayBuffer());
	assert.ok(bytes.equals(SAMPLE), "the file is untouched");

	// Escape: the innermost first.
	await selectWord(page, 2, "force");
	await page.$eval('[data-testid="pdf-scroll"]', (el) => el.focus());
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="pdf-bubble"]'));
	assert.ok(await page.$('[data-testid="pdf-reader"]'), "Escape closed only the selection");

	// The keyboard's way in (feature 023): the same selection, bubble and actions.
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	await page.$eval('[data-testid="pdf-page-field"]', (el) => { el.value = ""; });
	const marksBefore = await page.$$eval('[data-pdf-page="1"] [data-testid="pdf-mark"]', (els) => els.length);
	await page.evaluate(() => document.querySelector('[data-testid="pdf-scroll"]').scrollTo(0, 0));
	await pause(300);
	await page.focus('[data-testid="pdf-keyboard-select"]');
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="pdf-keyboard-line"]');
	await page.waitForSelector('[data-testid="pdf-bubble"]');
	const focusAfterStart = await page.evaluate(() => document.activeElement?.dataset?.testid);
	assert.equal(focusAfterStart, "pdf-scroll", "the page's region has the keys");
	const selectedNow = () => page.evaluate(() => getSelection().toString());
	const firstWord = await selectedNow();
	assert.ok(firstWord.trim() && !firstWord.includes(" "), `one word: ${firstWord}`);
	await page.keyboard.press("ArrowRight");
	await page.waitForFunction((w) => getSelection().toString() !== w, {}, firstWord);
	const second = await selectedNow();
	await page.keyboard.down("Shift");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.up("Shift");
	await page.waitForFunction((w) => getSelection().toString().length > w.length, {}, second);
	const passage = (await selectedNow()).trim();
	assert.ok(passage.startsWith(second.trim()) && /\s/.test(passage), `extended: ${passage}`);
	await pause(100);
	const scrollBefore = await page.$eval('[data-testid="pdf-scroll"]', (el) => el.offsetWidth - el.clientWidth);
	assert.equal(scrollBefore, 0, "no visible scrollbar");
	await shot(page, `documents-keyboard-${width}.png`);
	await noOverflow(page, "keyboard selection");
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => document.querySelector('[data-testid="pdf-bubble"]')?.contains(document.activeElement));
	assert.equal(await page.evaluate(() => document.activeElement.dataset.testid), "pdf-highlight", "Enter reaches the actions");
	const focusRing = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0; });
	assert.ok(focusRing, "focus shows");
	await page.keyboard.press("Enter");
	await page.waitForFunction((n) => document.querySelectorAll('[data-pdf-page="1"] [data-testid="pdf-mark"]').length > n, {}, marksBefore);
	await page.waitForFunction(() => !document.querySelector('[data-testid="pdf-keyboard-line"]') && document.activeElement?.dataset?.testid === "pdf-scroll");
	const keyed = (await api(`/api/library/items/${pdf.id}/annotations`)).body.annotations.at(-1);
	assert.equal(keyed.anchor.quote.trim(), passage, "the keyboard's passage is what is kept");
	assert.equal(keyed.anchor.page, 1);
	await api(`/api/library/items/${pdf.id}/annotations/${keyed.id}`, "DELETE");
	// Escape: the selection first, then the mode with it, and the pane stays.
	await page.focus('[data-testid="pdf-keyboard-select"]');
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="pdf-bubble"]');
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-testid="pdf-bubble"]') && !document.querySelector('[data-testid="pdf-keyboard-line"]'));
	assert.ok(await page.$('[data-testid="pdf-reader"]'), "Escape ended only the selection");
	await page.$eval('[data-testid="pdf-page-field"]', (el) => { el.blur(); });

	// A highlight survives a reload, with its note.
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="pdf-reader"]');
	await page.waitForSelector('[data-pdf-page="1"][data-text-ready]');
	await page.waitForFunction(() => document.querySelectorAll('[data-pdf-page="1"] [data-testid="pdf-mark"]').length >= 2);
	const toggle = await textOf(page, '[data-testid="pdf-highlights-toggle"]');
	assert.ok(toggle.includes("(2)"), toggle);
	await page.click('[data-testid="pdf-highlights-toggle"]');
	await page.waitForSelector('[data-testid="pdf-highlight-row"]');
	assert.ok((await textOf(page, '[data-testid="pdf-highlights"]')).includes("My note on this"));
	await shot(page, `documents-highlights-${width}.png`);
	// Removing is undoable, not immediate and final.
	await page.click('[aria-label="Remove highlight on page 1"]');
	await page.waitForSelector('[data-testid="pdf-removed-undo"]');
	await page.click('[data-testid="pdf-removed-undo"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="pdf-highlights-toggle"]').innerText.includes("(2)"));
	await page.click('[data-testid="pdf-highlights-toggle"]');
	await page.waitForSelector('[data-pdf-page="1"]');
	await closePane(page, mobile);

	// A stored mark whose words have gone is listed as unanchored, never dropped.
	await api(`/api/library/items/${pdf.id}/annotations`, "POST", { anchor: { page: 1, quote: "words that are nowhere", prefix: "", suffix: "", start: 0, rects: [[0.1, 0.1, 0.2, 0.05]] } });
	await page.goto(`${base}/library?item=${pdf.id}&page=1&quote=`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-pdf-page="1"][data-text-ready]');
	await page.click('[data-testid="pdf-highlights-toggle"]');
	await page.waitForSelector('[data-testid="pdf-unanchored"]');
	await page.click('[data-testid="pdf-highlights-toggle"]');

	// A citation: the right page, the quote marked, and it says so.
	const href = `/library?item=${pdf.id}&page=3&quote=${encodeURIComponent("H2O is water")}`;
	await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-pdf-page="3"] [data-testid="pdf-cite-mark"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="pdf-jump-status"]')?.innerText.includes("Quote found on page 3"));
	await page.waitForFunction(() => {
		const rect = document.querySelector('[data-pdf-page="3"]').getBoundingClientRect();
		return rect.top < window.innerHeight && rect.bottom > 0;
	});
	assert.equal(new URL(page.url()).search, "", "the address steps out, so a reload doesn't jump again");
	await shot(page, `documents-citation-${width}.png`);

	// A quote not on that page says so, and still shows the page.
	await page.goto(`${base}/library?item=${pdf.id}&page=1&quote=${encodeURIComponent("H2O is water")}`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => document.querySelector('[data-testid="pdf-jump-status"]')?.innerText.includes("isn't on page 1"));
	assert.equal(await page.$('[data-testid="pdf-cite-mark"]'), null);

	// A page past the end says that, too.
	await page.goto(`${base}/library?item=${pdf.id}&page=9&quote=x`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => document.querySelector('[data-testid="pdf-jump-status"]')?.innerText.includes("has 3 pages"));

	// A missing document says so.
	await page.goto(`${base}/library?item=lib_gone&page=1&quote=x`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector('[data-testid="library-citation-missing"]');

	// A citation inside a note follows the same way.
	const cited = await createPage(`${p} cited`, `[PDF: sample, p. 2](/library?item=${pdf.id}&page=2&quote=${encodeURIComponent("force equals mass")})`);
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => document.querySelector('[data-testid="library-search-mode-text"]'));
	await page.waitForSelector('[data-testid="page-pane"]');
	await closePane(page, mobile);
	await page.click('[data-testid="library-search-mode-names"]');
	await page.waitForSelector(`[aria-label="Open ${p} cited"]`);
	await page.click(`[aria-label="Open ${p} cited"]`);
	await page.waitForSelector('[data-testid="page-citation-link"]');
	await page.click('[data-testid="page-citation-link"]');
	await page.waitForSelector('[data-pdf-page="2"] [data-testid="pdf-cite-mark"]');
	await closePane(page, mobile);
	assert.ok(cited.id);

	// A passage into a note, with its citation.
	await page.goto(`${base}/library?item=${pdf.id}&page=2&quote=${encodeURIComponent("force equals mass")}`, { waitUntil: "domcontentloaded" });
	await selectWord(page, 2, "acceleration");
	await page.click('[data-testid="pdf-save-passage"]');
	await page.waitForSelector('[data-testid="save-passage-query"]');
	await page.type('[data-testid="save-passage-query"]', `${p} extracted`);
	await page.waitForSelector('[data-testid="save-passage-new"]');
	await page.click('[data-testid="save-passage-new"]');
	await page.waitForSelector('[data-testid="save-passage-saved"]');
	assert.ok((await textOf(page, '[data-testid="save-passage-saved"]')).includes("citation to page 2"));
	await page.keyboard.press("Escape");
	const saved = (await api("/api/library")).body.items.find((item) => item.name === `${p} extracted`);
	const savedText = (await api(`/api/library/pages/${saved.id}`)).body.head.content;
	assert.ok(savedText.startsWith("> acceleration"), savedText);
	assert.ok(savedText.includes(`/library?item=${pdf.id}&page=2&quote=acceleration`), savedText);
	await closePane(page, mobile);
	assert.deepEqual(posts, [], "nothing was sent to a model so far");

	// In a session: a citation in the transcript opens the viewer beside it, and a
	// question goes only on the click, as marked material.
	const chatId = `chat_doc${width}`;
	await seedLesson(chatId, `See [${pdfName}, p. 2](${`/library?item=${pdf.id}&page=2&quote=${encodeURIComponent("force equals mass")}`}) for it.`);
	await page.goto(`${base}/chat/${chatId}`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(`[role="log"] a[href*="${pdf.id}"]`);
	await pause(1500);
	await page.click(`[role="log"] a[href*="${pdf.id}"]`);
	await page.waitForSelector('[data-pdf-page="2"] [data-testid="pdf-cite-mark"]');
	assert.ok(new URL(page.url()).pathname.startsWith("/chat/"), "the lesson stays underneath");
	assert.deepEqual(posts, [], "opening a citation sends nothing");
	await selectWord(page, 2, "force equals mass");
	assert.deepEqual(posts, [], "selecting sends nothing");
	assert.ok((await textOf(page, '[data-testid="pdf-bubble"]')).includes("Sends this passage, from page 2"));
	await page.click('[data-testid="pdf-tutor-explain"]');
	await page.waitForFunction(() => true);
	for (let i = 0; i < 40 && posts.length === 0; i++) await pause(250);
	assert.equal(posts.length, 1, "one click, one send");
	const sent = JSON.stringify(posts[0]);
	assert.ok(sent.includes("library_passage"), sent.slice(0, 400));
	assert.ok(sent.includes("force equals mass"), sent.slice(0, 400));
	if (!mobile) {
		await page.waitForSelector('[data-testid="pdf-sent"]');
		assert.ok((await textOf(page, '[data-testid="pdf-sent"]')).includes("Sent to the tutor"));
	}

	// The palette: a passage, by Cmd/Ctrl+K.
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => document.querySelector('[data-testid="library-search"]'));
	await pause(500);
	await page.keyboard.down("Control");
	await page.keyboard.press("k");
	await page.keyboard.up("Control");
	await page.waitForSelector('[data-testid="command-palette-input"]');
	await page.type('[data-testid="command-palette-input"]', "force equals mass");
	await page.waitForFunction((name) => [...document.querySelectorAll('[data-testid="command-palette-option"]')].some((el) => el.dataset.entryId.startsWith("passage:") && el.innerText.includes(name)), {}, pdfName);
	assert.ok((await page.$eval('[data-testid="command-palette-list"]', (el) => el.innerHTML)).includes("<mark"), "the palette marks the match");
	await shot(page, `documents-palette-${width}.png`);
	await page.keyboard.press("Escape");

	// Trash takes it out of search at once, and restore brings it back.
	await api("/api/library/trash", "POST", { itemId: note.id });
	assert.equal((await api(`/api/library/search?q=${word}%20particle`)).body.total, 0, "trashed content doesn't leak");
	assert.ok(scan.id);

	assert.deepEqual(errors, [], "no page errors");
	await close();
	console.log(`ok ${width}`);
}

try {
	await mkdir(data, { recursive: true });
	if (shots) await mkdir(shots, { recursive: true });
	// LH_UI_STANDALONE=1 runs the production server the Docker image and desktop app
	// ship, after `next build` and scripts/build-server.mjs.
	const command = process.env.LH_UI_STANDALONE ? [".next/standalone/server.js"] : ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)];
	server = spawn(process.execPath, command, {
		env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: process.env.LH_UI_STANDALONE ? "production" : process.env.NODE_ENV, OPENROUTER_API_KEY: "test-key-never-used", LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
		stdio: ["ignore", "ignore", process.env.LH_UI_SERVER_LOG ? "inherit" : "ignore"],
	});
	let ready = false;
	for (let i = 0; i < 240 && !ready; i++) {
		ready = await fetch(`${base}/api/library`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
		if (!ready) await pause(250);
	}
	assert.ok(ready, "isolated server starts");
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
	for (const width of (process.env.LH_UI_WIDTHS ?? "1440,390,320").split(",").map(Number)) await checkWidth(width);
	console.log("Documents browser checks passed.");
} catch (error) {
	if (failing) console.error(await failing.page.evaluate(() => [...document.querySelectorAll("[data-pdf-page]")].slice(0, 2).map((el) => `${el.dataset.pdfPage} ready=${el.dataset.textReady !== undefined} marks=${el.querySelectorAll('[data-testid="pdf-mark"]').length} text=${JSON.stringify(el.querySelector('[data-testid="pdf-text-layer"]')?.textContent.slice(0, 80))}`).join("\n")).catch(() => ""));
	if (failing && shots) await failing.page.screenshot({ path: path.join(shots, `documents-failed-${failing.width}.png`) }).catch(() => {});
	throw error;
} finally {
	await browser?.close();
	server?.kill();
	await rm(root, { recursive: true, force: true });
}
