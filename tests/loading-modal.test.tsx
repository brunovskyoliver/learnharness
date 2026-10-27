import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { createRoot } from "react-dom/client";
import { LoadingModal } from "../components/loading-modal.tsx";

const { window, document } = parseHTML("<html><body><button id='trigger'>Open</button><div id='root'></div></body></html>");
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
let focused: Element | null = document.querySelector("#trigger");
Object.defineProperty(document, "activeElement", { get: () => focused });
Object.assign(window.HTMLElement.prototype, {
 focus(this: HTMLElement) { focused = this; },
 showModal(this: HTMLElement) { this.setAttribute("open", ""); this.querySelector("button")?.focus(); },
 close(this: HTMLElement) { this.removeAttribute("open"); },
});

test("temporary failure shell stays modal, closes with Escape, and restores the original trigger", async () => {
 const root = createRoot(document.querySelector("#root")!);
 const trigger = focused;
 let closes = 0, openedFrom: HTMLElement | null = null;
 document.body.style.overflow = "auto";
 await act(async () => root.render(<LoadingModal label="Connection" testid="loading" onOpen={(element) => { openedFrom = element; }} onClose={() => { closes++; }}>
  <p role="alert">The connection dialog could not load.</p><button onClick={() => { closes++; }}>Close</button>
 </LoadingModal>));
 assert.equal(openedFrom, trigger);
 assert.ok(document.querySelector("dialog[open]"));
 assert.equal(document.body.style.overflow, "hidden");
 assert.equal(focused?.textContent, "Close");
 const escape = new window.Event("keydown", { cancelable: true });
 Object.defineProperty(escape, "key", { value: "Escape" });
 document.dispatchEvent(escape);
 assert.equal(closes, 1);
 assert.equal(escape.defaultPrevented, true);
 await act(async () => root.unmount());
 assert.equal(document.body.style.overflow, "auto");
 assert.equal(focused, trigger);
});
