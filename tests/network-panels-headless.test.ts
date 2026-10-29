import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { it } from "node:test";
import puppeteer, { type Page } from "puppeteer-core";
import { kitDemoHtml, type DemoKitSpec } from "../src/core/demo-kit.ts";
import { injectDemoTheme } from "../src/core/demo-theme.ts";

const chrome = process.env.CHROME_PATH;
const skip = !chrome || !existsSync(chrome) ? "Chrome not available" : !existsSync("public/demo-kit/runtime.js") ? "demo kit not built" : false;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ml-net-2-3-1.json", import.meta.url), "utf8"));
const network: DemoKitSpec = { panels: [{ type: "network", title: "One training step, 2 → 3 → 1, sigmoid, squared error", ...Object.fromEntries(Object.entries(fixture.spec).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])) } as DemoKitSpec["panels"][number]] };
async function mount(page: Page, spec: DemoKitSpec) {
	await page.setContent(injectDemoTheme(kitDemoHtml(spec), true).replace('<script src="/demo-kit/runtime.js"></script>', ""));
	await page.addScriptTag({ content: readFileSync("public/demo-kit/runtime.js", "utf8") });
	await page.evaluate(() => window.__lhKit!.ready);
}
it("network steps match hand values, expose gradients and undo without losing keyboard selection", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await mount(page, network);
		assert.equal(await page.$$eval(".k-neuron", es => es.length), 6);
		assert.equal(await page.$$eval(".k-illustrative", es => es.length), 0);
		assert.equal(await page.$$eval('.k-neuron[tabindex="0"]', es => es.length), 1);
		assert.equal(await page.$eval(".k-network-edges line", line => { const x = Number(line.getAttribute("x1")); const neuron = document.querySelector<HTMLElement>('.k-neuron[data-layer="0"]')!; return x > neuron.offsetLeft; }), true, "edges end at neuron boundaries, never behind value text");
		assert.equal(await page.$eval(".k-network-step", e => e.textContent), "Step 0 of 5");
		await page.focus('.k-neuron[data-layer="1"][data-neuron="1"]');
		assert.match(await page.$eval(".k-readout-line", e => e.textContent), /Hidden h2 · value not computed yet/);
		await page.click(".k-network-next");
		assert.match(await page.$eval(".k-readout-line", e => e.textContent), /Hidden h2 · value 0.6900/);
		await page.click(".k-network-next");
		assert.equal(await page.$eval(".k-network-next", e => e.textContent), "Start backward");
		assert.equal(await page.$eval(".k-network-loss", e => e.textContent), "Target 1 · Loss 0.0885");
		await page.click(".k-network-next"); await page.click(".k-network-next");
		await page.focus('.k-neuron[data-layer="1"][data-neuron="1"]');
		const expected = "Hidden h2 · value 0.6900 · gradient +0.0132";
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), expected);
		assert.equal(await page.evaluate(() => document.activeElement!.getAttribute("aria-label")), expected);
		await page.keyboard.press("Space");
		await page.$eval('.k-neuron[data-layer="0"]', e => { e.dispatchEvent(new Event("pointerenter")); e.dispatchEvent(new Event("pointerleave")); });
		assert.equal(await page.$eval(".k-readout-line", e => e.textContent), expected);
		await page.keyboard.press("ArrowDown");
		assert.match(await page.$eval(".k-readout-line", e => e.textContent), /Hidden h3.*−0.0102/);
		await page.click(".k-network-next");
		assert.equal(await page.$eval(".k-network-next", e => (e as HTMLButtonElement).disabled), true);
		assert.match(await page.$eval(".k-network-edges", e => e.textContent), /gradient −0.0614/);
		await page.click(".k-network-back");
		assert.equal(await page.$eval(".k-network-step", e => e.textContent), "Step 4 of 5");
		await page.click(".k-network-reset");
		assert.equal(await page.$eval(".k-network-step", e => e.textContent), "Step 0 of 5");
		assert.match(await page.$eval(".k-network-loss", e => e.textContent), /Loss –/);
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 1, steps: 0 });
	} finally { await browser.close(); }
});
it("network keeps state across expansion and theme, fits phones and refuses invalid evaluated data", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await page.setViewport({ width: 800, height: 900, hasTouch: true, isMobile: true }); await mount(page, network);
		for (let i = 0; i < 4; i++) await page.click(".k-network-next");
		for (const width of [320, 390, 1440]) {
			await page.setViewport({ width, height: 900, hasTouch: true, isMobile: true });
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/network-inline-${width}.png`, fullPage: true });
			await page.click(".k-icon-button");
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			assert.equal(await page.$$eval(".k-neuron,.k-network-fields .k-btn", es => es.filter(e => e.getBoundingClientRect().height > 0).every(e => e.getBoundingClientRect().height >= 44)), true);
			if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/network-expanded-${width}.png`, fullPage: true });
			await page.evaluate(() => { window.dispatchEvent(new Event("lh-demo-theme")); window.postMessage({ type: "lh-demo-focus", panel: null }, "*"); });
			await page.waitForFunction(() => !document.querySelector(".k-focus"));
			assert.equal(await page.$eval(".k-network-step", e => e.textContent), "Step 4 of 5");
		}
		await mount(page, { panels: [{ ...network.panels[0]!, input: "[NaN,0.5]" } as DemoKitSpec["panels"][number]] });
		assert.match(await page.$eval(".k-error", e => e.textContent), /finite/);
		assert.equal(await page.$$eval(".k-neuron", es => es.length), 0);
	} finally { await browser.close(); }
});
