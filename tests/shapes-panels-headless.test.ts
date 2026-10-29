import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { it } from "node:test";
import puppeteer, { type Page } from "puppeteer-core";
import { kitDemoHtml, type DemoKitSpec } from "../src/core/demo-kit.ts";
import { injectDemoTheme } from "../src/core/demo-theme.ts";

const chrome = process.env.CHROME_PATH;
const skip = !chrome || !existsSync(chrome) ? "Chrome not available" : !existsSync("public/demo-kit/runtime.js") ? "demo kit not built" : false;
const B = { name: "B" }, T = { name: "T" }, C = { name: "C", size: 768 }, H = { name: "H", size: 12 }, D = { name: "D", size: 64 };
const trace = [
	{ op: "Input embeddings", shape: [B, T, C] }, { op: "Project to Q, K, V", shape: [B, T, { name: "3C", size: 2304 }] },
	{ op: "Split into heads", shape: [B, H, T, D] }, { op: "Scores Q·Kᵀ / √D", shape: [B, H, T, T] },
	{ op: "Softmax over keys", shape: [B, H, T, T] }, { op: "Weights · V", shape: [B, H, T, D] }, { op: "Merge heads, project", shape: [B, T, C] },
];
const panel: Extract<DemoKitSpec["panels"][number], { type: "shapes" }> = { type: "shapes", title: "Multi-head attention, GPT-2 small", dims: JSON.stringify([{ name: "B", meaning: "batch" }, { name: "T", meaning: "tokens" }, { name: "C", meaning: "width 768" }, { name: "H", meaning: "heads 12" }, { name: "D", meaning: "head width 64" }]), steps: JSON.stringify(trace) };
async function mount(page: Page, p = panel) {
	await page.setContent(injectDemoTheme(kitDemoHtml({ panels: [p] }), true).replace('<script src="/demo-kit/runtime.js"></script>', ""));
	await page.addScriptTag({ content: readFileSync("public/demo-kit/runtime.js", "utf8") });
	await page.evaluate(() => window.__lhKit!.ready);
}
it("shapes derive transitions, mark changed dimensions by name and size and select with native buttons", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await mount(page);
		assert.equal(await page.$$eval(".k-shape-step", es => es.length), 7);
		assert.equal(await page.$eval('.k-shape-step[aria-current="step"]', e => e.getAttribute("data-step")), "0");
		assert.equal(await page.$$eval(".k-illustrative", es => es.length), 0);
		assert.equal(await page.$eval(".k-shape-legend", e => e.textContent), "B batch · T tokens · C width 768 · H heads 12 · D head width 64");
		await page.click('.k-shape-step[data-step="0"]');
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), "Step 1 of 7 · Input embeddings · (B, T, C) · start");
		await page.focus('.k-shape-step[data-step="2"]'); await page.keyboard.press("Enter");
		assert.equal(await page.$eval('.k-shape-step[data-step="2"]', e => e.getAttribute("aria-current")), "step");
		const readout = "Step 3 of 7 · Split into heads · (B, H, T, D) · (B, T, 3C 2304) → (B, H 12, T, D 64)";
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), readout);
		assert.equal(await page.evaluate(() => document.activeElement!.getAttribute("aria-label")), readout);
		assert.deepEqual(await page.$$eval('.k-shape-step[data-step="2"] .k-shape-changed', es => es.map(e => e.textContent)), ["H 12", "D 64"]);
		assert.deepEqual(await page.$$eval('.k-shape-step[data-step="3"] .k-shape-changed', es => es.map(e => e.textContent)), ["T"]);
		assert.equal(await page.$eval('.k-shape-step[data-step="4"] .k-shape-change', e => e.textContent), "no change");
		await mount(page, { ...panel, steps: '[{"op":"Before","shape":[{"name":"B","size":1},{"name":"C","size":2}]},{"op":"Resize and reorder","shape":[{"name":"C","size":3},{"name":"B","size":1}]}]' });
		assert.deepEqual(await page.$$eval('.k-shape-step[data-step="1"] .k-shape-changed', es => es.map(e => e.textContent)), ["C 3"]);
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 1, steps: 0 });
	} finally { await browser.close(); }
});
it("shapes retain selection across expansion/theme and wrap changes below the shape on phones", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await page.setViewport({ width: 800, height: 900, hasTouch: true, isMobile: true }); await mount(page);
		await page.click('.k-shape-step[data-step="2"]');
		for (const width of [320, 390, 1440]) {
			await page.setViewport({ width, height: 900, hasTouch: true, isMobile: true });
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			assert.equal(await page.$$eval(".k-shape-step", es => es.every(e => e.getBoundingClientRect().height >= 44)), true);
			if (width < 560) assert.equal(await page.$eval('.k-shape-step[data-step="2"]', e => e.querySelector(".k-shape-change")!.getBoundingClientRect().top >= e.querySelector(".k-shape-dims")!.getBoundingClientRect().bottom), true);
			if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/shapes-inline-${width}.png`, fullPage: true });
			await page.click(".k-icon-button");
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/shapes-expanded-${width}.png`, fullPage: true });
			await page.evaluate(() => { window.dispatchEvent(new Event("lh-demo-theme")); window.postMessage({ type: "lh-demo-focus", panel: null }, "*"); }); await page.waitForFunction(() => !document.querySelector(".k-focus"));
			assert.equal(await page.$eval('.k-shape-step[aria-current="step"]', e => e.getAttribute("data-step")), "2");
		}
	} finally { await browser.close(); }
});
it("shapes handle scalar tensors and reject invalid evaluated shapes without truncation", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await mount(page, { ...panel, steps: '[{"op":"Scalar","shape":[]}]' });
		await page.click(".k-shape-step"); assert.match(await page.$eval(".k-readout-line", e => e.textContent), /Scalar · \(\) · start/);
		for (const steps of ['[]', 'range(1,25).map(i=>({op:String(i),shape:[]}))', '[{op:"Invalid",shape:[{name:"B",size:Infinity}]}]', '[{op:"Wide",shape:range(1,7).map(i=>({name:String(i)}))}]']) {
			await mount(page, { ...panel, steps });
			assert.ok(await page.$eval(".k-error", e => e.textContent!.length > 0));
			assert.equal(await page.$$eval(".k-shape-step", es => es.length), 0);
		}
	} finally { await browser.close(); }
});
