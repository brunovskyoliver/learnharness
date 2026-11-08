/**
 * Feature 025, SC-001: one design system. Every component, stylesheet and
 * module in components/**, app/**, lib/**, src/** and electron/** speaks the
 * paper tokens (app/paper.css): no Study ink names, no Study faces, no
 * colour, size or face literals, no arbitrary radius, leading or tracking.
 * Literal colours live only in app/paper.css's token blocks (rules on
 * `html.lh-paper…`), and data colours (charts, demo series, PDF marks,
 * export palettes, Electron, Clerk) are listed with a reason in
 * tests/token-hygiene-allow.json.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { COLOR as DIAGRAM_COLOR } from "../src/core/diagram-svg.ts";
import { EXPORT_PALETTE } from "../src/core/notebook-export.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN = ["components", "app", "lib", "src", "electron"];
const EXT = /\.(tsx|ts|css|cjs|mjs|js)$/;

interface Allow { file: string; pattern: string; reason: string }
const allow: Allow[] = JSON.parse(readFileSync(join(ROOT, "tests/token-hygiene-allow.json"), "utf8"));

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, out);
		else if (EXT.test(name)) out.push(path);
	}
	return out;
}

/** Blanks comments, keeping line breaks so line numbers hold. */
function stripComments(src: string, css: boolean): string {
	const blank = (m: string) => m.replace(/[^\n]/g, " ");
	let out = src.replace(/\/\*[\s\S]*?\*\//g, blank);
	if (!css) out = out.replace(/(^|[\s;{}(,])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
	return out;
}

/** app/paper.css: blanks the values of custom properties declared in its
 *  token blocks (rules whose selector starts with `html.lh-paper`, at the
 *  top level or inside @media). Everything else is checked like any file. */
function maskTokenBlocks(src: string): string {
	const chars = [...src];
	const stack: boolean[] = [];
	let preludeStart = 0;
	for (let i = 0; i < chars.length; i++) {
		const c = chars[i];
		if (c === "{") {
			const prelude = src.slice(preludeStart, i).trim();
			stack.push(prelude.startsWith("html.lh-paper"));
			preludeStart = i + 1;
		} else if (c === "}") {
			stack.pop();
			preludeStart = i + 1;
		} else if (c === ";") {
			preludeStart = i + 1;
		}
		if (stack.at(-1) && c === "-" && chars[i + 1] === "-" && /[\s{;]/.test(src[i - 1] ?? "")) {
			const colon = src.indexOf(":", i);
			const end = src.indexOf(";", colon);
			if (colon > 0 && end > colon && !src.slice(i, colon).includes("\n")) {
				for (let j = colon + 1; j < end; j++) if (chars[j] !== "\n") chars[j] = " ";
				i = end - 1;
			}
		}
	}
	return chars.join("");
}

const STUDY_NAMES = "background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|success|warning|input|ring|border";

const RULES: { name: string; re: RegExp; only?: (file: string) => boolean }[] = [
	{ name: "surface-raised", re: /surface-raised/ },
	{ name: "ink-2", re: /(?<![\w])ink-2(?![\w-])/ },
	{ name: "--message-surface", re: /--message-surface/ },
	{ name: "amber #e3a957", re: /#e3a957/i },
	{ name: "Source Sans", re: /source[ -]sans/i },
	{ name: "JetBrains Mono", re: /jetbrains/i },
	{ name: "font-title / font-prose / font-ui", re: /(?<![\w])font-(title|prose|ui)(?![\w-])/ },
	{ name: "Study colour utility", re: new RegExp(`(?<![\\w-])(?:bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|divide|placeholder|caret|accent|decoration|from|via|to|shadow)-(?:${STUDY_NAMES})(?![\\w-])`) },
	{ name: "Study colour variable", re: new RegExp(`var\\(--(?:${STUDY_NAMES})\\s*[,)]`) },
	{ name: "dark: variant", re: /(?<![\w-])dark:[\w[&-]/, only: (f) => !f.endsWith(".css") },
	{ name: "hex colour", re: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/ },
	{ name: "rgb/hsl colour", re: /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((?!\))/ },
	{ name: "font-size px", re: /font-size:\s*[\d.]+px/ },
	{ name: "text-[…px]", re: /(?<![\w-])text-\[[\d.]+px\]/ },
	{ name: "text-[…] arbitrary size", re: /(?<![\w-])text-\[[\d.]+(?:rem|em|pt)\]/ },
	{ name: "arbitrary radius/leading/tracking", re: /(?<![\w-])(?:rounded(?:-[a-z]{1,2})?|leading|tracking)-\[[^\]]+\]/ },
	{ name: "fontSize number", re: /fontSize:\s*(?:[\d.]+|["'`][\d.]+px)/ },
	{ name: "font-family literal", re: /font-family:\s*(?=\S)(?!(?:var\([^;]*\)|inherit|initial|unset|revert)\s*(?:[;}"'`]|$))[^;}"'`]+/ },
	{ name: "fontFamily literal", re: /fontFamily:\s*["'`](?!var\(|inherit)/ },
];

interface Hit { file: string; line: number; rule: string; text: string }

function scan(): Hit[] {
	const hits: Hit[] = [];
	for (const path of SCAN.flatMap((d) => walk(join(ROOT, d)))) {
		const file = relative(ROOT, path);
		const raw = readFileSync(path, "utf8");
		const css = file.endsWith(".css");
		let src = stripComments(raw, css);
		if (file === "app/paper.css") src = maskTokenBlocks(src);
		const rawLines = raw.split("\n");
		src.split("\n").forEach((line, i) => {
			for (const rule of RULES) {
				if (rule.only && !rule.only(file)) continue;
				if (rule.re.test(line)) hits.push({ file, line: i + 1, rule: rule.name, text: rawLines[i] ?? line });
			}
		});
	}
	return hits;
}

describe("token hygiene (feature 025, SC-001)", () => {
	const hits = scan();
	const used = new Set<number>();
	const open = hits.filter((h) => {
		const at = allow.findIndex((a) => a.file === h.file && new RegExp(a.pattern).test(h.text));
		if (at >= 0) used.add(at);
		return at < 0;
	});

	it("components, app, lib, src and electron use only paper tokens", () => {
		assert.deepEqual(open.map((h) => `${h.file}:${h.line} [${h.rule}] ${h.text.trim().slice(0, 160)}`), []);
	});

	it("every allowlist entry names a file, a pattern and a reason, and is still needed", () => {
		for (const [i, a] of allow.entries()) {
			assert.ok(a.file && a.pattern && a.reason && a.reason.length > 12, `entry ${i} is incomplete`);
			assert.ok(existsSync(join(ROOT, a.file)), `entry ${i}: ${a.file} does not exist`);
			assert.ok(used.has(i), `entry ${i} (${a.file} /${a.pattern}/) matches nothing; remove it`);
		}
	});

	it("the paper token blocks hold the light and dark values", () => {
		const css = readFileSync(join(ROOT, "app/paper.css"), "utf8");
		const masked = maskTokenBlocks(stripComments(css, true));
		assert.match(css, /html\.lh-paper\[data-theme="light"\][^{]*\{[^}]*--paper:\s*#f8f7f4/);
		assert.doesNotMatch(masked, /#f8f7f4/, "the masked sheet still shows a token value");
	});

	it("palettes that cannot read CSS variables mirror the paper tokens", () => {
		const css = readFileSync(join(ROOT, "app/paper.css"), "utf8");
		const tokens = (selector: string) => {
			const open = css.indexOf("{", css.indexOf(`${selector} {`));
			const body = css.slice(open + 1, css.indexOf("}", open));
			return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(([, n, hex]) => [n, hex!.toLowerCase()]));
		};
		const light = tokens('html.lh-paper[data-theme="light"]');
		const dark = tokens('html.lh-paper[data-theme="dark"]');
		// Exports (PDF, DOCX, sketch SVG): every colour entry is paper light.
		for (const [name, value] of Object.entries(EXPORT_PALETTE)) {
			if (value.startsWith("#")) assert.equal(value, light[name], `EXPORT_PALETTE.${name}`);
		}
		// Downloaded diagram SVG.
		const roles = { ground: "paper", raised: "shelf", raised2: "paper", ink: "ink", ink2: "graphite", edge: "faint", rule: "rule" } as const;
		for (const [role, name] of Object.entries(roles)) assert.equal(DIAGRAM_COLOR[role as keyof typeof roles], light[name], `diagram ${role}`);
		// Electron window colours: --paper and --ink, light and dark.
		const main = readFileSync(join(ROOT, "electron/main.cjs"), "utf8");
		for (const [scheme, t] of [["light", light], ["dark", dark]] as const) {
			const m = new RegExp(`${scheme}: Object\\.freeze\\(\\{ background: "(#[0-9a-f]{6})", symbol: "(#[0-9a-f]{6})" \\}\\)`).exec(main);
			assert.ok(m, `electron PAPER_CHROME.${scheme} not found`);
			assert.equal(m[1], t.paper, `electron ${scheme} background`);
			assert.equal(m[2], t.ink, `electron ${scheme} symbol`);
		}
	});
});
