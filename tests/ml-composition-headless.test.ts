import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { it } from "node:test";
import puppeteer, { type Page } from "puppeteer-core";
import { kitDemoHtml, type DemoKitSpec } from "../src/core/demo-kit.ts";
import { tokenize, withTokenizedPanels } from "../src/agent/tokenizer.ts";
import { buildDemoSrcDoc } from "../components/artifacts/demo-card.tsx";

const chrome = process.env.CHROME_PATH;
const skip = !chrome || !existsSync(chrome) ? "Chrome not available" : !existsSync("public/demo-kit/runtime.js") ? "demo kit not built" : false;
const panels: Extract<DemoKitSpec["panels"][number], { type: "tokens" | "heatmap" | "next_token" | "scatter" | "network" | "shapes" }>[] = [
	{ type: "tokens", title: "Tokens", text: "cat dog", encoding: "cl100k" },
	{ type: "heatmap", title: "Attention", rows: '["cat"," dog"]', cols: '["cat"," dog"]', values: '[[p.scale,0.2],[0.4,0.6]]', scale: "sequential" },
	{ type: "next_token", title: "Sampling", context: '"cat"', tokens: '[{"text":"cat","logit":1},{"text":" dog","logit":0}]' },
	{ type: "scatter", title: "Embeddings", points: '[{"label":"cat","x":1,"y":2},{"label":" dog","x":2,"y":1},{"label":"sum","x":3,"y":3}]', arithmetic: '{"plus":["cat"," dog"],"minus":[]}', metric: "euclidean" },
	{ type: "network", title: "Network", layers: '[1,1]', weights: '[[[1]]]', biases: '[[0]]', input: '[1]', target: '[0]', activation: "sigmoid", loss: "mse" },
	{ type: "shapes", title: "Shapes", steps: '[{"op":"Input","shape":[{"name":"B","size":2}]}]' },
];
const spec: DemoKitSpec = { params: { scale: { type: "slider", label: "Scale", min: 0, max: 1, step: .1, value: .8 } }, panels };
async function mount(page: Page, value: DemoKitSpec = spec, beforeRuntime?: () => Promise<void>) {
	await page.setContent(buildDemoSrcDoc(kitDemoHtml(await withTokenizedPanels(value))).replace('<script src="/demo-kit/runtime.js"></script>', '<base href="http://demo.test/">'));
	await beforeRuntime?.();
	await page.addScriptTag({ content: readFileSync("public/demo-kit/runtime.js", "utf8") });
	await page.evaluate(() => window.__lhKit!.ready);
}

it("renders the optional caption for all six ML panels safely beneath their content", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		await mount(page, { ...spec, panels: panels.map(panel => ({ ...panel, caption: '<b>Read the values.</b>' })) });
		assert.equal(await page.$$eval(".k-panel-caption", els => els.length), 6);
		assert.equal(await page.$$eval(".k-panel-caption", els => els.every(el => el.textContent === '<b>Read the values.</b>' && el.childElementCount === 0 && el === el.parentElement!.lastElementChild && getComputedStyle(el).color === getComputedStyle(document.querySelector(".k-readout-line")!).color)), true);
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 6, steps: 0 });
	} finally { await browser.close(); }
});

