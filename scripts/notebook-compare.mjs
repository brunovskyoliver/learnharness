/**
 * Notebook mode vs the Riddled reference frames (feature 024, T046).
 *
 * Starts its own `next dev` (port 3126, a fresh LH_DATA_DIR, local mode, the
 * faux Notebook model), seeds the notes each frame shows through the Library
 * and settings APIs and the companion store (the AI's exact words cannot come
 * from a model), captures our page at the frames' viewport (1665 x 962 CSS
 * px; contracts/visual-reference.md "Frame scale") and writes, per frame:
 *   pairs/<name>.png    frame | ours, side by side
 *   pairs/<name>-overlay.png   ours with the frame at 50% on top
 * and per motion (normal and reduced motion):
 *   motion/<name>[-reduced]/frame-NN.png   one capture every ~100 ms
 *   motion/<name>[-reduced].png            the sequence as one strip
 * plus index.md (each pair, each strip and its remaining differences).
 * Images are composed in the browser itself (no image library).
 *
 * The frames are macOS recordings: Linux Chromium sets the same fonts ≈3%
 * wider, so some line breaks differ (progress.md, width investigation).
 *
 * Run: node scripts/notebook-compare.mjs [outDir]
 *   CHROME_PATH   browser (default: the repo's chrome-headless-shell)
 *   FRAMES_DIR    reference stills (default ~/agent-runs/2026-11-06-riddled-research/frames)
 *   ONLY          comma list of pair/motion names to run
 *   INDEX_ONLY=1  only rewrite index.md (after editing notebook-compare-notes.json)
 * Stop any other `next dev` in this checkout first (Next allows one per dir).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const HOME = os.homedir();
const OUT = path.resolve(process.argv[2] ?? path.join(HOME, "agent-runs/2026-11-06-notebook-mode/compare"));
const FRAMES = process.env.FRAMES_DIR ?? path.join(HOME, "agent-runs/2026-11-06-riddled-research/frames");
const CHROME = process.env.CHROME_PATH ?? path.join(HOME, ".t3/tools/chrome-headless-shell/linux64/156.0.8078.70/chrome-headless-shell");
const PORT = 3126;
const BASE = `http://127.0.0.1:${PORT}`;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const want = (name) => !ONLY || ONLY.has(name);

/** The frames' browser viewport: x ≥ 127, y ≥ 64 in a 1440 x 1026 still; the viewport itself is ≈1665 wide. */
const VIEW = { width: 1665, height: 962 };
const STILL = { x: 127, y: 64, width: 1313, height: 962 };
/** Contact sheets: one sheet px (of the 2400 px wide file) is 2.4 CSS px. */
const SHEET_SCALE = 2.4;
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

const snapCommon = path.join(HOME, "snap", "chromium", "common");
const tmpRoot = process.env.PW_TMPDIR ?? path.join(existsSync(snapCommon) ? snapCommon : os.tmpdir(), "learnharness-compare");
mkdirSync(tmpRoot, { recursive: true });
const DATA = mkdtempSync(path.join(tmpRoot, "lh-data-"));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── dev server ─────────────────────────────────────────────────────────────

let server;
async function startServer() {
	server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
		env: {
			...process.env, LH_DATA_DIR: DATA, LH_AUTH_FILE: path.join(DATA, "auth.json"), LH_HOSTED: "0", LH_IGNORE_ENV_KEYS: "1",
			LH_NOTEBOOK_FAUX: "1", NEXT_TELEMETRY_DISABLED: "1", TMPDIR: tmpRoot,
		},
	});
	let log = "";
	server.stdout.on("data", (chunk) => { log += chunk; });
	server.stderr.on("data", (chunk) => { log += chunk; });
	let exited = false;
	server.once("exit", () => { exited = true; });
	for (let i = 0; i < 480; i++) {
		if (exited) throw new Error(`next dev exited:\n${log.slice(-2000)}`);
		try {
			const response = await fetch(`${BASE}/api/settings`);
			if (response.ok) return;
		} catch { /* not up yet */ }
		await pause(500);
	}
	throw new Error(`next dev did not answer on ${BASE}:\n${log.slice(-2000)}`);
}
function stopServer() {
	if (server?.pid) try { process.kill(-server.pid, "SIGTERM"); } catch { /* gone */ }
}

