/**
 * The events stream's way into the repo-sync schedule (feature 026, R9):
 * `import("./repo-sync.ts")` happens on the first window, so neither the
 * events route nor startup loads the git code statically.
 */

/** A window opened; the returned function closes it. Safe to call before the module loads. */
export function windowOpened(): () => void {
	let close: (() => void) | null = null;
	let closed = false;
	import("./repo-sync.ts")
		.then((sync) => { if (!closed) close = sync.openWindow(); })
		.catch((err) => console.error("[repo-sync]", (err as Error)?.message ?? err));
	return () => {
		closed = true;
		close?.();
	};
}