it("composed focus places global and panel controls in one sidebar without overlap or duplicate phone toggles", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900, isMobile: true, hasTouch: true }); await mount(page);
		await page.$eval('input[aria-label="Scale"]', el => { el.value = ".4"; el.dispatchEvent(new Event("input")); });
		await page.$eval('input[aria-label="Temperature"]', el => { el.value = "1.5"; el.dispatchEvent(new Event("input")); });
		for (const [index, local] of [[0, ".k-token-fields"], [2, ".k-sampling-fields"], [3, ".k-scatter-fields"], [4, ".k-network-fields"]] as const) {
			for (const width of [1440, 390, 320]) {
				await page.setViewport({ width, height: 900, isMobile: true, hasTouch: true });
				await page.click(`.k-panel:nth-child(${index + 1}) .k-icon-button`);
				assert.equal(await page.evaluate(selector => {
					const global = document.querySelector('input[aria-label="Scale"]')!.closest(".k-field")!.getBoundingClientRect();
					const local = document.querySelector(selector)!.getBoundingClientRect();
					return !(global.left < local.right && global.right > local.left && global.top < local.bottom && global.bottom > local.top);
				}, local), true, `${local} and global controls overlap at ${width}`);
				assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
				assert.equal(await page.$$eval(`${local} > .k-field`, fields => fields.every(field => field.getBoundingClientRect().height <= Array.from(field.children).reduce((height, child) => height + child.getBoundingClientRect().height, 0) + 8)), true, "sidebar fields use their content height");
				if (width < 640) {
					assert.equal(await page.$$eval(".k-parameters-toggle", els => els.filter(el => el.getBoundingClientRect().height > 0).length), 1);
					await page.click('#lh-kit > .k-controls > .k-parameters-toggle');
					assert.equal(await page.$eval(local, el => el.getBoundingClientRect().height), 0);
					await page.click('#lh-kit > .k-controls > .k-parameters-toggle');
				}
				if (process.env.LH_ML_SHOTS) await page.screenshot({ path: `${process.env.LH_ML_SHOTS}/composed-${index}-expanded-${width}.png`, fullPage: true });
				await page.evaluate(() => window.postMessage({ type: "lh-demo-focus", panel: null }, "*")); await page.waitForFunction(() => !document.querySelector(".k-focus"));
				assert.equal(await page.$$eval(local, els => els.length), 1);
				assert.equal(await page.$eval(local, (el, panelIndex) => el.closest(".k-panel") === document.querySelectorAll(".k-panel")[panelIndex], index), true);
				assert.equal(await page.$eval('input[aria-label="Scale"]', el => el.value), "0.4");
				assert.equal(await page.$eval('input[aria-label="Temperature"]', el => el.value), "1.5");
			}
		}
	} finally { await browser.close(); }
});

it("linked chips, headers, sampling rows and points share exact labels only within their link group", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		await mount(page, { ...spec, panels: [...panels.slice(0, 4).map(panel => ({ ...panel, link: "words" })), { ...panels[1]!, link: "other" }] });
		await page.evaluate(() => { (window as any).links = []; document.getElementById("lh-kit")!.addEventListener("k-link", event => (window as any).links.push((event as CustomEvent).detail)); });
		await page.focus(".k-token"); await page.keyboard.press("ArrowRight");
		assert.deepEqual(await page.evaluate(() => (window as any).links), [{ link: "words", label: "cat" }, { link: "words", label: " dog" }], "each focus emits once, with no receiving-panel echo");
		for (const selector of ['.k-panel:nth-child(2) [role="columnheader"]', '.k-panel:nth-child(2) [role="rowheader"]', '.k-sampling-row', '.k-scatter-point']) {
			assert.equal(await page.$$eval(`${selector}.k-linked`, els => els.length), 1, selector);
		}
		assert.equal(await page.$$eval('.k-panel:nth-child(5) .k-linked', els => els.length), 0);
		assert.equal(await page.$eval('.k-panel:nth-child(2) [role="columnheader"].k-linked', el => el.textContent), " dog");
		const samplingReadout = await page.$eval('.k-panel:nth-child(3) .k-readout-line', el => el.textContent);
		await page.$eval('.k-scatter-point', el => el.dispatchEvent(new Event("pointerenter")));
		assert.match(await page.$eval('.k-token.k-linked', el => el.getAttribute("aria-label") ?? ""), /“cat”/);
		assert.equal(await page.$eval('.k-panel:nth-child(3) .k-readout-line', el => el.textContent), samplingReadout);
		await page.focus('.k-sampling-row'); await page.keyboard.press('ArrowDown');
		assert.equal(await page.$$eval('.k-sampling-row[tabindex="0"]', els => els.length), 1);
		assert.equal(await page.$eval('.k-sampling-row[tabindex="0"]', el => getComputedStyle(el).outlineWidth), "2px");
		assert.match(await page.$eval('.k-token.k-linked', el => el.getAttribute("aria-label") ?? ""), /“ dog”/);
		await page.focus('.k-heatmap-cell[data-row="1"][data-col="0"]');
		assert.match(await page.$eval('.k-token.k-linked', el => el.getAttribute("aria-label") ?? ""), /“cat”/, "cell broadcasts its key-column label");
		await page.$$eval('.k-panel:nth-child(2) [role="rowheader"]', els => els[1]!.dispatchEvent(new Event("pointerenter")));
		assert.match(await page.$eval('.k-token.k-linked', el => el.getAttribute("aria-label") ?? ""), /“ dog”/);
		await page.evaluate(() => document.getElementById("lh-kit")!.dispatchEvent(new CustomEvent("k-link", { detail: { link: "words", label: "dog" } })));
		assert.equal(await page.$$eval('.k-token.k-linked', els => els.length), 0, "leading spaces are not silently normalized");
	} finally { await browser.close(); }
});