// ─── seeding (Library and settings APIs, the companion store) ───────────────

async function api(url, method = "GET", body) {
	const response = await fetch(`${BASE}${url}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
	const text = await response.text();
	if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${text}`);
	return text ? JSON.parse(text) : null;
}
const notebookSettings = (patch) => api("/api/settings/notebook", "PUT", {
	layout: "both", startMode: "thinks", pace: "regular", textSize: "default", lettering: "serif", ink: "ink", pointerInk: false, appearance: "light", ...patch,
});

const AT = "2026-11-06T10:00:00.000Z";
let seq = 0;
const thread = (id, quote, side, texts, extra = {}) => ({
	id, anchor: { quote, prefix: "", suffix: "" }, placement: "margin", side, status: "open", origin: "read", createdAt: AT, updatedAt: AT,
	messages: texts.map((text, i) => ({ id: `msg_seed${seq++}`, author: i % 2 ? "user" : "ai", text, at: AT })), ...extra,
});
/** The companion file as the store writes it (src/store/notebook.ts companionFile); read and validated by the server on open. */
function writeCompanion(pageId, companion) {
	const dir = path.join(DATA, "library", "notebook");
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, `${pageId}.json`), JSON.stringify({ v: 1, pageId, instruction: "", threads: [], chat: [], ...companion }, null, 2));
}

const LIST = "Video Ideas:\n\n1. college is becoming increasingly worthless with the advent of AI\n2. AI will create a huge economic gap between those who let themselves get replaced and those who are competitive enough to make it\n3. AI is making people dumber\n4. LLMs will never become \"AGI\"\n";
const DP_LINE = "I have a really hard time visualizing 2d dp can you help me";
const DP_REPLY = "Think of a grid where you start in the top-left corner and can move only right or down: how many ways can you reach each square? Write that count inside each square; every square gets its count by adding the counts directly above and directly left, because those are the only places you could have come from. The top row and left column are all 1s, so the next row becomes 1, 2, 3, and the next becomes 1, 3, 6. That’s one example of 2D DP: each square stores an answer for two coordinates, built from smaller answers you’ve already found.";
const cx = [50.5, 126.5, 202.5], cy = [71, 131, 191];
const cell = (step, c, r, text) => ({ step, kind: "text", x: cx[c], y: cy[r], text, size: "l" });
/** The frame's drawing (the faux engine's FAUX_SKETCH, src/agent/subagents/notebook.ts). */
const DP_SKETCH = {
	title: "How many ways to each cell?", subtitle: "Start top-left. Move only right or down.", w: 262, h: 282,
	items: [
		{ step: 0, kind: "grid", x: 12.5, y: 41, cols: 3, rows: 3, cell: 76, cellH: 60 },
		cell(0, 0, 0, "1"), cell(0, 1, 0, "1"), cell(0, 2, 0, "1"), cell(0, 0, 1, "1"), cell(0, 0, 2, "1"),
		{ step: 0, kind: "text", x: 12.5, y: 250, text: "Two coordinates choose the cell.", size: "s", voice: false, anchor: "start" },
		{ step: 0, kind: "text", x: 12.5, y: 272, text: "Its number stores a smaller answer.", size: "s", voice: false, anchor: "start" },
		cell(1, 1, 1, "2"), cell(2, 2, 1, "3"), cell(2, 1, 2, "3"), cell(3, 2, 2, "6"),
		{ step: 3, kind: "arrow", x1: 202.5, y1: 147, x2: 202.5, y2: 171 },
		{ step: 3, kind: "arrow", x1: 144, y1: 191, x2: 182, y2: 191 },
	],
	steps: [
		{ caption: "Start with 1 way to reach every edge cell." },
		{ caption: "The middle cell gets 1 from above + 1 from the left." },
		{ caption: "The next two cells each get 1 + 2 = 3." },
		{ caption: "The last cell adds its two neighbors: 3 + 3 = 6.", note: "Above + left = this cell." },
	],
};

