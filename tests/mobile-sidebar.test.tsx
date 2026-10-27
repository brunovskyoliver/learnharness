import React, { act, useContext } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { createRoot } from "react-dom/client";
import MobileSidebar from "../components/mobile-sidebar.tsx";
import { MenuPortalContext } from "../components/menu-shell.tsx";

const { window, document } = parseHTML('<html><body><button aria-label="Open sidebar">Open</button><div id="root"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
let focused: Element | null = document.querySelector("button");
Object.defineProperty(document, "activeElement", { get: () => focused });
Object.assign(window.HTMLElement.prototype, {
	focus(this: HTMLElement) { focused = this; },
	showModal(this: HTMLElement) { this.setAttribute("open", ""); },
	close(this: HTMLElement) { this.removeAttribute("open"); },
});
let menuHost: HTMLElement | null = null;
function ChildMenu() { menuHost = useContext(MenuPortalContext); return <button>Session menu</button>; }

test("mobile navigation uses native modality, retains menu ownership, and restores focus/body scrolling", async () => {
	const root = createRoot(document.querySelector("#root")!);
	let closes = 0;
	const render = (hasMenu: boolean) => <MobileSidebar width={400} hasMenu={hasMenu} onClose={() => { closes++; }}><ChildMenu /></MobileSidebar>;
	document.body.style.overflow = "auto";
	await act(async () => root.render(render(false)));
	const dialog = document.querySelector("dialog")!;
	const panel = document.querySelector<HTMLElement>("[data-mobile-navigation]")!;
	assert.ok(dialog.hasAttribute("open"));
	assert.equal(dialog.getAttribute("aria-modal"), "true");
	assert.equal(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent, "Sessions");
	assert.equal(menuHost, dialog, "portaled menus stay inside the browser's modal top layer");
	assert.equal(panel.style.width, "320px");
	assert.equal(panel.style.maxWidth, "calc(100vw - 3rem)");
	assert.equal(focused, panel);
	assert.equal(document.body.style.overflow, "hidden");
	const escape = () => { const event = new window.Event("keydown", { bubbles: true, cancelable: true }); Object.defineProperty(event, "key", { value: "Escape" }); panel.dispatchEvent(event); return event; };
	assert.equal(escape().defaultPrevented, true);
	assert.equal(closes, 1);
	await act(async () => root.render(render(true)));
	assert.equal(escape().defaultPrevented, true, "the active menu receives Escape without a native modal cancellation");
	const cancel = new window.Event("cancel", { bubbles: true, cancelable: true });
	dialog.dispatchEvent(cancel);
	assert.equal(cancel.defaultPrevented, true);
	assert.equal(closes, 1, "browser Escape cannot close navigation beneath a menu");
	dialog.firstElementChild!.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
	assert.equal(closes, 2);
	await act(async () => root.unmount());
	assert.equal(document.body.style.overflow, "auto");
	assert.equal(focused, document.querySelector('[aria-label="Open sidebar"]'));
});

test("delete confirmation stays inside native navigation and Escape leaves the drawer open", async () => {
	const { DeleteSessionDialog } = await import("../components/delete-session-dialog.tsx");
	const root = createRoot(document.querySelector("#root")!);
	let closes = 0, dismissals = 0;
	const chat = { id: "review-delete", title: "Review deletion" };
	const render = (deleting: boolean) => <MobileSidebar width={256} hasMenu={deleting} onClose={() => { closes++; }}>
		<input data-testid="session-search" />
		<DeleteSessionDialog chat={deleting ? chat : null} onClose={() => { dismissals++; }} onDeleted={() => assert.fail("must not delete a session")} />
	</MobileSidebar>;
	await act(async () => root.render(render(false)));
	await act(async () => root.render(render(true)));
	const confirmation = document.querySelector('[data-testid="delete-session-dialog"]')!;
	assert.equal(confirmation.closest("dialog"), document.querySelector("dialog"));
	assert.equal(focused, document.querySelector('[data-testid="delete-cancel"]'));
	const event = new window.Event("keydown", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "key", { value: "Escape" });
	await act(async () => focused!.dispatchEvent(event));
	assert.equal(dismissals, 1);
	assert.equal(closes, 0, "confirmation owns the first Escape");
	await act(async () => root.render(render(false)));
	assert.ok(document.querySelector("dialog")?.hasAttribute("open"));
	await act(async () => root.unmount());
});
