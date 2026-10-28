/** Real Markdown tables in a practice prompt, using isolated data and no providers.
 * LH_BROWSER_URL=http://127.0.0.1:9223 node scripts/smoke-md-tables-ui.mjs
 * Or set CHROME_PATH. LH_UI_PRODUCTION=1 tests an existing production build.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const data = await mkdtemp(path.join(os.tmpdir(), "lh-md-tables-"));
const port = Number(process.env.LH_UI_PORT ?? 3113);
const base = `http://127.0.0.1:${port}`;
const body = '[data-testid="practice-problem-content"]:not([hidden])';
const table = `${body} [data-streamdown="table"]`;
const scroll = `${body} .lh-table-scroll`;
const screenshots = process.env.LH_UI_SCREENSHOT_DIR;
let server, browser, context;
let output = "";
const errors = [];
try {
	const chat = JSON.parse(await readFile(new URL("../tests/fixtures/golden-data/chats/chat_mv293wv5_10656952.json", import.meta.url), "utf8"));
	const index = chat.messages.findIndex((m) => m.role === "assistant" && m.content?.some((p) => p.type === "toolCall" && p.name === "problem"));
	assert.ok(index >= 0);
	chat.id = "mobile-markdown-tables";
	chat.title = "Mobile Markdown tables";
	chat.messages = chat.messages.slice(0, index + 2);
	chat.messages[index].content.find((p) => p.type === "toolCall" && p.name === "problem").arguments.statement = [
		"Your predictions and the targets are:",
		"| Example | Prediction $\\hat{y}_i$ | Target $y_i$ |\n| --- | ---: | ---: |\n| 1 | $-1$ | $2$ |\n| 2 | $3$ | $4$ |\n| 3 | $-2$ | $1$ |",
		"A wider table:",
		"| Example | A deliberately long prediction heading | Target | Residual | Squared residual | Weighted residual |\n| --- | --- | --- | --- | --- | --- |\n| 1 | $\\hat{y}_i=-1$ | 2 | -3 | 9 | 0.9 |",
		"A table that already fits:",
		"| A | B |\n| --- | --- |\n| 1 | 2 |",
	].join("\n\n");
	await mkdir(path.join(data, "chats"));
	await writeFile(path.join(data, "chats", `${chat.id}.json`), JSON.stringify(chat));
	const lesson = JSON.parse(await readFile(new URL("../tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", import.meta.url), "utf8"));
	const planIndex = lesson.messages.findIndex((m) => m.role === "toolResult" && m.toolName === "plan_init" && m.details?.tree);
	const quizIndex = lesson.messages.findIndex((m, i) => i > planIndex && m.role === "assistant" && m.content?.some((p) => p.type === "toolCall" && p.name === "quiz" && p.arguments.type === "check"));
	assert.ok(quizIndex > planIndex);
	lesson.id = "mobile-table-question";
	lesson.messages = lesson.messages.slice(0, quizIndex + 1);
	lesson.messages.at(-1).content.find((p) => p.type === "toolCall" && p.name === "quiz").arguments.question = chat.messages[index].content.find((p) => p.type === "toolCall" && p.name === "problem").arguments.statement;
	await writeFile(path.join(data, "chats", `${lesson.id}.json`), JSON.stringify(lesson));
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", process.env.LH_UI_PRODUCTION === "1" ? "start" : "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		env: { ...process.env, LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-5000); });
	let ready = false;
	for (let i = 0; i < 120; i++) {
		if (server.exitCode !== null) throw new Error(output);
		try { const r = await fetch(`${base}/api/chats`, { signal: AbortSignal.timeout(1000) }); if (r.ok) { ready = true; break; } } catch { /* starting */ }
		await new Promise((r) => setTimeout(r, 250));
	}
	assert.ok(ready, `server starts: ${output}`);
	browser = process.env.LH_BROWSER_URL
		? await puppeteer.connect({ browserURL: process.env.LH_BROWSER_URL })
		: await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
	context = await browser.createBrowserContext();
	await context.overridePermissions(base, ["clipboard-read", "clipboard-write"]);
	const page = await context.newPage();
	page.setDefaultTimeout(5000);
	page.on("pageerror", (e) => errors.push(e.message));
	await page.setRequestInterception(true);
	page.on("request", (r) => {
		if (r.method() !== "GET" && r.url().startsWith(base)) void r.respond({ status: 503, body: "Writes blocked in table regression" });
		else if (!r.url().startsWith(base) && !r.url().startsWith("data:")) void r.abort();
		else void r.continue();
	});
	await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true });
	await page.goto(`${base}/chat/${chat.id}`, { waitUntil: "domcontentloaded" });
	await page.locator('[data-testid="practice-dock-bar"]').click();
	await page.waitForSelector(table, { visible: true });
	await page.evaluate(() => document.fonts.ready);
	const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
	const metrics = () => page.$$eval(scroll, (nodes) => nodes.map((el) => {
		const t = el.querySelector("table");
		const style = getComputedStyle(t);
		const zoom = Number.parseFloat(style.zoom) || 1;
		return { available: el.clientWidth, content: el.scrollWidth, width: t.getBoundingClientRect().width, height: t.getBoundingClientRect().height,
			scrollHeight: el.clientHeight, natural: t.offsetWidth, font: Number.parseFloat(style.fontSize), zoom,
			effectiveFont: Number.parseFloat(style.fontSize) * zoom, clip: el.dataset.clip || "", tabIndex: el.tabIndex };
	}));
	const capture = async (name) => {
		if (!screenshots) return;
		await mkdir(screenshots, { recursive: true });
		await page.screenshot({ path: path.join(screenshots, `${name}.png`) });
	};
	for (const width of [320, 390, 639, 640, 1440]) {
		await page.setViewport({ width, height: 844, isMobile: width < 640, hasTouch: width < 640 });
		await frames();
		const rows = await metrics();
		console.log(JSON.stringify({ viewport: width, tables: rows }));
		await capture(`table-${width}`);
		if (width < 640) {
			assert.ok(rows[0].content <= rows[0].available + 1, `three-column table fits at ${width}px`);
			assert.ok(rows.every((r) => r.effectiveFont >= 13 - 0.01), "13px floor is preserved");
			assert.equal(rows[2].zoom, 1, "small table is not shrunk");
			assert.ok(Math.abs(rows[0].height - rows[0].scrollHeight) < 2, "scaled height takes no unscaled blank space");
		} else assert.ok(rows.every((r) => r.zoom === 1), "desktop restores natural size");
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no page overflow");
	}
	await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true });
	await frames();
	let rows = await metrics();
	assert.ok(rows[1].content > rows[1].available, "wide table needs swipe fallback");
	assert.ok(Math.abs(rows[1].effectiveFont - 13) < 0.01, "wide table stops at 13px");
	assert.equal(rows[1].clip, "end");
	assert.equal(rows[1].tabIndex, 0, "overflow is keyboard focusable");
	await page.$$eval(scroll, (nodes) => nodes[1].scrollLeft = nodes[1].scrollWidth);
	await frames();
	assert.equal((await metrics())[1].clip, "start", "far edge remains reachable and fade updates");
	await page.$$eval(scroll, (nodes) => { nodes[1].scrollLeft = 0; nodes[1].focus(); });
	await page.keyboard.press("ArrowRight");
	await page.waitForFunction((selector) => document.querySelectorAll(selector)[1].scrollLeft > 0, {}, scroll);
	assert.equal(await page.$$eval(scroll, (nodes) => getComputedStyle(nodes[1]).scrollbarWidth), "none");
	assert.equal(await page.$$eval(scroll, (nodes) => getComputedStyle(nodes[1]).outlineStyle !== "none"), true, "keyboard focus is visible");
	await page.$$eval(scroll, (nodes) => { nodes[1].scrollLeft = 0; nodes[1].scrollIntoView({ block: "center" }); });
	await frames();
	const swipe = await page.$$eval(scroll, (nodes) => {
		const box = nodes[1].getBoundingClientRect();
		return { x: box.right - 20, y: box.top + box.height / 2 };
	});
	await page.touchscreen.touchStart(swipe.x, swipe.y);
	for (let i = 1; i <= 5; i++) { await page.touchscreen.touchMove(swipe.x - i * 25, swipe.y); await frames(); }
	await page.touchscreen.touchEnd();
	await page.waitForFunction((selector) => document.querySelectorAll(selector)[1].scrollLeft > 30, {}, scroll);
	console.log("PASS wide-table floor, scrolling, keyboard focus, and hidden scrollbars");

	// Change a reading preference without remounting the table or composer.
	await page.$eval(body, (el) => el.style.setProperty("--lh-prose-size", "24px"));
	await frames();
	rows = await metrics();
	assert.equal(rows[0].font, 24);
	assert.ok(rows.every((r) => r.effectiveFont >= 12.99));
	await capture("table-large-reading");
	await page.$eval(body, (el) => el.style.removeProperty("--lh-prose-size"));
	await frames();
	// A streamed cell can grow without changing the available width.
	const original = await page.$eval(`${table} th`, (el) => el.textContent);
	await page.$eval(`${table} th`, (el) => { el.textContent = "An exceptionally long example heading newly streamed into this table"; });
	await frames();
	assert.ok(Math.abs((await metrics())[0].effectiveFont - 13) < 0.01, "content growth recalculates scale");
	await page.$eval(`${table} th`, (el, text) => { el.textContent = text; }, original);
	await frames();
	assert.ok((await metrics())[0].effectiveFont > 13.1, "content shrink restores the fitting size");
	// Resize the actual available container independently of the viewport.
	await page.$eval(body, (el) => el.style.width = "220px");
	await frames();
	assert.ok(Math.abs((await metrics())[0].effectiveFont - 13) < 0.01);
	await page.$eval(body, (el) => el.style.removeProperty("width"));
	await frames();
	assert.ok((await metrics())[0].effectiveFont > 13.1);
	await page.$eval(body, (el) => el.style.setProperty("--lh-prose-size", "12px"));
	await frames();
	assert.ok((await metrics()).every((r) => r.zoom === 1), "existing small reading preferences are never enlarged or shrunk");
	await page.$eval(body, (el) => el.style.removeProperty("--lh-prose-size"));
	await frames();
	const mutations = await page.$eval(body, (el) => new Promise((resolve) => {
		let count = 0;
		const observer = new MutationObserver((records) => { count += records.length; });
		el.querySelectorAll("table").forEach((t) => observer.observe(t, { attributes: true, attributeFilter: ["style"] }));
		let framesLeft = 30;
		const tick = () => { if (--framesLeft) requestAnimationFrame(tick); else { observer.disconnect(); resolve(count); } };
		requestAnimationFrame(tick);
	}));
	assert.ok(mutations <= 1, "sizing settles without a frame-by-frame feedback loop");
	console.log("PASS reading preference, content growth/shrink, and container resize");

	const copy = `${body} [aria-label="Copy table"]`;
	await page.locator(copy).click();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	assert.match(copied, /Example/);
	assert.match(copied, /Prediction/);
	assert.match(copied, /Target/);
	assert.match(copied, /\| 3 /);
	const copySize = await page.$eval(copy, (el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
	assert.ok(copySize.w >= 44 && copySize.h >= 44, "Copy keeps its unscaled touch target");
	await page.goto(`${base}/chat/${lesson.id}`, { waitUntil: "domcontentloaded" });
	await page.locator('[data-testid="teach-check-reveal"]').click();
	await page.waitForSelector('[data-testid="question-dock"] .lh-table-scroll', { visible: true });
	await frames();
	const confidence = () => page.$eval('[data-testid="confidence-segments"] [aria-checked="true"]', (el) => el.textContent);
	const initialConfidence = await confidence();
	await page.$$eval('[data-testid="question-dock"] .lh-table-scroll', (nodes) => nodes[1].focus());
	await page.keyboard.press("ArrowRight");
	await page.waitForFunction(() => document.querySelectorAll('[data-testid="question-dock"] .lh-table-scroll')[1].scrollLeft > 0);
	assert.equal(await confidence(), initialConfidence, "table scroll keys do not change lesson confidence");
	await frames();
	assert.deepEqual(errors, [], "no browser errors or ResizeObserver loops");
	console.log("PASS complete Copy source, touch target, lesson keyboard isolation, and no browser errors");
} finally {
	if (context) await context.close();
	if (browser) { if (process.env.LH_BROWSER_URL) browser.disconnect(); else await browser.close(); }
	if (server) { const exited = new Promise((r) => server.once("exit", r)); if (server.exitCode === null) { server.kill("SIGTERM"); await exited; } }
	await rm(data, { recursive: true, force: true });
}