async function seed() {
	await api("/api/settings/general", "PUT", { interface: "notebook" });
	await notebookSettings({});
	// Created oldest first so the sidebar lists them as frame sidebar-and-settings does.
	const pages = [
		["Chem 105 Notes", "Some words about moles.\n"],
		["Physics 101: Forces on a ramp", "Some words about forces.\n"],
		["Go Carting", "Some words about karts.\n"],
		["LeetCode prep: Longest Common Subsequence", "Some words about subsequences.\n"],
		["Journal", "I had a super rough day at work.\n"],
		["YouTube Ideas", LIST],
		["2D Dynamic Programming", `${DP_LINE}\n`],
	];
	const ids = {};
	for (const [name, content] of pages) {
		ids[name] = (await api("/api/library/pages", "POST", { name, content })).item.id;
		await pause(40);
	}
	for (const name of ["Chem 105 Notes", "Physics 101: Forces on a ramp", "Go Carting", "LeetCode prep: Longest Common Subsequence"]) {
		writeCompanion(ids[name], { mode: "thinks", threads: [thread(`thr_${seq}`, "Some words", "left", ["What would change your mind?"])] });
	}
	writeCompanion(ids.Journal, { mode: "thinks", threads: [thread("thr_journal", "I had a super rough day at work.", "left", ["That sounds rough. What happened?"])] });
	writeCompanion(ids["YouTube Ideas"], {
		mode: "thinks", instruction: "Be antagonistic- you always disagree with the premise of my video",
		threads: [
			thread("thr_a", "college is becoming increasingly worthless with the advent of AI", "left", [
				"If AI makes competent-looking code cheap, college could become more valuable as a signal employers use to distinguish candidates whose output now looks identical. Your premise needs to show that AI erodes the value of fundamentals, credentials, and networks—not just that it can complete the assignments.",
				"Well in my opinion after taking classes at USC i can definitely say they are super outdated and dont teach how to build actual applications",
				"That supports “my USC classes are outdated,” not “AI is making college worthless.” Not teaching application development was a criticism of CS programs long before AI; the counterargument is that they teach foundations that outlast today’s tools. Which classes did you take, and what did they teach that you think no longer earns its place?",
			]),
			thread("thr_b", "AI will create a huge economic gap between those who let themselves get replaced and those who are competitive enough to make it", "right", [
				"“Let themselves get replaced” assumes workers control whether replacing them becomes profitable. What if AI’s biggest economic divide is between people who own the systems and people competing to work with them—not between people who tried hard enough and people who didn’t?",
			]),
			thread("thr_c", "AI is making people dumber", "left", [
				"Doing less thinking isn’t the same as becoming less capable of thinking. Is your claim that AI erodes people’s abilities over time, or that it lets them get things done without exercising those abilities?",
				"Over time.", "Then what would you measure?",
			]),
			thread("thr_d", "LLMs will never become \"AGI\"", "left", [
				"“Never” requires showing a fundamental limit, not pointing to today’s failures. What definition of AGI are you using, and what prevents an LLM-based system from meeting it?",
			]),
		],
	});
	writeCompanion(ids["2D Dynamic Programming"], {
		mode: "ask",
		threads: [{ ...thread("thr_dp", DP_LINE, "right", [DP_REPLY]), placement: "inline", origin: "visualize", messages: [{ id: "msg_dp", author: "ai", text: DP_REPLY, at: AT, sketch: DP_SKETCH }] }],
	});
	return ids;
}

// ─── capture helpers ────────────────────────────────────────────────────────

