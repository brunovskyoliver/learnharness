import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { it } from "node:test";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "react-dom/server";
import { chatUsesNativeTraversal, mlResultKeepsNativeEnter } from "../components/enter-submits.ts";
import { Chat } from "../components/chat.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { buildSubagentSteer, kitDemoHtml, type LhMessage } from "../src/core/index.ts";

it("permits native traversal only when the mounted chat has ML results", () => {
	for (const marked of [false, true]) {
		const { document } = parseHTML(`<html><body><div data-chat-id="review" ${marked ? 'data-chat-ml-lab=""' : ""}></div></body></html>`);
		assert.equal(chatUsesNativeTraversal(document), marked);
	}
});

it("native result Enter is limited to keyboard focus on ML summaries or page citations", () => {
	for (const [markup, expected] of [
		['<details data-testid="lookup-row"><summary>Hub model</summary></details>', true],
		['<details data-testid="tool-call-card" data-tool="ml_visual"><summary>Failed panel</summary></details>', true],
		['<details data-testid="tool-call-card" data-tool="tokenize"><summary>Tokenizer</summary></details>', true],
		['<div class="lh-prose"><a href="https://arxiv.org/pdf/p#page=4">Paper p. 4</a></div>', true],
		['<details data-testid="lookup-row" data-tool="paper_read"><a href="https://arxiv.org/pdf/p#page=4">p. 4</a></details>', true],
		['<details data-testid="math-check-card"><summary>Math</summary></details>', false],
		['<details data-testid="tool-call-card" data-tool="read"><summary>Read</summary></details>', false],
		['<div class="lh-prose"><a href="https://huggingface.co/gpt2">Model</a></div>', false],
	] as const) {
		for (const keyboard of [false, true]) {
			const { document } = parseHTML(`<html><body><div data-chat-ml-lab>${markup}</div></body></html>`);
			const target = document.querySelector("summary,a")! as unknown as HTMLElement;
			const matches = target.matches.bind(target);
			target.matches = selector => selector === ":focus-visible" ? keyboard : matches(selector);
			assert.equal(mlResultKeepsNativeEnter(target), keyboard && expected, `${markup}/${keyboard}`);
			document.querySelector("[data-chat-ml-lab]")!.removeAttribute("data-chat-ml-lab");
			assert.equal(mlResultKeepsNativeEnter(target), false);
		}
	}
});

const renderChat = (messages: LhMessage[]) => renderToStaticMarkup(<ServerEventsProvider><Chat chatId="keyboard-test" title="Keyboard" initialMessages={messages} /></ServerEventsProvider>);
it("marks all six completed ML tool kinds while ordinary and merely pending calls stay unchanged", () => {
	for (const name of ["ml_visual", "tokenize", "hub_model", "hub_search", "paper_search", "paper_read", "plot", "read"]) {
		const messages = [{id:"a",role:"assistant",content:[{type:"toolCall",id:"c",name,arguments:{}}],timestamp:1}] as LhMessage[];
		assert.doesNotMatch(renderChat(messages), /data-chat-ml-lab/);
		messages.push({id:"r",role:"toolResult",toolName:name,toolCallId:"c",content:[{type:"text",text:"Unavailable"}],isError:true,timestamp:2} as LhMessage);
		assert.equal(renderChat(messages).includes("data-chat-ml-lab"), !["plot","read"].includes(name));
	}
});
it("marks composed ML demos while ordinary kit demos retain the existing traversal", () => {
	for (const type of ["tokens", "heatmap", "scatter", "network", "next_token", "shapes", "plot3d"]) {
		const steer = buildSubagentSteer({id:"job",kind:"demo",toolCallId:"call"},{title:"Composition",html:kitDemoHtml({panels:[{type} as never]}),tested:true});
		assert.equal(renderChat([steer as never]).includes("data-chat-ml-lab"), type !== "plot3d");
	}
});
