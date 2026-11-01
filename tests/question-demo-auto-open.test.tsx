import React, { act, useContext } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";

const dom = parseHTML("<html><body></body></html>");
const saved = new Map<string, string>();
Object.assign(dom.window, { localStorage: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } } });
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;

const { SessionAccountContext } = await import("../components/session-state.tsx");
const { SessionStateStore } = await import("../components/session-state-store.ts");
const { PagePaneProvider } = await import("../components/library/page-pane-context.tsx");
const { PagePaneContext } = await import("../components/workspace/pane-context.ts");
const { useQuestionDemoAutoOpen } = await import("../components/question-demo-auto-open.ts");

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Mounts the question and the provider in one commit, as a client render of the page does:
 *  the child's effect runs before the provider has restored the saved page. */
async function mount(savedPage: boolean) {
	saved.clear();
	if (savedPage) {
		const store = new SessionStateStore("a", "__page-pane", () => dom.window.localStorage as never);
		store.set("open", { id: "item_1", name: "Waves", kind: "page", size: 1 });
		store.flush();
	}
	const opens: string[] = [];
	const items: (string | null)[] = [];
	function Question() {
		const pane = useContext(PagePaneContext);
		items.push(pane?.item?.id ?? null);
		useQuestionDemoAutoOpen("call_1", { id: "demo_1" }, (id) => { opens.push(id); pane?.close(); });
		return null;
	}
	const container = dom.document.createElement("div");
	const root = createRoot(container);
	await act(async () => {
		root.render(<SessionAccountContext.Provider value="a"><PagePaneProvider><Question /></PagePaneProvider></SessionAccountContext.Provider>);
		await tick();
	});
	await act(async () => { await tick(); });
	root.unmount();
	return { opens, lastItem: items.at(-1) };
}

test("a saved page restored in the same commit keeps the pane: the question's demo stays closed", async () => {
	globalThis.fetch = originalFetch;
	const { opens, lastItem } = await mount(true);
	assert.deepEqual(opens, [], "the automatic open waits for the restore, and then respects the page");
	assert.equal(lastItem, "item_1", "the saved page is still open");
});

test("with no saved page the question's demo opens, once", async () => {
	const { opens } = await mount(false);
	assert.deepEqual(opens, ["demo_1"]);
});