let browser;
async function context({ reduced = true } = {}) {
	const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, reducedMotion: reduced ? "reduce" : "no-preference", userAgent: MAC_UA });
	await ctx.addInitScript(() => Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }));
	return ctx;
}
async function openNote(ctx, id) {
	const page = await ctx.newPage();
	page.on("pageerror", (error) => console.log(`  pageerror: ${error.message}`));
	await page.goto(`${BASE}/notebook/${id}`);
	await page.getByTestId("nb-editor").waitFor({ timeout: 240_000 });
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(1200);
	return page;
}
const box = (page, selector) => page.evaluate((s) => {
	const el = document.querySelector(s);
	if (!el) return null;
	const b = el.getBoundingClientRect();
	return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) };
}, selector);

const b64 = (file) => readFileSync(file).toString("base64");
const mime = (file) => (file.endsWith(".png") ? "image/png" : "image/jpeg");
const dataUrl = (file) => `data:${mime(file)};base64,${b64(file)}`;

/** A region of an image, scaled, as an absolutely placed div (composition happens in the browser). */
function regionHtml(file, region, scale = 1, extra = "") {
	return `<div style="position:relative;overflow:hidden;width:${Math.round(region.width * scale)}px;height:${Math.round(region.height * scale)}px;${extra}">`
		+ `<img src="${dataUrl(file)}" style="position:absolute;left:${-region.x * scale}px;top:${-region.y * scale}px;transform-origin:0 0;transform:scale(${scale});image-rendering:auto"></div>`;
}

let composer;
async function compose(html, width, height, file) {
	await composer.setViewportSize({ width, height });
	await composer.setContent(`<!doctype html><html><body style="margin:0;background:#888;font:13px system-ui,sans-serif">${html}</body></html>`);
	await composer.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
	await composer.screenshot({ path: file });
}

/** frame | ours, and ours with the frame at 50% over it. Both regions are given in CSS px at `scale`. */
async function pair(name, frame, ours) {
	const w = Math.round(frame.region.width * frame.scale), h = Math.round(frame.region.height * frame.scale);
	const label = (text) => `<div style="position:absolute;left:8px;top:6px;padding:2px 6px;background:#000a;color:#fff;border-radius:4px">${text}</div>`;
	await compose(
		`<div style="display:flex;gap:8px"><div style="position:relative">${regionHtml(frame.file, frame.region, frame.scale)}${label("Riddled (frame)")}</div>`
		+ `<div style="position:relative">${regionHtml(ours.file, ours.region)}${label("ours")}</div></div>`,
		w + 8 + ours.region.width, Math.max(h, ours.region.height), path.join(OUT, "pairs", `${name}.png`),
	);
	await compose(
		`<div style="position:relative">${regionHtml(ours.file, ours.region)}<div style="position:absolute;left:0;top:0;opacity:.5">${regionHtml(frame.file, frame.region, frame.scale)}</div>${label("ours + frame at 50%")}</div>`,
		ours.region.width, ours.region.height, path.join(OUT, "pairs", `${name}-overlay.png`),
	);
}

/** Starts `act`, then captures `clip` about every `every` ms; returns the frame list. */
async function burst(page, dir, clip, act, { count = 30, every = 100 } = {}) {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	const frames = [];
	const t0 = Date.now();
	const acting = act();
	for (let i = 0; i < count; i++) {
		const due = t0 + i * every;
		if (Date.now() < due) await pause(due - Date.now());
		const file = path.join(dir, `frame-${String(i).padStart(2, "0")}.png`);
		await page.screenshot({ path: file, clip, animations: "allow", caret: "initial" });
		frames.push({ file, t: Date.now() - t0 });
	}
	await acting;
	return frames;
}
/** The frames as a grid of labelled thumbnails (`pick` thins long runs). */
async function strip(name, frames, clip, pick = 1) {
	const chosen = frames.filter((_, i) => i % pick === 0);
	const columns = Math.max(1, Math.min(chosen.length, Math.floor(1800 / Math.min(clip.width, 600))));
	const scale = Math.min(1, 1800 / columns / clip.width);
	const tw = Math.round(clip.width * scale), th = Math.round(clip.height * scale);
	const cells = chosen.map((f) => `<div style="position:relative;width:${tw}px;height:${th}px;background:#fff"><img src="${dataUrl(f.file)}" style="width:${tw}px;height:${th}px">`
		+ `<div style="position:absolute;left:4px;top:3px;padding:1px 4px;background:#000a;color:#fff;border-radius:3px;font-size:11px">${f.t} ms</div></div>`).join("");
	const rows = Math.ceil(chosen.length / columns);
	await compose(`<div style="display:grid;grid-template-columns:repeat(${columns},${tw}px);gap:4px;padding:4px">${cells}</div>`,
		columns * (tw + 4) + 4, rows * (th + 4) + 4, path.join(OUT, "motion", `${name}.png`));
}

