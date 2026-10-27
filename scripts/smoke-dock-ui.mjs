/** Real dock interactions against an isolated copy of the golden transcript.
 * LH_BROWSER_URL=http://127.0.0.1:9333 node scripts/smoke-dock-ui.mjs
 * Alternatively set CHROME_PATH to a local Chromium executable.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { checkStreamingUi } from "./check-streaming-ui.mjs";
import { checkSessionStateUi } from "./check-session-state-ui.mjs";
import { checkTurnNavigationUi } from "./check-turn-navigation-ui.mjs";

const data = await mkdtemp(path.join(os.tmpdir(), "learning-dock-ui-"));
const port = Number(process.env.LH_UI_PORT ?? 3101);
const base = `http://127.0.0.1:${port}`;
const motionOnly = process.env.LH_UI_MOTION_ONLY === "1";
const stateOnly = process.env.LH_UI_STATE_ONLY === "1";
const helpersOnly = process.env.LH_UI_HELPERS_ONLY === "1" || stateOnly;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pythonSnippet = "predictions = X @ w\nerrors = predictions - y\nmse = np.mean(errors ** 2)";
let server;
let browser;
let context;
let page;
const errors = [];
const pendingRequests = new Map();
const motionFailures = [];
let output = "";
try {
	const chat = JSON.parse(await readFile(new URL("../tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", import.meta.url), "utf8"));
	const plan = chat.messages.findIndex((message) => message.role === "toolResult" && message.toolName === "plan_init" && message.details?.tree);
	const check = chat.messages.findIndex((message, index) => index > plan && message.role === "assistant"
		&& message.content?.some((part) => part.type === "toolCall" && part.name === "quiz" && part.arguments.type === "check"));
	assert.ok(check > 0, "fixture has a teaching check after its plan");
	chat.id = "dock-ui-regression";
	chat.title = "Dock UI regression";
	chat.messages = chat.messages.slice(0, check + 1);
	await mkdir(path.join(data, "chats"));
	await writeFile(path.join(data, "chats", `${chat.id}.json`), JSON.stringify(chat));
	const completed = JSON.parse(await readFile(new URL("../tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", import.meta.url), "utf8"));
	completed.id = "composer-ui-regression";
	await writeFile(path.join(data, "chats", `${completed.id}.json`), JSON.stringify(completed));
	const practice = JSON.parse(await readFile(new URL("../tests/fixtures/golden-data/chats/chat_mv293wv5_10656952.json", import.meta.url), "utf8"));
	const problem = practice.messages.findIndex((message) => message.role === "assistant" && message.content?.some((part) => part.type === "toolCall" && part.name === "problem"));
	assert.ok(problem >= 0, "practice fixture has an active problem");
	practice.id = "practice-dock-ui-regression";
	practice.messages = practice.messages.slice(0, problem + 2);
	practice.messages.splice(problem, 0, {
		...practice.messages[problem], id: "practice-reading-history", role: "assistant",
		content: [{ type: "text", text: Array.from({ length: 30 }, (_, index) => `Earlier practice note ${index + 1}: compare the evidence with the current estimate before attempting the next problem.`).join("\n\n") }],
	});
	await writeFile(path.join(data, "chats", `${practice.id}.json`), JSON.stringify(practice));
	const fence = "```";
	const longCode = Array.from({ length: 11 }, (_, i) => `value_${i} = ${i}`).join("\n");
	const wideCode = `message = "${"x".repeat(200)}"`;
	const codeChat = {
		...completed,
		id: "markdown-ui-regression",
		title: "Markdown UI regression",
		messages: [{ ...completed.messages.at(-1), content: [{ type: "text", text: `${fence}python\n${pythonSnippet}\n${fence}\n\n${fence}python\n${longCode}\n${fence}\n\n${fence}python\n${wideCode}\n${fence}` }] }],
	};
	await writeFile(path.join(data, "chats", `${codeChat.id}.json`), JSON.stringify(codeChat));
	const recordingChat = structuredClone(chat);
	recordingChat.id = "motion-ui-regression";
	const quiz = recordingChat.messages.at(-1).content.find((part) => part.type === "toolCall" && part.name === "quiz");
	quiz.arguments.question = "For one example,\n\n$$\n\\mathbf{x}=\\begin{bmatrix}3\\\\1\\end{bmatrix},\\quad \\mathbf{w}=\\begin{bmatrix}1\\\\2\\end{bmatrix},\\quad y=7.\n$$\n\nThe prediction is 5, so the error is $e=-2$. What is the gradient $2e\\mathbf{x}$?";
	quiz.arguments.options = ["12\\\\4", "-6\\\\-2", "-12\\\\-4", "-4\\\\-4"].map((value, index) => ({ value: String(index), label: `$\\begin{bmatrix}${value}\\end{bmatrix}$` }));
	quiz.arguments.correctAnswer = "2";
	await writeFile(path.join(data, "chats", `${recordingChat.id}.json`), JSON.stringify(recordingChat));
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		env: { ...process.env, LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	server.stdout.on("data", (chunk) => { output = (output + chunk).slice(-4000); });
	server.stderr.on("data", (chunk) => { output = (output + chunk).slice(-4000); });
	let ready = false;
	for (let i = 0; i < 120; i++) {
		if (server.exitCode !== null) throw new Error(`Dev server exited: ${output}`);
		try { await fetch(`${base}/api/chats`, { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch { await wait(250); }
	}
	assert.ok(ready, "isolated server starts");
	browser = process.env.LH_BROWSER_URL
		? await puppeteer.connect({ browserURL: process.env.LH_BROWSER_URL, defaultViewport: null })
		: await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
	context = await browser.createBrowserContext();
	page = await context.newPage();
	page.setDefaultTimeout(5000);
	page.setDefaultNavigationTimeout(30000);
	const openChat = async (id) => {
		await page.goto(`${base}/chat/${id}`, { waitUntil: "domcontentloaded" });
		await page.waitForFunction((expectedId) => {
			const chat = document.querySelector('[data-chat-id]');
			const field = chat?.querySelector('[data-testid="composer"] textarea, [data-testid="question-dock"] textarea, [data-testid="practice-dock"] textarea');
			const props = field && Object.keys(field).find((key) => key.startsWith("__reactProps$"));
			return chat?.dataset.chatId === expectedId && typeof field?.[props]?.onChange === "function";
		}, {}, id);
	};
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("request", (request) => { const url = new URL(request.url()); pendingRequests.set(request, { url: url.origin + url.pathname, type: request.resourceType() }); });
	page.on("requestfinished", (request) => pendingRequests.delete(request));
	page.on("requestfailed", (request) => pendingRequests.delete(request));
	if (!motionOnly && !helpersOnly) {
	await page.setViewport({ width: 2000, height: 1216 });
	await openChat(chat.id);
	await page.waitForSelector('[data-testid="teach-check-reveal"]');
	// Hold only newly requested script chunks after the CTA is activated. This
	// exercises the cold lazy boundary without relying on an arbitrary delay.
	const heldSetupScripts = [];
	const holdSetup = (request) => {
		if (request.resourceType() === "script") heldSetupScripts.push(request);
		else void request.continue();
	};
	await page.setRequestInterception(true);
	page.on("request", holdSetup);
	await page.focus('[data-testid="setup-cta"]');
	await page.keyboard.press("Enter");
	await page.waitForSelector('[data-testid="setup-loading-dialog"] [role="status"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="setup-loading-dialog"]', (element) => element.contains(document.activeElement)), true, "loading setup owns keyboard focus");
	await page.waitForFunction(() => !document.querySelector('[data-testid="setup-dialog"]'));
	assert.ok(heldSetupScripts.length > 0, "setup chunk is requested only when opened");
	page.off("request", holdSetup);
	for (const request of heldSetupScripts) await request.continue();
	await page.setRequestInterception(false);
	await page.waitForSelector('[data-testid="setup-dialog"]', { visible: true });
	await page.waitForSelector('[data-testid="setup-loading-dialog"]', { hidden: true });
	await page.waitForFunction(() => document.querySelector('[data-testid="setup-dialog"]').contains(document.activeElement));
	await page.click('[data-testid="setup-close"]');
	await page.waitForSelector('[data-testid="setup-dialog"]', { hidden: true });
	await page.waitForFunction(() => document.activeElement === document.querySelector('[data-testid="setup-cta"]'));
	await page.evaluate(() => document.activeElement?.blur());
	console.log("PASS cold setup loading feedback, modal focus handoff and original CTA focus restoration");
	await page.evaluate(() => {
		let element = document.querySelector('[data-testid="dock-spacer"]').parentElement;
		while (element && !/auto|scroll/.test(getComputedStyle(element).overflowY)) element = element.parentElement;
		window.dockScroller = element;
	});
	const sample = () => page.evaluate(() => new Promise((resolve) => {
		const values = [];
		const start = performance.now();
		let collapsedDistance = null;
		const beforeLayout = () => {
			if (document.querySelector('[data-testid="dock-shell"]').dataset.compact === "true") collapsedDistance = window.dockScroller.scrollHeight - window.dockScroller.clientHeight - window.dockScroller.scrollTop;
		};
		// Capture the threshold before React expands the dock and increases its
		// reserved tail. The next painted frame legitimately has a larger range.
		window.dockScroller.addEventListener("scroll", beforeLayout, true);
		const frame = () => {
			values.push({ animations: window.dockAnimationTrace ? document.querySelector('[data-testid="dock-shell"]').getAnimations().map((animation) => ({ playState: animation.playState, currentTime: animation.currentTime, keyframes: animation.effect?.getKeyframes() })) : undefined, collapsedDistance, time: performance.now() - start, height: document.querySelector('[data-testid="dock-shell"]').getBoundingClientRect().height, scroll: window.dockScroller.scrollTop, distance: window.dockScroller.scrollHeight - window.dockScroller.clientHeight - window.dockScroller.scrollTop, expanded: document.querySelector('[data-testid="dock-shell"]').dataset.compact === 'false' });
			if (performance.now() - start < 380) requestAnimationFrame(frame);
			else { window.dockScroller.removeEventListener("scroll", beforeLayout, true); resolve(values); }
		};
		requestAnimationFrame(frame);
	}));
	let sampling = sample();
	await page.click('[data-testid="teach-check-reveal"]');
	let frames = await sampling;
	const heights = frames.map((frame) => Math.round(frame.height));
	assert.ok(new Set(heights).size > 3, "expansion has intermediate heights");
	assert.ok(heights.at(-1) > heights[0] + 100, "question expands");
	assert.ok(frames.some((frame) => frame.scroll > frames[0].scroll + 1 && frame.scroll < frames.at(-1).scroll - 1), "reveal scroll moves through intermediate positions");
	assert.equal(await page.$eval('[data-testid="lesson-question"]', (element) => !!element.closest('[data-testid="dock-shell"]') && !element.closest('[data-testid="lesson-content"]')), true, "active question follows the floating prompt");
	console.log("PASS coordinated expansion and scroll");
	assert.equal(await page.$('[data-testid="plan-sidebar"]'), null, "no persistent plan sidebar");
	assert.equal(await page.$('[data-testid="plan-popup"]'), null, "plan starts closed");
	const centered = await page.evaluate(() => {
		const prompt = document.querySelector('[data-testid="dock-shell"]').getBoundingClientRect();
		const session = document.querySelector('[role="log"]').getBoundingClientRect();
		return Math.abs((prompt.left + prompt.right) / 2 - (session.left + session.right) / 2);
	});
	assert.ok(centered <= 12, "prompt is centered without reserved plan space");
	console.log("PASS plan stays hidden and prompt remains centered");
	const field = await page.$('[data-testid="thinking-field"]');
	const box = await field.boundingBox();
	await page.mouse.click(box.x + 12, box.y + box.height - 5);
	assert.equal(await page.evaluate(() => document.activeElement?.tagName), "TEXTAREA", "bottom blank space focuses the textarea");
	await page.keyboard.type("Keep this draft.");
	await page.click('[data-kbdrow="0"]');
	assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "TEXTAREA", "answer button keeps its action");
	await page.click('[data-testid="confidence-segments"] [role="radio"]:last-child');
	const chosenConfidence = await page.$eval('[data-testid="confidence-segments"] [aria-checked="true"]', (element) => element.textContent);
	await page.evaluate(() => document.activeElement?.blur());
	const selection = await page.evaluate(() => ({
		button: getComputedStyle(document.querySelector('button[type="submit"]')).userSelect,
		input: getComputedStyle(document.querySelector('[aria-label="Your thinking"]')).userSelect,
		question: getComputedStyle(document.querySelector('[data-testid="lesson-question"]')).userSelect,
	}));
	assert.deepEqual(selection, { button: "none", input: "text", question: "text" });
	console.log("PASS blank-area focus and selective text selection");
	await wait(500);
	const shell = await page.$('[data-testid="dock-shell"]');
	const shellBox = await shell.boundingBox();
	await page.mouse.move(shellBox.x + 20, shellBox.y + shellBox.height - 15);
	sampling = sample();
	await page.mouse.wheel({ deltaY: -420 });
	frames = await sampling;
	assert.ok(new Set(frames.map((frame) => Math.round(frame.scroll))).size > 3, "wheel over prompt scrolls smoothly");
	await page.waitForSelector('[data-testid="question-dock-bar"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="lesson-question"]', (element) => element.inert), true, "outgoing choices become inert as soon as folding begins");
	await page.waitForFunction(() => document.querySelector('[data-testid="lesson-question"]').hidden);
	await page.click('[data-testid="question-dock-bar"]');
	await wait(400);
	assert.equal(await page.$eval('[data-kbdrow="0"]', (element) => element.getAttribute("aria-checked")), "true", "fold preserves the selected answer");
	assert.equal(await page.$eval('[data-testid="confidence-segments"] [aria-checked="true"]', (element) => element.textContent), chosenConfidence, "fold preserves confidence");
	assert.equal(await page.$eval('[aria-label="Your thinking"]', (element) => element.value), "Keep this draft.");
	await page.evaluate(() => { window.dockScroller.scrollTop = window.dockScroller.scrollHeight; });
	await wait(450);
	await page.click('[aria-label="Your thinking"]');
	await page.keyboard.down("Control");
	await page.keyboard.press("KeyA", { commands: ["SelectAll"] });
	await page.keyboard.up("Control");
	await page.keyboard.press("Backspace");
	assert.equal(await page.$eval('[aria-label="Your thinking"]', (element) => element.value), "");
	await page.mouse.wheel({ deltaY: -420 });
	await wait(450);
	assert.equal(await page.$('[data-testid="question-dock-bar"]'), null, "scrolling up must keep an empty focused input expanded");
	await page.evaluate(() => { document.activeElement?.blur(); window.dockScroller.scrollTop = window.dockScroller.scrollHeight; });
	await wait(450);
	await page.mouse.wheel({ deltaY: -420 });
	await page.waitForSelector('[data-testid="question-dock-bar"]');
	await page.click('[data-testid="question-dock-bar"]');
	await wait(400);
	assert.equal(await page.$eval('[aria-label="Your thinking"]', (element) => element.value), "", "cleared draft stays empty after folding");
	assert.equal(await page.$eval('[data-kbdrow="0"]', (element) => element.getAttribute("aria-checked")), "true", "fold preserves choice");
	const revealDistance = await page.evaluate(() => window.dockScroller.scrollHeight - window.dockScroller.clientHeight - window.dockScroller.scrollTop);
	assert.ok(revealDistance < 2, `reveal ends at the bottom (remaining ${revealDistance}px)`);
	console.log("PASS focused inputs stay open; folded inputs preserve drafts, choice and confidence");
	// The lesson can end above the prompt while its reserved tail remains.
	// Expansion now waits for the final 16px of the actual scroll range.
	await page.mouse.wheel({ deltaY: -1000 });
	await page.waitForSelector('[data-testid="question-dock-bar"]');
	await wait(450);
	await page.evaluate(() => {
		window.dockScroller.scrollTop = window.dockScroller.scrollHeight - window.dockScroller.clientHeight - 300;
	});
	await wait(450);
	await page.waitForSelector('[data-testid="question-dock-bar"]');
	await page.mouse.move(1000, 160);
	sampling = sample();
	await page.mouse.wheel({ deltaY: 200 });
	frames = await sampling;
	assert.ok(frames.every((frame) => !frame.expanded), "the prompt stays collapsed more than 16px from the actual bottom");
	sampling = sample();
	await page.mouse.wheel({ deltaY: 100 });
	frames = await sampling;
	assert.ok(frames.some((frame) => frame.expanded), "the prompt opens in the final 16px");
	const expansionThreshold = frames.find((frame) => frame.expanded).collapsedDistance;
	assert.ok(typeof expansionThreshold === "number" && expansionThreshold <= 16, `the lesson-end position does not trigger early expansion (threshold ${expansionThreshold}px)`);
	await wait(300);
	assert.equal(await page.$('[data-testid="question-dock-bar"]'), null);
	assert.equal(await page.$eval('[aria-label="Your thinking"]', (element) => element.value), "");
	console.log("PASS prompt expands only within 16px of the actual bottom");
	await page.click('[data-testid="plan-chip"]');
	await page.waitForSelector('[data-testid="plan-popup"]');
	const overlay = await page.$eval('[data-testid="plan-popup"]', (element) => {
		const bounds = element.getBoundingClientRect();
		const session = element.parentElement.getBoundingClientRect();
		return { width: bounds.width, height: bounds.height, sessionWidth: session.width, sessionHeight: session.height };
	});
	assert.equal(overlay.width, overlay.sessionWidth, "plan fills the session width");
	assert.equal(overlay.height, overlay.sessionHeight, "plan fills the session height");
	assert.equal(await page.$eval('[data-testid="plan-chip"]', (element) => element.getAttribute("aria-expanded")), "true");
	await page.click('[data-testid="plan-chip"]');
	assert.equal(await page.$('[data-testid="plan-popup"]'), null, "top-row button toggles the plan closed");
	await page.click('[data-testid="plan-chip"]');
	await page.click('[data-testid="plan-popup-close"]');
	await page.click('[data-testid="plan-chip"]');
	await page.keyboard.press("Escape");
	assert.equal(await page.$('[data-testid="plan-popup"]'), null, "Escape closes the plan");
	console.log("PASS full-screen Plan toggle, close button, and Escape");
	for (const viewport of [{ width: 1024, height: 768 }, { width: 800, height: 600 }, { width: 375, height: 812 }]) {
		await page.setViewport(viewport);
		if (viewport.width < 500) {
			const close = await page.$('[aria-label="Close sidebar"]');
			if (close) await close.click();
		}
		await wait(450);
		const layout = await page.evaluate(() => {
			const prompt = document.querySelector('[data-testid="dock-shell"]').getBoundingClientRect();
			const question = document.querySelector('[data-testid="lesson-question"]');
			return { sidebar: !!document.querySelector('[data-testid="plan-sidebar"]'), top: prompt.top, bottom: prompt.bottom, questionHeight: question.clientHeight, width: document.documentElement.scrollWidth, viewport: innerWidth };
		});
		assert.equal(layout.sidebar, false);
		assert.ok(layout.top >= 52 && layout.bottom <= viewport.height, `prompt stays within ${viewport.width}×${viewport.height}: ${JSON.stringify(layout)}`);
		assert.ok(layout.questionHeight >= 80, "question remains usable");
		assert.ok(layout.questionHeight <= viewport.height / 2 + 1, "question stays within half the available screen");
		assert.ok(layout.width <= layout.viewport, "no horizontal overflow");
		if (viewport.width === 800) {
			await page.waitForFunction(() => window.dockScroller.scrollHeight - window.dockScroller.clientHeight - window.dockScroller.scrollTop < 2);
			const nested = await page.evaluate(() => {
				const element = document.querySelector('[data-testid="lesson-question"]');
				element.scrollTop = 0;
				const bounds = element.getBoundingClientRect();
				return { x: bounds.left + 30, y: bounds.top + 30, main: window.dockScroller.scrollTop };
			});
			await page.mouse.move(nested.x, nested.y);
			await page.mouse.wheel({ deltaY: 80 });
			await wait(100);
			assert.ok(await page.$eval('[data-testid="lesson-question"]', (element) => element.scrollTop > 0), "nested question area keeps native scrolling");
			assert.equal(await page.evaluate(() => window.dockScroller.scrollTop), nested.main, "nested scrolling does not move the lesson");
		}
	}
	await page.click('[data-testid="plan-chip"]');
	await page.waitForSelector('[data-testid="plan-popup"]');
	await page.click('[data-testid="plan-popup-close"]');
	console.log("PASS responsive layout and full-screen Plan button");
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	await page.evaluate(() => document.activeElement?.blur());
	await page.waitForSelector('[data-testid="plan-popup"]', { hidden: true });
	await page.mouse.move(180, 160);
	await page.mouse.wheel({ deltaY: -420 });
	await page.waitForSelector('[data-testid="question-dock-bar"]');
	await page.click('[data-testid="question-dock-bar"]');
	await wait(50);
	assert.equal(await page.$eval('[data-testid="dock-shell"]', (element) => element.getAnimations().length), 0, "reduced motion has no height animation");
	assert.equal(await page.$eval('[aria-label="Your thinking"]', (element) => element.value), "");
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
	await openChat(completed.id);
	const composer = await page.$('[data-testid="composer"]');
	const composerBox = await composer.boundingBox();
	await page.mouse.click(composerBox.x + composerBox.width / 2, composerBox.y + composerBox.height - 3);
	assert.equal(await page.evaluate(() => document.activeElement?.tagName), "TEXTAREA", "composer padding focuses the input");
	await page.evaluate(() => {
		let scroller = document.querySelector('[data-testid="dock-spacer"]').parentElement;
		while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
		window.dockScroller = scroller;
		scroller.scrollTop = Math.floor((scroller.scrollHeight - scroller.clientHeight) / 2);
	});
	await wait(450);
	const lessonLeft = await page.$eval('[role="log"]', (element) => element.getBoundingClientRect().left);
	await page.mouse.move(lessonLeft + 40, 160);
	// The lesson scrolls natively (2026-10-27): the wheel is never cancelled,
	// so the compositor owns the motion. Headless CDP wheels apply at once;
	// a real trackpad/mouse animates in the browser itself.
	await page.evaluate(() => {
		window.lessonWheelPrevented = null;
		window.dockScroller.addEventListener("wheel", (event) => { setTimeout(() => { window.lessonWheelPrevented = event.defaultPrevented; }); }, { once: true });
	});
	sampling = sample();
	await page.mouse.wheel({ deltaY: 120 });
	frames = await sampling;
	assert.equal(await page.evaluate(() => window.lessonWheelPrevented), false, "lesson wheel input scrolls natively");
	assert.ok(Math.abs(frames.at(-1).scroll - frames[0].scroll - 120) <= 1, "lesson scrolling preserves gesture distance");
	const promptBox = await (await page.$('[data-testid="composer"]')).boundingBox();
	await page.mouse.move(promptBox.x + promptBox.width / 2, promptBox.y + promptBox.height - 3);
	const startScroll = await page.evaluate(() => window.dockScroller.scrollTop);
	for (let i = 0; i < 12; i++) await page.mouse.wheel({ deltaY: 8 });
	await wait(220);
	const afterScroll = await page.evaluate(() => window.dockScroller.scrollTop);
	assert.ok(Math.abs(afterScroll - startScroll - 96) <= 1, "continuous prompt gestures preserve total pixel distance");
	console.log("PASS continuous scrolling across lesson and prompt");
	await page.waitForSelector('[aria-label="Scroll to latest"]');
	await page.click('[aria-label="Scroll to latest"]');
	await page.waitForFunction(() => window.dockScroller.scrollHeight - window.dockScroller.clientHeight - window.dockScroller.scrollTop < 2);
	console.log("PASS composer focus and jump-to-latest without a question");
	if (process.env.LH_UI_TRACE_ANIMATIONS) await page.evaluate(() => {
		window.dockAnimationTrace = [];
		const animate = Element.prototype.animate;
		Element.prototype.animate = function(keyframes, options) {
			if (this.matches('[data-testid="dock-shell"]')) window.dockAnimationTrace.push({ target: this.dataset.testid, time: performance.now(), keyframes, options, height: this.getBoundingClientRect().height, computedHeight: getComputedStyle(this).height, compact: this.dataset.compact });
			return animate.call(this, keyframes, options);
		};
	});
	await page.type('[data-testid="composer"] textarea', "Ordinary composer draft");
	await page.evaluate(() => { window.originalComposerInput = document.querySelector('[data-testid="composer"] textarea'); document.activeElement?.blur(); });
	await page.mouse.move(lessonLeft + 40, 160);
	sampling = sample();
	await page.mouse.wheel({ deltaY: -420 });
	frames = await sampling;
	await page.waitForFunction(() => document.querySelector('[data-testid="dock-shell"]').dataset.compact === "true");
	if (process.env.LH_UI_TRACE_ANIMATIONS && process.env.LH_UI_SCREENSHOT_DIR) {
		await mkdir(process.env.LH_UI_SCREENSHOT_DIR, { recursive: true });
		await writeFile(path.join(process.env.LH_UI_SCREENSHOT_DIR, "dock-motion-trace.json"), JSON.stringify({ calls: await page.evaluate(() => window.dockAnimationTrace), frames }, null, 2));
	}
	if (new Set(frames.map((frame) => Math.round(frame.height))).size <= 3) motionFailures.push(`ordinary composer has intermediate compacting heights: ${JSON.stringify(frames.map(({time,height,expanded})=>({time:Math.round(time),height:Math.round(height),expanded})))}`);
	assert.equal(await page.$eval('[data-testid="composer"] textarea', (element) => element.value), "Ordinary composer draft", "compacting preserves the draft");
	assert.equal(await page.evaluate(() => document.querySelector('[data-testid="composer"] textarea') === window.originalComposerInput), true, "compacting preserves the mounted input");
	await page.focus('[data-testid="composer"] textarea');
	await page.waitForFunction(() => document.querySelector('[data-testid="dock-shell"]').dataset.compact === "false");
	await page.mouse.wheel({ deltaY: -160 });
	await wait(350);
	assert.equal(await page.$eval('[data-testid="dock-shell"]', (element) => element.dataset.compact), "false", "focused composer stays expanded");
	await page.evaluate(() => document.activeElement?.blur());
	await page.mouse.wheel({ deltaY: -160 });
	await page.waitForFunction(() => document.querySelector('[data-testid="dock-shell"]').dataset.compact === "true");
	await page.click('[aria-label="Scroll to latest"]');
	await page.waitForFunction(() => document.querySelector('[data-testid="dock-shell"]').dataset.compact === "false" && window.dockScroller.scrollHeight - window.dockScroller.clientHeight - window.dockScroller.scrollTop < 2);
	assert.equal(await page.$eval('[data-testid="composer"] textarea', (element) => element.value), "Ordinary composer draft");
	console.log("PASS ordinary composer keeps its input and draft, protects focus and expands at latest");
	await openChat(practice.id);
	await page.setViewport({ width: 390, height: 844 });
	await page.waitForSelector('[data-testid="practice-dock-bar"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="practice-problem-content"]', (element) => element.hidden && element.inert), true, "practice starts with a compact summary");
	await page.click('[data-testid="practice-dock-bar"]');
	await page.waitForSelector('[data-testid="practice-problem-content"]', { visible: true });
	assert.ok(await page.$eval('[data-testid="practice-problem-content"]', (element) => element.textContent.trim().length > 0 && !!element.closest('[data-testid="dock-shell"]')), "expanded practice statement follows the prompt");
	await page.type('[data-testid="practice-thinking-field"] textarea', "My practice reasoning survives folding.");
	await page.evaluate(() => {
		window.practiceInput = document.querySelector('[data-testid="practice-thinking-field"] textarea');
		document.activeElement?.blur();
		let scroller = document.querySelector('[data-testid="dock-spacer"]').parentElement;
		while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
		window.dockScroller = scroller;
	});
	const practiceLessonLeft = await page.$eval('[role="log"]', (element) => element.getBoundingClientRect().left);
	await page.mouse.move(practiceLessonLeft + 20, 100);
	await page.mouse.wheel({ deltaY: -420 });
	await page.waitForSelector('[data-testid="practice-dock-bar"]', { visible: true });
	await page.click('[data-testid="practice-dock-bar"]');
	await page.waitForSelector('[data-testid="practice-problem-content"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="practice-thinking-field"] textarea', (element) => element.value), "My practice reasoning survives folding.");
	assert.equal(await page.evaluate(() => window.practiceInput === document.querySelector('[data-testid="practice-thinking-field"] textarea')), true, "practice folding keeps the input mounted");
	assert.ok(await page.$eval('[data-testid="practice-problem-content"]', (element) => element.getBoundingClientRect().height <= (window.visualViewport?.height ?? innerHeight) / 2 + 1), "mobile practice content is bounded to half the available viewport");
	console.log("PASS floating practice summary, expanded statement, mobile bounds and preserved draft/input");
	await openChat(codeChat.id);
	await page.setViewport({ width: 1024, height: 768 });
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
	await page.waitForSelector('[data-testid="md-code"]');
	await page.waitForFunction(() => {
		const code = document.querySelector('[data-testid="md-code"] code');
		return [...code.querySelectorAll('span span')].some((token) => token.textContent.trim() === '=' && getComputedStyle(token).color === 'rgb(177, 185, 196)');
	});
	const presentation = await page.evaluate(() => {
		const blocks = [...document.querySelectorAll('[data-testid="md-code"]')];
		const short = blocks[0].querySelector('[data-streamdown="code-block"]');
		const code = short.querySelector('code');
		return {
			panelBorder: getComputedStyle(blocks[0]).borderTopWidth,
			language: blocks[0].querySelector('.md-code-toolbar > span').textContent,
			wrap: blocks[0].querySelector('[aria-label="Wrap lines"]').getAttribute('aria-pressed'),
			border: getComputedStyle(short).borderTopWidth,
			background: getComputedStyle(short).backgroundColor,
			shortNumbers: code.className.includes('counter-reset'),
			longNumbers: blocks[1].querySelector('code').className.includes('counter-reset'),
			rows: new Set([...code.children].map((line) => line.getBoundingClientRect().top)).size,
			copyVisible: getComputedStyle(blocks[0].querySelector('button')).opacity,
		};
	});
	assert.deepEqual(presentation, { panelBorder: "1px", language: "python", wrap: "false", border: "0px", background: "rgba(0, 0, 0, 0)", shortNumbers: false, longNumbers: true, rows: 3, copyVisible: "1" });
	await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value) => { window.copiedCode = value; } } }));
	await page.click('[data-testid="md-code"] [aria-label="Copy code"]');
	assert.equal(await page.evaluate(() => window.copiedCode), `${pythonSnippet}\n`, "Copy preserves source whitespace including the fence newline");
	assert.ok(await page.$eval('[data-testid="md-code"] code', (element) => element.innerText.includes("\n")), "selection has real code lines");
	console.log("PASS framed code, language header, short/long gutters, and source copying");
	await page.evaluate(() => document.querySelectorAll('[data-testid="md-code"]')[2].scrollIntoView({ block: "center" }));
	const wide = await page.evaluate(() => {
		const element = document.querySelectorAll('[data-testid="md-code"]')[2].querySelector('[data-streamdown="code-block-body"]');
		const bounds = element.getBoundingClientRect();
		return { x: bounds.left + 40, y: bounds.top + 8, scrollable: element.scrollWidth > element.clientWidth };
	});
	assert.ok(wide.scrollable, "long code lines scroll inside their own block");
	await page.mouse.move(wide.x, wide.y);
	await page.mouse.wheel({ deltaX: 120, deltaY: 0 });
	await wait(100);
	assert.ok(await page.evaluate(() => document.querySelectorAll('[data-testid="md-code"]')[2].querySelector('[data-streamdown="code-block-body"]').scrollLeft > 0), "horizontal code scrolling stays native");
	await page.click('[data-testid="md-code"]:last-of-type [aria-label="Wrap lines"]');
	const wrapped = await page.evaluate(() => {
		const block = document.querySelectorAll('[data-testid="md-code"]')[2];
		const body = block.querySelector('[data-streamdown="code-block-body"]');
		return { pressed: block.querySelector('[aria-label="Disable line wrap"]').getAttribute('aria-pressed'), fits: body.scrollWidth <= body.clientWidth + 1 };
	});
	assert.deepEqual(wrapped, { pressed: "true", fits: true }, "wrapping fits a long source line inside its panel");
	await page.click('[data-testid="md-code"]:last-of-type [aria-label="Disable line wrap"]');
	assert.ok(await page.evaluate(() => document.querySelectorAll('[data-testid="md-code"]')[2].querySelector('[data-streamdown="code-block-body"]').scrollWidth > document.querySelectorAll('[data-testid="md-code"]')[2].querySelector('[data-streamdown="code-block-body"]').clientWidth), "unwrapping restores horizontal source scrolling");
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "code does not overflow the page");
	if (process.env.LH_UI_SCREENSHOT) await page.screenshot({ path: process.env.LH_UI_SCREENSHOT });
	}
	if (!helpersOnly) {
	await page.setViewport({ width: 2048, height: 1229 });
	const motionClient = await page.createCDPSession();
	for (const rate of [1, 4]) {
		const reset = await page.evaluateOnNewDocument((id) => { if (window === window.top) localStorage.removeItem(`lh:session-ui:v1:local:${id}`); }, recordingChat.id);
		await motionClient.send("Emulation.setCPUThrottlingRate", { rate });
		await openChat(recordingChat.id);
		await page.removeScriptToEvaluateOnNewDocument(reset.identifier);
		await page.click('[data-testid="teach-check-reveal"]');
		await wait(450);
		await page.evaluate(() => document.activeElement?.blur());
		await page.mouse.move(1100, 180);
		const observing = page.evaluate(() => new Promise((resolve) => {
			window.stopDockObservation = false;
			let transitions = 0;
			const phases = [];
			window.dockObservationPhases = phases;
			window.dockDebugScrollEvents = [];
			window.dockDebugWheelEvents = [];
			let scroller = document.querySelector('[data-testid="dock-spacer"]').parentElement;
			while(scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller=scroller.parentElement;
			window.debugMotionScroller = scroller;
			scroller.addEventListener("wheel", (event) => window.dockDebugWheelEvents.push({time:performance.now(),deltaY:event.deltaY,target:event.target.tagName}), true);
			scroller.addEventListener("scroll", () => { window.dockDebugScrollEvents.push({time:performance.now(),y:scroller.scrollTop,distance:scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop,height:scroller.scrollHeight,client:scroller.clientHeight,compact:document.querySelector('[data-testid="dock-shell"]').dataset.compact});if(window.dockDebugScrollEvents.length>150)window.dockDebugScrollEvents.shift(); }, true);
			let blankFrames = 0;
			let previous = !!document.querySelector('[data-testid="question-dock-bar"]');
			const start = performance.now();
			const frame = () => {
				const shell = document.querySelector('[data-testid="dock-shell"]');
				const bar = !!document.querySelector('[data-testid="question-dock-bar"]');
				if (bar !== previous) { transitions++; previous = bar; phases.push({ t: Math.round(performance.now() - start), bar, y: Math.round(scroller.scrollTop), distance: scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, h: Math.round(shell.getBoundingClientRect().height) }); }
				const outgoing = shell.querySelector('.dock-outgoing');
				const painted = Math.max(shell.firstElementChild.getBoundingClientRect().height, outgoing && Number(getComputedStyle(outgoing).opacity) > .03 ? outgoing.getBoundingClientRect().height : 0);
				if (shell.getBoundingClientRect().height - painted > 80) blankFrames++;
				if (!window.stopDockObservation && performance.now() - start < 10000) requestAnimationFrame(frame);
				else resolve({ transitions, blankFrames, phases });
			};
			requestAnimationFrame(frame);
		}));
		void observing.catch(() => {});
		await page.mouse.wheel({ deltaY: -360 });
		await page.waitForSelector('[data-testid="question-dock-bar"]');
		await wait(450);
		assert.ok(await page.$('[data-testid="question-dock-bar"]'), "layout movement cannot reopen an upward gesture");
		await page.mouse.wheel({ deltaY: 360 });
		await page.waitForFunction(() => !document.querySelector('[data-testid="question-dock-bar"]'));
		await page.mouse.wheel({ deltaY: -240 });
		await page.waitForSelector('[data-testid="question-dock-bar"]');
		await page.mouse.wheel({ deltaY: 360 });
		await page.waitForFunction(() => !document.querySelector('[data-testid="question-dock-bar"]'));
		for (let i = 0; i < 12; i++) await page.mouse.wheel({ deltaY: 8 });
		await wait(350);
		await page.evaluate(() => { window.stopDockObservation = true; });
		const stable = await observing;
		assert.equal(stable.transitions, 4, `two up/down gestures produce exactly two collapses and two openings: ${JSON.stringify(stable.phases)}`);
		if (stable.blankFrames !== 0) motionFailures.push(`the outgoing quiz stays painted during the morph at ${rate}x CPU (${stable.blankFrames} blank frames)`);
		console.log(`PASS recording regression at ${rate}x CPU slowdown: no repeated toggles; blank frames ${stable.blankFrames}`);
	}
	await motionClient.send("Emulation.setCPUThrottlingRate", { rate: 1 });
	}
	if (!motionOnly) {
	if (!helpersOnly) {
	const resetNavigation = await page.evaluateOnNewDocument((id) => { if (window === window.top) localStorage.removeItem(`lh:session-ui:v1:local:${id}`); }, recordingChat.id);
	await checkTurnNavigationUi(page, base, recordingChat.id, completed.id);
	await page.removeScriptToEvaluateOnNewDocument(resetNavigation.identifier);
	}
	if (!stateOnly) await checkStreamingUi(page, base, completed);
	await checkSessionStateUi(page, base, completed.id, codeChat.id, recordingChat.id);
	}
	assert.deepEqual(motionFailures, [], "all dock height transitions animate");
	assert.deepEqual(errors, [], "no browser exceptions");
	console.log("PASS requested dock checks; no browser exceptions");
} catch (error) {
	if (process.env.LH_UI_SCREENSHOT_DIR && page) {
		await mkdir(process.env.LH_UI_SCREENSHOT_DIR, { recursive: true });
		await page.screenshot({ path: path.join(process.env.LH_UI_SCREENSHOT_DIR, "dock-failure.png") }).catch(() => {});
		await writeFile(path.join(process.env.LH_UI_SCREENSHOT_DIR, "dock-failure.json"), JSON.stringify({ error: error.message, errors, motionFailures, pendingRequests: [...pendingRequests.values()], serverOutput: output, page: await page.evaluate(() => ({ hydration: (()=>{const chat=document.querySelector("[data-chat-id]");const field=chat?.querySelector("[data-testid=composer] textarea");const key=field&&Object.keys(field).find(k=>k.startsWith("__reactProps$"));return {chatId:chat?.dataset.chatId,field:!!field,propsKey:key,onChange:typeof field?.[key]?.onChange,eventSource:!!window.testEventSource,eventState:window.testEventSource?.readyState};})(), text: document.body.innerText.slice(-6000), observation: window.dockObservationPhases, scrollEvents: window.dockDebugScrollEvents, wheelEvents: window.dockDebugWheelEvents, shell: document.querySelector('[data-testid="dock-shell"]')?.outerHTML.slice(0,1000), distance: window.dockScroller ? window.dockScroller.scrollHeight - window.dockScroller.clientHeight - window.dockScroller.scrollTop : null })).catch(() => null) }, null, 2));
	}
	throw error;
} finally {
	await page?.close();
	await context?.close();
	if (process.env.LH_BROWSER_URL) await browser?.disconnect();
	else await browser?.close();
	if (server && server.exitCode === null) {
		server.kill("SIGTERM");
		await new Promise((resolve) => server.once("exit", resolve));
	}
	await rm(data, { recursive: true, force: true });
}
