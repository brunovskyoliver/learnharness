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
const navOnly = process.env.LH_UI_TURN_NAV_ONLY === "1";
const helpersOnly = process.env.LH_UI_HELPERS_ONLY === "1" || stateOnly || navOnly;
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
		env: { ...process.env, OPENROUTER_API_KEY: "test-key-never-used", LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
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
		: await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
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
		// Long transcripts mount their earlier part in idle chunks after
		// hydration. Gestures that overlap that growth measure scroll
		// anchoring, not the dock (feature 002, US6): wait until the
		// transcript stops growing.
		await page.waitForFunction(() => new Promise((resolve) => {
			let main = document.querySelector('[data-testid="dock-spacer"]')?.parentElement;
			while (main && !/auto|scroll/.test(getComputedStyle(main).overflowY)) main = main.parentElement;
			if (!main) return resolve(false);
			let last = main.scrollHeight, since = performance.now();
			const tick = () => {
				if (main.scrollHeight !== last) { last = main.scrollHeight; since = performance.now(); }
				if (performance.now() - since >= 600) resolve(true);
				else requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}), { timeout: 30000 });
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
	let sampling;
	let frames;
	// Feature 025 (R8): the check is a thread beside the lesson, not in the prompt bar.
	assert.match(await page.$eval('[data-testid="check-pending"]', (element) => element.textContent), /Answer the check beside the lesson/, "the bar says where the check is");
	await page.click('[data-testid="teach-check-reveal"]');
	await page.waitForSelector('[data-testid="check-thread"][data-state="open"]');
	await wait(450); // the thread unfolds (.34s clip): let it finish before pointing into it
	const placement = await page.$eval('[data-testid="lesson-question"]', (element) => {
		const thread = element.closest('[data-testid="check-thread"]');
		const lesson = document.querySelector('[data-testid="lesson-content"]');
		const text = lesson.getBoundingClientRect().right - parseFloat(getComputedStyle(lesson).paddingRight);
		return { thread: !!thread, variant: thread?.dataset.variant, inLesson: !!element.closest('[data-testid="lesson-content"]'), inShell: !!element.closest('[data-testid="dock-shell"]'), gap: Math.round(thread.getBoundingClientRect().left - text), width: Math.round(thread.getBoundingClientRect().width) };
	});
	assert.deepEqual(placement, { thread: true, variant: "margin", inLesson: false, inShell: false, gap: 71, width: 410 }, "the open check is a 410px thread 71px right of the lesson column");
	console.log("PASS the check opens as a margin thread beside lesson-content");
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
		button: getComputedStyle(document.querySelector('[data-testid="check-thread"] button[type="submit"]')).userSelect,
		input: getComputedStyle(document.querySelector('[aria-label="Your thinking"]')).userSelect,
		question: getComputedStyle(document.querySelector('[data-testid="lesson-question"]')).userSelect,
	}));
	assert.deepEqual(selection, { button: "none", input: "text", question: "text" });
	console.log("PASS blank-area focus and selective text selection");
	await wait(500);
	// Reading history no longer folds a check: the thread stays as it is.
	await page.mouse.move(700, 300);
	await page.mouse.wheel({ deltaY: -420 });
	await wait(450);
	assert.equal(await page.$eval('[data-testid="check-thread"]', (element) => element.dataset.state), "open", "scrolling never folds the thread");
	await page.click('[aria-label="Collapse question"]');
	await page.waitForSelector('[data-testid="question-dock-bar"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="lesson-question"]', (element) => !!element.closest("[hidden][inert]")), true, "a closed thread hides its form and makes it inert");
	await page.click('[data-testid="question-dock-bar"]');
	await page.waitForSelector('[data-testid="check-thread"][data-state="open"]');
	assert.equal(await page.$eval('[data-kbdrow="0"]', (element) => element.getAttribute("aria-checked")), "true", "closing preserves the selected answer");
	assert.equal(await page.$eval('[data-testid="confidence-segments"] [aria-checked="true"]', (element) => element.textContent), chosenConfidence, "closing preserves confidence");
	assert.equal(await page.$eval('[aria-label="Your thinking"]', (element) => element.value), "Keep this draft.");
	console.log("PASS closed threads preserve drafts, choice and confidence; scrolling leaves them alone");
	// "Go to it" brings the thread back, open.
	await page.click('[aria-label="Collapse question"]');
	await page.mouse.move(700, 300);
	await page.mouse.wheel({ deltaY: -2000 });
	await wait(450);
	await page.click('[data-testid="check-go-to"]');
	await page.waitForFunction(() => {
		const thread = document.querySelector('[data-testid="check-thread"]');
		const box = thread?.getBoundingClientRect();
		return thread?.dataset.state === "open" && box.top >= 0 && box.bottom <= innerHeight;
	}, { timeout: 3000 });
	console.log("PASS Go to it scrolls to and opens the thread");
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
			const thread = question.closest('[data-testid="check-thread"]');
			return { sidebar: !!document.querySelector('[data-testid="plan-sidebar"]'), top: prompt.top, bottom: prompt.bottom, questionHeight: question.clientHeight, width: document.documentElement.scrollWidth, viewport: innerWidth, variant: thread.dataset.variant, threadRight: thread.getBoundingClientRect().right };
		});
		assert.equal(layout.sidebar, false);
		assert.ok(layout.top >= 52 && layout.bottom <= viewport.height, `prompt stays within ${viewport.width}×${viewport.height}: ${JSON.stringify(layout)}`);
		assert.ok(layout.questionHeight >= 80, "question remains usable");
		assert.ok(layout.questionHeight <= viewport.height / 2 + 1, "question stays within half the available screen");
		assert.ok(layout.width <= layout.viewport, "no horizontal overflow");
		assert.equal(layout.variant, "inline", `no room beside the lesson at ${viewport.width}px: the thread sits inline`);
		assert.ok(layout.threadRight <= viewport.width, "the inline thread stays on screen");
		if (viewport.width === 800) {
			const nested = await page.evaluate(async () => {
				const element = document.querySelector('[data-testid="lesson-question"]');
				element.scrollIntoView({ block: "start" });
				await new Promise((resolve) => setTimeout(resolve, 300));
				element.scrollTop = 0;
				const bounds = element.getBoundingClientRect();
				return { x: bounds.left + 30, y: bounds.top + 30, main: window.dockScroller.scrollTop };
			});
			await page.mouse.move(nested.x, nested.y);
			assert.ok(await page.$eval('[data-testid="lesson-question"]', (element) => element.scrollHeight > element.clientHeight + 10), "the question overflows its half-screen area here");
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
	await page.$eval('[aria-label="Collapse question"]', (element) => element.click());
	await page.waitForSelector('[data-testid="question-dock-bar"]');
	await page.$eval('[data-testid="question-dock-bar"]', (element) => element.click());
	await page.waitForSelector('[data-testid="check-thread"][data-state="open"]');
	await wait(50);
	assert.equal(await page.$eval('[data-testid="check-thread"]', (element) => element.getAnimations({ subtree: true }).length), 0, "reduced motion: the thread opens without unfolding");
	assert.equal(await page.$eval('[data-testid="dock-shell"]', (element) => element.getAnimations().length), 0, "reduced motion has no height animation");
	assert.equal(await page.$eval('[aria-label="Your thinking"]', (element) => element.value), "Keep this draft.");
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
	// A wheel over a demo iframe goes to that document, so aim at the lesson's own text.
	const lessonPoint = await page.evaluate(async () => {
		const scroller = window.dockScroller;
		const paragraphs = [...scroller.querySelectorAll('[role="log"] p')].filter((p) => !p.closest("[data-testid='composer']") && p.getBoundingClientRect().height > 0);
		const middle = paragraphs[Math.floor(paragraphs.length / 2)];
		if (!middle) return null;
		scroller.scrollTop += middle.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 120;
		await new Promise((resolve) => setTimeout(resolve, 450));
		const box = middle.getBoundingClientRect();
		const point = { x: box.left + 10, y: box.top + box.height / 2 };
		return scroller.contains(document.elementFromPoint(point.x, point.y)) ? point : null;
	});
	assert.ok(lessonPoint, "the lesson shows text outside its demos");
	await page.mouse.move(lessonPoint.x, lessonPoint.y);
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
	await page.mouse.move(lessonPoint.x, lessonPoint.y);
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
	assert.equal(await page.$eval('[data-testid="practice-problem-content"]', (element) => !!element.closest("[hidden][inert]")), true, "practice starts as a collapsed thread");
	assert.match(await page.$eval('[data-testid="check-pending"]', (element) => element.textContent), /Solve the problem beside the lesson/);
	await page.click('[data-testid="practice-dock-bar"]');
	await page.waitForSelector('[data-testid="practice-problem-content"]', { visible: true });
	assert.ok(await page.$eval('[data-testid="practice-problem-content"]', (element) => element.textContent.trim().length > 0 && element.closest('[data-testid="check-thread"]')?.dataset.variant === "inline" && !!element.closest('[data-testid="lesson-content"]') && !element.closest('[data-testid="dock-shell"]')), "on a phone the problem's thread sits inline in the lesson");
	await page.type('[data-testid="practice-thinking-field"] textarea', "My practice reasoning survives folding.");
	await page.evaluate(() => {
		window.practiceInput = document.querySelector('[data-testid="practice-thinking-field"] textarea');
		document.activeElement?.blur();
		let scroller = document.querySelector('[data-testid="dock-spacer"]').parentElement;
		while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
		window.dockScroller = scroller;
	});
	await page.click('[aria-label="Collapse problem"]');
	await page.waitForSelector('[data-testid="practice-dock-bar"]', { visible: true });
	await page.click('[data-testid="practice-dock-bar"]');
	await page.waitForSelector('[data-testid="practice-problem-content"]', { visible: true });
	assert.equal(await page.$eval('[data-testid="practice-thinking-field"] textarea', (element) => element.value), "My practice reasoning survives folding.");
	assert.equal(await page.evaluate(() => window.practiceInput === document.querySelector('[data-testid="practice-thinking-field"] textarea')), true, "closing the problem thread keeps the input mounted");
	assert.ok(await page.$eval('[data-testid="practice-problem-content"]', (element) => element.getBoundingClientRect().height <= (window.visualViewport?.height ?? innerHeight) / 2 + 1), "mobile practice content is bounded to half the available viewport");
	console.log("PASS practice thread: collapsed line, inline statement, mobile bounds and preserved draft/input");
	await openChat(codeChat.id);
	await page.setViewport({ width: 1024, height: 768 });
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
	await page.waitForSelector('[data-testid="md-code"]');
	await page.waitForFunction(() => {
		const code = document.querySelector('[data-testid="md-code"] code');
		// Shiki's highlighted tokens are in. Feature 025: the paper theme's Shiki colours land
		// in phase 8, so this no longer pins Study's old dark keyword colour.
		return [...code.querySelectorAll('span span')].some((token) => token.textContent.trim() === '=');
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
		await page.mouse.move(700, 180);
		// Feature 025 (R8): a thread does not fold with scrolling. Up and down
		// gestures leave it open; only the reader closes it.
		const observing = page.evaluate(() => new Promise((resolve) => {
			window.stopDockObservation = false;
			const thread = () => document.querySelector('[data-testid="check-thread"]')?.dataset.state;
			let previous = thread();
			let transitions = 0;
			const start = performance.now();
			const frame = () => {
				const now = thread();
				if (now !== previous) { transitions++; previous = now; }
				if (!window.stopDockObservation && performance.now() - start < 10000) requestAnimationFrame(frame);
				else resolve({ transitions, state: now });
			};
			requestAnimationFrame(frame);
		}));
		void observing.catch(() => {});
		for (const deltaY of [-360, 360, -240, 360]) { await page.mouse.wheel({ deltaY }); await wait(450); }
		for (let i = 0; i < 12; i++) await page.mouse.wheel({ deltaY: 8 });
		await wait(350);
		await page.evaluate(() => { window.stopDockObservation = true; });
		const stable = await observing;
		assert.deepEqual(stable, { transitions: 0, state: "open" }, "scrolling never toggles the open thread");
		console.log(`PASS recording regression at ${rate}x CPU slowdown: the thread stays open through up/down gestures`);
	}
	await motionClient.send("Emulation.setCPUThrottlingRate", { rate: 1 });
	}
	if (!motionOnly) {
	if (!helpersOnly || navOnly) {
	const resetNavigation = await page.evaluateOnNewDocument((id) => { if (window === window.top) localStorage.removeItem(`lh:session-ui:v1:local:${id}`); }, recordingChat.id);
	await checkTurnNavigationUi(page, base, recordingChat.id, completed.id);
	await page.removeScriptToEvaluateOnNewDocument(resetNavigation.identifier);
	}
	if (!stateOnly && !navOnly) await checkStreamingUi(page, base, completed);
	if (!navOnly) await checkSessionStateUi(page, base, completed.id, codeChat.id, recordingChat.id);
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
