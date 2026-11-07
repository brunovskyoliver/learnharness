#!/usr/bin/env node
/**
 * Paper codemod (feature 025, task T010). Applies the ui-contract token table
 * (specs/025-unified-redesign/contracts/ui-contract.md) to components/**,
 * app/** and lib/**: Study's shadcn colour names, faces, type steps, radii,
 * shadows and `dark:` variants become the paper system's. Kept in the repo
 * for the record; running it again on migrated code changes nothing.
 *
 * Notebook is excluded (components/notebook, app/(app)/notebook): it already
 * speaks paper through its own CSS. components/paper is new paper code.
 *
 * Every hit that needs a person (a `primary` that may mean "your turn", a
 * title, a floating surface, a removed shadow or `dark:` class, an arbitrary
 * size) is printed in the report for the manual pass (T011).
 *
 *   node scripts/paper-codemod.mjs            # rewrite files, print report
 *   node scripts/paper-codemod.mjs --dry      # report only
 *   node scripts/paper-codemod.mjs --report=path.md
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN = ["components", "app", "lib"];
const EXCLUDE = [
	"components/notebook",
	"app/(app)/notebook",
	"components/paper",
	"components/ui/SHADCN-LICENSE",
	// Paper's own sheet: its token blocks define the bridge names; its sizes
	// go through the Notebook pass below (exact values only).
	"app/paper.css",
	// Study's retired appearance writer (phase 6 removes it): its string keys
	// are the old variable names and must stay as they are.
	"components/settings/appearance-vars.ts",
];
/** Notebook's sheets: only exact px font sizes become scale variables, so
 *  no computed value changes. Off-scale sizes are named tokens, by hand. */
const NOTEBOOK_CSS = ["app/paper.css", "app/(app)/notebook/notebook.css"];
const NOTEBOOK_PX = { 11: "--text-2xs", 12: "--text-xs", 12.5: "--text-meta", 13: "--text-sm", 13.5: "--text-ui", 14: "--text-md", 14.5: "--text-reply", 17: "--text-lg", 19: "--text-xl" };
const EXT = /\.(tsx|ts|css)$/;
const dry = process.argv.includes("--dry");
const reportArg = process.argv.find((a) => a.startsWith("--report="));

/* ── The token table ─────────────────────────────────────────────────── */

/** Study colour name → paper colour name (Tailwind colour utilities). */
const COLOR = {
	"background": "paper",
	"foreground": "ink",
	"card": "shelf",
	"card-foreground": "ink",
	"popover": "paper",
	"popover-foreground": "ink",
	"primary": "ink", // reported: "your turn" / waiting → bulb (owner Q4)
	"primary-foreground": "paper",
	"secondary": "shelf",
	"secondary-foreground": "ink",
	"muted": "shelf",
	"muted-foreground": "faint",
	"accent": "shelf",
	"accent-foreground": "ink",
	"destructive": "red",
	"destructive-foreground": "paper",
	"success": "green",
	"warning": "bulb",
	"border": "rule",
	"input": "rule",
	"ring": "focus",
	"ink-2": "graphite",
};

/** The same names as CSS custom properties → the paper token. */
const VAR = {
	"--background": "--paper",
	"--foreground": "--ink",
	"--card": "--shelf",
	"--card-foreground": "--ink",
	"--popover": "--paper",
	"--popover-foreground": "--ink",
	"--primary": "--ink", // reported
	"--primary-foreground": "--paper",
	"--secondary": "--shelf",
	"--secondary-foreground": "--ink",
	"--muted": "--shelf",
	"--muted-foreground": "--faint",
	"--accent": "--shelf",
	"--accent-foreground": "--ink",
	"--destructive": "--text-red",
	"--success": "--text-green",
	"--warning": "--bulb",
	"--border": "--rule",
	"--input": "--rule",
	"--ring": "--nb-focus",
	"--ink-2": "--graphite",
	"--color-border": "--rule",
	"--font-ui": "--font-sans",
	"--font-prose": "--font-sans",
	"--font-title": "--font-sans", // reported
	"--lh-prose-size": "--note-size",
};