// ─── the pairs ──────────────────────────────────────────────────────────────

const shot = (name) => path.join(OUT, "ours", `${name}.png`);
const still = (file) => ({ file: path.join(FRAMES, file), region: STILL, scale: 1 });
const ourView = (name) => ({ file: shot(name), region: { x: 0, y: 0, width: STILL.width, height: STILL.height } });

async function pairs(ids) {
	if (want("margin-notes")) {
		const ctx = await context();
		const page = await openNote(ctx, ids["YouTube Ideas"]);
		await page.mouse.move(526 - STILL.x, 370 - STILL.y); // the frame's cursor rests on the first note
		await page.waitForTimeout(600);
		await page.screenshot({ path: shot("margin-notes") });
		await pair("margin-notes", still("margin-notes.jpg"), ourView("margin-notes"));
		await ctx.close();
	}
	if (want("margin-thread")) {
		const ctx = await context();
		const page = await openNote(ctx, ids["YouTube Ideas"]);
		await page.click("[data-thread=thr_a] [data-testid=nb-thread-open]");
		await page.waitForTimeout(900);
		await page.mouse.move(757 - STILL.x, 515 - STILL.y); // on item 4, as in the frame
		await page.waitForTimeout(700);
		await page.screenshot({ path: shot("margin-thread") });
		await pair("margin-thread", still("margin-thread.jpg"), ourView("margin-thread"));
		await ctx.close();
	}
	if (want("inline-sketch-and-selection")) {
		const ctx = await context();
		const page = await openNote(ctx, ids["2D Dynamic Programming"]);
		await page.getByTestId("nb-sketch").waitFor();
		await page.locator(".nb-prose p", { hasText: DP_LINE }).click();
		await page.keyboard.press("Home");
		await page.keyboard.press("Shift+End");
		await page.getByTestId("nb-selection-menu").waitFor();
		await page.waitForTimeout(600);
		await page.mouse.move(633 - STILL.x, 298 - STILL.y);
		await page.waitForTimeout(300);
		await page.screenshot({ path: shot("inline-sketch-and-selection") });
		await pair("inline-sketch-and-selection", still("inline-sketch-and-selection.jpg"), ourView("inline-sketch-and-selection"));
		await ctx.close();
	}
	if (want("note-chat-panel")) {
		const ctx = await context();
		const page = await openNote(ctx, ids["2D Dynamic Programming"]);
		await page.getByTestId("nb-sketch").waitFor();
		await page.click('[data-testid="nb-chat"]');
		await page.getByTestId("nb-chat-panel").waitFor();
		await page.waitForTimeout(800);
		await page.mouse.move(1000, 950);
		await page.screenshot({ path: shot("note-chat-panel") });
		await pair("note-chat-panel", still("note-chat-panel.jpg"), ourView("note-chat-panel"));
		await ctx.close();
	}
	if (want("sidebar-and-settings") || want("settings-bottom") || want("dark-appearance")) {
		for (const appearance of ["light", "dark"]) {
			await notebookSettings({ appearance, lastNoteId: ids.Journal });
			const ctx = await context();
			const page = await openNote(ctx, ids.Journal);
			await page.getByTestId("nb-menu-button").filter({ visible: true }).click();
			await page.getByTestId("nb-side-dot").first().waitFor();
			await page.waitForTimeout(400);
			await page.click('[data-testid="nb-side-settings"]');
			await page.getByTestId("nb-settings").waitFor();
			await page.waitForTimeout(600);
			await page.mouse.move(895 - STILL.x, 333 - STILL.y); // on "Thinks with you", as in the frame
			await page.waitForTimeout(300);
			await page.screenshot({ path: shot(`sidebar-and-settings-${appearance}`) });
			await page.evaluate(() => { const el = document.querySelector('[data-testid="nb-settings-customize"]'); el.scrollTop = el.scrollHeight; });
			await page.mouse.move(1500, 950);
			await page.waitForTimeout(400);
			await page.screenshot({ path: shot(`settings-bottom-${appearance}`) });
			if (appearance === "light") {
				await pair("sidebar-and-settings", still("sidebar-and-settings.jpg"), ourView("sidebar-and-settings-light"));
			} else {
				const modal = await box(page, '[data-testid="nb-settings"]');
				// sheet-10 tile 9: the dark modal scrolled to its end, and the whole dark viewport.
				const tileModal = { x: 1824, y: 996, width: 352, height: 300 };
				await pair("settings-bottom", { file: path.join(FRAMES, "sheet-10.jpg"), region: tileModal, scale: SHEET_SCALE },
					{ file: shot("settings-bottom-dark"), region: { x: modal.x - 6, y: modal.y - 6, width: Math.round(tileModal.width * SHEET_SCALE), height: Math.round(tileModal.height * SHEET_SCALE) } });
				const tileView = { x: 1658, y: 948, width: VIEW.width / SHEET_SCALE, height: 401 };
				await pair("dark-appearance", { file: path.join(FRAMES, "sheet-10.jpg"), region: tileView, scale: SHEET_SCALE },
					{ file: shot("settings-bottom-dark"), region: { x: 0, y: 0, width: VIEW.width, height: Math.min(VIEW.height, Math.round(401 * SHEET_SCALE)) } });
			}
			await ctx.close();
		}
		await notebookSettings({ appearance: "light" });
	}
	if (want("export-dialog")) {
		await notebookSettings({ lastNoteId: ids.Journal });
		const ctx = await context();
		const page = await openNote(ctx, ids.Journal);
		await page.evaluate(() => { localStorage.setItem("lh.nb.exportFormat", "pdf"); localStorage.setItem("lh.nb.exportNotes", "with"); });
		await page.click('[data-testid="nb-export"]');
		await page.getByTestId("nb-export-dialog").waitFor();
		await page.waitForTimeout(600);
		await page.mouse.move(1000, 950);
		await page.screenshot({ path: shot("export-dialog") });
		const dialog = await box(page, '[data-testid="nb-export-dialog"]');
		// sheet-10 tile 2: the dialog with a 13 x 12 px margin.
		const tile = { x: 1090, y: 175, width: 230, height: 150 };
		await pair("export-dialog", { file: path.join(FRAMES, "sheet-10.jpg"), region: tile, scale: SHEET_SCALE },
			{ file: shot("export-dialog"), region: { x: dialog.x - 13, y: dialog.y - 12, width: Math.round(tile.width * SHEET_SCALE), height: Math.round(tile.height * SHEET_SCALE) } });
		await ctx.close();
	}
}

