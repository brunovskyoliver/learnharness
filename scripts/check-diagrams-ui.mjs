/** Isolated browser regression for diagrams (feature 022), at 1440, 390 and 320 px:
 * create, add a node and an edge by keyboard, undo and redo, autosave through a reload,
 * every export downloading, and a proposal that changes nothing until Approve while
 * Reject changes nothing at all. Makes no model requests: any chat submission fails the
 * run. A proposal is seeded as the file diagram_propose writes, since no model runs here.
 * TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium node scripts/check-diagrams-ui.mjs
 * LH_UI_SCREENSHOT_DIR keeps screenshots.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const port = Number(process.env.LH_UI_PORT ?? 3122);
const base = `http://127.0.0.1:${port}`;
const root = await mkdtemp(path.join(os.tmpdir(), "learning-diagrams-ui-"));
const data = path.join(root, "data");
const downloads = path.join(root, "downloads");
const shots = process.env.LH_UI_SCREENSHOT_DIR;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let browser;
let passes = 0;
const pass = (text) => { passes++; console.log(`PASS ${text}`); };
const until = async (what, check, ms = 15000, every = 100) => {
	const end = Date.now() + ms;
	for (;;) {
		const value = await check();
		if (value) return value;
		if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
		await pause(every);
	}
};
const getJson = async (url) => (await fetch(`${base}${url}`, { cache: "no-store" })).json();
const items = async () => (await getJson("/api/library")).items;
const state = async (id) => getJson(`/api/library/diagrams/${id}`);
const docOf = async (id) => {
	const body = await state(id);
	return JSON.parse(body.draft?.content ?? body.head.content);
};
const versions = async (id) => (await getJson(`/api/library/diagrams/${id}/versions`)).versions;
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `diagrams-${name}.png`) }); };
const noOverflow = async (page, where) => {
	const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	assert.ok(over <= 0, `page overflow ${over}px: ${where}`);
};
const tid = (id) => `[data-testid="${id}"]`;
const focusActivate = async (page, id) => {
	await page.waitForSelector(tid(id));
	await page.focus(tid(id));
	await page.keyboard.press("Enter");
};

/** A proposal as diagram_propose stores it. The app only ever reads this file. */
async function seedProposal({ id, diagramId, name, summary, baseVersion, doc }) {
	const folder = path.join(data, "library", "diagram-proposals", diagramId ?? "new");
	await mkdir(folder, { recursive: true });
	await writeFile(path.join(folder, `${id}.json`), JSON.stringify({ id, diagramId, name, summary, baseVersion, doc, status: "pending", createdAt: new Date().toISOString() }));
}

async function coarseTargets(page, where) {
	const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid="diagram-toolbar"] button, [data-testid="page-pane"] [data-testid="diagram-export"], [data-testid="diagram-history-toggle"], [data-testid="diagram-outline-toggle"]')]
		.filter((el) => el.offsetParent !== null).map((el) => { const r = el.getBoundingClientRect(); return { name: el.getAttribute("aria-label") ?? el.textContent, w: r.width, h: r.height }; }).filter((r) => r.w < 44 || r.h < 44));
	assert.deepEqual(small, [], `coarse targets under 44px: ${where}`);
}

