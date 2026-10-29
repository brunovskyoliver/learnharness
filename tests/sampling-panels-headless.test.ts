import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { it } from "node:test";
import puppeteer, { type Page } from "puppeteer-core";
import { kitDemoHtml, type DemoKitSpec } from "../src/core/demo-kit.ts";
import { injectDemoTheme } from "../src/core/demo-theme.ts";

const chrome = process.env.CHROME_PATH;
const skip = !chrome || !existsSync(chrome) ? "Chrome not available" : !existsSync("public/demo-kit/runtime.js") ? "demo kit not built" : false;
const nextToken: DemoKitSpec = { panels: [{ type: "next_token", context: JSON.stringify("The cat sat on the"), tokens: JSON.stringify([3.2, 2.6, 2.2, 2, 1.4, 1.2, 1, 0.6].map((logit, i) => ({ text: [" mat", " floor", " sofa", " bed", " roof", " table", " chair", " windowsill"][i], logit }))) }] };
async function mount(page: Page, spec: DemoKitSpec) {
	await page.setContent(injectDemoTheme(kitDemoHtml(spec), true).replace('<script src="/demo-kit/runtime.js"></script>', ""));
	await page.addScriptTag({ content: readFileSync("public/demo-kit/runtime.js", "utf8") });
	await page.evaluate(() => window.__lhKit!.ready);
}
async function slider(page: Page, name: string, value: string) {
	await page.$eval(`input[name="${name}"]`, (input, v) => { input.value = v; input.dispatchEvent(new Event("input")); }, value);
}
it("next-token controls recompute, cut, sample and reset the board distribution", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await page.setViewport({ width: 800, height: 900, isMobile: true, hasTouch: true }); await mount(page, nextToken);
		assert.equal(await page.$$eval(".k-sampling-row", rows => rows.length), 8);
		assert.equal(await page.$eval(".k-illustrative", e => e.textContent), "Illustrative numbers");
		assert.match(await page.$eval(".k-sampling-row", e => e.textContent), /37.0%/);
		await slider(page, "temperature", "0.1");
		assert.match(await page.$eval(".k-sampling-row", e => e.textContent), /99.7%/);
		await slider(page, "temperature", "1"); await slider(page, "topK", "3");
		assert.equal(await page.$$eval(".k-sampling-cut", rows => rows.length), 5);
		assert.match(await page.$eval(".k-sampling-cut", e => e.textContent), /cut by top-k/);
		// Top-p runs on the renormalised top-3 (mat = 0.522 ≥ 0.5), as in transformers.
		await slider(page, "topP", "0.5");
		assert.equal(await page.$$eval(".k-sampling-cut", rows => rows.length), 7);
		assert.match(await page.$eval(".k-sampling-rows", e => e.textContent), /cut by top-p/);
		await page.evaluate(() => { Math.random = () => 0; }); await page.click(".k-sampling-fields .k-primary");
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "Sampled “mat” · 1 token could be drawn");
		assert.equal(await page.$$eval(".k-sampling-picked", rows => rows.length), 1);
		await page.click(".k-sampling-reset");
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "8 of 8 tokens can be drawn. Press Sample to draw one.");
		for (const width of [320, 390, 1440]) {
			await page.setViewport({ width, height: 900, isMobile: true, hasTouch: true });
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			await page.click(".k-icon-button");
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			if (width < 640) {
				assert.equal(await page.$$eval(".k-sampling-fields input,.k-sampling-fields .k-btn", elements => elements.filter(e => e.getBoundingClientRect().height > 0).every(e => e.getBoundingClientRect().height >= 44)), true);
				await page.click(".k-parameters-toggle");
				assert.equal(await page.$eval(".k-parameters-toggle", e => e.getAttribute("aria-expanded")), "false");
				await page.click(".k-parameters-toggle");
			}
			await page.evaluate(() => window.postMessage({ type: "lh-demo-focus", panel: null }, "*"));
			await page.waitForFunction(() => !document.querySelector(".k-focus"));
		}
	} finally { await browser.close(); }
});
it("next-token preserves supplied titles, context and out-of-board slider values", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		await mount(page, { panels: [{ ...nextToken.panels[0]!, title: "Sampling", temperature: "3.125", topP: "0.0125" } as DemoKitSpec["panels"][number]] });
		assert.equal(await page.$eval("h3", e => e.textContent), "Sampling");
		assert.equal(await page.$eval(".k-sampling-context", e => e.textContent), "After “The cat sat on the”");
		assert.equal(await page.$eval('input[name="temperature"]', e => e.value), "3.125");
		assert.equal(await page.$eval('input[name="topP"]', e => e.value), "0.0125");
		await slider(page, "topP", "1");
		assert.equal(await page.$eval('input[name="topP"]', e => e.value), "1");
		await mount(page, nextToken);
		assert.equal(await page.$eval("h3", e => e.textContent), "After “The cat sat on the”");
		assert.equal(await page.$$eval(".k-sampling-context", e => e.length), 0);
	} finally { await browser.close(); }
});
const heatmap: DemoKitSpec = { panels: [{ type: "heatmap", title: "Attention weights, head 3", rows: '["The"," cat"," mat"]', cols: '["The"," cat"," mat"]', values: '[[1,0,0],[0.38,0.62,0],[0.05,0.48,0.47]]', scale: "sequential", min: "0", max: "1", rowAxis: '"Query"', colAxis: '"Key"', digits: "2" }] };
it("heatmap provides roving focus, matching hover/readout, pinned cells and responsive values", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await mount(page, heatmap);
		assert.equal(await page.$$eval('[role="gridcell"]', e => e.length), 9);
		assert.equal(await page.$eval(".k-illustrative", e => e.textContent), "Illustrative numbers");
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 1, steps: 0 });
		assert.equal(await page.$$eval('[role="gridcell"][tabindex="0"]', e => e.length), 1);
		await page.focus('[role="gridcell"]');
		await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowRight");
		const expected = "Query “mat” → key “cat” · 0.48";
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), expected);
		assert.equal(await page.evaluate(() => document.activeElement!.getAttribute("aria-label")), expected);
		assert.deepEqual(await page.$$eval('.k-heatmap-label.k-active', es => es.map(e => e.textContent?.trim())), ["cat", "mat"]);
		await page.keyboard.press("Space");
		await page.$eval('[role="gridcell"]', e => { e.dispatchEvent(new Event("pointerenter")); e.dispatchEvent(new Event("pointerleave")); });
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), expected);
		assert.deepEqual(await page.$$eval(".k-heatmap-legend-value", es => es.map(e => e.textContent)), ["1.00", "0.50", "0.00"]);
		for (const width of [320,390,1440]) {
			await page.setViewport({ width, height: 900 });
			await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLElement>('[role="gridcell"]')).every(e => (e.getBoundingClientRect().width >= 44) === !e.querySelector<HTMLElement>("span")!.hidden));
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
		}
		await mount(page, { panels: [{ ...heatmap.panels[0]!, scale: "diverging", min: "-1", max: "1", values: '[[1,-1,0],[0.4,-0.2,0.3],[-0.5,0.1,0.6]]' } as DemoKitSpec["panels"][number]] });
		assert.deepEqual(await page.$$eval(".k-heatmap-legend-value", es => es.map(e => e.textContent)), ["1.00", "0.00", "-1.00"]);
		assert.match(await page.$eval('[data-row="0"][data-col="1"]', e => e.getAttribute("style")!), /--lh-blue/);
		assert.match(await page.$eval('[data-row="0"][data-col="0"]', e => e.getAttribute("style")!), /--lh-red/);
	} finally { await browser.close(); }
});
it("large heatmaps scroll inside the panel and preserve touch targets in focus mode", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await page.setViewport({ width: 320, height: 900, hasTouch: true, isMobile: true });
		await mount(page, { panels: [{ type: "heatmap", title: "Matrix", rows: 'range(1,64).map(String)', cols: 'range(1,64).map(String)', values: 'range(1,64).map(()=>range(1,64).map(x=>x/64))', scale: "sequential", min: "0", max: "1" }] });
		assert.equal(await page.$$eval('[role="gridcell"]', es => es.length), 4096);
		assert.equal(await page.$eval(".k-heatmap-scroll", e => e.scrollWidth > e.clientWidth && e.scrollHeight > e.clientHeight), true);
		assert.equal(await page.$$eval('[role="gridcell"]', es => es.every(e => e.getBoundingClientRect().width >= 44 && e.getBoundingClientRect().height >= 44)), true);
		await page.focus('[role="gridcell"]'); for (let i=0;i<63;i++) await page.keyboard.press("ArrowRight");
		assert.equal(await page.$eval(".k-heatmap-scroll", e => e.scrollLeft > 0), true);
		await page.click(".k-icon-button");
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
	} finally { await browser.close(); }
});
it("heatmap derives approved bounds and rejects invalid evaluated data without truncation", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		for (const [scale, values, expected] of [["sequential", "[[2,4]]", ["4.00", "3.00", "2.00"]], ["diverging", "[[2,4]]", ["4.00", "0.00", "0.00"]], ["diverging", "[[-4,-2]]", ["0.00", "0.00", "-4.00"]], ["sequential", "[[2,2]]", ["2.00", "2.00", "2.00"]]] as const) {
			await mount(page, { panels: [{ type: "heatmap", rows: '["a"]', cols: '["b","c"]', values, scale }] });
			assert.deepEqual(await page.$$eval(".k-heatmap-legend-value", es => es.map(e => e.textContent)), expected);
			assert.match(await page.$eval(".k-readout-line", e => e.textContent), /^Query “a” → key “b”/);
		}
		for (const values of ["[[NaN]]", "[[1,2]]", "range(1,65).map(()=>[1])"]) {
			await mount(page, { panels: [{ type: "heatmap", rows: '["a"]', cols: '["b"]', values, scale: "sequential" }] });
			assert.equal(await page.$$eval('[role="gridcell"]', es => es.length), 0);
			assert.match(await page.$eval(".k-error", e => e.textContent), /finite number.*64×64/);
		}
	} finally { await browser.close(); }
});