it("linked labels reapply after evaluated rows and edited token splits change without changing other panel state", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		await page.exposeFunction("tokenizeForTest", async (text: string, encoding: "o200k" | "cl100k" | "gpt2") => tokenize(text, encoding));
		await mount(page, { ...spec, panels: panels.slice(0, 4).map(panel => ({ ...panel, link: "words" })) }, async () => {
			await page.evaluate(() => { window.addEventListener("message", async event => { if (event.data?.type === "demo-tokenize") { const request = event.data; const tokens = await (window as any).tokenizeForTest(request.text, request.encoding); window.postMessage({ type: "lh-demo-tokens", requestId: request.requestId, encoding: request.encoding, tokens }, "*"); } }); });
		});
		await page.waitForFunction(() => !document.querySelector("textarea")!.readOnly);
		await page.focus(".k-token");
		const readout = await page.$eval('.k-panel:nth-child(3) .k-readout-line', el => el.textContent);
		await page.$eval('input[aria-label="Scale"]', el => { el.value = ".4"; el.dispatchEvent(new Event("input")); });
		await page.waitForFunction(() => document.querySelector('.k-heatmap-cell')!.getAttribute("aria-label")!.endsWith("0.40"));
		assert.equal(await page.$eval('[role="columnheader"].k-linked', el => el.textContent), "cat");
		await page.$eval('input[aria-label="Temperature"]', el => { el.value = "1.5"; el.dispatchEvent(new Event("input")); });
		assert.equal(await page.$eval('.k-sampling-row.k-linked .k-sampling-label', el => el.textContent), "cat");
		assert.equal(await page.$eval('.k-panel:nth-child(3) .k-readout-line', el => el.textContent), readout);
		for (const text of ["dog", "cat dog"]) {
			await page.$eval('textarea', (el, text) => { el.value = text; el.dispatchEvent(new Event("input")); }, text);
			await page.waitForFunction(text => document.querySelector('.k-token-count')!.textContent!.endsWith(`${text.length} characters`) && !document.querySelector('.k-updating'), {}, text);
			assert.equal(await page.$$eval('.k-token.k-linked', els => els.length), text === "dog" ? 0 : 1);
			assert.equal(await page.$eval('[role="columnheader"].k-linked', el => el.textContent), "cat");
		}
		assert.equal(await page.$eval('input[aria-label="Temperature"]', el => el.value), "1.5");
		assert.equal(await page.$eval('input[aria-label="Scale"]', el => el.value), "0.4");
	} finally { await browser.close(); }
});

it("3D linked points receive a Plotly highlight without changing selection or camera and broadcast hovered labels", { skip, timeout: 60000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--enable-unsafe-swiftshader"], headless: true });
	try {
		const page = await browser.newPage(); await page.setRequestInterception(true);
		page.on("request", request => { if (request.url().endsWith("/plotly.js")) void request.respond({ status: 200, contentType: "application/javascript", body: readFileSync("public/demo-kit/plotly.js") }); else void request.abort(); });
		await mount(page, { panels: [{ ...panels[0]!, link: "words" }, { type: "scatter", title: "3D", link: "words", metric: "euclidean", points: '[{"label":"cat","x":1,"y":2,"z":3},{"label":" dog","x":2,"y":1,"z":4}]' }] });
		const readout = await page.$eval('.k-panel:nth-child(2) .k-readout-line', el => el.textContent);
		await page.evaluate(async () => window.Plotly.relayout(document.querySelector('.js-plotly-plot'), { "scene.camera.eye": { x: 2, y: 1, z: .5 } }));
		await page.focus('.k-token'); await page.keyboard.press("ArrowRight");
		await page.waitForFunction(() => (document.querySelector('.js-plotly-plot') as any).data.some((trace: any) => trace.name === " dog"));
		assert.equal(await page.$eval('.k-panel:nth-child(2) .k-readout-line', el => el.textContent), readout);
		assert.equal(await page.$eval('.js-plotly-plot', el => (el as any).layout.scene.camera.eye.x), 2);
		await page.evaluate(() => (document.querySelector('.js-plotly-plot') as any).emit("plotly_hover", { points: [{ customdata: 0 }] }));
		assert.match(await page.$eval('.k-token.k-linked', el => el.getAttribute("aria-label") ?? ""), /“cat”/);
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 2, steps: 0 });
	} finally { await browser.close(); }
});

