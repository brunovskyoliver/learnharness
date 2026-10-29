import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { it } from "node:test";
import puppeteer from "puppeteer-core";
import { withTokenizedPanels } from "../src/agent/tokenizer.ts";
import { kitDemoHtml } from "../src/core/demo-kit.ts";
import { injectDemoTheme } from "../src/core/demo-theme.ts";
const chrome = process.env.CHROME_PATH;
it("token panel renders real pieces, roving focus, encodings and downloaded read-only state", { skip: !chrome || !existsSync(chrome), timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		const html = injectDemoTheme(kitDemoHtml(await withTokenizedPanels({ panels: [{ type: "tokens", title: "Tokens", text: "hello 😀", encoding: "gpt2" }] })), true).replace('<script src="/demo-kit/runtime.js"></script>', "");
		await page.setContent(html);
		await page.addScriptTag({ content: readFileSync("public/demo-kit/runtime.js", "utf8") });
		await page.waitForSelector(".k-token");
		assert.deepEqual(await page.evaluate(() => window.__lhKit!.selfTest()), { errors: [], panels: 1, steps: 0 });
		assert.match(await page.$eval(".k-token-strip", e => e.textContent), /<0x80>/);
		assert.equal(await page.$$eval('.k-token[tabindex="0"]', e => e.length), 1);
		await page.focus(".k-token"); await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		await page.$eval(".k-token", e => { e.dispatchEvent(new Event("pointerenter")); e.dispatchEvent(new Event("pointerleave")); });
		assert.match(await page.$eval(".k-readout-line", e => e.textContent), /^Token 2 of/);
		await page.click('.k-seg button[data-encoding="cl100k"]');
		assert.equal(await page.$eval('.k-seg button[data-encoding="cl100k"]', e => e.getAttribute("aria-pressed")), "true");
		await page.waitForFunction(() => document.querySelector("textarea")?.readOnly);
		assert.match(await page.$eval(".k-token-offline", e => e.textContent), /Editing works in the app/);
		for (const width of [320,390,1440]) {
			await page.setViewport({ width, height: 900 });
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
		}
	} finally { await browser.close(); }
});
it("token edits debounce and reject stale, malformed and foreign replies while keeping the last good split", { skip: !chrome || !existsSync(chrome), timeout: 30000 }, async () => {
	const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent(injectDemoTheme(kitDemoHtml(await withTokenizedPanels({ panels: [{ type: "tokens", title: "Tokens", text: "hello" }] })), true).replace('<script src="/demo-kit/runtime.js"></script>', ""));
		await page.evaluate(() => {
			(window as any).requests = [];
			window.addEventListener("message", event => {
				if (event.data?.type === "demo-tokenize") {
					(window as any).requests.push(event.data);
					if ((window as any).requests.length === 1) window.postMessage({ type: "lh-demo-tokens", requestId: event.data.requestId, encoding: event.data.encoding, tokens: [{ id: 24912, text: "hello" }] }, "*");
				}
			});
		});
		await page.addScriptTag({ content: readFileSync("public/demo-kit/runtime.js", "utf8") });
		await page.waitForFunction(() => (window as any).requests.length === 1);
		const edit = (value: string) => page.$eval("textarea", (el, text) => { el.value = text; el.dispatchEvent(new Event("input")); }, value);
		await edit("first");
		assert.equal(await page.$eval(".k-token-count", e => e.textContent), "Updating…");
		assert.equal(await page.evaluate(() => (window as any).requests.length), 1);
		await page.waitForFunction(() => (window as any).requests.length === 2);
		await edit("second");
		await page.waitForFunction(() => (window as any).requests.length === 3);
		await page.evaluate(() => {
			const requests = (window as any).requests;
			window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "lh-demo-tokens", requestId: requests[2].requestId, encoding: requests[2].encoding, tokens: [{ id: 2, text: "second" }] } }));
			window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "lh-demo-tokens", requestId: requests[1].requestId, encoding: requests[1].encoding, tokens: [{ id: 1, text: "first" }] } }));
		});
		assert.match(await page.$eval(".k-token-strip", e => e.textContent), /second/);
		await edit("third"); await page.waitForFunction(() => (window as any).requests.length === 4);
		await page.evaluate(() => {
			const req = (window as any).requests[3];
			for (const [source, tokens] of [[null, [{ id: 3, text: "foreign" }]], [window, [{ id: -1, text: null }]]] as const) window.dispatchEvent(new MessageEvent("message", { source, data: { type: "lh-demo-tokens", requestId: req.requestId, encoding: req.encoding, tokens } }));
		});
		assert.match(await page.$eval(".k-token-strip", e => e.textContent), /second/);
		await page.evaluate(() => { const req = (window as any).requests[3]; window.postMessage({ type: "lh-demo-tokens", requestId: req.requestId, error: "unavailable" }, "*"); });
		await page.waitForFunction(() => !document.querySelector<HTMLElement>(".k-token-error")!.hidden);
		assert.equal(await page.$eval(".k-token-error", e => e.textContent), "Couldn't tokenize this text: unavailable. The last split stays shown.");
		await edit("a".repeat(2001));
		assert.equal(await page.$eval(".k-token-error", e => e.textContent), "2,000 characters at most. Shorten the text to split it.");
		assert.equal(await page.evaluate(() => (window as any).requests.length), 4);
	} finally { await browser.close(); }
});
