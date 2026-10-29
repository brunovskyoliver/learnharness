import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { it } from "node:test";
import puppeteer, { type Page } from "puppeteer-core";
import { kitDemoHtml, type DemoKitSpec } from "../src/core/demo-kit.ts";
import { injectDemoTheme } from "../src/core/demo-theme.ts";

const chrome = process.env.CHROME_PATH;
const skip = !chrome || !existsSync(chrome) ? "Chrome not available" : !existsSync("public/demo-kit/runtime.js") ? "demo kit not built" : false;
const points = [{ label: "king", x: .62, y: .78, group: "royalty" }, { label: "queen", x: .8, y: .7, group: "royalty" }, { label: "prince", x: .55, y: .62, group: "royalty" }, { label: "princess", x: .74, y: .55, group: "royalty" }, { label: "man", x: .3, y: .42, group: "people" }, { label: "woman", x: .5, y: .33, group: "people" }, { label: "boy", x: .24, y: .27, group: "people" }, { label: "girl", x: .43, y: .19, group: "people" }, { label: "apple", x: .12, y: .84, group: "food" }, { label: "orange", x: .2, y: .92, group: "food" }];
const panel: Extract<DemoKitSpec["panels"][number], { type: "scatter" }> = { type: "scatter", title: "Word vectors, projected to 2D", points: JSON.stringify(points), groups: '["royalty","people","food"]', arithmetic: '{"plus":["king","woman"],"minus":["man"]}', metric: "euclidean" };
async function mount(page: Page, p = panel) {
	await page.setContent(injectDemoTheme(kitDemoHtml({ panels: [p] }), true).replace('<script src="/demo-kit/runtime.js"></script>', '<base href="http://demo.test/">'));
	await page.addScriptTag({ content: readFileSync("public/demo-kit/runtime.js", "utf8") });
	await page.evaluate(() => window.__lhKit!.ready);
}
it("2D scatter computes arithmetic, exposes matching pointer/keyboard readouts and pins points", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await mount(page);
		assert.equal(await page.$$eval(".k-scatter-point", es => es.length), 10);
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "king − man + woman lands nearest “queen” · Euclidean distance 0.02");
		assert.equal(await page.$$eval(".k-scatter-arrow", es => es.length), 2);
		assert.equal(await page.$eval(".k-scatter-ring", e => e.getAttribute("stroke-width")), "2");
		assert.equal(await page.$eval(".k-scatter-svg text", e => { const r = e.getBoundingClientRect(), plot = document.querySelector(".k-scatter-plot")!.getBoundingClientRect(); return r.left >= plot.left && r.right <= plot.right; }), true, "arithmetic label remains inside the plot");
		assert.equal(await page.evaluate(() => Math.abs(document.querySelector(".k-scatter-legend")!.getBoundingClientRect().top - document.querySelector(".k-scatter-fields")!.getBoundingClientRect().top) < 15), true);
		assert.equal(await page.$$eval('.k-scatter-point[tabindex="0"]', es => es.length), 1);
		await page.focus(".k-scatter-point"); await page.keyboard.press("ArrowRight");
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "queen · (0.80, 0.70)");
		assert.equal(await page.evaluate(() => document.activeElement!.getAttribute("aria-label")), "queen · (0.80, 0.70)");
		await page.keyboard.press("Space");
		await page.$eval(".k-scatter-point", e => { e.dispatchEvent(new Event("pointerenter")); e.dispatchEvent(new Event("pointerleave")); });
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "queen · (0.80, 0.70)");
		await page.click('.k-scatter-fields input[type="checkbox"]');
		assert.equal(await page.$$eval(".k-scatter-ring", es => es.length), 0);
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 1, steps: 0 });
	} finally { await browser.close(); }
});
it("scatter labels reveal on focus, preserves toggles across presentation changes and fits phone widths", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await page.setViewport({ width: 800, height: 900, isMobile: true, hasTouch: true }); await mount(page);
		for (const width of [320, 390, 1440]) {
			await page.setViewport({ width, height: 900, isMobile: true, hasTouch: true });
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			assert.equal(await page.$$eval(".k-scatter-point", es => es.every(e => e.getBoundingClientRect().width >= 44 && e.getBoundingClientRect().height >= 44)), true);
			if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/scatter-inline-${width}.png`, fullPage: true });
			await page.click(".k-icon-button");
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/scatter-expanded-${width}.png`, fullPage: true });
			await page.evaluate(() => window.postMessage({ type: "lh-demo-focus", panel: null }, "*")); await page.waitForFunction(() => !document.querySelector(".k-focus"));
		}
		await mount(page, { ...panel, points: '[{"label":"first","x":1,"y":1},{"label":"overlapping","x":1,"y":1}]', arithmetic: undefined });
		assert.equal(await page.$eval(".k-scatter-fields", e => e.getBoundingClientRect().height), 0);
		assert.equal(await page.$eval('.k-scatter-point[data-index="1"] .k-scatter-label', e => getComputedStyle(e).visibility), "hidden");
		await page.focus('.k-scatter-point[data-index="1"]');
		assert.equal(await page.$eval('.k-scatter-point[data-index="1"] .k-scatter-label', e => getComputedStyle(e).visibility), "visible");
	} finally { await browser.close(); }
});
it("3D scatter uses Plotly with keyboard highlight, pinning and unchanged camera on theme", { skip, timeout: 60000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--enable-unsafe-swiftshader"], headless: true });
	try {
		const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900, hasTouch: true, isMobile: true }); await page.setRequestInterception(true);
		page.on("request", request => { if (request.url().endsWith("/plotly.js")) void request.respond({ status: 200, contentType: "application/javascript", body: readFileSync("public/demo-kit/plotly.js") }); else void request.abort(); });
		await mount(page, { ...panel, title: "Word vectors, 3D", points: JSON.stringify(points.map((point, i) => ({ ...point, z: i / 10 }))) });
		assert.equal(await page.$$eval(".k-scatter-3d .js-plotly-plot", es => es.length), 1);
		await page.focus(".k-scatter-point"); await page.keyboard.press("ArrowRight");
		await page.waitForFunction(() => (document.querySelector(".js-plotly-plot") as HTMLElement & { data: { name: string }[] }).data.some(t => t.name === "queen"));
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "queen · (0.80, 0.70, 0.10)");
		assert.notEqual(await page.$eval(".k-scatter-3d", e => getComputedStyle(e).outlineStyle), "none");
		for (let i = 0; i < points.length; i++) {
			await page.focus(`.k-scatter-point[data-index="${i}"]`);
			await page.waitForFunction(label => (document.querySelector(".js-plotly-plot") as HTMLElement & { data: { name?: string; text?: string[] }[] }).data.some(trace => trace.name === label && trace.text?.[0] === label), {}, points[i]!.label);
			assert.equal(await page.evaluate(() => document.activeElement!.getAttribute("aria-label")), await page.$eval(".k-readout-line", e => e.textContent));
			assert.equal(await page.$eval(`.k-scatter-point[data-index="${i}"] .k-scatter-label`, e => getComputedStyle(e).visibility), "visible");
		}
		await page.focus('.k-scatter-point[data-index="1"]');
		await page.keyboard.press("Space");
		await page.evaluate(() => { const chart = document.querySelector(".js-plotly-plot") as HTMLElement & { emit(name: string, event: unknown): void }; chart.emit("plotly_hover", { points: [{ customdata: 0 }] }); });
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "king · (0.62, 0.78, 0.00)");
		await page.evaluate(() => { (document.querySelector(".js-plotly-plot") as HTMLElement & { emit(name: string, event: unknown): void }).emit("plotly_unhover", {}); });
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "queen · (0.80, 0.70, 0.10)");
		await page.evaluate(async () => { const target = document.querySelector(".js-plotly-plot"); await window.Plotly.relayout(target, { "scene.camera.eye": { x: 2, y: 1, z: .5 } }); window.dispatchEvent(new Event("lh-demo-theme")); });
		await page.waitForFunction(() => (document.querySelector(".js-plotly-plot") as HTMLElement & { layout: { scene: { camera: { eye: { x: number } } } } }).layout.scene.camera.eye.x === 2);
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 1, steps: 0 });
		for (const width of [320, 390, 1440]) {
			await page.setViewport({ width, height: 900, hasTouch: true, isMobile: true });
			await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
			if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/scatter-3d-inline-${width}.png`, fullPage: true });
			await page.click(".k-icon-button");
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			await page.waitForFunction(() => document.querySelector(".k-scatter-3d .k-chart")!.getBoundingClientRect().height >= 360);
			if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/scatter-3d-expanded-${width}.png`, fullPage: true });
			await page.evaluate(() => window.postMessage({ type: "lh-demo-focus", panel: null }, "*")); await page.waitForFunction(() => !document.querySelector(".k-focus"));
		}
	} finally { await browser.close(); }
});
it("scatter rejects invalid evaluated points and undefined nearest computations", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		for (const p of [{ ...panel, points: 'range(1,201).map(i=>({label:String(i),x:i,y:i}))' }, { ...panel, points: '[{"label":"king","x":0,"y":0}]', arithmetic: '{"plus":["king"],"minus":[]}' }, { ...panel, metric: "cosine" as const, arithmetic: '{"plus":["king"],"minus":["king"]}' }]) {
			await mount(page, p); assert.ok(await page.$eval(".k-error", e => e.textContent!.length > 0));
			assert.equal(await page.$$eval(".k-scatter-point", es => es.length), 0);
		}
	} finally { await browser.close(); }
});