it("composed tokens and heatmap pass self-test and retain values and linked headers through theme messages and focus", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 });
		await mount(page, { ...spec, panels: panels.slice(0, 2).map(panel => ({ ...panel, link: "words", caption: "Read the values." })) });
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 2, steps: 0 });
		await page.$eval('input[aria-label="Scale"]', el => { el.value = ".4"; el.dispatchEvent(new Event("input")); });
		await page.click('[data-encoding="gpt2"]');
		await page.focus('.k-token'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
		assert.equal(await page.$eval('[role="columnheader"].k-linked', el => el.textContent), " dog");
		const values = () => page.evaluate(() => ({
			scale: document.querySelector<HTMLInputElement>('input[aria-label="Scale"]')!.value,
			text: document.querySelector('textarea')!.value,
			encoding: document.querySelector('[data-encoding][aria-pressed="true"]')!.getAttribute('data-encoding'),
			tokens: Array.from(document.querySelectorAll('.k-token'), el => el.getAttribute('aria-label')),
			matrix: Array.from(document.querySelectorAll('.k-heatmap-cell'), el => el.getAttribute('aria-label')),
			readout: document.querySelector('.k-readout-line')!.textContent,
			linked: document.querySelector('[role="columnheader"].k-linked')!.textContent,
			pinned: document.querySelector('.k-token-pinned')!.getAttribute('aria-label'),
		}));
		const before = await values();
		await page.evaluate(() => { (window as any).themeMessages = 0; window.addEventListener("lh-demo-theme", () => (window as any).themeMessages++); });
		await page.click('.k-panel .k-icon-button');
		await page.evaluate(() => window.postMessage({ type: "lh-demo-theme", vars: { "--lh-bg": "#ffffff", "--lh-text": "#111111", "--lh-muted": "#666666" } }, "*"));
		await page.waitForFunction(() => (window as any).themeMessages === 1 && getComputedStyle(document.documentElement).getPropertyValue('--lh-bg').trim() === '#ffffff');
		assert.deepEqual(await values(), before);
		await page.evaluate(() => window.postMessage({ type: "lh-demo-focus", panel: null }, "*")); await page.waitForFunction(() => !document.querySelector('.k-focus'));
		assert.deepEqual(await values(), before);
		assert.equal(await page.$eval('.k-token.k-linked', el => getComputedStyle(el).color), 'rgb(17, 17, 17)');
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 2, steps: 0 });
	} finally { await browser.close(); }
});

it("a sampling value bound to a demo parameter has one slider, the demo's, which drives the panel", { skip, timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		const sampling = panels[2] as Extract<DemoKitSpec["panels"][number], { type: "next_token" }>;
		await mount(page, { params: { temperature: { type: "slider", label: "Temperature", min: .1, max: 2, step: .1, value: 1 } }, panels: [{ ...sampling, temperature: "p.temperature" }] });
		const labels = () => page.$$eval(".k-label", els => els.map(el => el.firstChild?.textContent?.trim()));
		assert.deepEqual((await labels()).filter(text => text === "Temperature").length, 1);
		assert.ok((await labels()).includes("Top-k"), "unbound controls stay in the panel");
		const before = await page.$eval(".k-sampling-row", el => el.textContent);
		await page.$eval('.k-controls input[type="range"]', (el) => { (el as HTMLInputElement).value = "0.1"; el.dispatchEvent(new Event("input", { bubbles: true })); });
		await page.waitForFunction((text) => document.querySelector(".k-sampling-row")!.textContent !== text, {}, before);
		assert.match(await page.$eval(".k-sampling-row", el => el.textContent), /100\.0%|99\.\d%/);
	} finally { await browser.close(); }
});
