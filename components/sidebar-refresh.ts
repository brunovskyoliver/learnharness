/** Coalesce a burst, retaining one read after any invalidation during a read. */
export function createSidebarRefresh(read: () => Promise<void>) {
	let running: Promise<void> | undefined;
	let pending = false;
	return function refresh(): Promise<void> {
		if (running) { pending = true; return running; }
		running = (async () => {
			try {
				do {
					pending = false;
					await read();
				} while (pending);
			} finally { running = undefined; }
		})();
		return running;
	};
}
