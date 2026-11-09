/** Feature 028, T009: the motion language's pure decisions (src/core/motion.ts). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SIGNATURE_ATTRIBUTE, SIGNATURE_KEY, SIGNATURE_SCRIPT, STAGGER, arrivalKind, signatureDecision, soakOrigin, staggerCount, staggerDelay } from "../src/core/motion.ts";

/** Runs the inline script against a fake tab: its storage and its document. */
function runScript(input: { visible: boolean; stored: boolean; blocked?: boolean }) {
	const store = new Map<string, string>(input.stored ? [[SIGNATURE_KEY, "1"]] : []);
	const attributes = new Map<string, string>();
	const sessionStorage = {
		getItem: (k: string) => { if (input.blocked) throw new Error("blocked"); return store.get(k) ?? null; },
		setItem: (k: string, v: string) => { if (input.blocked) throw new Error("blocked"); store.set(k, v); },
	};
	const document = {
		visibilityState: input.visible ? "visible" : "hidden",
		documentElement: { setAttribute: (k: string, v: string) => attributes.set(k, v) },
	};
	new Function("sessionStorage", "document", SIGNATURE_SCRIPT)(sessionStorage, document);
	return { played: attributes.get(SIGNATURE_ATTRIBUTE) === "signature", stored: store.get(SIGNATURE_KEY) === "1", attributes };
}

describe("signature once per tab session (FR-012, R5)", () => {
	for (const visible of [true, false]) {
		for (const stored of [true, false]) {
			it(`visible=${visible} stored=${stored}: the inline script matches signatureDecision`, () => {
				const decision = signatureDecision({ visible, stored });
				const ran = runScript({ visible, stored });
				assert.equal(ran.played, decision.play);
				assert.equal(decision.play, visible && !stored);
				// The flag is written even when the signature is skipped.
				assert.equal(ran.stored, true);
				assert.equal(decision.store, true);
			});
		}
	}

	it("blocked storage fails closed: no attribute, no throw", () => {
		const ran = runScript({ visible: true, stored: false, blocked: true });
		assert.equal(ran.played, false);
		assert.equal(ran.attributes.size, 0);
	});

	it("stays tiny and inert to HTML (one inline line)", () => {
		assert.ok(SIGNATURE_SCRIPT.length < 300, `${SIGNATURE_SCRIPT.length} bytes`);
		assert.ok(!SIGNATURE_SCRIPT.includes("<"));
		assert.ok(!SIGNATURE_SCRIPT.includes("\n"));
	});
});

describe("arrival kind (data-model)", () => {
	it("a pending navigation wins", () => {
		for (const kind of ["route", "mode", "tab", "history"] as const) {
			assert.equal(arrivalKind(kind, true), kind);
			assert.equal(arrivalKind(kind, false), kind);
		}
	});
	it("without one: the signature while it plays, else cold", () => {
		assert.equal(arrivalKind(null, true), "signature");
		assert.equal(arrivalKind(null, false), "cold");
	});
});

describe("stagger caps (FR-011, FR-025)", () => {
	it("desktop: 40ms steps, capped at 240ms", () => {
		assert.deepEqual([0, 1, 2, 6, 7, 50].map((i) => staggerDelay(i, STAGGER.desktop)), [0, 40, 80, 240, 240, 240]);
		assert.equal(staggerCount(STAGGER.desktop), 7);
	});
	it("phones: 24ms steps, capped at 160ms (gate 2)", () => {
		assert.deepEqual([0, 1, 6, 7, 30].map((i) => staggerDelay(i, STAGGER.phone)), [0, 24, 144, 160, 160]);
		assert.equal(staggerCount(STAGGER.phone), 7);
	});
	it("sidebar 200ms and Library 160ms caps", () => {
		assert.equal(staggerDelay(100, STAGGER.sidebar), 200);
		assert.equal(staggerDelay(100, STAGGER.library), 160);
		assert.equal(staggerCount(STAGGER.sidebar), 9);
	});
	it("odd indices never go negative or past the cap", () => {
		assert.equal(staggerDelay(-3, STAGGER.desktop), 0);
		assert.equal(staggerDelay(Number.NaN, STAGGER.desktop), 0);
		assert.equal(staggerDelay(2.7, STAGGER.desktop), 80);
	});
	it("every arrival with its stagger ends by 600ms (FR-006, gate 2: 360ms ink)", () => {
		for (const stagger of Object.values(STAGGER)) assert.ok(360 + stagger.cap <= 600);
	});
});

describe("ink soak origin (R9)", () => {
	it("the control's centre and the distance to the farthest corner", () => {
		const o = soakOrigin({ left: 100, top: 50, width: 40, height: 20 }, { width: 1440, height: 900 });
		assert.equal(o.x, 120);
		assert.equal(o.y, 60);
		assert.equal(o.r, Math.ceil(Math.hypot(1320, 840)));
	});
	it("a control in the bottom-right corner reaches the top-left", () => {
		const o = soakOrigin({ left: 380, top: 834, width: 10, height: 10 }, { width: 390, height: 844 });
		assert.equal(o.r, Math.ceil(Math.hypot(385, 839)));
	});
});
