/**
 * Feature 028, T010: the motion language in app/paper.css matches
 * specs/028-motion/contracts/motion-contract.md (§1 tokens, §1 keyframes,
 * §4 view-transition rules, §6 reduced motion, §7 print).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const css = readFileSync(`${ROOT}app/paper.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const contract = readFileSync(`${ROOT}specs/028-motion/contracts/motion-contract.md`, "utf8");

/** The body of the block whose `{` follows `index`. */
function blockAt(index: number, from = css): string {
	let depth = 0;
	const start = from.indexOf("{", index);
	for (let i = start; i < from.length; i++) {
		if (from[i] === "{") depth++;
		else if (from[i] === "}" && --depth === 0) return from.slice(start + 1, i);
	}
	throw new Error(`unclosed block at ${index}`);
}

/** The bodies of every block whose prelude matches. */
function blocks(prelude: RegExp): string[] {
	const re = new RegExp(prelude.source, "g");
	return [...css.matchAll(re)].map((m) => blockAt(m.index));
}

/** The body of the first block whose prelude matches. */
function block(prelude: RegExp): string {
	const [body] = blocks(prelude);
	assert.ok(body !== undefined, `no block ${prelude}`);
	return body;
}

const declarations = (body: string) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));

const TOKENS: Record<string, string> = {
	"--ease-ink": "cubic-bezier(0.2, 0.7, 0.2, 1)",
	"--ease-word": "cubic-bezier(0.25, 0.6, 0.3, 1)",
	"--ease-unfold": "cubic-bezier(0.22, 1, 0.36, 1)",
	"--ease-draw": "cubic-bezier(0.3, 0.7, 0.3, 1)",
	"--ease-pencil": "cubic-bezier(0.4, 0.1, 0.5, 1)",
	"--ease-splat": "cubic-bezier(0.2, 0.9, 0.25, 1.12)",
	"--ease-menu": "cubic-bezier(0.2, 0.8, 0.2, 1)",
	"--ease-out": "cubic-bezier(0.4, 0, 0.2, 1)",
	"--spring-soft": "var(--ease-menu)",
	"--spring-pop": "var(--ease-splat)",
	"--motion-press": "100ms",
	"--motion-lift": "140ms",
	"--motion-quick": "160ms",
	"--motion-settle": "200ms",
	"--motion-route": "280ms",
	"--motion-unfold": "340ms",
	"--motion-sheet": "340ms",
	"--motion-arrive": "360ms",
	"--motion-mark": "400ms",
	"--motion-mark-dot": "300ms",
	"--motion-mark-dot-delay": "280ms",
	"--motion-soak": "450ms",
	"--motion-splat": "460ms",
	"--motion-ink": "520ms",
	"--motion-draw": "560ms",
	"--motion-pencil": "800ms",
	"--motion-stagger": "40ms",
	"--stagger-cap": "240ms",
	"--motion-fade-reduced": "150ms",
};

const SPRINGS = {
	"--spring-soft": "linear(0, 0.053, 0.175, 0.324, 0.473, 0.609, 0.723, 0.814, 0.883, 0.934, 0.968, 0.991, 1.005, 1.012, 1.015, 1.015, 1)",
	"--spring-pop": "linear(0, 0.094, 0.302, 0.539, 0.751, 0.913, 1.019, 1.076, 1.094, 1.089, 1.07, 1.048, 1.027, 1.011, 1, 0.994, 1)",
};

