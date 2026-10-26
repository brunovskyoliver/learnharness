export const DOCK_MOTION_MS = 240;
export const DOCK_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";

export function reducedDockMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Follow a changing bottom target with the same timing as the dock morph. */
export function animateDockScroll(element: HTMLElement, target: () => number, write = (top: number) => { element.scrollTop = top; }, { cancelOnExternalScroll = false } = {}) {
	const start = element.scrollTop;
	let lastWritten = start;
	const started = performance.now();
	let frame = 0;
	let settle: (completed: boolean) => void;
	const finished = new Promise<boolean>((resolve) => { settle = resolve; });
	const tick = (now: number) => {
		// Wheel chaining from an iframe can move its parent without delivering
		// a wheel event to this document. Never overwrite that native input.
		if (cancelOnExternalScroll && element.scrollTop !== lastWritten) {
			settle(false);
			return;
		}
		const progress = reducedDockMotion() ? 1 : Math.min(1, (now - started) / DOCK_MOTION_MS);
		const eased = 1 - (1 - progress) ** 3;
		write(start + (target() - start) * eased);
		lastWritten = element.scrollTop;
		if (progress < 1) frame = requestAnimationFrame(tick);
		else settle(true);
	};
	frame = requestAnimationFrame(tick);
	return {
		finished,
		cancel() {
			cancelAnimationFrame(frame);
			settle(false);
		},
	};
}
