import assert from "node:assert/strict";

/** Run against isolated fixture chats, through actual pointer/keyboard input. */
export async function checkTurnNavigationUi(page, base, quizChatId, completedChatId) {
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const scroller = async () => page.evaluate(() => {
		let main = document.querySelector('[data-testid="dock-spacer"]').parentElement;
		while (main && !/auto|scroll/.test(getComputedStyle(main).overflowY)) main = main.parentElement;
		window.turnScroller = main;
	});
	await page.setViewport({ width: 2048, height: 1229 });
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
	await page.goto(`${base}/chat/${quizChatId}`, { waitUntil: "networkidle2" });
	await page.click('[data-testid="teach-check-reveal"]');
	await wait(450);
	await scroller();
	await page.mouse.move(1100, 180);
	await page.mouse.wheel({ deltaY: -2200 });
	await page.waitForSelector('[data-testid="question-dock-bar"]');
	await wait(400);
	const sampling = page.evaluate(() => new Promise((resolve) => {
		const frames = [];
		const start = performance.now();
		const frame = () => {
			frames.push({ time: performance.now() - start, scroll: window.turnScroller.scrollTop, distance: window.turnScroller.scrollHeight - window.turnScroller.clientHeight - window.turnScroller.scrollTop, expanded: !document.querySelector('[data-testid="question-dock-bar"]'), height: document.querySelector('[data-testid="dock-shell"]').getBoundingClientRect().height });
			if (performance.now() - start < 700) requestAnimationFrame(frame);
			else resolve(frames);
		};
		requestAnimationFrame(frame);
	}));
	await page.click('[aria-label="Scroll to latest"]');
	const frames = await sampling;
	const firstExpanded = frames.find((frame) => frame.expanded);
	assert.ok(firstExpanded && firstExpanded.distance <= 2, `the prompt waits for the bottom: ${JSON.stringify(firstExpanded)}`);
	assert.ok(firstExpanded.time >= 200, "expansion follows the 240ms scroll phase");
	assert.ok(new Set(frames.filter((frame) => !frame.expanded).map((frame) => frame.scroll)).size > 3, "scroll phase has intermediate positions");
	assert.ok(new Set(frames.filter((frame) => frame.expanded).map((frame) => Math.round(frame.height))).size > 3, "expansion has its own intermediate heights");
	console.log("PASS arrow eases to the bottom before expanding the prompt");
	await page.mouse.move(1100, 180);
	await page.mouse.wheel({ deltaY: -2200 });
	await page.waitForSelector('[data-testid="question-dock-bar"]');
	await wait(400);
	await page.click('[aria-label="Scroll to latest"]');
	await wait(60);
	await page.mouse.move(1100, 180);
	await page.mouse.wheel({ deltaY: -400 });
	await wait(500);
	assert.ok(await page.$('[data-testid="question-dock-bar"]'), "scrolling away cancels the queued expansion");
	assert.ok(await page.evaluate(() => window.turnScroller.scrollHeight - window.turnScroller.clientHeight - window.turnScroller.scrollTop > 100), "interruption keeps the reader away from the bottom");
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	await page.click('[aria-label="Scroll to latest"]');
	await page.waitForFunction(() => !document.querySelector('[data-testid="question-dock-bar"]'));
	assert.equal(await page.$eval('[data-testid="dock-shell"]', (element) => element.getAnimations().length), 0);
	assert.ok(await page.evaluate(() => window.turnScroller.scrollHeight - window.turnScroller.clientHeight - window.turnScroller.scrollTop < 2));
	console.log("PASS interrupted arrow sequence and reduced motion");

	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
	await page.goto(`${base}/chat/${completedChatId}`, { waitUntil: "networkidle2" });
	await scroller();
	await page.waitForSelector('[data-testid="session-turn-rail"]', { visible: true });
	const selector = '[data-testid="session-turn-rail"] button';
	const markers = await page.$$(selector);
	assert.ok(markers.length > 3, "the rail contains session turns");
	await markers[0].hover();
	await page.waitForSelector('.session-turn-preview', { visible: true });
	assert.equal(await page.$eval('.session-turn-preview p:last-child', (element) => getComputedStyle(element).webkitLineClamp), "3");
	assert.ok(await page.$eval('.session-turn-preview', (element) => element.innerText.length > 10));
	await page.mouse.move(1000, 180);
	await markers[0].focus();
	await page.keyboard.press("ArrowDown");
	assert.equal(await page.evaluate((selector) => document.activeElement === document.querySelectorAll(selector)[1], selector), true, "arrow keys move keyboard focus between markers");
	await page.waitForSelector('.session-turn-preview', { visible: true });
	const jumpTo = async (index) => {
		const partId = await markers[index].evaluate((element) => element.dataset.turnPartId);
		await page.evaluate(() => {
			window.turnJumpPositions = [];
			const start = performance.now();
			const frame = () => { window.turnJumpPositions.push(window.turnScroller.scrollTop); if (performance.now() - start < 400) requestAnimationFrame(frame); };
			requestAnimationFrame(frame);
		});
		await markers[index].click();
		await wait(500);
		assert.ok(await page.evaluate(() => new Set(window.turnJumpPositions).size > 3), "turn navigation moves through intermediate scroll positions");
		const result = await page.evaluate((id) => {
			const answer = [...window.turnScroller.querySelectorAll('[data-answer-part-id]')].find((element) => element.dataset.answerPartId === id);
			return { offset: answer.getBoundingClientRect().top - window.turnScroller.getBoundingClientRect().top, active: document.querySelector('[data-testid="session-turn-rail"] [aria-current="step"]')?.dataset.turnPartId };
		}, partId);
		assert.ok(Math.abs(result.offset - 16) < 2, `turn ${index + 1} aligns at 16px: ${result.offset}`);
		assert.equal(result.active, partId, "the visible answer's marker is highlighted");
	};
	await jumpTo(0);
	await jumpTo(markers.length - 1);
	await markers[0].click();
	await wait(60);
	await page.mouse.move(1100, 180);
	await page.mouse.wheel({ deltaY: 80 });
	await wait(250);
	const interruptedAt = await page.evaluate(() => window.turnScroller.scrollTop);
	await wait(350);
	assert.equal(await page.evaluate(() => window.turnScroller.scrollTop), interruptedAt, "a manual gesture cancels rail navigation without a later jump");
	await markers.at(-1).focus();
	await page.keyboard.press("Home");
	await page.keyboard.press("Enter");
	await wait(500);
	assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Jump to turn 1");
	console.log("PASS turn previews, keyboard navigation, short/long destinations, and active marker");
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	await markers.at(-1).click();
	await page.waitForFunction(() => {
		const buttons = [...document.querySelectorAll('[data-testid="session-turn-rail"] button')];
		const answer = [...window.turnScroller.querySelectorAll('[data-answer-part-id]')].find((element) => element.dataset.answerPartId === buttons.at(-1)?.dataset.turnPartId);
		return answer && Math.abs(answer.getBoundingClientRect().top - window.turnScroller.getBoundingClientRect().top - 16) < 2;
	});
	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
	await page.setViewport({ width: 2048, height: 520 });
	await wait(200);
	const visibleMarker = await page.evaluate(() => {
		const marker = document.querySelector('[data-testid="session-turn-rail"] [aria-current="step"]').getBoundingClientRect();
		const track = document.querySelector('.session-turn-markers').getBoundingClientRect();
		return marker.top >= track.top - 1 && marker.bottom <= track.bottom + 1;
	});
	assert.ok(visibleMarker, "the active marker stays visible when a long session exceeds the rail height");
	await page.setViewport({ width: 800, height: 900 });
	await wait(100);
	assert.equal(await page.$eval('[data-testid="session-turn-rail"]', (element) => getComputedStyle(element).display), "none", "narrow sessions keep the gutter clear");
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	console.log("PASS turn rail hides when the desktop gutter cannot fit");
}
