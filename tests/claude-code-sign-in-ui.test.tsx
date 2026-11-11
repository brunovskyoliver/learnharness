import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import type { ClaudeCodeAuthStatus } from "../src/core/contracts/claude-code.ts";

// Feature 029, T064 (US2b): the hosted sign-in row and dialog against a
// mocked /api/claude-code/auth (contracts/http.md), in hosted and local Settings.

const dom = parseHTML("<html><body></body></html>");
Object.assign(dom.window.HTMLElement.prototype, { showModal(this: HTMLElement) { this.setAttribute("open", ""); }, close(this: HTMLElement) { this.removeAttribute("open"); } });
Object.assign(globalThis, {
	window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, CustomEvent: dom.window.CustomEvent,
	Node: dom.window.Node, HTMLInputElement: dom.window.HTMLInputElement, HTMLFormElement: dom.window.HTMLFormElement, MutationObserver: dom.window.MutationObserver,
	NodeFilter: { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_SKIP: 3 }, getComputedStyle: () => ({ display: "block", visibility: "visible" }),
	localStorage: { getItem: () => null, setItem() {} }, IS_REACT_ACT_ENVIRONMENT: true,
});
const { SettingsDialogProvider } = await import("../components/settings/settings-dialog.tsx");
const { ClaudeCodeInstallationStatus } = await import("../components/settings/claude-code-status.tsx");
const { signInStatusLabel } = await import("../components/settings/claude-code-sign-in.tsx");
const { onSettingsSaved } = await import("../components/settings-signal.ts");

const originalFetch = globalThis.fetch;
const originalFocus = HTMLElement.prototype.focus;
let root: Root | undefined, host: HTMLDivElement | undefined;
const SIGNED_OUT: ClaudeCodeAuthStatus = { state: "signed-out", method: null, expiresAt: null };
const SIGNED_IN: ClaudeCodeAuthStatus = { state: "signed-in", method: "claude-subscription", expiresAt: "2026-12-12T08:00:00.000Z" };
const PENDING = { method: "claudeai", url: "https://claude.com/cai/oauth/authorize?code=true&state=fake", expiresAt: new Date(Date.now() + 600_000).toISOString() };
const CODE = "fake-code#fake-state";