/** Tailwind utility prefixes that take a colour. */
const COLOR_PREFIX = [
	"bg", "text", "border", "border-x", "border-y", "border-t", "border-r", "border-b", "border-l", "border-s", "border-e",
	"divide", "ring", "ring-offset", "inset-ring", "outline", "fill", "stroke", "placeholder", "caret", "accent",
	"decoration", "from", "via", "to", "shadow",
];

/** Study type steps → paper steps (contract: 15 → text-md, 40 → text-title;
 *  12, 13, 17, 22→19, 30→26.4 keep their names). */
const SIZE = { "text-base": "text-md", "text-3xl": "text-title" };

/** Arbitrary px sizes → the R4 scale. */
const PX = { 10: "2xs", 10.5: "2xs", 11: "2xs", 11.5: "xs", 12: "xs", 12.5: "meta", 13: "sm", 13.5: "ui", 14: "md", 14.5: "reply", 15: "md", 16: "base", 17: "lg", 18: "lg", 19: "xl", 22: "xl" };
/** CSS font-size px → the scale variable (exact steps only). */
const CSS_PX = { 11: "--text-2xs", 12: "--text-xs", 12.5: "--text-meta", 13: "--text-sm", 13.5: "--text-ui", 14: "--text-md", 14.5: "--text-reply", 15: "--text-md", 17: "--text-lg", 19: "--text-xl" };

/** Radii (old Study: xs/sm/md 6px, lg/xl/2xl 10px). Controls 8 (md), cards 10 (lg). */
const RADIUS = { "sm": "md", "xl": "lg", "2xl": "lg", "[10px]": "lg", "[6px]": "md", "[8px]": "md", "[4px]": "xs" };

/* ── Walk ───────────────────────────────────────────────────────────── */

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		const rel = relative(ROOT, path);
		if (EXCLUDE.some((x) => rel === x || rel.startsWith(x + "/"))) continue;
		if (statSync(path).isDirectory()) walk(path, out);
		else if (EXT.test(name)) out.push(path);
	}
	return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const B = "(?<![\\w-])"; // not inside a longer name
const E = "(?![\\w-])";

const counts = {};
const report = [];
const bump = (k, n = 1) => { counts[k] = (counts[k] ?? 0) + n; };
const note = (file, line, kind, text) => report.push({ file, line, kind, text: text.trim().slice(0, 220) });

