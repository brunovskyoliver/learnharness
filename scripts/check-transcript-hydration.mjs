/** Isolated browser regression for the cold-load transcript (feature 024, T033).
 * On a cold load of /chat/<id> the transcript arrives as a streamed segment. A context
 * value above the page's Suspense boundary that changes before the page hydrates makes
 * React throw that segment away and render it again, which left main empty for up to
 * ~300 ms. This check fails when the transcript on screen at the end is not the node the
 * server streamed, when main goes empty after showing content, or on a page error.
 * Cold caches, 60 ms / 20 Mbps. Needs a production build (`npm run build`); model
 * submissions are intercepted, so it makes no model requests.
 * TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium node scripts/check-transcript-hydration.mjs
 * LH_UI_RUNS (default 6), LH_UI_PORT (default 3123), LH_UI_STANDALONE=1 for .next/standalone
 * (or the path of another build's standalone server.js).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const port = Number(process.env.LH_UI_PORT ?? 3123);
const base = `http://127.0.0.1:${port}`;
const runs = Number(process.env.LH_UI_RUNS ?? 6);
const root = await mkdtemp(path.join(os.tmpdir(), "learning-transcript-hydration-"));
const data = path.join(root, "data");
const chatId = "chat_mvhydr01_0000abcd";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let browser;

/** A lesson on disk with enough text to stream as its own segment. */
async function seedLesson() {
	const golden = JSON.parse(await readFile("tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", "utf8"));
	const reply = golden.messages.find((m) => m.role === "assistant" && m.stopReason === "stop");
	const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}: a wave carries energy from place to place without carrying the medium along with it.`).join("\n\n");
	await mkdir(path.join(data, "chats"), { recursive: true });
	await writeFile(path.join(data, "chats", `${chatId}.json`), JSON.stringify({
		...structuredClone(golden), id: chatId, title: "Waves", settings: { model: { provider: "openrouter", id: "openai/gpt-4o" } },
		messages: [{ id: "m_user", role: "user", content: "Teach me about waves.", timestamp: 1 }, { ...reply, id: "m_reply", stopReason: "stop", content: [{ type: "text", text }] }],
	}));
}

/** Runs before any page script: keeps the streamed transcript node and samples main every frame. */
const PROBE = `(() => {
  const T = window.__transcript = { segment: false, empties: [], firstContent: null };
  const now = () => Math.round(performance.now());
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) {
    if (n.nodeType !== 1 || window.__streamed || !n.closest || !n.closest('div[hidden][id^="S:"]')) continue;
    T.segment = true;
    const lesson = n.matches('[data-testid="lesson-content"]') ? n : n.querySelector('[data-testid="lesson-content"]');
    if (lesson) window.__streamed = lesson;
  } }).observe(document, { childList: true, subtree: true });
  let shown = false, emptyAt = null;
  const frame = () => {
    const main = document.querySelector('main');
    const filled = !!main && (main.textContent || '').trim().length > 0;
    const t = now();
    if (filled) { if (T.firstContent === null) T.firstContent = t; shown = true; if (emptyAt !== null) { T.empties.push([emptyAt, t]); emptyAt = null; } }
    else if (shown && emptyAt === null) emptyAt = t;
    if (t < 8000) requestAnimationFrame(frame); else if (emptyAt !== null) T.empties.push([emptyAt, null]);
  };
  requestAnimationFrame(frame);
})();`;

async function coldLoad(i) {
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	await page.setViewport({ width: 1440, height: 900 });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (request.method() === "POST" && url.pathname === "/api/chat") return void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
		if (url.origin !== base && url.protocol !== "data:" && url.protocol !== "blob:") return void request.abort();
		void request.continue();
	});
	const cdp = await page.createCDPSession();
	await cdp.send("Network.enable");
	await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: 20e6 / 8, uploadThroughput: 5e6 / 8 });
	await page.evaluateOnNewDocument(PROBE);
	await page.goto(`${base}/chat/${chatId}`, { waitUntil: "load", timeout: 60000 });
	await page.waitForFunction(() => performance.now() > 6000 && !!document.querySelector('main [data-testid="lesson-content"]'), { polling: 200, timeout: 60000 });
	const result = await page.evaluate(() => {
		const live = document.querySelector('main [data-testid="lesson-content"]');
		const T = window.__transcript;
		return { segment: T.segment, streamed: !!window.__streamed, kept: !!live && live === window.__streamed, empties: T.empties, firstContent: T.firstContent };
	});
	await context.close();
	console.log(`run ${i + 1}: kept=${result.kept} visible=${result.firstContent} ms empties=${JSON.stringify(result.empties)}`);
	assert.ok(result.segment && result.streamed, `run ${i + 1}: the transcript was not streamed as a segment, so this check proves nothing`);
	assert.deepEqual(errors, [], `run ${i + 1}: no page errors (hydration included)`);
	assert.ok(result.kept, `run ${i + 1}: the streamed transcript was discarded and rendered again on the client`);
	assert.deepEqual(result.empties, [], `run ${i + 1}: main never goes empty after showing content`);
}

try {
	await seedLesson();
	const standalone = process.env.LH_UI_STANDALONE;
	const command = standalone ? [standalone === "1" ? ".next/standalone/server.js" : standalone] : ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)];
	server = spawn(process.execPath, command, {
		env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production", OPENROUTER_API_KEY: "test-key-never-used", LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
		stdio: ["ignore", "ignore", process.env.LH_UI_SERVER_LOG ? "inherit" : "ignore"],
	});
	let ready = false;
	for (let i = 0; i < 240 && !ready; i++) {
		ready = await fetch(`${base}/chat/${chatId}`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok, () => false);
		if (!ready) await pause(250);
	}
	assert.ok(ready, "isolated production server starts (run `npm run build` first)");
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-first-run"] });
	for (let i = 0; i < runs; i++) await coldLoad(i);
	console.log(`Transcript hydration checks passed (${runs} cold loads).`);
} finally {
	await browser?.close();
	server?.kill();
	await rm(root, { recursive: true, force: true });
}