// ─── the motion strips ──────────────────────────────────────────────────────

async function motions(ids) {
	// Two more notes for the motion runs, made after the stills so the sidebar shows the frame's list.
	for (const [name, content, mode] of [["Sketch draw-in", `${DP_LINE}\n`, "ask"], ["Live read", "", "thinks"]]) {
		ids[name] = (await api("/api/library/pages", "POST", { name, content })).item.id;
		writeCompanion(ids[name], { mode });
	}
	const done = [];
	for (const reduced of [false, true]) {
		const tag = reduced ? "-reduced" : "";
		const run = async (name, fn) => {
			if (!want(name)) return;
			const ctx = await context({ reduced });
			try {
				const { frames, clip, pick } = await fn(ctx);
				await strip(`${name}${tag}`, frames, clip, pick);
				done.push(`${name}${tag}`);
			} finally { await ctx.close(); }
		};
		// Underline → blot → question: a live automatic read (faux model) after he stops typing.
		await run("live-read", async (ctx) => {
			const page = await openNote(ctx, ids["Live read"]);
			await page.click('[data-testid="nb-editor"]');
			await page.keyboard.press("ControlOrMeta+a");
			await page.keyboard.press("Backspace");
			await page.keyboard.type(`Being a hyper competitive person is what made me good at CS. It keeps me sharp. (${reduced ? "reduced" : "motion"})`, { delay: 5 });
			const line = await box(page, ".nb-prose p");
			const clip = { x: 40, y: Math.max(0, line.y - 60), width: VIEW.width - 80, height: 240 };
			const frames = await burst(page, path.join(OUT, "motion", `live-read${tag}`), clip, async () => {}, { count: 90 });
			return { frames, clip, pick: 3 };
		});
		// Tether draw and thread unfold: opening a collapsed margin note.
		for (const [name, region] of [["tether-draw", "tether"], ["thread-unfold", "thread"]]) {
			await run(name, async (ctx) => {
				const page = await openNote(ctx, ids["YouTube Ideas"]);
				const column = await box(page, '[data-testid="nb-column"]');
				const clip = region === "tether"
					? { x: column.x - 90, y: 120, width: 160, height: 680 }
					: { x: 16, y: 120, width: column.x + 80, height: 680 };
				const frames = await burst(page, path.join(OUT, "motion", `${name}${tag}`), clip,
					() => page.click("[data-thread=thr_a] [data-testid=nb-thread-open]"), { count: 14 });
				return { frames, clip, pick: 1 };
			});
		}
		// Sketch draw-in: Visualize on the selected line (faux model returns the frame's drawing).
		await run("sketch-draw-in", async (ctx) => {
			const page = await openNote(ctx, ids["Sketch draw-in"]);
			await page.locator(".nb-prose p", { hasText: DP_LINE }).first().click();
			await page.keyboard.press("Home");
			await page.keyboard.press("Shift+End");
			await page.getByTestId("nb-selection-menu").waitFor();
			const column = await box(page, '[data-testid="nb-column"]');
			const clip = { x: column.x - 10, y: 230, width: column.width + 20, height: 720 };
			await page.getByTestId("nb-sel-visualize").click();
			await page.getByTestId("nb-sketch").waitFor({ timeout: 30_000 });
			const frames = await burst(page, path.join(OUT, "motion", `sketch-draw-in${tag}`), clip, async () => {}, { count: 60 });
			return { frames, clip, pick: 2 };
		});
		await run("chat-panel-open", async (ctx) => {
			const page = await openNote(ctx, ids["2D Dynamic Programming"]);
			const clip = { x: 465, y: 0, width: 1200, height: VIEW.height };
			const frames = await burst(page, path.join(OUT, "motion", `chat-panel-open${tag}`), clip, () => page.click('[data-testid="nb-chat"]'), { count: 10 });
			return { frames, clip, pick: 1 };
		});
		await run("sidebar-open", async (ctx) => {
			const page = await openNote(ctx, ids["YouTube Ideas"]);
			const clip = { x: 0, y: 0, width: 900, height: VIEW.height };
			const frames = await burst(page, path.join(OUT, "motion", `sidebar-open${tag}`), clip, () => page.getByTestId("nb-menu-button").filter({ visible: true }).click(), { count: 10 });
			return { frames, clip, pick: 1 };
		});
		await run("theme-cross-fade", async (ctx) => {
			await notebookSettings({ appearance: "light", lastNoteId: ids["YouTube Ideas"] });
			const page = await openNote(ctx, ids["YouTube Ideas"]);
			await page.getByTestId("nb-menu-button").filter({ visible: true }).click();
			await page.getByTestId("nb-side-settings").click();
			await page.getByTestId("nb-settings").waitFor();
			await page.waitForTimeout(500);
			await page.getByTestId("nb-set-appearance-dark").scrollIntoViewIfNeeded();
			await page.waitForTimeout(200);
			const clip = { x: 0, y: 0, width: VIEW.width, height: VIEW.height };
			const frames = await burst(page, path.join(OUT, "motion", `theme-cross-fade${tag}`), clip, () => page.getByTestId("nb-set-appearance-dark").click(), { count: 10 });
			await notebookSettings({ appearance: "light" });
			return { frames, clip, pick: 1 };
		});
	}
	return done;
}

