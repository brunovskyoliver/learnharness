import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createSmoothWheelScroller } from "../components/smooth-wheel-scroll.ts";

describe("continuous wheel scrolling", () => {
	let clock: number;
	let nextId: number;
	let pending: Map<number, FrameRequestCallback>;
	const originalRequest = globalThis.requestAnimationFrame;
	const originalCancel = globalThis.cancelAnimationFrame;
	beforeEach(() => {
		clock = performance.now();
		nextId = 0;
		pending = new Map();
		globalThis.requestAnimationFrame = (callback) => { pending.set(++nextId, callback); return nextId; };
		globalThis.cancelAnimationFrame = (id) => { pending.delete(id); };
	});
	afterEach(() => {
		globalThis.requestAnimationFrame = originalRequest;
		globalThis.cancelAnimationFrame = originalCancel;
	});
	const step = (milliseconds = 16) => {
		clock += milliseconds;
		const callbacks = [...pending.values()];
		pending.clear();
		for (const callback of callbacks) callback(clock);
	};
	const settle = () => {
		for (let i = 0; pending.size && i < 100; i++) step();
		assert.equal(pending.size, 0, "animation settles without an endless frame loop");
	};
	const surface = () => ({ scrollTop: 100, scrollHeight: 2000, clientHeight: 500 });

	it("fills the frames between input events while preserving total distance", () => {
		const element = surface();
		const scroll = createSmoothWheelScroller(element, { reducedMotion: () => false });
		scroll.scrollBy(120);
		assert.equal(element.scrollTop, 100);
		step();
		assert.ok(element.scrollTop > 100 && element.scrollTop < 220);
		settle();
		assert.equal(element.scrollTop, 220);
		assert.equal(scroll.active, false);
	});

	it("accumulates fractional trackpad input in one running frame loop", () => {
		const element = surface();
		let settled = 0;
		const scroll = createSmoothWheelScroller(element, { reducedMotion: () => false, onSettled: () => settled++ });
		for (let i = 0; i < 24; i++) {
			scroll.scrollBy(0.75);
			assert.equal(pending.size, 1, "input retargets the existing loop");
			step(8);
		}
		settle();
		assert.equal(element.scrollTop, 118, "fractional deltas are not rounded or dropped");
		assert.equal(settled, 1);
	});

	it("cancelling prevents drift and the next gesture starts at the visible position", () => {
		const element = surface();
		const scroll = createSmoothWheelScroller(element, { reducedMotion: () => false });
		scroll.scrollBy(200);
		step();
		scroll.cancel();
		const stopped = element.scrollTop;
		step(200);
		assert.equal(element.scrollTop, stopped);
		scroll.scrollBy(-20);
		settle();
		assert.equal(element.scrollTop, stopped - 20);
	});

	it("retains subpixel input when the browser rounds scrollTop to physical pixels", () => {
		let visible = 100;
		const element = {
			get scrollTop() { return visible; },
			set scrollTop(value: number) { visible = Math.round(value); },
			scrollHeight: 2000,
			clientHeight: 500,
		};
		const scroll = createSmoothWheelScroller(element, { reducedMotion: () => false });
		for (let i = 0; i < 16; i++) {
			scroll.scrollBy(0.125);
			step(8);
		}
		settle();
		assert.equal(element.scrollTop, 102, "sixteen eighth-pixel deltas move two pixels");
	});

	it("clamps at both edges and adapts if the scrollable content shrinks", () => {
		const element = surface();
		const scroll = createSmoothWheelScroller(element, { reducedMotion: () => false });
		scroll.scrollBy(-1000);
		settle();
		assert.equal(element.scrollTop, 0);
		scroll.scrollBy(5000);
		step();
		element.scrollHeight = 1200;
		settle();
		assert.equal(element.scrollTop, 700);
	});

	it("reduced motion applies the delta immediately without scheduling frames", () => {
		const element = surface();
		const scroll = createSmoothWheelScroller(element, { reducedMotion: () => true });
		scroll.scrollBy(12.5);
		assert.equal(element.scrollTop, 112.5);
		assert.equal(pending.size, 0);
		assert.equal(scroll.active, false);
	});
});
