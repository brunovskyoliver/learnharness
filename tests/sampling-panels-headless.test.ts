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
		await slider(page, "topP", "0.5");
		assert.equal(await page.$$eval(".k-sampling-cut", rows => rows.length), 6);
		assert.match(await page.$eval(".k-sampling-rows", e => e.textContent), /cut by top-p/);
		await page.evaluate(() => { Math.random = () => 0; }); await page.click(".k-sampling-fields .k-primary");
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "Sampled “mat” · 2 tokens could be drawn");
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
		await mount(page, nextToken);
		assert.equal(await page.$eval("h3", e => e.textContent), "After “The cat sat on the”");
		assert.equal(await page.$$eval(".k-sampling-context", e => e.length), 0);
	} finally { await browser.close(); }
});
