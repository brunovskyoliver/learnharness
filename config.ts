import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (this file is at <root>/config.ts). */
export const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * THE data-location seam (the Electron contract, 2026-09-17): LH_DATA_DIR
 * relocates every MUTABLE record — chat sessions, graph ledgers, the
 * embedding model cache — when set. The desktop shell points it at
 * userData so nothing is written inside the read-only .app bundle
 * (macOS translocation guarantees the bundle is read-only anyway).
 * Unset (plain web dev / repo work) it resolves to the repo's data/,
 * byte-for-byte as before. Read-only assets (prompts) stay ROOT-anchored
 * on purpose: they ship inside the app bundle by design.
 */
const DATA_ROOT = process.env.LH_DATA_DIR
	? path.resolve(process.env.LH_DATA_DIR)
	: path.join(ROOT, "data");

/**
 * THE TENANT SEAM (hosted multi-user, 2026-10-26): hosted mode
 * (LH_HOSTED=1) runs every request inside runAsTenant(userId), and every
 * mutable path below resolves under DATA_ROOT/users/<userId>/ at CALL
 * time. AsyncLocalStorage follows promises and timers, so background work
 * started inside a request keeps its tenant. Outside hosted mode there is
 * one implicit tenant whose paths are byte-for-byte the pre-tenant ones
 * (desktop, plain dev, tests). Hosted mode FAILS CLOSED: a path read with
 * no tenant throws instead of falling back to the shared root.
 * globalThis-backed for the usual Next reason: each route entry is its
 * own module instance, and they must all see one store.
 */
export interface Tenant {
	userId: string;
}
const TENANT_KEY = Symbol.for("lh.tenant");
const tenants: AsyncLocalStorage<Tenant> = ((globalThis as Record<symbol, unknown>)[TENANT_KEY] ??=
	new AsyncLocalStorage<Tenant>()) as AsyncLocalStorage<Tenant>;
/** Clerk ids look like user_2abc…; anything else could escape users/. */
const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function hostedMode(): boolean {
	return process.env.LH_HOSTED === "1";
}

export function runAsTenant<T>(userId: string, fn: () => T): T {
	if (!TENANT_ID.test(userId)) throw new Error("invalid tenant id");
	return tenants.run({ userId }, fn);
}

export function currentTenant(): Tenant | undefined {
	return tenants.getStore();
}

/** One in-memory registry instance per tenant (turn runs, wake queues,
 * extraction runs, permit pools, ...). Outside a tenant it is the same
 * globalThis slot the registries always used, so local behavior and the
 * tests that inspect those slots are unchanged; tenant instances live in
 * a sibling map. ponytail: tenant instances are never evicted, they are
 * small; add idle eviction if tenant counts get large. */
export function tenantScoped<T>(slot: string, init: () => T): T {
	const g = globalThis as unknown as Record<string, unknown>;
	const tenant = tenants.getStore();
	if (!tenant) {
		if (hostedMode()) throw new Error(`hosted mode: ${slot} used outside a tenant`);
		return (g[slot] ??= init()) as T;
	}
	const byTenant = (g[`${slot}:tenants`] ??= new Map<string, T>()) as Map<string, T>;
	let value = byTenant.get(tenant.userId);
	if (value === undefined) byTenant.set(tenant.userId, (value = init()));
	return value;
}

/** The current tenant's mutable-data root. */
function dataRoot(): string {
	const tenant = tenants.getStore();
	if (tenant) return path.join(DATA_ROOT, "users", tenant.userId);
	if (hostedMode()) throw new Error("hosted mode: data access outside a tenant");
	return DATA_ROOT;
}

export const PATHS = {
	root: ROOT,
	/** Teacher system prompt — the agent's instructions (src/agent/). */
	teacherPrompt: path.join(ROOT, "src", "agent", "system-prompt.md"),
	get data() { return dataRoot(); },
	/** Chat sessions (AI SDK UIMessage transcripts, one JSON file per chat). */
	get chats() { return path.join(dataRoot(), "chats"); },
	get graph() { return path.join(dataRoot(), "graph"); },
	/** Library documents, flat, in both modes. In hosted mode this is also the
	 *  only folder the agent's fs tools can see. */
	get files() { return path.join(dataRoot(), "files"); },
	/** Library catalog, page versions and cached text (feature 009). */
	get library() { return path.join(dataRoot(), "library"); },
	/** Debug artifacts (env-gated): data/debug/provider-events/<chatId>.jsonl
	 * raw provider stream recordings (src/agent/provider-events.ts). */
	get debug() { return path.join(dataRoot(), "debug"); },
};

// ─── Models ────────────────────────────────────────────────────────────────
// BYOK ALL THE WAY DOWN (owner, 2026-09-22): there are NO factory default
// models. Every engine resolves from the user's model slots (settings.json
// models section: strong/cheap/vision) over per-role/ChatSettings overrides,
// and a chain that ends empty REFUSES honestly (503 models_not_configured).
// .env stays for secrets (API keys) only. What remains here are ENGINE
// CONSTRUCTION FACTS: the thinking-level scale and the default order.

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** Every agent role in the app. The conversation pair (prober/teacher)
 *  resolves chat.model → strong slot; background roles resolve their own
 *  override → tier slot (core/settings-resolution.ts ROLE_SLOT). */
