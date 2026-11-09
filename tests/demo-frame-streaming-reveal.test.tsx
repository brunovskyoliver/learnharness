/** The cold-load plot remount (specs/024-instant-loads research R4).
 *
 *  Cause: the chat page streams its transcript, so the server HTML of each
 *  demo card is parsed into a hidden `<div hidden id="S:0">` segment and then
 *  moved into place by React's reveal script; on a slow first load the shell
 *  can also hydrate first, and a mount-time provider update makes React
 *  replace the still-dehydrated boundary with a client render. A server-
 *  rendered `srcdoc` started each frame inside the hidden segment, and every
 *  move or replacement of an iframe reloads its document: plot libraries were
 *  fetched and cancelled twice and `demo-ready` fired up to twice per plot.
 *
 *  Fix pinned here: the server HTML has the frame but no document, and the
 *  client sets the srcdoc once, after the card has committed in place; a
 *  re-render with the same demo never replaces it. */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { it } from "node:test";
import { parseHTML } from "linkedom";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { DemoFrame } from "../components/artifacts/demo-card.tsx";
import { kitDemoHtml } from "../src/core/demo-kit-document.ts";

const html = kitDemoHtml({ panels: [{ type: "note", text: "streamed" }] } as never);

it("server HTML carries the sandboxed frame without a document", () => {
	const markup = renderToString(<DemoFrame title="Streamed" html={html} />);
	const frame = /<iframe[^>]*>/.exec(markup)?.[0] ?? "";
	assert.match(frame, /sandbox="allow-scripts"/);
	assert.match(frame, /data-testid="demo-iframe"/);
	assert.doesNotMatch(frame, /srcdoc/i, "a server srcdoc starts the frame inside the hidden streamed segment");
	assert.doesNotMatch(markup, /\/demo-kit\/runtime\.js/);
});

it("after hydration the srcdoc is set once and survives re-renders of the same demo", async () => {
	const markup = renderToString(<DemoFrame title="Streamed" html={html} />);
	const { window, document } = parseHTML(`<html><body><div id="root">${markup}</div></body></html>`);
	const requests: string[] = [];
	const fetcher = async (url: string) => { requests.push(url); return new Response("window.__kit=1"); };
	Object.assign(globalThis, {
		window, document, HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, IS_REACT_ACT_ENVIRONMENT: true,
		fetch: fetcher,
		getComputedStyle: () => ({ getPropertyValue: () => "", overflowY: "visible" }),
		MutationObserver: class { observe() {} disconnect() {} },
	});
	Object.assign(window, { getComputedStyle: globalThis.getComputedStyle, fetch: fetcher });
	Object.assign(window.HTMLElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 360, right: 600, bottom: 360 }) });

	const writes: string[] = [];
	const frame = () => document.querySelector("iframe")!;
	const serverFrame = frame();
	const proto = Object.getPrototypeOf(serverFrame) as object;
	const setAttribute = window.Element.prototype.setAttribute;
	Object.defineProperty(proto, "srcdoc", { configurable: true, get() { return this.getAttribute("srcdoc"); }, set(value: string) { writes.push(value); setAttribute.call(this, "srcdoc", value); } });
	window.Element.prototype.setAttribute = function (this: Element, name: string, value: string) { if (name.toLowerCase() === "srcdoc" && this.tagName === "IFRAME") writes.push(value); return setAttribute.call(this, name, value); };

	const root = await act(async () => hydrateRoot(document.querySelector("#root")!, <DemoFrame title="Streamed" html={html} />));
	await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
	assert.equal(frame(), serverFrame, "hydration keeps the server's frame element");
	assert.equal(writes.length, 1, "one document per frame");
	assert.match(writes[0]!, /window\.__kit=1/, "the kit runtime arrives inline");
	assert.doesNotMatch(writes[0]!, /\/demo-kit\//);

	await act(async () => root.render(<DemoFrame title="Streamed again" html={`${html}`} />));
	await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
	assert.equal(frame(), serverFrame);
	assert.equal(writes.length, 1, "a re-render with the same demo never replaces the document");
	assert.deepEqual(requests.map((url) => url.replace(/\?v=.*/, "")), ["/demo-kit/runtime.js"]);
	await act(async () => root.unmount());
});
