/**
 * Hosted uploads (2026-10-26): each user's files/ folder is the only place
 * the agent's fs tools can read (fs-shared.ts jailedPath), and this is the
 * only way files get into it. One flat folder, regular files only — no
 * subfolders, no symlinks — so the jail's realpath check has nothing to
 * chase. Same name overwrites.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { hostedMode, PATHS } from "../../config.ts";

/** Whole request. The proxy buffers bodies up to its 10 MB default and
 * truncates past it, so a larger cap would silently save cut files.
 * ponytail: raise together with experimental.proxyClientMaxBodySize. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export interface StoredFile { name: string; size: number; modifiedAt: string }

/** A plain file name or null: no separators, no leading dot, no controls. */
export function uploadName(raw: string): string | null {
	const name = raw.normalize("NFC").trim();
	if (!name || name.length > 200 || name !== path.basename(name) || name.startsWith(".") || /[\\/\x00-\x1f\x7f]/.test(name)) return null;
	return name;
}

export async function listFiles(): Promise<StoredFile[]> {
	const entries = await fs.readdir(PATHS.files, { withFileTypes: true }).catch(() => []);
	const files = await Promise.all(entries.filter((e) => e.isFile()).map(async (e) => {
		const stat = await fs.stat(path.join(PATHS.files, e.name));
		return { name: e.name, size: stat.size, modifiedAt: stat.mtime.toISOString() };
	}));
	return files.sort((a, b) => a.name.localeCompare(b.name));
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function filesResponse(request: Request): Promise<Response> {
	if (!hostedMode()) return json({ error: "Uploads exist only in hosted mode." }, 404);
	if (request.method === "GET") return json({ files: await listFiles(), maxBytes: UPLOAD_MAX_BYTES });
	if (request.method === "DELETE") {
		const name = uploadName(new URL(request.url).searchParams.get("name") ?? "");
		if (!name) return json({ error: "Invalid file name." }, 400);
		await fs.rm(path.join(PATHS.files, name), { force: true });
		return json({ files: await listFiles() });
	}
	const declared = Number(request.headers.get("content-length") ?? NaN);
	if (!Number.isFinite(declared) || declared > UPLOAD_MAX_BYTES) return json({ error: "Upload is over 10 MB." }, 413);
	const form = await request.formData().catch(() => null);
	const files = form?.getAll("files").filter((f): f is File => f instanceof File) ?? [];
	if (files.length === 0) return json({ error: "No files." }, 400);
	const named = files.map((file) => ({ file, name: uploadName(file.name) }));
	const bad = named.find((f) => !f.name);
	if (bad) return json({ error: `Invalid file name: ${bad.file.name}` }, 400);
	if (files.reduce((sum, f) => sum + f.size, 0) > UPLOAD_MAX_BYTES) return json({ error: "Upload is over 10 MB." }, 413);
	await fs.mkdir(PATHS.files, { recursive: true });
	for (const { file, name } of named) {
		const target = path.join(PATHS.files, name!);
		// Replace, never write through: a pre-existing symlink is unlinked, not followed.
		await fs.rm(target, { force: true });
		await fs.writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
	}
	return json({ files: await listFiles() });
}
