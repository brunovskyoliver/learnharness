/**
 * Side-by-side pairs for the unified redesign (feature 025, T064), from the
 * shots scripts/unified-screens.mjs took. No server: it reads PNGs and
 * composes them in the browser (no image library), as notebook-compare does.
 *
 *   PAIRS_DIR/<pair>-<theme>-<width>.png        Notebook | Study, same theme and width
 *   BEFORE_AFTER_DIR/<combo>/<name>.png         before | after, every Study shot
 *
 * Pairs (Notebook shot name → Study shot name, or a crop of both):
 *   note-vs-lesson        notebook-note        | lesson-belief-top
 *   sidebar               notebook-sidebar     | sidebar-open
 *   settings              notebook-settings    | settings-customize   (the same modal)
 *   chat-vs-right-pane    notebook-chat        | right-pane-context
 *   thread-vs-check       notebook-thread-open | check-pending-expanded
 *   corner-hint           the bottom-right corner of notebook-note | lesson-belief-top
 *
 * Writes a JSON manifest beside each output folder (pairs.json,
 * before-after.json) for the index. A missing shot is listed, not fatal.
 *
 * Run: node scripts/unified-pairs.mjs
 *   AFTER_DIR         default ~/agent-runs/2026-11-07-unified-redesign/after
 *   BEFORE_DIR        default ~/agent-runs/2026-11-07-unified-redesign/before
 *   PAIRS_DIR         default ~/agent-runs/2026-11-07-unified-redesign/pairs
 *   BEFORE_AFTER_DIR  default ~/agent-runs/2026-11-07-unified-redesign/before-after
 *   CHROME_PATH       browser (default: the repo's chrome-headless-shell)
 *   ONLY              "pairs" or "before-after"
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const HOME = os.homedir();
const RUN = path.join(HOME, "agent-runs/2026-11-07-unified-redesign");
const AFTER = path.resolve(process.env.AFTER_DIR ?? path.join(RUN, "after"));
const BEFORE = path.resolve(process.env.BEFORE_DIR ?? path.join(RUN, "before"));
const PAIRS = path.resolve(process.env.PAIRS_DIR ?? path.join(RUN, "pairs"));
const BEFORE_AFTER = path.resolve(process.env.BEFORE_AFTER_DIR ?? path.join(RUN, "before-after"));
const CHROME = process.env.CHROME_PATH ?? path.join(HOME, ".t3/tools/chrome-headless-shell/linux64/156.0.8078.70/chrome-headless-shell");
const ONLY = process.env.ONLY ?? null;

const snapCommon = path.join(HOME, "snap", "chromium", "common");
const tmpRoot = process.env.PW_TMPDIR ?? (existsSync(snapCommon) ? snapCommon : os.tmpdir());
process.env.TMPDIR = tmpRoot;

const THEMES = ["light", "dark"];
const WIDTHS = [1440, 390];
const PAIR_LIST = [
	{ name: "note-vs-lesson", notebook: "notebook-note", study: "lesson-belief-top" },
	{ name: "sidebar", notebook: "notebook-sidebar", study: "sidebar-open" },
	{ name: "settings", notebook: "notebook-settings", study: "settings-customize" },
	{ name: "chat-vs-right-pane", notebook: "notebook-chat", study: "right-pane-context" },
	{ name: "thread-vs-check", notebook: "notebook-thread-open", study: "check-pending-expanded" },
	{ name: "corner-hint", notebook: "notebook-note", study: "lesson-belief-top", corner: true },
];

/** `<dir>/<NN>-<name>.png` by name (the NN prefix is the shot's place in the list). */
function shotFile(dir, name) {
	if (!existsSync(dir)) return null;
	const hit = readdirSync(dir).find((file) => file.replace(/^\d+-/, "") === `${name}.png`);
	return hit ? path.join(dir, hit) : null;
}
const pngSize = (file) => { const b = readFileSync(file); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; };
const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;

/** One image region, scaled, as a positioned div. */
function regionHtml(file, region, scale) {
	return `<div style="position:relative;overflow:hidden;width:${Math.round(region.width * scale)}px;height:${Math.round(region.height * scale)}px">`
		+ `<img src="${dataUrl(file)}" style="position:absolute;left:${-region.x * scale}px;top:${-region.y * scale}px;width:${Math.round(region.full.width * scale)}px;height:${Math.round(region.full.height * scale)}px"></div>`;
}
const label = (text) => `<div style="position:absolute;left:8px;top:6px;padding:2px 6px;background:#000b;color:#fff;border-radius:4px;font:600 13px system-ui,sans-serif">${text}</div>`;

