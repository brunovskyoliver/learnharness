/**
 * The search index's files (feature 019): rebuildable, apart from source data,
 * and safe to delete. Layout, under the tenant's library/:
 *
 *   search/current.json          which generation is live
 *   search/g_<id>/<itemId>.json  one shard per item, written whole through a temp
 *
 * A full reindex writes a new generation beside the old one and swaps the pointer
 * only once it is complete, so a crash leaves the old index serving. A torn shard
 * or pointer reads as missing and is rebuilt; nothing here is ever a source of truth.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nanoid } from "nanoid";
import { PATHS } from "../../config.ts";
import { DOC_INDEX_VERSION, type DocIndexShard } from "../core/document-search.ts";

const searchDir = () => path.join(PATHS.library, "search");
const pointerFile = () => path.join(searchDir(), "current.json");
const generationDir = (generation: string) => path.join(searchDir(), generation);
const shardFile = (generation: string, itemId: string) => path.join(generationDir(generation), `${itemId}.json`);
const isCode = (err: unknown, code: string) => (err as NodeJS.ErrnoException)?.code === code;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

async function writeWhole(file: string, text: string): Promise<void> {
	const temp = `${file}.${nanoid(8)}.tmp`;
	const handle = await fs.open(temp, "wx");
	try {
		await handle.writeFile(text);
		await handle.sync();
	} finally {
		await handle.close();
	}
	await fs.rename(temp, file);
}

/** The live generation, or null when there is none or the pointer can't be used. */
export async function readGeneration(): Promise<string | null> {
	const raw = await fs.readFile(pointerFile(), "utf8").catch((err) => {
		if (isCode(err, "ENOENT")) return null;
		throw err;
	});
	if (raw === null) return null;
	try {
		const parsed = JSON.parse(raw) as { version?: unknown; generation?: unknown };
		if (parsed.version !== DOC_INDEX_VERSION || typeof parsed.generation !== "string" || !SAFE_ID.test(parsed.generation)) return null;
		return parsed.generation;
	} catch {
		return null;
	}
}

/** An empty generation, not yet live. */
export async function createGeneration(): Promise<string> {
	const generation = `g_${nanoid(12).replace(/[^A-Za-z0-9_]/g, "_")}`;
	await fs.mkdir(generationDir(generation), { recursive: true });
	return generation;
}

/** The swap. Everything in the generation is on disk before this runs. */
export async function publishGeneration(generation: string): Promise<void> {
	await fs.mkdir(searchDir(), { recursive: true });
	await writeWhole(pointerFile(), JSON.stringify({ version: DOC_INDEX_VERSION, generation }));
}

/** Every generation but the live one: old ones, and any a crash left half-built. */
export async function sweepGenerations(keep: string | null): Promise<void> {
	const names = await fs.readdir(searchDir()).catch(() => [] as string[]);
	await Promise.all(names.filter((name) => name.startsWith("g_") && name !== keep).map((name) => fs.rm(generationDir(name), { recursive: true, force: true })));
}

/** Null when absent, torn or from another index format: all mean "read it again". */
export async function readShard(generation: string, itemId: string): Promise<DocIndexShard | null> {
	const raw = await fs.readFile(shardFile(generation, itemId), "utf8").catch(() => null);
	if (raw === null) return null;
	try {
		const shard = JSON.parse(raw) as DocIndexShard;
		if (shard?.v !== DOC_INDEX_VERSION || shard.itemId !== itemId || typeof shard.signature !== "string" || !Array.isArray(shard.passages)) return null;
		return shard;
	} catch {
		return null;
	}
}

/** Modification time, to tell whether a cached shard is still the one on disk. */
export async function shardStamp(generation: string, itemId: string): Promise<number | null> {
	const stat = await fs.stat(shardFile(generation, itemId)).catch(() => null);
	return stat ? stat.mtimeMs + stat.size / 1e6 : null;
}

export async function writeShard(generation: string, shard: DocIndexShard): Promise<void> {
	await fs.mkdir(generationDir(generation), { recursive: true });
	await writeWhole(shardFile(generation, shard.itemId), JSON.stringify(shard));
}

export async function removeShard(generation: string, itemId: string): Promise<void> {
	await fs.rm(shardFile(generation, itemId), { force: true });
}

/** Item ids with a file in this generation. Temp files aren't shards. */
export async function listShardIds(generation: string): Promise<string[]> {
	const names = await fs.readdir(generationDir(generation)).catch(() => [] as string[]);
	return names.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length));
}

/** Leftover temp files from a crash. */
export async function sweepTemps(generation: string): Promise<void> {
	const names = await fs.readdir(generationDir(generation)).catch(() => [] as string[]);
	await Promise.all(names.filter((name) => name.endsWith(".tmp")).map((name) => fs.rm(path.join(generationDir(generation), name), { force: true })));
}