type Reply = { status: number; body: unknown } | "hang";
type Calls = { url: string; method: string; body: Record<string, unknown> | null }[];
function fixture(script: { auth?: () => ClaudeCodeAuthStatus; post?: (body: Record<string, unknown>) => Reply }) {
	const calls: Calls = [];
	let auth = script.auth ?? (() => SIGNED_OUT);
	globalThis.fetch = (async (input, init) => {
		const url = String(input), method = init?.method ?? "GET";
		const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
		calls.push({ url, method, body });
		if (url === "/api/settings") return Response.json({ settings: { version: 1, claudeCode: { enabled: true } } });
		if (url === "/api/claude-code") return Response.json({ state: "meets-minimum", version: "2.1.321", minimumVersion: "2.1.259" });
		if (url === "/api/claude-code/auth") {
			assert.equal(new Headers(init?.headers).get("x-learnharness-claude-code"), "1");
			assert.equal(init?.cache, "no-store");
			if (method === "GET") return Response.json({ auth: auth(), pending: null });
			const reply = script.post?.(body!) ?? { status: 200, body: { pending: null } };
			if (reply === "hang") return new Promise<Response>(() => {});
			if (reply.status === 200 && reply.body && typeof reply.body === "object" && "auth" in reply.body) { const next = (reply.body as { auth: ClaudeCodeAuthStatus }).auth; auth = () => next; }
			return Response.json(reply.body, { status: reply.status });
		}
		return Response.json({ error: "not in this test" }, { status: 404 });
	}) as typeof fetch;
	return calls;
}
/** Records focus() calls and makes document.activeElement follow them (linkedom keeps no focus). */
function trackFocus() {
	const focused: HTMLElement[] = [];
	HTMLElement.prototype.focus = function () { focused.push(this); };
	Object.defineProperty(document, "activeElement", { configurable: true, get: () => focused.at(-1) ?? null });
	return focused;
}
const byTest = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const status = () => byTest("claude-code-sign-in-status")?.textContent;
async function flush() { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((done) => setTimeout(done, 0)); }); }
async function mount(hosted = true) {
	host = document.createElement("div"); document.body.append(host); root = createRoot(host);
	await act(async () => root!.render(<SettingsDialogProvider hosted={hosted}><ClaudeCodeInstallationStatus /></SettingsDialogProvider>));
	await flush();
}
async function click(el: HTMLElement | null) { assert(el, "element present"); await act(async () => el.click()); await flush(); }
async function typeCode(value: string) {
	const input = byTest("claude-code-sign-in-code") as HTMLInputElement;
	await act(async () => { input.value = value; input.dispatchEvent(new window.Event("input", { bubbles: true })); });
}
async function submit() {
	await act(async () => { byTest("claude-code-sign-in-code-step")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
	await flush();
}
async function escape() {
	const event = new window.Event("keydown", { bubbles: true, cancelable: true });
	Object.assign(event, { key: "Escape" });
	await act(async () => { document.dispatchEvent(event); });
	await flush();
}
async function toCodeStep() {
	byTest("claude-code-sign-in")!.focus(); // a real click focuses the opener
	await click(byTest("claude-code-sign-in"));
	assert(byTest("claude-code-sign-in-dialog"), "dialog open");
	await click(byTest("claude-code-sign-in-continue"));
	assert(byTest("claude-code-sign-in-code"), "code step");
}
afterEach(async () => {
	await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined;
	document.body.innerHTML = "";
	globalThis.fetch = originalFetch; HTMLElement.prototype.focus = originalFocus;
	delete (document as unknown as Record<string, unknown>).activeElement;
});

test("status words follow the owner's copy (O1)", () => {
	assert.equal(signInStatusLabel({ kind: "checking" }), "Checking…");
	assert.equal(signInStatusLabel({ kind: "failed" }), "Sign-in status could not be checked");
	assert.equal(signInStatusLabel({ kind: "known", auth: { state: "unchecked", method: null, expiresAt: null } }), "Sign-in status could not be checked");
	assert.equal(signInStatusLabel({ kind: "known", auth: SIGNED_OUT }), "Signed out");
	assert.equal(signInStatusLabel({ kind: "known", auth: { ...SIGNED_IN, expiresAt: null } }), "Signed in · Claude subscription");
	assert.equal(signInStatusLabel({ kind: "known", auth: { state: "signed-in", method: "console", expiresAt: null } }), "Signed in · Anthropic Console");
	assert.equal(signInStatusLabel({ kind: "known", auth: { state: "signed-in", method: "other", expiresAt: null } }), "Signed in");
	assert.equal(signInStatusLabel({ kind: "known", auth: { ...SIGNED_IN, expiresAt: "2026-12-12T12:00:00.000Z" } }), "Signed in · Claude subscription · until 12 Dec");
});

test("hosted: the O2 guidance replaces the terminal paragraph, and a signed-out user sees Sign in", async () => {
	const calls = fixture({});
	await mount();
	const text = byTest("claude-code-installation")!.textContent!;
	assert.match(text, /Sign in with your own Claude account\. Your usage is billed to that account\./);
	assert.match(text, /Claude Code controls billing\. Requires v2\.1\.259\+\./);
	assert.doesNotMatch(text, /Install and authenticate|Setup|Checks installation/);
	assert.equal(byTest("claude-code-sign-in-row")!.querySelector(".nb-set-row-label")!.textContent, "Claude account");
	assert.equal(status(), "Signed out");
	const action = byTest("claude-code-sign-in")!;
	assert.equal(action.textContent, "Sign in"); assert.equal(action.getAttribute("data-variant"), "outline");
	assert.equal(calls.filter((c) => c.url === "/api/claude-code/auth").length, 1);
});

test("full flow: method, Anthropic link, code, signed in; the signal fires and status is re-read", async () => {
	const signals: string[] = [];
	const off = onSettingsSaved((section) => signals.push(section));
	const focused = trackFocus();
	const calls = fixture({ post: (body) => body.action === "start" ? { status: 200, body: { pending: PENDING } }
		: body.action === "code" ? { status: 200, body: { auth: SIGNED_IN, pending: null } } : { status: 200, body: { pending: null } } });
	try {
		await mount();
		await click(byTest("claude-code-sign-in"));
		const dialog = byTest("claude-code-sign-in-dialog")!;
		assert.equal(dialog.querySelector(".lh-dialog-title")!.textContent, "Sign in to Claude Code");
		const radios = [...dialog.querySelectorAll('[role="radio"]')];
		assert.deepEqual(radios.map((r) => r.textContent), ["Claude subscriptionPro or Max plan", "Anthropic ConsoleAPI usage billing"]);
		assert(dialog.querySelector('[role="radiogroup"]'));
		assert.equal(radios[0]!.getAttribute("aria-checked"), "true");
		await click(radios[1] as HTMLElement);
		await click(byTest("claude-code-sign-in-continue"));
		assert.deepEqual(calls.find((c) => c.body?.action === "start")?.body, { action: "start", method: "console" });
		const link = byTest("claude-code-sign-in-link") as HTMLAnchorElement;
		assert.equal(link.getAttribute("href"), PENDING.url); assert.equal(link.getAttribute("target"), "_blank"); assert.equal(link.getAttribute("rel"), "noreferrer");
		assert.equal(focused.at(-1), link, "the code step focuses Anthropic's link first");
		assert.match(dialog.textContent!, /Open Anthropic's sign-in page, sign in, then paste the code it shows\./);
		const input = byTest("claude-code-sign-in-code") as HTMLInputElement;
		// React writes these with their camelCase names (HTML attributes are case-insensitive; linkedom is not).
		const attr = (name: string) => input.getAttribute(name) ?? input.getAttribute(name.toLowerCase());
		assert.equal(attr("autoComplete"), "off"); assert.equal(attr("spellCheck"), "false"); assert.equal(attr("autoCapitalize"), "off");
		assert.match(input.className, /nb-set-input/);
		assert.equal(dialog.querySelector(`label[for="${input.id}"]`)!.textContent, "Code");
		assert.equal(byTest("claude-code-sign-in-submit")!.hasAttribute("disabled"), true, "Sign in waits for a code");
		await typeCode(CODE);
		assert.equal(byTest("claude-code-sign-in-submit")!.hasAttribute("disabled"), false);
		await submit();
		assert.deepEqual(calls.find((c) => c.body?.action === "code")?.body, { action: "code", code: CODE });
		assert(calls.every((c) => !c.url.includes(CODE)), "the code never rides a URL");
		assert.equal(byTest("claude-code-sign-in-dialog"), null, "success closes the dialog");
		assert.equal(status(), "Signed in · Claude subscription · until 12 Dec");
		assert.equal(byTest("claude-code-sign-out")!.textContent, "Sign out");
		assert.equal(byTest("claude-code-sign-out")!.getAttribute("data-variant"), "ghost");
		assert(signals.includes("claudeCode"), "the settings signal fires (O6)");
		assert.equal(calls.filter((c) => c.url === "/api/claude-code/auth" && c.method === "GET").length, 2, "status is re-read after sign-in");
		assert(!document.body.innerHTML.includes(CODE), "the code is gone from the page");
	} finally { off(); }
});

test("a wrong code shows the server's message; Start again returns to the method step", async () => {
	const failure = "Sign-in failed: That code wasn't accepted. It may be incomplete, expired, already used, or from an earlier sign-in attempt. Sign in again to get a new code.";
	fixture({ post: (body) => body.action === "start" ? { status: 200, body: { pending: PENDING } } : body.action === "code" ? { status: 422, body: { error: failure } } : { status: 200, body: { pending: null } } });
	await mount(); await toCodeStep();
	await typeCode(CODE); await submit();
	const alert = byTest("claude-code-sign-in-error")!;
	assert.equal(alert.getAttribute("role"), "alert"); assert.match(alert.textContent!, /That code wasn't accepted/);
	assert.match(alert.className, /text-red/);
	assert.equal((byTest("claude-code-sign-in-code") as HTMLInputElement).value, "", "the field is emptied on submit");
	await click(byTest("claude-code-sign-in-restart"));
	assert(byTest("claude-code-sign-in-continue"), "back at step 1");
	assert.equal(status(), "Signed out");
});

test("an empty or invalid paste keeps the pending sign-in (no Start again)", async () => {
	fixture({ post: (body) => body.action === "start" ? { status: 200, body: { pending: PENDING } } : body.action === "code" ? { status: 400, body: { error: "Paste the code from Anthropic's page." } } : { status: 200, body: { pending: null } } });
	await mount(); await toCodeStep();
	await typeCode("nohash"); await submit();
	assert.match(byTest("claude-code-sign-in-error")!.textContent!, /Paste the code from Anthropic's page\./);
	assert.equal(byTest("claude-code-sign-in-restart"), null);
	assert(byTest("claude-code-sign-in-code"));
});

test("409 reads 'This sign-in expired. Start again.'", async () => {
	fixture({ post: (body) => body.action === "start" ? { status: 200, body: { pending: PENDING } } : body.action === "code" ? { status: 409, body: { error: "This sign-in expired. Start again." } } : { status: 200, body: { pending: null } } });
	await mount(); await toCodeStep();
	await typeCode(CODE); await submit();
	assert.match(byTest("claude-code-sign-in-error")!.textContent!, /^This sign-in expired\. Start again\./);
	assert(byTest("claude-code-sign-in-restart"));
	assert.equal(byTest("claude-code-sign-in-submit")!.hasAttribute("disabled"), true);
});

test("a start that fails shows the server's refusal on step 1", async () => {
	fixture({ post: (body) => body.action === "start" ? { status: 502, body: { error: "Sign-in could not be started." } } : { status: 200, body: { pending: null } } });
	await mount();
	await click(byTest("claude-code-sign-in"));
	await click(byTest("claude-code-sign-in-continue"));
	assert.equal(byTest("claude-code-sign-in-error")!.textContent, "Sign-in could not be started.");
	assert(byTest("claude-code-sign-in-continue"));
});

test("Escape cancels the pending sign-in, closes the dialog and returns focus to Sign in", async () => {
	const focused = trackFocus();
	const calls = fixture({ post: (body) => body.action === "start" ? { status: 200, body: { pending: PENDING } } : { status: 200, body: { pending: null } } });
	await mount(); await toCodeStep();
	await typeCode(CODE);
	await escape();
	assert.equal(byTest("claude-code-sign-in-dialog"), null);
	assert.deepEqual(calls.at(-1)?.body, { action: "cancel" });
	assert(calls.every((c) => !JSON.stringify(c.body ?? {}).includes(CODE)), "a cancelled code is never sent");
	await flush();
	assert.equal(focused.at(-1), byTest("claude-code-sign-in"), "focus returns to the opener");
	await click(byTest("claude-code-sign-in"));
	await click(byTest("claude-code-sign-in-continue"));
	assert.equal((byTest("claude-code-sign-in-code") as HTMLInputElement).value, "", "the code is not kept across openings");
});

test("Escape is held while a code is being checked", async () => {
	fixture({ post: (body) => body.action === "start" ? { status: 200, body: { pending: PENDING } } : body.action === "code" ? "hang" : { status: 200, body: { pending: null } } });
	await mount(); await toCodeStep();
	await typeCode(CODE); await submit();
	assert.equal(byTest("claude-code-sign-in-dialog")!.getAttribute("aria-busy"), "true");
	await escape();
	assert(byTest("claude-code-sign-in-dialog"), "the busy dialog stays");
});

test("sign out needs no confirmation, shows Checking… until the reply, then Signed out and fires the signal", async () => {
	const signals: string[] = [];
	const off = onSettingsSaved((section) => signals.push(section));
	let release!: () => void;
	const gate = new Promise<void>((done) => { release = done; });
	const calls = fixture({ auth: () => SIGNED_IN, post: (body) => body.action === "sign-out" ? { status: 200, body: { auth: SIGNED_OUT, pending: null } } : { status: 200, body: { pending: null } } });
	const fetchNow = globalThis.fetch;
	globalThis.fetch = (async (input, init) => { if (init?.method === "POST") await gate; return fetchNow(input, init); }) as typeof fetch;
	try {
		await mount();
		assert.equal(status(), "Signed in · Claude subscription · until 12 Dec");
		await click(byTest("claude-code-sign-out"));
		assert.equal(byTest("claude-code-sign-in-dialog"), null, "no confirmation");
		assert.equal(status(), "Checking…");
		release(); await flush();
		assert.equal(status(), "Signed out");
		assert.deepEqual(calls.find((c) => c.method === "POST")?.body, { action: "sign-out" });
		assert(signals.includes("claudeCode"));
		assert.equal(byTest("claude-code-sign-in")!.textContent, "Sign in");
	} finally { off(); }
});

test("a failed sign-out says so and keeps the CLI's status", async () => {
	fixture({ auth: () => SIGNED_IN, post: () => ({ status: 502, body: { error: "Sign-out could not be completed.", auth: SIGNED_IN, pending: null } }) });
	await mount();
	await click(byTest("claude-code-sign-out"));
	assert.equal(byTest("claude-code-sign-in-row-error")!.textContent, "Sign-out could not be completed.");
	assert.equal(status(), "Signed in · Claude subscription · until 12 Dec");
});

test("an unreadable status reads 'Sign-in status could not be checked' and still offers Sign in", async () => {
	fixture({});
	globalThis.fetch = (async (input, init) => String(input) === "/api/claude-code/auth" ? new Response("{}", { status: 500 })
		: String(input) === "/api/settings" ? Response.json({ settings: { version: 1, claudeCode: { enabled: true } } })
		: Response.json({ state: "meets-minimum", version: "2.1.321", minimumVersion: "2.1.259" }, { status: init ? 200 : 200 })) as typeof fetch;
	await mount();
	assert.equal(status(), "Sign-in status could not be checked");
	assert(byTest("claude-code-sign-in"));
});

test("local Settings never renders the sign-in row or calls the auth endpoint", async () => {
	const calls = fixture({});
	await mount(false);
	assert(byTest("claude-code-details"));
	assert.equal(byTest("claude-code-sign-in-row"), null);
	assert.match(byTest("claude-code-installation")!.textContent!, /Install and authenticate Claude Code in your terminal/);
	assert(calls.every((c) => c.url !== "/api/claude-code/auth"));
});
