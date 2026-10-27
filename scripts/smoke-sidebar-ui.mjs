/** Isolated browser regression for resizing and transcript typography.
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
const rail = '[aria-label="Resize sidebar"]';
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
		const chat = { ...sample, id: `sidebar-stress-${i}`, title: `Study session ${i}`, messages: [] };
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
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
	const page = await browser.newPage();
	page.setDefaultTimeout(5000);
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewport({ width: 1280, height: 800 });
	await page.goto(`${base}/chat/${sample.id}`, { waitUntil: "networkidle2" });
	await page.waitForSelector(rail, { visible: true });
	await page.evaluate(() => document.fonts.ready);
	const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const width = () => page.$eval("aside", (element) => element.getBoundingClientRect().width);
	const settled = async (expected) => page.waitForFunction((value) => Math.abs((document.querySelector("aside")?.getBoundingClientRect().width ?? 0) - value) < 1, {}, expected);
	const startDrag = async () => {
		const box = await page.$eval('[aria-label="Resize sidebar"]', (element) => element.getBoundingClientRect().toJSON());
		const x = box.x + box.width / 2;
		await page.mouse.move(x, 300);
		await page.mouse.down();
		await frames();
		return x;
	};
	const focusRail = async () => {
		await page.keyboard.down("Control");
		await page.keyboard.down("Shift");
		await page.keyboard.press("KeyF");
		await page.keyboard.up("Shift");
		await page.keyboard.up("Control");
		await page.waitForFunction(() => document.activeElement?.matches('[data-testid="session-search"]'));
		await page.keyboard.press("Tab");
		assert.equal(await page.$eval(rail, (element) => element === document.activeElement), true, "search then Tab reaches the resize rail");
	};
	const start = await width();
	const x = await startDrag();
	const lag = [];
	for (let i = 1; i <= 8; i++) {
		await page.mouse.move(x + i * 10, 300);
		await frames();
		lag.push(Math.abs(await width() - (start + i * 10)));
	}
	await page.mouse.up();
	assert.ok(Math.max(...lag) <= 2, `drag follows the pointer within 2px: ${JSON.stringify(lag)}`);
	console.log(`PASS drag lag, maximum ${Math.max(...lag).toFixed(2)}px with 82 sessions`);
	await page.reload({ waitUntil: "networkidle2" });
	await settled(start + 80);
	console.log("PASS drag width survives reload");
	await focusRail();
	await page.keyboard.press("End");
	await settled(640);
	await page.setViewport({ width: 1024, height: 768 });
	await settled(384);
	assert.equal(await page.$eval('[role="log"]', (element) => element.getBoundingClientRect().width), 640);
	await page.click(rail);
	assert.equal(await page.evaluate(() => localStorage.getItem("lh:sidebar-width")), "640", "clicking the clamped rail preserves the preferred width");
	await page.reload({ waitUntil: "networkidle2" });
	await settled(384);
	await page.setViewport({ width: 1280, height: 800 });
	await settled(640);
	await focusRail();
	await page.keyboard.press("Home");
	await settled(208);
	await page.keyboard.press("ArrowRight");
	await settled(224);
	await page.keyboard.press("ArrowLeft");
	await settled(208);
	await page.keyboard.press("Enter");
	await settled(256);
	console.log("PASS viewport clamp, restored preference, keyboard bounds and reset");
	for (const kind of ["pointercancel", "blur", "lostpointercapture"]) {
		const dragX = await startDrag();
		await page.mouse.move(dragX + 40, 300);
		await frames();
		await page.evaluate((type) => {
			if (type === "blur") window.dispatchEvent(new Event("blur"));
			else if (type === "lostpointercapture") document.querySelector('[aria-label="Resize sidebar"]').releasePointerCapture(1);
			else window.dispatchEvent(new PointerEvent(type, { pointerId: 1 }));
		}, kind);
		await frames();
		const stopped = await width();
		await page.mouse.move(dragX + 100, 300);
		await frames();
		assert.equal(await width(), stopped, `${kind} ends the drag`);
		await page.mouse.up();
		await page.click(rail, { count: 2 });
		await settled(256);
	}
	console.log("PASS pointer cancellation, blur, lost capture and double-click reset");
	const rowHeights = await page.$$eval('[data-testid="session-row"]', (rows) => rows.map((element) => element.getBoundingClientRect().height));
	assert.equal(rowHeights.length, 82);
	assert.ok(rowHeights.every((height) => height === 36), "crowded rows remain 36px");
	const typography = await page.$eval(".lh-reading", (element) => {
		const prose = element.querySelector(".lh-prose");
		const heading = prose.querySelector("h2");
		return { size: getComputedStyle(prose).fontSize, leading: getComputedStyle(prose).lineHeight,
			weight: getComputedStyle(heading).fontWeight, measure: element.getBoundingClientRect().width,
			limit: getComputedStyle(element).maxWidth, paragraphGap: getComputedStyle(prose.querySelector("p")).marginBottom,
			sectionGap: getComputedStyle(prose.querySelectorAll("h2")[1]).marginTop,
			headingGap: getComputedStyle(heading).marginBottom };
	});
	assert.equal(typography.size, "17px");
	assert.equal(typography.leading, "27px");
	assert.equal(typography.weight, "700");
	assert.ok(Math.abs(typography.measure - parseFloat(typography.limit)) < 1, "reading column reaches its 76ch cap");
	assert.equal(typography.paragraphGap, "16px");
	assert.equal(typography.sectionGap, "32px");
	assert.equal(typography.headingGap, "12px");
	console.log(`PASS crowded rows and typography: ${JSON.stringify(typography)}`);
	if (process.env.LH_UI_SCREENSHOT_DIR) {
		await mkdir(process.env.LH_UI_SCREENSHOT_DIR, { recursive: true });
		await page.screenshot({ path: path.join(process.env.LH_UI_SCREENSHOT_DIR, "after-desktop.png") });
	}
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
	await page.click('[data-testid="teach-check-reveal"]');
	await page.click('[data-kbdrow="0"]');
	await focusRail();
	const confidence = () => page.$eval('[data-testid="confidence-segments"] [aria-checked="true"]', (element) => element.textContent);
	const initialConfidence = await confidence();
	for (const key of ["ArrowRight", "ArrowLeft", "Home", "End", "Enter"]) {
		await page.keyboard.press(key);
		await frames();
		assert.equal(await confidence(), initialConfidence, `${key} does not change question confidence`);
		assert.equal(submissions, 0, `${key} does not submit an answer`);
	}
	assert.ok(await page.$('[data-testid="question-dock"]'), "question remains active after reset");
	console.log("PASS shortcut and Tab reach the rail with an active dock; resize keys do not change confidence or submit");
	await page.goto(`${base}/chat/${sample.id}`, { waitUntil: "networkidle2" });
	await page.setViewport({ width: 390, height: 844 });
	await settled(0);
	await frames();
	assert.equal(await page.$(rail), null, "mobile has no desktop resize rail");
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
	await page.waitForFunction(() => {
		const button = document.querySelector('[aria-label="Open sidebar"]');
		const box = button.getBoundingClientRect();
		return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
	});
	await page.click('[aria-label="Open sidebar"]');
	await page.waitForSelector('[data-mobile-navigation]', { visible: true });
	assert.equal(await page.$eval('[data-mobile-navigation] aside', (element) => element.getBoundingClientRect().width), 256);
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[data-mobile-navigation]'));
	await page.waitForFunction(() => document.querySelector('[aria-label="Open sidebar"]').parentElement.getBoundingClientRect().width >= 35);
	await page.evaluate(() => document.activeElement?.blur());
	await page.mouse.move(380, 100);
	await page.waitForFunction(() => !document.querySelector('[role="tooltip"]'));
	if (process.env.LH_UI_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.LH_UI_SCREENSHOT_DIR, "after-mobile.png") });
	assert.deepEqual(errors, []);
	console.log("PASS mobile overlay, no horizontal overflow or browser exceptions");
} finally {
	await browser?.close();
	if (server && server.exitCode === null) {
		server.kill("SIGTERM");
		await new Promise((resolve) => server.once("exit", resolve));
	}
	await rm(data, { recursive: true, force: true });
}
