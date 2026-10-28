import assert from "node:assert/strict";
import { waitForStableTranscript } from "./check-turn-navigation-ui.mjs";

/** Feed timed native wire events through the real reattach/renderer path.
 * Everything is browser-local; no model or production service is invoked. */
export async function checkStreamingUi(page, base, record) {
	await page.evaluateOnNewDocument(() => {
		const Original = window.EventSource;
		window.EventSource = class extends Original {
			constructor(...args) { super(...args); if (String(args[0]).includes("/api/events")) window.testEventSource = this; }
		};
	});
	await page.setViewport({ width: 1440, height: 1000 });
	const reset = await page.evaluateOnNewDocument((id) => { if (window === window.top) localStorage.removeItem(`lh:session-ui:v1:local:${id}`); }, record.id);
	await page.goto(`${base}/chat/${record.id}`, { waitUntil: "domcontentloaded" });
	// The root event connection can open before selective Chat hydration.
	// Require Chat's own live input handler before dispatching fixture events.
	// An idle SSE sends its first heartbeat at 25s, so OPEN needs that bound.
	await page.waitForFunction((id) => {
		const chat = document.querySelector('[data-chat-id]');
		const field = chat?.querySelector('[data-testid="composer"] textarea');
		const props = field && Object.keys(field).find((key) => key.startsWith("__reactProps$"));
		return chat?.dataset.chatId === id && typeof field?.[props]?.onChange === "function" && window.testEventSource?.readyState === EventSource.OPEN;
	}, { timeout: 30000 }, record.id);
	await waitForStableTranscript(page);
	await page.removeScriptToEvaluateOnNewDocument(reset.identifier);
	await page.evaluate((initial) => {
		const originalFetch = window.fetch.bind(window);
		window.testRecord = initial;
		window.testStream = null;
		window.fetch = async (input, init) => {
			const url = new URL(typeof input === "string" ? input : input.url ?? String(input), location.href);
			if (url.pathname === `/api/chats/${initial.id}`) return Response.json(window.testRecord);
			if (url.pathname === `/api/chats/${initial.id}/stream`) {
				return new Response(new ReadableStream({ start(controller) { window.testStream = controller; } }), { headers: { "Content-Type": "text/event-stream" } });
			}
			return originalFetch(input, init);
		};
		window.writeWire = (event) => window.testStream.enqueue(new TextEncoder().encode(`data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`));
	}, record);
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const begin = async (id) => {
		await page.evaluate((id) => {
			window.testStream = null;
			window.testAssistant = { ...window.testRecord.messages.filter((message) => message.role === "assistant").at(-1), id, content: [{ type: "text", text: "" }], stopReason: "stop" };
			window.testEventSource.dispatchEvent(new MessageEvent("turn-started", { data: JSON.stringify({ chatId: window.testRecord.id }) }));
		}, id);
		await page.waitForFunction(() => !!window.testStream);
		await page.evaluate(() => window.writeWire({ type: "message_start", message: window.testAssistant }));
	};
	const write = async (source) => {
		await page.evaluate((source) => {
			window.testAssistant = { ...window.testAssistant, content: [{ type: "text", text: source }] };
			window.writeWire({ type: "message_update", message: window.testAssistant });
		}, source);
		await wait(70);
	};
	const answerText = (id) => page.$eval(`[data-source-message-id="${id}"]`, (element) => element.innerText);
	const finish = async () => {
		await page.evaluate(() => {
			window.testRecord = { ...window.testRecord, messages: [...window.testRecord.messages, window.testAssistant] };
			window.writeWire({ type: "message_end", message: window.testAssistant });
			window.writeWire({ type: "agent_end", messages: [] });
			window.writeWire("[DONE]");
			window.testStream.close();
		});
	};
	const scrollerPosition = () => page.evaluate(() => {
		let main = document.querySelector('[data-testid="dock-spacer"]').parentElement;
		while (main && !/auto|scroll/.test(getComputedStyle(main).overflowY)) main = main.parentElement;
		window.streamScroller = main;
		return main.scrollTop;
	});
	await begin("stream_reading_1");
	await write("An unfinished **paragraph");
	assert.equal((await answerText("stream_reading_1")).trim(), "");
	let source = "A completed paragraph.\n\n```python\nx = 1\n";
	await write(source);
	assert.match(await answerText("stream_reading_1"), /A completed paragraph/);
	assert.ok(!(await answerText("stream_reading_1")).includes("x = 1"));
	source += "```\n\n$$\nx^2";
	await write(source);
	assert.ok(await page.$('[data-source-message-id="stream_reading_1"] [data-testid="md-code"]'));
	assert.equal(await page.$('[data-source-message-id="stream_reading_1"] .katex'), null);
	source += "\n$$\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
	await write(source);
	assert.ok(await page.$('[data-source-message-id="stream_reading_1"] .katex'));
	assert.equal(await page.$('[data-source-message-id="stream_reading_1"] table'), null);
	source += "\n\n- First item\n- Second item";
	await write(source);
	assert.ok(await page.$('[data-source-message-id="stream_reading_1"] table'));
	assert.equal(await page.$('[data-source-message-id="stream_reading_1"] ul'), null);
	source += "\n\nFinal conclusion.";
	await write(source);
	assert.ok(await page.$('[data-source-message-id="stream_reading_1"] ul'));
	assert.ok(!(await answerText("stream_reading_1")).includes("Final conclusion"));
	await finish();
	await page.waitForFunction(() => document.querySelector('[data-source-message-id="stream_reading_1"]').innerText.includes("Final conclusion"));
	await wait(500);
	await scrollerPosition();
	let aligned = await page.evaluate(() => document.querySelector('[data-source-message-id="stream_reading_1"]').getBoundingClientRect().top - window.streamScroller.getBoundingClientRect().top);
	assert.ok(Math.abs(aligned - 16) < 2, `completed answer starts below the top row: ${aligned}`);
	await wait(650);
	aligned = await page.evaluate(() => document.querySelector('[data-source-message-id="stream_reading_1"]').getBoundingClientRect().top - window.streamScroller.getBoundingClientRect().top);
	assert.ok(Math.abs(aligned - 16) < 2, `bottom-follow stays detached after answer alignment: ${aligned}`);
	console.log("PASS atomic paragraphs/code/math/tables/lists and completion alignment");

	// Start another turn while following, then deliberately leave its tail.
	await page.click('[aria-label="Scroll to latest"]');
	await page.waitForFunction(() => window.streamScroller.scrollHeight - window.streamScroller.clientHeight - window.streamScroller.scrollTop < 2);
	await begin("stream_reading_2");
	await write("Another completed paragraph.\n\nA final unfinished paragraph");
	await wait(350);
	const beforeWheel = await scrollerPosition();
	const bounds = await page.evaluate(() => { const box = window.streamScroller.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + 80 }; });
	await page.mouse.move(bounds.x, bounds.y);
	await page.mouse.wheel({ deltaY: -300 });
	await wait(250);
	const before = await scrollerPosition();
	assert.ok(before < beforeWheel - 1, `the wheel actually leaves the live tail: ${beforeWheel} -> ${before}`);
	await finish();
	await wait(500);
	const after = await scrollerPosition();
	assert.ok(Math.abs(after - before) <= 1, `completion preserves a reader's position: ${before} -> ${after}`);
	console.log("PASS completion leaves earlier reading undisturbed");
}
