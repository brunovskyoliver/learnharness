type ScrollSurface = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">;

/** Retarget one animation loop as trackpad deltas arrive. Never restart its clock. */
export function createSmoothWheelScroller(element: ScrollSurface, options: {
	reducedMotion?: () => boolean;
	onSettled?: () => void;
} = {}) {
	let target: number | null = null;
	let frame: number | null = null;
	let lastFrame = 0;
	// Keep subpixels between frames and gestures. Chromium can round every
	// scrollTop write, which otherwise drops tiny trackpad deltas entirely.
	let position = element.scrollTop;
	let lastWritten = element.scrollTop;
	const clamp = (value: number) => Math.max(0, Math.min(element.scrollHeight - element.clientHeight, value));
	const write = (value: number) => {
		position = clamp(value);
		element.scrollTop = position;
		lastWritten = element.scrollTop;
	};
	const reducedMotion = options.reducedMotion ?? (() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	const cancel = () => {
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
		target = null;
		position = element.scrollTop;
		lastWritten = element.scrollTop;
	};
	const tick = (now: number) => {
		frame = null;
		if (target === null) return;
		if (element.scrollTop !== lastWritten) {
			cancel(); // Native scrollbars, touch, or another navigation owns it.
			return;
		}
		target = clamp(target);
		const elapsed = Math.min(64, Math.max(0, now - lastFrame));
		lastFrame = now;
		const fraction = reducedMotion() ? 1 : 1 - Math.exp(-elapsed / 32);
		const next = position + (target - position) * fraction;
		if (Math.abs(target - next) <= 0.5) {
			write(target);
			target = null;
			options.onSettled?.();
			return;
		}
		write(next);
		frame = requestAnimationFrame(tick);
	};
	return {
		cancel,
		get active() { return target !== null; },
		scrollBy(delta: number) {
			if (!Number.isFinite(delta) || delta === 0) return;
			if (element.scrollTop !== lastWritten) cancel();
			const next = clamp((target ?? position) + delta);
			if (reducedMotion()) {
				cancel();
				write(next);
				options.onSettled?.();
				return;
			}
			target = next;
			if (frame === null) {
				lastFrame = performance.now();
				frame = requestAnimationFrame(tick);
			}
		},
	};
}
