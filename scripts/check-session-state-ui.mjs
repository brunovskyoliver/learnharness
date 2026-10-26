import assert from "node:assert/strict";

/** Isolated fixture sessions only. Uses real session navigation and reloads. */
export async function checkSessionStateUi(page, base, firstId, secondId, questionId) {
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const main = () => page.evaluate(() => {
		let node = document.querySelector('[data-testid="dock-spacer"]');
		while (node && !/auto|scroll/.test(getComputedStyle(node).overflowY)) node = node.parentElement;
		window.stateScroller = node;
	});
	const open = async (id) => {
		await page.goto(`${base}/chat/${id}`, { waitUntil: "networkidle2" });
		await page.waitForSelector('[data-testid="session-row"]');
		await main();
		await wait(2200);
	};
	const switchTo = async (id) => {
		const rows = await page.$$('[data-testid="session-row"], [data-testid="session-row-kbd"]');
		for (const row of rows) {
			if ((await row.evaluate((node, id) => node.dataset.sessionId === id || node.title.startsWith(`${id}\n`), id))) { await row.click(); break; }
		}
		await page.waitForFunction((id) => document.querySelector("[data-chat-id]")?.dataset.chatId === id, {}, id);
		await main();
		await wait(2200);
	};
	await page.setViewport({ width: 1600, height: 1000 });
	if (!page.url().startsWith(base)) await page.goto(`${base}/chat/${firstId}`, { waitUntil: "networkidle2" });
	const reset = await page.evaluateOnNewDocument((ids) => { if (window !== window.top) return; for (const id of ids) localStorage.removeItem(`lh:session-ui:v1:local:${encodeURIComponent(id)}`); }, [firstId, secondId, questionId]);
	await open(firstId);
	await page.removeScriptToEvaluateOnNewDocument(reset.identifier);
	await page.type('[data-testid="composer"] textarea', "Unsent composer draft");
	// Reasoning and tool sections are independently keyed within a run.
	const sections = await page.evaluate(() => {
		const reasoning = document.querySelector('[data-testid="lesson-content"] button[aria-expanded="false"][data-state="closed"]');
		reasoning?.click();
		const tool = document.querySelector('[data-testid="tool-call-card"] summary');
		tool?.click();
		return { reasoning: Boolean(reasoning), tool: Boolean(tool) };
	});
	await wait(250);
	await page.evaluate(() => { window.stateScroller.scrollTop = 800; });
	await wait(250);
	const before = await page.evaluate(() => window.stateScroller.scrollTop);
	await switchTo(secondId);
	assert.equal(await page.$eval('[data-testid="composer"] textarea', (node) => node.value), "", "drafts never leak between sessions");
	await page.type('[data-testid="composer"] textarea', "Another session's draft");
	await switchTo(firstId);
	const restored = async () => {
		assert.equal(await page.$eval('[data-testid="composer"] textarea', (node) => node.value), "Unsent composer draft");
		const after = await page.evaluate(() => window.stateScroller.scrollTop);
		assert.ok(Math.abs(after - before) <= 2, `exact reading position survives navigation/reload: ${before} -> ${after}`);
		if (sections.reasoning) assert.ok(await page.$('[data-testid="lesson-content"] button[aria-expanded="true"][data-state="open"]'));
		if (sections.tool) assert.ok(await page.$('[data-testid="tool-call-card"][open]'));
	};
	await restored();
	await page.reload({ waitUntil: "networkidle2" });
	await main(); await wait(2300); await restored();
	console.log("PASS session switching/reload preserve reading, composer, reasoning and tools");
	await page.reload({ waitUntil: "networkidle2" }); await main();
	const bounds = await page.evaluate(() => { const box = window.stateScroller.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + 100 }; });
	await page.mouse.move(bounds.x, bounds.y); await page.mouse.wheel({ deltaY: -250 });
	await wait(400);
	const interrupted = await page.evaluate(() => window.stateScroller.scrollTop);
	await wait(2200);
	assert.ok(Math.abs(await page.evaluate(() => window.stateScroller.scrollTop) - interrupted) < 2, "manual scrolling cancels later restoration corrections");
	console.log("PASS manual scrolling interrupts restoration");

	// Explicit deep links win over a saved reading position.
	const target = await page.$eval('[data-answer-part-id][id]', (node) => node.id);
	await page.goto(`${base}/chat/${firstId}#${target}`, { waitUntil: "networkidle2" });
	await main(); await wait(2300);
	assert.ok(await page.evaluate((id) => {
		const rect = document.getElementById(id).getBoundingClientRect();
		const box = window.stateScroller.getBoundingClientRect();
		return rect.top >= box.top - 2 && rect.top < box.bottom;
	}, target), "hash navigation takes precedence");
	console.log("PASS hash navigation overrides saved position");

	await open(questionId);
	const reveal = await page.$('[data-testid="teach-check-reveal"]');
	if (reveal) await reveal.click();
	await wait(400);
	await page.waitForSelector('[data-testid="question-dock"]');
	const options = await page.$$('[data-testid="question-dock"] button');
	const option = await page.$('[data-testid="question-dock"] [data-kbdrow="0"]');
	if (option) await option.click();
	const confidence = await page.$('[data-testid="confidence-segments"] button:last-child');
	if (confidence) await confidence.click();
	const fields = await page.$$('[data-testid="question-dock"] textarea');
	if (fields.length) await fields.at(-1).type("Unsent question thinking");
	const questionBefore = await page.evaluate(() => ({
		fields: [...document.querySelectorAll('[data-testid="question-dock"] textarea')].map((node) => node.value),
		selected: [...document.querySelectorAll('[data-testid="question-dock"] [aria-checked="true"]')].map((node) => node.textContent),
	}));
	assert.ok(options.length > 0);
	await switchTo(secondId);
	await switchTo(questionId);
	await page.waitForSelector('[data-testid="question-dock"]');
	assert.deepEqual(await page.evaluate(() => ({
		fields: [...document.querySelectorAll('[data-testid="question-dock"] textarea')].map((node) => node.value),
		selected: [...document.querySelectorAll('[data-testid="question-dock"] [aria-checked="true"]')].map((node) => node.textContent),
	})), questionBefore);
	await page.reload({ waitUntil: "networkidle2" }); await wait(2300);
	assert.deepEqual(await page.$$eval('[data-testid="question-dock"] textarea', (nodes) => nodes.map((node) => node.value)), questionBefore.fields);
	console.log("PASS revealed question and unfinished answer survive switches and reload");
	for (const width of [375, 800, 1600]) {
		await page.setViewport({ width, height: 900 }); await wait(100);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal page overflow at ${width}px`);
	}
	console.log("PASS responsive session layout at 375, 800 and 1600px");
	await page.setViewport({ width: 375, height: 900 }); await wait(100);
	await page.click('[aria-label="Open sidebar"]');
	await page.waitForSelector('[role="dialog"]');
	assert.ok(await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), "mobile navigation owns keyboard focus");
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "navigation overlays rather than squeezing the lesson");
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
	assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Open sidebar");
	console.log("PASS mobile navigation overlay, focus and Escape");
}