let composer;
/** left | right, each region scaled to `scale`, labelled; written to `file`. */
async function sideBySide(file, left, right, scale) {
	const w = (r) => Math.round(r.region.width * scale), h = (r) => Math.round(r.region.height * scale);
	const width = w(left) + 12 + w(right), height = Math.max(h(left), h(right));
	await composer.setViewportSize({ width, height });
	await composer.setContent(`<!doctype html><html><body style="margin:0;background:#7f7f7f">`
		+ `<div style="display:flex;gap:12px;align-items:flex-start">`
		+ `<div style="position:relative">${regionHtml(left.file, left.region, scale)}${label(left.label)}</div>`
		+ `<div style="position:relative">${regionHtml(right.file, right.region, scale)}${label(right.label)}</div>`
		+ `</div></body></html>`);
	await composer.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
	await composer.screenshot({ path: file });
}
const whole = (file) => { const full = pngSize(file); return { x: 0, y: 0, width: full.width, height: full.height, full }; };
/** The bottom-right corner, where both modes keep the hint. */
const corner = (file) => {
	const full = pngSize(file);
	const width = Math.min(full.width, full.width > 600 ? 520 : full.width), height = Math.min(full.height, 160);
	return { x: full.width - width, y: full.height - height, width, height, full };
};

async function buildPairs() {
	mkdirSync(PAIRS, { recursive: true });
	const rows = [];
	for (const pair of PAIR_LIST) {
		for (const theme of THEMES) {
			for (const width of WIDTHS) {
				const nb = shotFile(path.join(AFTER, `notebook-${theme}-${width}`), pair.notebook);
				const st = shotFile(path.join(AFTER, `study-${theme}-${width}`), pair.study);
				const out = `${pair.name}-${theme}-${width}.png`;
				const row = { pair: pair.name, theme, width, file: out, notebook: nb && path.relative(RUN, nb), study: st && path.relative(RUN, st), ok: false };
				if (!nb || !st) { row.error = `missing ${!nb ? `notebook ${pair.notebook}` : ""}${!nb && !st ? " and " : ""}${!st ? `study ${pair.study}` : ""}`; rows.push(row); console.log(`skip ${out}: ${row.error}`); continue; }
				const region = pair.corner ? corner : whole;
				const scale = pair.corner ? 2 : width > 600 ? 0.6 : 1;
				await sideBySide(path.join(PAIRS, out), { file: nb, region: region(nb), label: `Notebook · ${pair.notebook}` }, { file: st, region: region(st), label: `Study · ${pair.study}` }, scale);
				row.ok = true;
				rows.push(row);
				console.log(`ok   ${out}`);
			}
		}
	}
	writeFileSync(path.join(PAIRS, "pairs.json"), JSON.stringify(rows, null, 2));
	return rows;
}

async function buildBeforeAfter() {
	const rows = [];
	for (const theme of THEMES) {
		for (const width of WIDTHS) {
			const combo = `study-${theme}-${width}`;
			const afterDir = path.join(AFTER, combo), beforeDir = path.join(BEFORE, combo);
			if (!existsSync(afterDir)) continue;
			mkdirSync(path.join(BEFORE_AFTER, combo), { recursive: true });
			const names = [...new Set([...(existsSync(beforeDir) ? readdirSync(beforeDir) : []), ...readdirSync(afterDir)]
				.filter((f) => f.endsWith(".png") && !f.endsWith("-full.png")).map((f) => f.replace(/^\d+-/, "").replace(/\.png$/, "")))].sort();
			for (const name of names) {
				const before = shotFile(beforeDir, name), after = shotFile(afterDir, name);
				const row = { combo, name, file: `${combo}/${name}.png`, before: !!before, after: !!after, ok: false };
				if (!before || !after) { row.error = !before ? "no before shot" : "no after shot"; rows.push(row); continue; }
				await sideBySide(path.join(BEFORE_AFTER, combo, `${name}.png`), { file: before, region: whole(before), label: "before" }, { file: after, region: whole(after), label: "after" }, width > 600 ? 0.6 : 1);
				row.ok = true;
				rows.push(row);
			}
			console.log(`${combo}: ${rows.filter((r) => r.combo === combo && r.ok).length} pairs`);
		}
	}
	mkdirSync(BEFORE_AFTER, { recursive: true });
	writeFileSync(path.join(BEFORE_AFTER, "before-after.json"), JSON.stringify(rows, null, 2));
	return rows;
}

const browser = await chromium.launch({ executablePath: CHROME, env: { ...process.env, TMPDIR: tmpRoot } });
try {
	composer = await browser.newPage();
	if (ONLY !== "before-after") await buildPairs();
	if (ONLY !== "pairs") await buildBeforeAfter();
} finally {
	await browser.close();
}