/** The html.lh-paper block that holds the motion tokens. */
const tokenBlock = () => {
	const body = blocks(/html\.lh-paper\s*\{/).find((b) => b.includes("--motion-press"));
	assert.ok(body, "the motion token block on html.lh-paper");
	return declarations(body);
};

describe("motion tokens (contract §1)", () => {
	it("html.lh-paper defines every token with its value", () => {
		const defined = tokenBlock();
		for (const [name, value] of Object.entries(TOKENS)) assert.equal(defined[name], value, name);
	});

	it("every token the contract names is defined", () => {
		const table = contract.slice(contract.indexOf("## 1. Tokens"), contract.indexOf("## 2."));
		const rows = table.split("\n").filter((line) => line.startsWith("| `--"));
		const named = new Set(rows.flatMap((row) => [...row.split("|")[1]!.matchAll(/`(--[\w-]+)`/g)].map(([, n]) => n!)));
		assert.ok(named.size >= 25, `${named.size} tokens in the contract table`);
		const defined = tokenBlock();
		for (const name of named) assert.ok(name in defined, `${name} is in the contract but not in app/paper.css`);
	});

	it("springs are linear() behind @supports, with cubic fallbacks", () => {
		const supports = declarations(block(/@supports\s*\(animation-timing-function:\s*linear\(0,\s*1\)\)\s*\{/));
		for (const [name, value] of Object.entries(SPRINGS)) assert.equal(supports[name], value, name);
	});

	it("phones get 24ms steps and a 160ms cap (FR-025, gate 2)", () => {
		const phone = declarations(block(/@media\s*\(max-width:\s*639px\)\s*\{\s*html\.lh-paper\s*\{\s*--motion-stagger/));
		assert.equal(phone["--motion-stagger"], "24ms");
		assert.equal(phone["--stagger-cap"], "160ms");
	});
});

const ALLOWED = new Set(["transform", "opacity", "clip-path", "mask", "mask-image", "stroke-dashoffset"]);
const NEW_KEYFRAMES = ["lh-lift", "lh-fade", "lh-dialog-rise", "lh-sheet-in", "lh-mark-draw"];

describe("new keyframes (contract §1, FR-017)", () => {
	for (const name of NEW_KEYFRAMES) {
		it(`${name} animates only transform, opacity, clip-path, mask and stroke-dashoffset`, () => {
			const body = block(new RegExp(`@keyframes\\s+${name}\\s*\\{`));
			const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map(([, p]) => p!);
			assert.ok(props.length > 0, `${name} is empty`);
			for (const p of props) assert.ok(ALLOWED.has(p), `${name} animates ${p}`);
		});
	}
});

describe("view transitions (contract §4)", () => {
	it("the overlay never takes pointer events", () => {
		assert.match(css, /::view-transition\s*\{\s*pointer-events:\s*none;\s*\}/);
	});
	it("route and mode transitions leave the root unnamed and lift the old content", () => {
		assert.match(css, /html:active-view-transition-type\(lh-route,\s*lh-mode\)\s*\{\s*view-transition-name:\s*none;\s*\}/);
		assert.match(css, /::view-transition-old\(\.lh-lift\)\s*\{\s*animation:\s*var\(--motion-lift\)\s+var\(--ease-out\)\s+both\s+lh-lift;\s*\}/);
	});
});

/** Every arrival hook of contract §3 and §8 that the reduced-motion ceiling must name. */
const ARRIVAL_SELECTORS = ["[data-lh-arrive]", "[data-arrive]", "[data-ink-order]", ".nb-wordmark-mark", "::view-transition-old(.lh-lift)"];

describe("reduced motion (FR-013, contract §6)", () => {
	const reduced = () => blocks(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/).find((b) => b.includes("[data-lh-arrive]")) ?? "";

	it("one block names every arrival selector", () => {
		const body = reduced();
		assert.ok(body, "a reduced-motion block for the arrivals");
		for (const selector of ARRIVAL_SELECTORS) assert.ok(body.includes(selector), `reduced motion does not name ${selector}`);
	});

	it("fades are opacity-only and within --motion-fade-reduced", () => {
		const body = reduced();
		for (const [, value] of body.matchAll(/animation:\s*([^;]+);/g)) {
			if (/^none\b/.test(value!)) continue;
			assert.match(value!, /var\(--motion-fade-reduced\)/, value);
			assert.match(value!, /\b(lh-fade|lh-lift)\b/, value);
		}
		assert.match(body, /stroke-dashoffset:\s*0/);
	});
});

describe("print (FR-021, contract §7)", () => {
	it("every animation and transition jumps to its end in print", () => {
		const motion = blocks(/@media print\s*\{/).find((b) => b.includes("animation-duration"));
		assert.ok(motion, "a print block for motion");
		assert.match(motion!, /animation-duration:\s*0s\s*!important/);
		assert.match(motion!, /animation-delay:\s*0s\s*!important/);
		assert.match(motion!, /transition:\s*none\s*!important/);
	});
});

describe("layers (feature 028, T049, research R7)", () => {
	it("no inert tw-animate-css class is left under components/ui", async () => {
		const { readdirSync } = await import("node:fs");
		const dir = `${ROOT}components/ui`;
		for (const name of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
			const source = readFileSync(`${dir}/${name}`, "utf8");
			for (const inert of [/\banimate-in\b/, /\banimate-out\b/, /\bzoom-(in|out)-/, /\bslide-in-from-/, /\bfade-in-0\b/, /\bfade-out-0\b/]) {
				assert.doesNotMatch(source, inert, `${name}: ${inert.source}`);
			}
		}
	});

	it("every layer exit is a short lift that takes no clicks (FR-004)", () => {
		const exits = blocks(/\[data-state="closed"\][^{]*\{/).filter((b) => /animation:/.test(b) && !/animation:\s*none/.test(b));
		assert.ok(exits.length >= 3, "dialog, menu and sidebar exits");
		for (const body of exits) {
			assert.match(body, /lh-lift/);
			assert.match(body, /pointer-events:\s*none/);
		}
	});
});
