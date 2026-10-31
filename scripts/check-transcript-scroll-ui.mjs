/** Long-session scrolling (bug transcript-scroll-jank), on isolated data. Needs a
 * production build: npm run build && node scripts/check-transcript-scroll-ui.mjs
 * CHROME picks the browser; snap Chromium needs TMPDIR under $HOME. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const port = Number(process.env.LH_UI_PORT ?? 3106);
const base = `http://127.0.0.1:${port}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = await mkdtemp(path.join(process.env.TMPDIR ?? os.tmpdir(), "learning-scroll-ui-"));
const data = path.join(root, "data");
await mkdir(path.join(data, "chats"), { recursive: true });

const golden = JSON.parse(await readFile("tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", "utf8"));
const template = golden.messages.findLast((message) => message.role === "assistant");
const prose = "A correct answer provides evidence that a learner understands a skill, and it does not establish that understanding with certainty. ";
const messages = [];
for (let i = 0; i < 150; i++) {
	messages.push({ id: `msg_u${i}`, role: "user", content: `Please continue with step ${i}.`, timestamp: 1791625848004 + i * 2000 });
	const marker = i === 3 ? " needlemarker" : "";
	messages.push({ ...template, id: `msg_a${i}`, content: [{ type: "text", text: `## Step ${i}${marker}\n\n${prose.repeat(8 + (i % 5) * 6)}\n\n- One\n- Two\n\n$$x^2$$\n\n\`\`\`ts\nconst step = ${i};\n\`\`\`\n` }], timestamp: 1791625849004 + i * 2000 });
}
await writeFile(path.join(data, "chats", "long.json"), JSON.stringify({ ...golden, id: "long", title: "Long session", messages, turns: messages.filter((message) => message.role === "assistant").map((message) => ({ ...golden.turns[0], id: `turn_${message.id}`, messageId: message.id })) }));

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, OPENROUTER_API_KEY: "test-key-never-used", LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore" });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/snap/bin/chromium", headless: true, userDataDir: path.join(root, "profile"), args: ["--no-sandbox"] });

async function open(page) {
	await page.goto(`${base}/chat/long`, { waitUntil: "load", timeout: 120000 });
	await page.waitForSelector('[data-testid="lesson-content"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="transcript-backfill"]'), { timeout: 120000, polling: 100 });
	await page.waitForFunction(() => !document.querySelector('[data-testid="lesson-content"] > :not([data-question-target], [data-transcript-measured])'));
	await pause(800);
	await page.evaluate(() => { let main = document.querySelector('[data-testid="lesson-content"]'); while (main && !/auto|scroll/.test(getComputedStyle(main).overflowY)) main = main.parentElement; window.scroller = main; });
}
const gap = (page) => page.evaluate(() => Math.round(window.scroller.scrollHeight - window.scroller.clientHeight - window.scroller.scrollTop));

try {
	for (let n = 0; ; n++) { try { if ((await fetch(`${base}/api/chats`)).ok) break; } catch { /* not up yet */ } assert.ok(n < 120, "server start"); await pause(250); }
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900 });
	const cdp = await page.createCDPSession();
	await open(page);
	await page.mouse.move(720, 400);
	const wheel = (deltaY) => cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 720, y: 400, deltaX: 0, deltaY });

	// The dock folds on the first reading scroll without restyling the session.
	const trace = path.join(root, "trace.json");
	await page.tracing.start({ path: trace, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] });
	await wheel(-300);
	await pause(800);
	await page.tracing.stop();
	const { traceEvents } = JSON.parse(await readFile(trace, "utf8"));
	const restyled = Math.max(0, ...traceEvents.filter((event) => event.name === "UpdateLayoutTree").map((event) => event.args?.elementCount ?? 0));
	assert.ok(restyled < 5000, `first wheel restyled ${restyled} elements`);
	console.log(`ok first wheel restyles ${restyled} elements`);

	// Unvisited rows resolve to their real height: each wheel moves what it asked.
	let previous = await gap(page);
	const moved = [];
	for (let i = 0; i < 40; i++) { await wheel(-300); await pause(40); const next = await gap(page); moved.push(next - previous); previous = next; }
	assert.ok(moved.every((delta) => delta <= 330), `a wheel jumped: ${Math.max(...moved)}px`);
	console.log("ok no wheel of 300px moved more than 330px");

	// Full scrolling: the first message is reachable with the wheel, and the last again.
	for (let i = 0; i < 400 && await page.evaluate(() => window.scroller.scrollTop > 0); i++) { await wheel(-3000); await pause(16); }
	assert.equal(await page.evaluate(() => window.scroller.scrollTop), 0);
	assert.ok(await page.evaluate(() => { const first = document.querySelector('[data-testid="user-message"]'); const box = first.getBoundingClientRect(); return first.textContent.includes("step 0") && box.top >= 0 && box.top < innerHeight; }), "first message on screen");
	for (let i = 0; i < 400 && await gap(page) > 2; i++) { await wheel(3000); await pause(16); }
	assert.ok(await gap(page) <= 2, "bottom reachable");
	console.log("ok top and bottom reachable by wheel");

	// Text in a skipped row is found by the session's find text walk and by the browser.
	await page.evaluate(() => { window.scroller.scrollTop = window.scroller.scrollHeight; });
	await pause(300);
	assert.ok(await page.evaluate(() => window.find("needlemarker")), "browser find reaches a skipped row");
	console.log("ok browser find reaches a skipped row");
	await page.evaluate(() => { window.getSelection()?.removeAllRanges(); window.scroller.scrollTop = window.scroller.scrollHeight; });
	await pause(300);
	await page.keyboard.down("Control");
	await page.keyboard.press("KeyF");
	await page.keyboard.up("Control");
	await page.waitForSelector('[aria-label="Find in session"]', { visible: true });
	await page.type('[aria-label="Find in session"]', "needlemarker");
	await page.waitForFunction(() => /1/.test(document.querySelector('[data-testid="session-find-count"]').textContent));
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => { const heading = [...document.querySelectorAll("[data-answer-part-id]")].find((element) => element.textContent.includes("needlemarker")); const box = heading.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0; }, { timeout: 5000 });
	await page.keyboard.press("Escape");
	console.log("ok session find counts and scrolls to a skipped row");

	// A rail jump lands on an answer in a skipped row and highlights its marker.
	await page.evaluate(() => { window.scroller.scrollTop = window.scroller.scrollHeight; });
	await pause(500);
	const markers = await page.$$('[data-testid="session-turn-rail"] [data-turn-part-id]');
	assert.ok(markers.length > 100, `rail markers: ${markers.length}`);
	const jumpTo = await markers[20].evaluate((button) => { button.click(); return button.dataset.turnPartId; });
	await pause(1800);
	const landed = await page.evaluate((id) => {
		const answer = [...document.querySelectorAll("[data-answer-part-id]")].find((element) => element.dataset.answerPartId === id);
		return { offset: answer.getBoundingClientRect().top - window.scroller.getBoundingClientRect().top, active: document.querySelector('[data-turn-part-id][aria-current="step"]')?.dataset.turnPartId };
	}, jumpTo);
	assert.ok(Math.abs(landed.offset - 16) < 2, `rail jump offset ${landed.offset}`);
	assert.equal(landed.active, jumpTo, "marker follows the visible answer");
	console.log("ok rail jump aligns on a skipped row and highlights its marker");

	// A mid-session reading position survives a reload.
	await page.evaluate(() => { window.scroller.scrollTop = window.scroller.scrollHeight * 0.4; });
	await wheel(-300);
	await pause(600);
	const row = () => page.evaluate(() => { const edge = window.scroller.getBoundingClientRect().top + 16; const parts = [...document.querySelectorAll("[data-answer-part-id]")]; const part = parts.filter((element) => element.getBoundingClientRect().top <= edge).at(-1); return { id: part.dataset.answerPartId, top: Math.round(part.getBoundingClientRect().top) }; });
	const before = await row();
	await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
	await pause(200);
	await open(page);
	await pause(2300);
	const after = await row();
	assert.equal(after.id, before.id, "reading anchor");
	assert.ok(Math.abs(after.top - before.top) <= 4, `reading offset moved ${after.top - before.top}px`);
	console.log("ok reading position restored");

	// No page overflow at the required widths.
	for (const width of [320, 390, 1440]) {
		await page.setViewport({ width, height: 800 });
		await pause(500);
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		assert.ok(overflow <= 0, `${width}px overflows by ${overflow}`);
	}
	console.log("ok no overflow at 320, 390 and 1440");
} finally {
	await browser.close();
	server.kill("SIGTERM");
	await rm(root, { recursive: true, force: true });
}