// ─── index.md ───────────────────────────────────────────────────────────────

/** Remaining differences per pair, from reading the composed images (update when the UI changes). */
const PAIR_NOTES = JSON.parse(readFileSync(new URL("./notebook-compare-notes.json", import.meta.url), "utf8"));

function writeIndex(motionDone) {
	const lines = [
		"# Notebook vs Riddled frames", "",
		`Generated by \`scripts/notebook-compare.mjs\` on ${new Date().toISOString().slice(0, 10)} (chrome-headless-shell, Linux, 1665 x 962 CSS px, 1x).`,
		"Frames: macOS stills cropped to their viewport (x ≥ 127, y ≥ 64); contact-sheet tiles scaled 2.4x. Linux sets the same fonts ≈3% wider than the frames, so line breaks differ where a line is near its measure (progress.md, width investigation).", "",
		"## Pairs (frame | ours, and overlay)", "",
	];
	for (const [name, notes] of Object.entries(PAIR_NOTES.pairs)) {
		if (!existsSync(path.join(OUT, "pairs", `${name}.png`))) continue;
		lines.push(`### ${name}`, "", `- [side by side](pairs/${name}.png) · [overlay](pairs/${name}-overlay.png)`, ...notes.map((n) => `- ${n}`), "");
	}
	lines.push("## Motion strips (~100 ms apart; `-reduced` = prefers-reduced-motion)", "");
	for (const [name, notes] of Object.entries(PAIR_NOTES.motion)) {
		const present = [name, `${name}-reduced`].filter((n) => motionDone.includes(n) || existsSync(path.join(OUT, "motion", `${n}.png`)));
		if (!present.length) continue;
		lines.push(`### ${name}`, "", `- ${present.map((n) => `[${n}](motion/${n}.png)`).join(" · ")}`, ...notes.map((n) => `- ${n}`), "");
	}
	writeFileSync(path.join(OUT, "index.md"), `${lines.join("\n")}\n`);
}

// ─── main ───────────────────────────────────────────────────────────────────

for (const dir of ["pairs", "ours", "motion"]) mkdirSync(path.join(OUT, dir), { recursive: true });
if (process.env.INDEX_ONLY) {
	// Rewrite index.md from notebook-compare-notes.json over the images already there.
	writeIndex([]);
	rmSync(DATA, { recursive: true, force: true });
	process.exit(0);
}
process.on("SIGINT", () => { stopServer(); process.exit(130); });
try {
	console.log(`data ${DATA}\nout  ${OUT}`);
	await startServer();
	const ids = await seed();
	browser = await chromium.launch({ executablePath: CHROME, env: { ...process.env, TMPDIR: tmpRoot } });
	composer = await browser.newPage();
	console.log("pairs…");
	await pairs(ids);
	console.log("motion…");
	const motionDone = await motions(ids);
	writeIndex(motionDone);
	console.log(`done: ${path.join(OUT, "index.md")}`);
} finally {
	await browser?.close();
	stopServer();
	rmSync(DATA, { recursive: true, force: true });
}