async function checkWidth(width) {
	const prefix = `w${width}`;
	const coarse = width < 768;
	// Each width starts with no remembered pane: a restored diagram rightly loads the canvas.
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	await page.setViewport({ width, height: 800, hasTouch: coarse, isMobile: coarse });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const scripts = [];
	page.on("response", (response) => { if (response.url().includes("/_next/") && response.url().includes(".js")) scripts.push(response.url()); });
	await page.setRequestInterception(true);
	page.on("request", (request) => {
		if (request.method() === "POST" && /\/api\/chat(\b|\/|$)/.test(new URL(request.url()).pathname)) {
			errors.push(`model submission intercepted: ${request.url()}`);
			return void request.abort();
		}
		void request.continue();
	});
	const cdp = await page.createCDPSession();
	const saved = path.join(downloads, prefix);
	await mkdir(saved, { recursive: true });
	await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: saved, browserContextId: context.id });

	// Nothing of React Flow reaches a route with no diagram open.
	await page.goto(`${base}/library`, { waitUntil: "networkidle2" });
	await page.waitForSelector(tid("library-new-diagram"));
	const initial = [...new Set(scripts)];
	for (const url of initial) assert.ok(!(await (await fetch(url)).text()).includes("react-flow__pane"), `React Flow in initial script ${url}`);
	assert.equal(await page.$(".react-flow"), null);
	pass(`${width}: no React Flow code on first load (${initial.length} scripts)`);

	// Create by keyboard: the dialog, a form, a name, Enter.
	await focusActivate(page, "library-new-diagram");
	await page.waitForSelector(tid("diagram-new-dialog"));
	await shot(page, `new-${width}`);
	await page.focus(tid("diagram-form-concept-map"));
	await page.keyboard.press("Space");
	await page.focus(tid("diagram-new-name"));
	const name = `${prefix} map`;
	await page.keyboard.type(name);
	await page.keyboard.press("Enter");
	await page.waitForSelector(tid("diagram-editor"));
	const item = (await items()).find((entry) => entry.name === name);
	assert.equal(item.kind, "diagram");
	assert.equal((await docOf(item.id)).form, "concept-map");
	pass(`${width}: created a concept map by keyboard`);

	const view = await page.$eval(tid("diagram-editor"), (el) => el.dataset.view);
	if (width === 320) {
		assert.equal(view, "list", "320 leads with the list");
		assert.equal(await page.$(".react-flow"), null, "the list loads no canvas");
		pass("320: the list alternative leads, with no canvas loaded");
	} else {
		assert.equal(view, "canvas");
		await page.waitForSelector(".react-flow__node");
		assert.ok(await page.$(".react-flow__pane"), "React Flow loaded on opening");
		pass(`${width}: the canvas loaded on opening`);
		const styles = await page.$eval(".react-flow__node .lh-diagram-box", (el) => { const s = getComputedStyle(el); return { background: s.backgroundColor, shadow: s.boxShadow, border: s.borderStyle }; });
		assert.equal(styles.shadow, "none");
		assert.notEqual(styles.border, "dashed");
		assert.notEqual(styles.background, "rgb(255, 255, 255)", "the paper tokens override the default");
		pass(`${width}: the paper tokens override React Flow's defaults`);
	}

	// Add a node without a pointer.
	const label = `Fre<q> & co ${prefix}`;
	await focusActivate(page, "diagram-add-node");
	await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA" && ["diagram-node-text", "diagram-list-text"].includes(document.activeElement.dataset.testid), { timeout: 10000 });
	await page.keyboard.type(label);
	await page.keyboard.press(view === "canvas" ? "Enter" : "Tab");
	await until("the node's text on screen", () => page.evaluate((text) => (document.querySelector('[data-testid="diagram-editor"]').innerText.includes(text) || [...document.querySelectorAll("textarea")].some((a) => a.value === text)), label));
	pass(`${width}: added a node and typed its text by keyboard`);

	// Every node reachable and editable by keyboard, with focus visible.
	if (view === "canvas") {
		await page.waitForFunction(() => document.activeElement?.classList.contains("react-flow__node"));
		const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth}`; });
		assert.match(outline, /solid 2px/, `focus visible on a node: ${outline}`);
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		await page.waitForSelector(tid("diagram-node-text"));
		await page.keyboard.press("Escape");
		await page.waitForFunction(() => document.activeElement?.classList.contains("react-flow__node"));
		assert.ok(await page.$(tid("diagram-editor")), "Escape closed only the field");
		pass(`${width}: node reachable, moved and edited by keyboard; focus visible; Escape innermost`);
	}

	// An edge without a pointer, with a label. Escape closes only the form.
	await focusActivate(page, "diagram-connect");
	await page.waitForSelector(tid("diagram-connect-form"));
	await page.keyboard.press("Escape");
	await page.waitForFunction((sel) => !document.querySelector(sel), {}, tid("diagram-connect-form"));
	assert.ok(await page.$(tid("diagram-editor")));
	await focusActivate(page, "diagram-connect");
	await page.waitForSelector(tid("diagram-connect-form"));
	await page.focus(tid("diagram-connect-label"));
	await page.keyboard.type("has a");
	await page.keyboard.press("Enter");
	await until("the edge saved", async () => (await docOf(item.id)).edges.length === 1);
	await shot(page, `edge-${width}`);
	await page.focus(tid("diagram-connect-add"));
	await page.click(`${tid("diagram-connect-form")} button[type="button"]`);
	pass(`${width}: added a labelled edge by keyboard, and autosave wrote the draft`);
	if (coarse) await coarseTargets(page, `${width}`);

	// Undo and redo: the shortcuts and the buttons.
	await page.focus(tid("diagram-undo"));
	await page.keyboard.down("Control");
	await page.keyboard.press("z");
	await page.keyboard.up("Control");
	await until("undo to remove the edge", async () => (await docOf(item.id)).edges.length === 0);
	await page.keyboard.down("Control");
	await page.keyboard.down("Shift");
	await page.keyboard.press("z");
	await page.keyboard.up("Shift");
	await page.keyboard.up("Control");
	await until("redo to restore the edge", async () => (await docOf(item.id)).edges.length === 1);
	await page.click(tid("diagram-undo"));
	await until("the Undo button", async () => (await docOf(item.id)).edges.length === 0);
	await page.click(tid("diagram-redo"));
	await until("the Redo button", async () => (await docOf(item.id)).edges.length === 1);
	pass(`${width}: undo and redo by shortcut and by button`);

	// Autosave states, then a reload keeps everything and says so.
	await until("Draft saved", () => page.$eval(tid("page-save-state"), (el) => el.textContent.includes("Draft saved")));
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector(tid("diagram-editor"), { timeout: 30000 });
	await until("the state after reload", () => page.$eval(tid("page-save-state"), (el) => el.textContent.includes("Draft saved")));
	const reloaded = await docOf(item.id);
	assert.ok(reloaded.nodes.some((node) => node.text === label), "the node survived");
	assert.equal(reloaded.edges[0].label, "has a");
	pass(`${width}: autosave survives a reload`);

	// A save makes a version, and the header says Saved.
	await page.focus(tid("diagram-undo"));
	await page.keyboard.down("Control");
	await page.keyboard.press("s");
	await page.keyboard.up("Control");
	await until("a version", async () => (await versions(item.id)).length === 2);
	await until("Saved", () => page.$eval(tid("page-save-state"), (el) => el.textContent.trim().startsWith("Saved")));
	pass(`${width}: Ctrl+S saves a version`);

	// Export: each format really downloads, and the SVG is escaped.
	for (const [format, button] of [["svg", "diagram-export-svg"], ["png", "diagram-export-png"], ["json", "diagram-export-json"]]) {
		await page.click(tid("diagram-export"));
		await page.waitForSelector(tid(button));
		await page.click(tid(button));
		const file = path.join(saved, `${name}.${format}`);
		const bytes = await until(`${format} download`, async () => { try { return await readFile(file); } catch { return null; } });
		if (format === "png") assert.equal(bytes.subarray(1, 4).toString(), "PNG");
		if (format === "svg") {
			const text = bytes.toString();
			assert.ok(text.includes("Fre&lt;q&gt; &amp; co"), "the label is escaped");
			assert.ok(!text.includes("Fre<q>"), "no raw markup");
		}
		if (format === "json") assert.equal(JSON.parse(bytes.toString()).schema, 1);
	}
	assert.ok(!(await page.$(tid("diagram-export-failed"))));
	pass(`${width}: SVG, PNG and JSON download, and the SVG escapes the label`);

	// The accessible outline.
	await page.click(tid("diagram-outline-toggle"));
	await page.waitForSelector(tid("diagram-outline"));
	assert.ok((await page.$eval(tid("diagram-outline"), (el) => el.innerText)).includes(label));
	await shot(page, `outline-${width}`);
	await page.click(tid("diagram-outline-toggle"));
	pass(`${width}: the text outline lists the graph`);

	// The list works here too, and a touch pinch zooms the canvas.
	await page.click(tid(view === "canvas" ? "diagram-view-list" : "diagram-view-canvas"));
	await page.waitForSelector(view === "canvas" ? tid("diagram-list") : ".react-flow__pane");
	await shot(page, `${view === "canvas" ? "list" : "canvas"}-${width}`);
	await noOverflow(page, `${width} other view`);
	await page.click(tid(view === "canvas" ? "diagram-view-canvas" : "diagram-view-list"));
	await page.waitForSelector(view === "canvas" ? ".react-flow__pane" : tid("diagram-list"));
	pass(`${width}: canvas and list swap with no page overflow`);
	if (width === 390) {
		await page.waitForSelector(".react-flow__viewport");
		const transform = () => page.$eval(".react-flow__viewport", (el) => el.style.transform);
		const before = await transform();
		const box = await (await page.$(".react-flow__pane")).boundingBox();
		await cdp.send("Input.synthesizePinchGesture", { x: box.x + box.width / 2, y: box.y + box.height / 2, scaleFactor: 1.6, gestureSourceType: "touch" });
		await until("a pinch to change the zoom", async () => (await transform()) !== before, 5000);
		const pinched = await transform();
		const start = { x: box.x + 30, y: box.y + box.height - 30 };
		await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
		for (let step = 1; step <= 6; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + step * 10, y: start.y - step * 10 }] });
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await until("a touch drag to pan", async () => (await transform()) !== pinched, 5000);
		pass("390: touch pinch zooms and touch drag pans");
	}
	if (width === 1440) {
		const transform = () => page.$eval(".react-flow__viewport", (el) => el.style.transform);
		const before = await transform();
		await page.click(tid("diagram-zoom-out"));
		await until("the zoom button", async () => (await transform()) !== before);
		pass("1440: the zoom buttons work");
		await page.click(tid("diagram-full-screen"));
		await until("full screen", () => page.$eval(tid("page-pane"), (el) => Math.round(el.getBoundingClientRect().width) === window.innerWidth));
		await shot(page, "full-1440");
		await page.keyboard.press("Escape");
		await until("Escape to leave full screen", () => page.$eval(tid("page-pane"), (el) => Math.round(el.getBoundingClientRect().width) < window.innerWidth));
		assert.ok(await page.$(tid("diagram-editor")), "the same editor stayed");
		pass("1440: full screen opens, and Escape leaves it first");
	}

	// Links: a dangling one is honest, and it becomes live when the page appears.
	if (width === 1440) {
		await page.waitForSelector(".react-flow__node");
		await page.click(".react-flow__node");
		await page.click(tid("diagram-link"));
		await page.waitForSelector(tid("diagram-link-filter"));
		await page.type(tid("diagram-link-filter"), "Later note");
		await page.waitForSelector(tid("diagram-link-dangling"));
		await page.click(tid("diagram-link-dangling"));
		await page.waitForSelector(tid("diagram-link-existing"));
		await shot(page, "link-1440");
		await page.keyboard.press("Escape");
		await page.waitForFunction((sel) => !document.querySelector(sel), {}, tid("diagram-link-dialog"));
		await until("the link saved", async () => (await docOf(item.id)).nodes.some((node) => node.links?.length));
		await page.click(tid("page-links-toggle"));
		await page.waitForSelector('[data-testid="note-link"][data-state="missing"]');
		await shot(page, "links-1440");
		const note = (await (await fetch(`${base}/api/library/pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Later note", content: "x" }) })).json()).item;
		await page.waitForSelector('[data-testid="note-link"][data-state="live"]', { timeout: 15000 });
		const backlinks = await getJson(`/api/library/pages/${note.id}/connections`);
		assert.equal(backlinks.backlinks[0].kind, "diagram");
		await page.click(tid("page-links-toggle"));
		pass("1440: a dangling link is honest, goes live with the page, and shows in the page's Links panel");
		await page.focus(tid("diagram-undo"));
		await page.keyboard.down("Control");
		await page.keyboard.press("s");
		await page.keyboard.up("Control");
		await until("the link's version", async () => (await state(item.id)).draft === null);

		// A whiteboard: sticky notes by keyboard, freehand by pointer, both in undo.
		const board = (await (await fetch(`${base}/api/library/diagrams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${prefix} board`, form: "whiteboard" }) })).json()).item;
		await page.waitForSelector(`[aria-label="Open ${prefix} board"]`);
		await page.click(`[aria-label="Open ${prefix} board"]`);
		await page.waitForSelector(tid("diagram-draw"));
		await page.waitForSelector(tid("diagram-empty"));
		await focusActivate(page, "diagram-add-node");
		await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA");
		await page.keyboard.type("A sticky note");
		await page.keyboard.press("Enter");
		await page.click(tid("diagram-draw"));
		await page.waitForSelector(tid("diagram-pen-layer"));
		const pen = await (await page.$(tid("diagram-pen-layer"))).boundingBox();
		await page.mouse.move(pen.x + 40, pen.y + 40);
		await page.mouse.down();
		for (let step = 1; step < 12; step++) await page.mouse.move(pen.x + 40 + step * 12, pen.y + 40 + (step % 3) * 14);
		await page.mouse.up();
		await page.keyboard.press("Escape");
		await page.waitForFunction((sel) => !document.querySelector(sel), {}, tid("diagram-pen-layer"));
		await until("the stroke saved", async () => (await docOf(board.id)).nodes.some((node) => node.type === "stroke" && node.points.length > 2));
		await shot(page, "board-1440");
		await page.keyboard.down("Control");
		await page.keyboard.press("z");
		await page.keyboard.up("Control");
		await until("undo to drop the stroke", async () => !(await docOf(board.id)).nodes.some((node) => node.type === "stroke"));
		pass("1440: a whiteboard takes sticky notes and freehand, Escape stops the pen, and undo covers both");
		await page.click(`[aria-label="Open ${name}"]`);
		await page.waitForFunction((text) => document.querySelector('[data-testid="page-name"]')?.textContent === text, {}, name);
	}

	// A proposal: nothing changes until Approve, and Reject changes nothing.
	const before = await state(item.id);
	const countBefore = (await versions(item.id)).length;
	const doc = JSON.parse(before.head.content);
	const proposed = { ...doc, nodes: [...doc.nodes.map((node) => (node.id === "n1" ? { ...node, text: "Renamed by the tutor" } : node)), { id: "n99", type: "box", x: 600, y: 300, text: `Amplitude <b>${prefix}</b>` }], edges: [...doc.edges, { id: "e99", from: "n1", to: "n99", label: "has an" }] };
	await seedProposal({ id: `prp_${prefix}a`, diagramId: item.id, name, summary: "Adds amplitude and renames the main idea.", baseVersion: before.head.n, doc: proposed });
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector(tid("diagram-proposal-bar"), { timeout: 30000 });
	assert.deepEqual(await state(item.id), before, "a proposal changes nothing");
	await page.click(tid("diagram-proposal-review"));
	await page.waitForSelector(tid("diagram-diff"));
	const diffText = await page.$eval(tid("diagram-diff"), (el) => el.innerText);
	for (const words of ["Added nodes (1)", `Amplitude <b>${prefix}</b>`, "Changed nodes (1)", "Renamed by the tutor", "Added connections (1)"]) assert.ok(diffText.includes(words), `the comparison says ${words}: ${diffText}`);
	assert.equal(await page.$(`${tid("diagram-diff")} b`), null, "a label is never markup");
	await shot(page, `review-${width}`);
	await noOverflow(page, `${width} review`);
	await page.keyboard.press("Escape");
	await page.waitForFunction((sel) => !document.querySelector(sel), {}, tid("diagram-proposal-dialog"));
	assert.ok(await page.$(tid("diagram-editor")), "Escape closed the dialog first");
	assert.deepEqual(await state(item.id), before, "closing changes nothing");
	await page.click(tid("diagram-proposal-review"));
	await page.waitForSelector(tid("diagram-proposal-reject"));
	await page.click(tid("diagram-proposal-reject"));
	await page.waitForFunction((sel) => !document.querySelector(sel), {}, tid("diagram-proposal-bar"));
	assert.deepEqual(await state(item.id), before, "Reject leaves the diagram");
	assert.equal((await versions(item.id)).length, countBefore);
	pass(`${width}: the comparison shows, closing and Reject change nothing`);

	await seedProposal({ id: `prp_${prefix}b`, diagramId: item.id, name, summary: "The same again.", baseVersion: before.head.n, doc: proposed });
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForSelector(tid("diagram-proposal-bar"), { timeout: 30000 });
	await page.click(tid("diagram-proposal-review"));
	await page.waitForSelector(tid("diagram-proposal-edit"));
	assert.deepEqual(await state(item.id), before, "still unchanged while reviewing");
	await page.click(tid("diagram-proposal-edit"));
	await page.waitForSelector(`${tid("diagram-proposal-dialog")} ${tid("diagram-editor")}`);
	await shot(page, `edit-first-${width}`);
	await noOverflow(page, `${width} edit first`);
	assert.deepEqual(await state(item.id), before, "Edit first changes nothing yet");
	await page.click(tid("diagram-proposal-approve-edited"));
	await page.waitForFunction((sel) => !document.querySelector(sel), {}, tid("diagram-proposal-dialog"));
	const after = await until("the approved version", async () => { const list = await versions(item.id); return list.length === countBefore + 1 ? list[0] : null; });
	assert.equal(after.author, "agent");
	assert.equal(after.cause, "proposal-approved");
	await until("the editor to show it", () => page.evaluate(() => { const root = document.querySelector('[data-testid="diagram-editor"]'); return root && (root.innerText.includes("Renamed by the tutor") || [...root.querySelectorAll("textarea")].some((a) => a.value === "Renamed by the tutor")); }));
	await until("the bar to go", async () => !(await page.$(tid("diagram-proposal-bar"))));
	pass(`${width}: Edit first then Approve makes one version with an AI author, and the editor follows`);

	// History: the version shows, and restoring adds one.
	await page.click(tid("diagram-history-toggle"));
	await page.waitForSelector(tid("diagram-version"));
	assert.ok((await page.$eval(tid("diagram-version"), (el) => el.textContent)).includes("Tutor"));
	const rows = await page.$$(tid("diagram-version"));
	await rows.at(-1).click();
	await page.waitForSelector(tid("diagram-version-preview"));
	await shot(page, `history-${width}`);
	await page.click(tid("diagram-restore"));
	await until("the restore", async () => (await versions(item.id))[0].cause === "restore");
	await page.waitForSelector(tid("diagram-editor"));
	pass(`${width}: History shows versions, and Restore adds one`);

	// A proposal for a diagram that doesn't exist yet waits in the Library.
	const newName = `${prefix} proposed`;
	await seedProposal({ id: `prp_${prefix}c`, diagramId: null, name: newName, summary: "A new map.", baseVersion: null, doc: { schema: 1, form: "concept-map", nodes: [{ id: "n1", type: "box", x: 0, y: 0, text: "Alone" }], edges: [] } });
	await page.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await page.waitForSelector(tid("diagram-proposal-open"), { timeout: 30000 });
	assert.ok(!(await items()).some((entry) => entry.name === newName), "nothing exists before approval");
	if (coarse) {
		const back = await page.$(tid("page-back"));
		if (back) await back.click();
	}
	await page.click(tid("diagram-proposal-open"));
	await page.waitForSelector(tid("diagram-proposal-approve"));
	await page.click(tid("diagram-proposal-approve"));
	await until("the new diagram", async () => (await items()).find((entry) => entry.name === newName));
	const made = (await items()).find((entry) => entry.name === newName);
	assert.equal(made.origin.type, "agent");
	pass(`${width}: a proposed new diagram exists only after Approve`);

	// It organizes like anything else, and search reads its labels.
	const open = await page.$(`[aria-label="Open ${name}"]`);
	await until("the list row", async () => Boolean(await page.$(`[aria-label="Open ${name}"]`)) || !open);
	const hits = await until("search to find the label", async () => {
		const body = await getJson(`/api/library/search?q=${encodeURIComponent(`Alone`)}`);
		return body.results?.some((row) => row.itemId === made.id) ? body : null;
	}, 30000, 600); // Slower than the index's settle, or each search would put it off again.
	assert.equal(hits.results.find((row) => row.itemId === made.id).kind, "diagram");
	pass(`${width}: full-text search finds a diagram's label`);

	await noOverflow(page, `${width} end`);
	await shot(page, `library-${width}`);
	assert.deepEqual(errors, []);
	await context.close();
	console.log(`ok ${width}`);
}

try {
	await mkdir(data, { recursive: true });
	await mkdir(downloads, { recursive: true });
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
		env: { ...process.env, OPENROUTER_API_KEY: "test-key-never-used", LH_HOSTED: "0", LH_DATA_DIR: data, LH_AUTH_FILE: path.join(data, "auth.json"), NEXT_TELEMETRY_DISABLED: "1" },
		stdio: ["ignore", "ignore", "ignore"],
	});
	let ready = false;
	for (let i = 0; i < 240 && !ready; i++) {
		ready = await fetch(`${base}/api/library`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
		if (!ready) await pause(250);
	}
	assert.ok(ready, "isolated server starts");
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ["--no-sandbox"] });
	for (const width of [1440, 390, 320]) await checkWidth(width);
	assert.ok((await readdir(downloads)).length === 3);
	console.log(`Diagram browser checks passed: ${passes} PASS lines.`);
} finally {
	await browser?.close();
	server?.kill();
	await rm(root, { recursive: true, force: true });
}
