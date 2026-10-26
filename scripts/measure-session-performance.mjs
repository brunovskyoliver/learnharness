/** Production fixture benchmark. Run with LH_BROWSER_URL and pass base URLs.
 * Example: node scripts/measure-session-performance.mjs http://localhost:3104
 * LH_PERF_CHAT defaults to perf-a, a disposable fixture (never a live lesson).
 */
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: process.env.LH_BROWSER_URL, defaultViewport: null });
try {
	for (const base of process.argv.slice(2)) {
		const runs = [];
		for (let run = 0; run < 3; run++) {
			const context = await browser.createBrowserContext();
			try {
				const page = await context.newPage();
				await page.setViewport({ width: 1600, height: 1000 });
				await page.evaluateOnNewDocument(() => {
					window.audit = { tasks: [], shifts: [] };
					new PerformanceObserver((list) => { window.audit.tasks.push(...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration }))); }).observe({ type: "longtask", buffered: true });
					new PerformanceObserver((list) => { window.audit.shifts.push(...list.getEntries().filter((entry) => !entry.hadRecentInput).map((entry) => entry.value)); }).observe({ type: "layout-shift", buffered: true });
				});
				await page.goto(`${base}/chat/${process.env.LH_PERF_CHAT ?? "perf-a"}`, { waitUntil: "load", timeout: 90000 });
				await page.waitForSelector('[data-testid="session-row"]');
				await new Promise((resolve) => setTimeout(resolve, 500));
				const loading = await page.evaluate(() => {
					const resources = performance.getEntriesByType("resource");
					return {
						readyMs: Math.round(performance.now()),
						fcpMs: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0),
						jsEncodedBytes: resources.filter((entry) => new URL(entry.name).pathname.endsWith(".js")).reduce((sum, entry) => sum + entry.encodedBodySize, 0),
						apiEncodedBytes: resources.filter((entry) => new URL(entry.name).pathname.startsWith("/api/")).reduce((sum, entry) => sum + entry.encodedBodySize, 0),
						blockingMs: Math.round(window.audit.tasks.reduce((sum, entry) => sum + Math.max(0, entry.duration - 50), 0)),
						cls: Number(window.audit.shifts.reduce((sum, value) => sum + value, 0).toFixed(4)),
						domNodes: document.querySelectorAll("*").length,
					};
				});
				await page.mouse.move(1000, 200); await page.mouse.wheel({ deltaY: -600 });
				await new Promise((resolve) => setTimeout(resolve, 500));
				const scrolling = await page.evaluate(async () => {
					let main = document.querySelector('[data-testid="dock-spacer"]');
					while (main && !/auto|scroll/.test(getComputedStyle(main).overflowY)) main = main.parentElement;
					const original = Element.prototype.getBoundingClientRect;
					let answerLayoutReads = 0;
					Element.prototype.getBoundingClientRect = function () {
						if (this.hasAttribute("data-answer-part-id")) answerLayoutReads++;
						return original.call(this);
					};
					try {
						for (let step = 0; step < 60; step++) {
							main.scrollTop = (main.scrollHeight - main.clientHeight) * step / 60;
							await new Promise(requestAnimationFrame);
						}
						return { answerLayoutReads };
					} finally { Element.prototype.getBoundingClientRect = original; }
				});
				runs.push({ ...loading, ...scrolling });
			} finally { await context.close(); }
		}
		console.log(JSON.stringify({ base, runs }));
	}
} finally { browser.disconnect(); }
