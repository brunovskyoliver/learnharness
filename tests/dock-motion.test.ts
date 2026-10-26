import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { animateDockScroll } from "../components/dock-motion.ts";

describe("interruptible dock navigation", () => {
	let now: number;
	let id: number;
	let pending: Map<number, FrameRequestCallback>;
	let reduced: boolean;
	const originalWindow = globalThis.window;
	const originalRequest = globalThis.requestAnimationFrame;
	const originalCancel = globalThis.cancelAnimationFrame;
	beforeEach(() => {
		now = performance.now();
		id = 0;
		pending = new Map();
		reduced = false;
		globalThis.window = { matchMedia: () => ({ matches: reduced }) } as unknown as Window & typeof globalThis;
		globalThis.requestAnimationFrame = (callback) => { pending.set(++id, callback); return id; };
		globalThis.cancelAnimationFrame = (frame) => { pending.delete(frame); };
	});
	afterEach(() => {
		if (originalWindow) globalThis.window = originalWindow;
		else Reflect.deleteProperty(globalThis, "window");
		globalThis.requestAnimationFrame = originalRequest;
		globalThis.cancelAnimationFrame = originalCancel;
	});
	const step = (milliseconds = 16) => {
		now += milliseconds;
		const callbacks = [...pending.values()];
		pending.clear();
		for (const callback of callbacks) callback(now);
	};
	it("cancels a native scroll from an iframe without a parent wheel event", async () => {
		const element = { scrollTop: 100 } as HTMLElement;
		const motion = animateDockScroll(element, () => 2000, undefined, { cancelOnExternalScroll: true });
		step(48);
		element.scrollTop -= 80;
		const nativePosition = element.scrollTop;
		step();
		assert.equal(await motion.finished, false);
		assert.equal(element.scrollTop, nativePosition, "the animation must not overwrite native input");
		assert.equal(pending.size, 0);
	});
	it("eases to the target and completes exactly once", async () => {
		const element = { scrollTop: 0 } as HTMLElement;
		const motion = animateDockScroll(element, () => 1000, undefined, { cancelOnExternalScroll: true });
		step(120);
		assert.ok(element.scrollTop > 800 && element.scrollTop < 1000);
		step(121);
		assert.equal(await motion.finished, true);
		assert.equal(element.scrollTop, 1000);
		assert.equal(pending.size, 0);
	});
	it("uses the browser's rounded position when detecting external scrolling", async () => {
		let top = 0;
		const element = { get scrollTop() { return top; }, set scrollTop(value) { top = Math.round(value); } } as HTMLElement;
		const motion = animateDockScroll(element, () => 1000, undefined, { cancelOnExternalScroll: true });
		for (let index = 0; index < 16; index++) step();
		assert.equal(await motion.finished, true);
		assert.equal(top, 1000);
	});
	it("reduced motion reaches the target in one frame", async () => {
		reduced = true;
		const element = { scrollTop: 0 } as HTMLElement;
		const motion = animateDockScroll(element, () => 1000, undefined, { cancelOnExternalScroll: true });
		step();
		assert.equal(await motion.finished, true);
		assert.equal(element.scrollTop, 1000);
		assert.equal(pending.size, 0);
	});
});
