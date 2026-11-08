/**
 * Repo link tokens (feature 026, research R8): a flat { [linkId]: token } map
 * in PATHS.data/git-tokens.json (per tenant in hosted mode, because PATHS.data
 * is the tenant root). Same mechanics as src/store/auth.ts: 0600, temp +
 * chmod + rename, re-read on every use, absent or corrupt = {}. A sibling of
 * auth.json rather than entries in it, so initAuthEnv never reflects a token
 * into process.env and the keys page never lists one.
 */
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { PATHS } from "../../config.ts";
import { maskKey } from "../core/auth-keys.ts";
import type { RepoTokenStore } from "../core/ports.ts";

const tokensFile = () => path.join(PATHS.data, "git-tokens.json");

function readMap(): Record<string, string> {
	// Outside the try: hosted mode without a tenant must throw, not read as "no tokens".
	const file = tokensFile();
	try {
		const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
		return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string") as [string, string][]);
	} catch {
		return {};
	}
}

/** Atomic at mode 0600: chmod before the rename, so the final path never exists relaxed. */
function writeMap(map: Record<string, string>): void {
	const file = tokensFile();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = path.join(path.dirname(file), `.git-tokens.json.tmp-${process.pid}-${nanoid(6)}`);
	try {
		fs.writeFileSync(tmp, `${JSON.stringify(map, null, "\t")}\n`, { mode: 0o600 });
		fs.chmodSync(tmp, 0o600);
		fs.renameSync(tmp, file);
	} catch (err) {
		fs.rmSync(tmp, { force: true });
		throw err;
	}
}

export const repoTokens: RepoTokenStore = {
	get(linkId) {
		return readMap()[linkId] ?? null;
	},
	set(linkId, token) {
		const map = readMap();
		map[linkId] = token;
		writeMap(map);
	},
	delete(linkId) {
		const map = readMap();
		if (!(linkId in map)) return;
		delete map[linkId];
		writeMap(map);
	},
	mask(linkId) {
		const token = readMap()[linkId];
		return token === undefined ? null : maskKey(token);
	},
};
