import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { currentTenant, PATHS } from "../../config.ts";
import type { PaperFiles } from "../core/ports.ts";

/** Lazy per-turn storage, bound to the creator's tenant and removed at settlement. */
export function createPaperFiles(): PaperFiles {
	const root = path.join(PATHS.data, "tmp"); // Refuses hosted access outside a tenant.
	const tenant = currentTenant()?.userId;
	let directory: Promise<string> | undefined;
	let disposed = false;
	const pending = new Set<Promise<string>>();
	function checkTenant() {
		if (currentTenant()?.userId !== tenant) throw new Error("Paper files belong to a different tenant.");
	}
	return {
		async write(bytes) {
			checkTenant();
			if (disposed) throw new Error("The paper turn has ended.");
			const writing = (async () => {
				directory ??= fs.mkdir(root, { recursive: true }).then(() => fs.mkdtemp(path.join(root, "papers-")));
				const file = path.join(await directory, `${randomUUID()}.pdf`);
				await fs.writeFile(file, bytes, { flag: "wx" });
				return file;
			})();
			pending.add(writing);
			try { return await writing; } finally { pending.delete(writing); }
		},
		async dispose() {
			checkTenant();
			disposed = true;
			await Promise.allSettled(pending);
			if (directory) await fs.rm(await directory, { recursive: true, force: true });
		},
	};
}