export type ModelRole =
	| "prober"
	| "teacher"
	| "researcher"
	| "demoBuilder"
	| "visualMaker"
	| "pdfReader"
	| "extractor"
	| "auditor";

/**
 * The LIVE graph store (src/store/graph.ts) — owned by the app's extraction
 * pipeline. Line shapes: src/core/contracts.ts. CHAINS ARE THE STORED
 * TRUTH (owner, 2026-09-30): edges are a derived view, never stored.
 */
export const LEDGER_FILES = {
	get nodes() { return path.join(PATHS.graph, "nodes.jsonl"); },
	get chains() { return path.join(PATHS.graph, "chains.jsonl"); },
	get sessions() { return path.join(PATHS.graph, "sessions.jsonl"); },
	/** Per-message extraction coverage (contracts/graph.ts CoverageEntry;
	 *  the checkpoint's replacement for chat extractions — notes keep
	 *  sessions.jsonl, whole-file as they are). */
	get coverage() { return path.join(PATHS.graph, "coverage.jsonl"); },
};

/**
 * Notes-import bookkeeping (NOT a ledger): one JSON map, src-id → NotesSource
 * record (contracts/graph.ts) — the file path + import time + the run's usage
 * log. Read-modify-write like a chat file, not append-only like the ledgers.
 */
export const sourcesFile = () => path.join(PATHS.graph, "sources.json");
/** The layout ledger (read-modify-write like sources.json): nodeId →
 *  {x,y} resting positions from the incremental settle (core/layout.ts).
 *  Carries an updatedAt stamp for future live-physics conflict handling. */
export const positionsFile = () => path.join(PATHS.graph, "positions.json");

/**
 * Graph render settings (the settings-panel controls): one small JSON blob,
 * read-modify-write. Shared shape/sanitizer: src/core/render-settings.ts.
 */
export const renderSettingsFile = () => path.join(PATHS.graph, "render-settings.json");

/** The graph-family FORMAT STAMP sidecar (schema-versioning wave,
 *  2026-10-10): one version for the whole family — the four JSONL ledgers,
 *  sources.json, render-settings.json. LAZY v1: absent = v1; the first
 *  graph-family write creates it. positions.json is REBUILDABLE and rides
 *  along unversioned by design (owner ruling). */
export const graphFormatFile = () => path.join(PATHS.graph, "format.json");

/**
 * THE USER SETTINGS RECORD (settings-storage wave, 2026-09-19): one
 * versioned, DELTA-shaped JSON blob at the data-dir seam holding every
 * non-secret product preference — general, agent (background
 * model/thinking overrides + tool toggles + prompt-override switches),
 * appearance, graph. Explicit user choices only: ABSENT keys resolve to the
 * factory defaults compiled into src/core/settings.ts (FACTORY_SETTINGS), so
 * a software update that adds a knob (new tool, new role, new appearance
 * field) needs no migration — old records simply lack the new keys. The
 * version field is a PRIVATE schema counter for breaking shape changes
 * only (field renamed/meaning changed), unrelated to the app release
 * version. Secrets (API keys, login tokens) NEVER live here — auth.json /
 * .env.local keep that role. (The `chat` default-settings section died
 * with per-session models, owner 2026-09-28 — sessions own their model
 * from birth, stamped from the strong slot.)
 */
export const settingsFile = () => path.join(dataRoot(), "settings.json");

/**
 * User prompt-override files (settings-storage wave, 2026-09-19): the
 * per-segment system-prompt overrides mirroring the SOURCE layout
 * (src/agent/prompts/) — the shared base as prompts/system-prompt.md,
 * fragments as prompts/teacher/<file> / prompts/prober/<file>. File
 * PRESENCE alone is not the override: settings.json's agent.prompts map
 * (segmentPath → boolean) is the explicit switch, so a user can keep a
 * customized file on disk but run the source default to compare. The
 * segment list itself is ALWAYS derived from source at runtime (the
 * loader in src/store/prompt-overrides.ts) — code updates that add,
 * remove, or reorder fragments adapt automatically; an override keyed to
 * a vanished segment stops composing but stays on disk.
 */
export const promptsOverrideDir = () => path.join(dataRoot(), "prompts");

/**
 * THE AUTH/KEY STORE (auth-keys wave, 2026-09-19): BYOK provider keys in a
 * flat {VAR: value} JSON map — the SAME file the Electron app has always
 * hand-edited (owner decision: option A, zero migration). Desktop main.cjs
 * passes LH_AUTH_FILE pointing at userData/auth.json (mode 0600); in dev
 * (no Electron) the default is the repo-root auth.json (gitignored, same
 * pattern as .env.local — a worktree may symlink it to the master copy).
 * The SERVER reads/writes this file directly at call time (no restart to
 * change a key); it reflects the values into process.env at boot with
 * FILL-GAP precedence — real environment variables (incl. .env.local in
 * dev) always win (src/server/keys.ts). Hand-edits still work: the file is
 * re-read from disk on every API access. Secrets NEVER go in settings.json
 * — this file keeps that role, alongside .env.local.
 */
export function authFile(): string {
	// A tenant keeps its keys and subscription credentials in its own root.
	if (tenants.getStore() || hostedMode()) return path.join(dataRoot(), "auth.json");
	return process.env.LH_AUTH_FILE ? path.resolve(process.env.LH_AUTH_FILE) : path.join(ROOT, "auth.json");
}
