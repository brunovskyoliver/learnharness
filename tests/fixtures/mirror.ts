/** Feature 026 test helper: pulls a tree into a repo link the way a sync does
 *  (stage the supported blobs, then one catalog write), with no remote. The
 *  first pull of a link id creates its linked folder. */
import { classifyEntry, repoKeyOf } from "../../src/core/repo-link.ts";
import type { LibraryFolder } from "../../src/core/library.ts";
import type { LibraryStore, MirrorFile } from "../../src/core/ports.ts";

const enc = (bytes: string | Uint8Array) => (typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes);
/** A content-dependent oid, so a changed file reads as changed. */
const oidOf = (p: string, bytes: Uint8Array) => Buffer.from(`${p}:${bytes.length}:${Buffer.from(bytes).toString("base64").slice(0, 24)}`).toString("hex").padEnd(40, "0").slice(0, 40);

export async function pullTree(store: LibraryStore, tree: Record<string, string | Uint8Array>, options: { linkId?: string; folderName?: string; parentId?: string | null; first?: boolean } = {}): Promise<LibraryFolder> {
	const linkId = options.linkId ?? "rpl_fixture";
	const stager = await store.stageSnapshot(linkId);
	const files: MirrorFile[] = [];
	for (const [p, raw] of Object.entries(tree)) {
		const bytes = enc(raw);
		const verdict = classifyEntry({ path: p, mode: "100644" }, bytes);
		if (verdict.action !== "keep") continue;
		await stager.put(p, oidOf(p, bytes), bytes);
		files.push({ path: p, oid: oidOf(p, bytes), size: bytes.length, kind: verdict.kind });
	}
	const now = new Date().toISOString();
	const sync = { state: "synced" as const, lastAttemptAt: now, lastSuccessAt: now, commit: "c".repeat(40) };
	const display = `github.com/oliver/${linkId}`;
	const result = await store.applyMirror(linkId, { snapshot: stager.snapshot, files, sync }, options.first === false ? undefined : (await store.repoLinks()).some((l) => l.id === linkId) ? undefined : {
		link: { id: linkId, url: `https://${display}`, display, repoKey: repoKeyOf(display, "main"), branch: "main", branchGiven: false, hasToken: false, createdAt: now },
		folderName: options.folderName ?? "Lecture notes",
		parentId: options.parentId ?? null,
	});
	if (!("link" in result)) throw new Error(`pullTree: ${JSON.stringify(result)}`);
	return result.folder;
}