const colorRe = new RegExp(
	`${B}((?:${COLOR_PREFIX.map(esc).sort((a, b) => b.length - a.length).join("|")}))-(${Object.keys(COLOR).map(esc).sort((a, b) => b.length - a.length).join("|")})${E}`,
	"g",
);
const varRe = new RegExp(`(${Object.keys(VAR).map(esc).sort((a, b) => b.length - a.length).join("|")})${E}`, "g");
const sizeRe = new RegExp(`${B}(${Object.keys(SIZE).map(esc).join("|")})${E}`, "g");
const radiusRe = /(?<![\w-])rounded(-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?-(sm|xl|2xl|\[10px\]|\[6px\]|\[8px\]|\[4px\])(?![\w-])/g;
const pxRe = /(?<![\w-])text-\[(\d+(?:\.\d+)?)px\](?![\w-])/g;
const shadowRe = /(?<![\w-])shadow-(xs|sm|md|lg|xl|2xl|\[[^\]]+\])(?![\w-])/g;
const darkRe = /(?<![\w-])dark:[^\s"'`]+/g;
const fontRe = /(?<![\w-])font-(ui|prose)(?![\w-])/g;
const titleRe = /(?<![\w-])font-title(?![\w-])/g;

/** Drops a class and one neighbouring space, so no double or edge space is left. */
function remove(line, re, onHit) {
	const src = re.source;
	const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
	const both = new RegExp(`[ \\t]+(?:${src})(?=[\\s"'\`]|$)|(?:${src})[ \\t]+|(?:${src})`, flags);
	return line.replace(both, (m) => { onHit(m.trim()); return ""; });
}

function transformLine(line, file, n, isCss) {
	let out = line;
	const orig = line;
	// 1. colour utilities
	out = out.replace(colorRe, (m, prefix, name) => {
		if (name === "primary" || name === "primary-foreground") note(file, n, "primary", orig);
		if (name === "secondary") note(file, n, "secondary", orig);
		bump(`${prefix}-${name} → ${prefix}-${COLOR[name]}`);
		return `${prefix}-${COLOR[name]}`;
	});
	// 2. custom properties (var(--x), getPropertyValue("--x"), [--x:..])
	out = out.replace(varRe, (m, name, offset, s) => {
		// A local definition (`--ring: var(--ink)` on a row) is renamed too, so
		// the override still reaches what reads it. Only the Tailwind theme's
		// own keys (`--color-border:`) stay: they are not bridge names.
		const after = s.slice(offset + m.length).trimStart();
		if (after.startsWith(":") && name === "--color-border") return m;
		if (name === "--primary") note(file, n, "primary", orig);
		if (name === "--font-title") note(file, n, "title", orig);
		bump(`${name} → ${VAR[name]}`);
		return VAR[name];
	});
	// 3. faces
	out = out.replace(fontRe, (m, f) => { bump(`font-${f} → font-sans`); return "font-sans"; });
	if (isCss && titleRe.test(out)) { titleRe.lastIndex = 0; note(file, n, "title", orig); }
	else if (titleRe.test(out)) {
		titleRe.lastIndex = 0;
		note(file, n, "title", orig);
		out = out.replace(titleRe, () => { bump("font-title → font-medium tracking-title"); return "tracking-title"; });
		out = remove(out, /(?<![\w-])tracking-\[[^\]]+\](?![\w-])/g, () => {});
		out = out.replace(/(?<![\w-])font-(semibold|bold)(?![\w-])/g, "font-medium");
		if (!/(?<![\w-])font-(medium|normal|light)(?![\w-])/.test(out)) out = out.replace(/(?<![\w-])tracking-title(?![\w-])/, "font-medium tracking-title");
	}
	// collapse duplicates left by the face merge
	out = out.replace(/(?<![\w-])font-sans(\s+[^"'`]*?)?\s+font-sans(?![\w-])/g, (m, mid = "") => `font-sans${mid}`);
	// 4. type steps (not in CSS: `var(--text-base)` handled below)
	if (!isCss) {
		out = out.replace(sizeRe, (m) => { bump(`${m} → ${SIZE[m]}`); return SIZE[m]; });
		out = out.replace(pxRe, (m, px) => {
			const step = PX[Number(px)];
			note(file, n, "size", orig);
			if (!step) return m;
			bump(`text-[${px}px] → text-${step}`);
			return `text-${step}`;
		});
	} else {
		out = out.replace(/var\(--text-base\)/g, () => { bump("var(--text-base) → var(--text-md)"); return "var(--text-md)"; });
		out = out.replace(/var\(--text-3xl\)/g, () => { bump("var(--text-3xl) → var(--text-title)"); return "var(--text-title)"; });
	}
	// CSS font-size px (in .css files and css-in-js strings)
	out = out.replace(/font-size:\s*(\d+(?:\.\d+)?)px/g, (m, px) => {
		const v = CSS_PX[Number(px)];
		if (!v) { note(file, n, "size", orig); return m; }
		bump(`font-size: ${px}px → var(${v})`);
		return `font-size: var(${v})`;
	});
	// 5. radii
	// (a line already lifted is a floating surface: its 12px stays)
	const lifted = /(?<![\w-])shadow-lift(?![\w-])/.test(orig);
	out = out.replace(radiusRe, (m, side = "", r) => { if (lifted && r === "xl") return m; bump(`rounded${side}-${r} → rounded${side}-${RADIUS[r]}`); return `rounded${side}-${RADIUS[r]}`; });
	if (isCss) out = out.replace(/border-radius:\s*6px/g, () => { bump("border-radius: 6px → var(--radius-md)"); return "border-radius: var(--radius-md)"; });
	// 6. floating surfaces: was bg-popover → paper + lift, radius 12
	if (/(?<![\w-])bg-popover(?![\w-])/.test(orig)) {
		note(file, n, "floating", orig);
		out = out.replace(/(?<![\w-])rounded-(lg|md)(?![\w-])/, () => { bump("floating radius → rounded-xl"); return "rounded-xl"; });
		if (!/(?<![\w-])shadow-lift(?![\w-])/.test(out)) out = out.replace(/(?<![\w-])bg-paper(?![\w-])/, () => { bump("floating: + shadow-lift"); return "bg-paper shadow-lift"; });
	}
	// 7. shadows: only lift, on floating surfaces
	out = remove(out, shadowRe, (m) => { note(file, n, "shadow", orig); bump(`${m} removed`); });
	// 8. dark: variants (the paper tokens carry the theme)
	if (!isCss) out = remove(out, darkRe, () => { note(file, n, "dark", orig); bump("dark: variant removed"); });
	// remaining amber or white-on-dark assumptions: report only
	if (/(?<![\w-])(bg|text|border|fill|stroke|decoration)-(white|black)(?![\w-])|bg-white\/|#e3a957/.test(orig)) note(file, n, "white-black", orig);
	return out;
}

const files = SCAN.flatMap((d) => walk(join(ROOT, d)));
let changed = 0;
for (const path of files) {
	const rel = relative(ROOT, path);
	const src = readFileSync(path, "utf8");
	const isCss = rel.endsWith(".css");
	const lines = src.split("\n");
	const next = lines.map((l, i) => transformLine(l, rel, i + 1, isCss)).join("\n");
	if (next !== src) {
		changed++;
		if (!dry) writeFileSync(path, next);
	}
}

for (const rel of NOTEBOOK_CSS) {
	const path = join(ROOT, rel);
	const src = readFileSync(path, "utf8");
	const next = src.split("\n").map((line, i) => line.replace(/font-size:\s*(\d+(?:\.\d+)?)px/g, (m, px) => {
		const v = NOTEBOOK_PX[Number(px)];
		if (!v) { note(rel, i + 1, "size", line); return m; }
		bump(`(Notebook) font-size: ${px}px → var(${v})`);
		return `font-size: var(${v})`;
	})).join("\n");
	if (next !== src) { changed++; if (!dry) writeFileSync(path, next); }
}

const kinds = {
	primary: "primary: ink by default; \"your turn\" / waiting → bulb, primary action → ink pill",
	secondary: "secondary: shelf; check it is not a button variant",
	title: "font-title: titles are sans 500 at −0.032em (tracking-title)",
	floating: "floating surface (was bg-popover): paper + shadow-lift, radius 12",
	shadow: "shadow removed (only shadow-lift on floating surfaces)",
	dark: "dark: variant removed",
	size: "arbitrary or off-scale size",
	"white-black": "white/black or amber literal (dark-only assumption?)",
};
const lines = [`# Paper codemod report`, ``, `${files.length} files scanned, ${changed} changed${dry ? " (dry run)" : ""}.`, ``, `## Mechanical replacements`, ``];
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) lines.push(`- ${v} × ${k}`);
lines.push("", "## Needs a decision", "");
for (const [kind, label] of Object.entries(kinds)) {
	const hits = report.filter((r) => r.kind === kind);
	if (!hits.length) continue;
	lines.push(`### ${label} (${hits.length})`, "");
	for (const h of hits) lines.push(`- ${h.file}:${h.line} \`${h.text.replace(/`/g, "'")}\``);
	lines.push("");
}
const text = lines.join("\n");
if (reportArg) writeFileSync(reportArg.slice("--report=".length), text);
else process.stdout.write(text + "\n");
