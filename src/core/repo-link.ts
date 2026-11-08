/**
 * Library git sync (feature 026): the shared vocabulary for repo links. Pure:
 * address and branch rules, the repo key, which tree entries are mirrored,
 * the limits and the plain sentences. research.md R6, R7, R16 and
 * data-model.md are the source; strings come from contracts/ui-contract.md.
 */
import { contentMatches, formatBytes, kindForName, LIBRARY_REFUSALS, MAX_FILE_BYTES, uploadName, type LibraryKind, type LibraryRefusal } from "./library.ts";

export const REPO_MAX_FILES = 2000;
/** Supported files' total per link, after skips; also the download cap (FR-029). */
export const REPO_MAX_BYTES = 500 * 1024 * 1024;
export const REPO_MAX_LINKS = 10;
export const REPO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
/** Concurrent pulls per server, FIFO across tenants (FR-015). */
export const REPO_PULL_POOL = 2;

export type SyncFailureCode = "auth" | "not-found" | "network" | "limit-files" | "limit-bytes" | "too-large-download" | "server" | "storage" | "address-blocked";

export interface SyncFailure {
	code: SyncFailureCode;
	/** A plain sentence (ui-contract.md). */
	message: string;
	/** Raw, already redacted; behind "Show details". */
	detail: string;
	limit?: { kind: "files" | "bytes"; limit: number; found: number };
}

export type SkippedReason = "too-large" | "bad-name" | "lfs" | "submodule" | "symlink" | "content-mismatch";
export interface SkippedFile { path: string; reason: SkippedReason }

export interface RepoSyncState {
	state: "never" | "syncing" | "synced" | "failed";
	lastAttemptAt?: string;
	lastSuccessAt?: string;
	/** The tip oid the current mirror reflects. */
	commit?: string;
	/** Only when state is "failed". */
	failure?: SyncFailure;
	counts?: { files: number; bytes: number; added: number; changed: number; removed: number; revived: number };
	skipped?: { unsupported: number; hiddenOrIgnored: number; named: SkippedFile[] };
}

export interface RepoLink {
	/** "rpl_<nanoid>" */
	id: string;
	/** The linked folder (a LibraryFolder with `mirror.path === ""`). */
	folderId: string;
	/** Credential-free https URL. */
	url: string;
	/** "github.com/oliver/notes" */
	display: string;
	repoKey: string;
	branch: string;
	/** False means "default branch", resolved at the first pull. */
	branchGiven: boolean;
	/** The token itself lives only in git-tokens.json. */
	hasToken: boolean;
	createdAt: string;
	sync: RepoSyncState;
}

/** What the client sees of a link (contracts/api.md): never a token, only its mask. */
export interface RepoLinkView {
	id: string;
	folderId: string;
	display: string;
	url: string;
	branch: string;
	branchGiven: boolean;
	tokenMask: string | null;
	sync: RepoSyncState;
}
/** A first link still pulling (US1 #5). */
export interface PendingLinkView { requestId: string; display: string; folderName: string; parentId: string | null; startedAt: string }

// ── Addresses (R7) ──

export interface RepoAddress {
	/** Credential-free, no trailing "/". */
	url: string;
	/** Host + path without a trailing "/" or ".git". */
	display: string;
	/** The repo part of the key: the lowercased host and the display path. */
	repoBase: string;
}

export interface AddressOptions {
	/** Tests and the e2e server only: accept `http://127.0.0.1:<port>`. */
	allowLoopbackHttp?: boolean;
}

/** scp-like `git@host:path`, which `URL` can't parse. */
const SCP_LIKE = /^[^\s/@:]+@[^\s/:]+:/;

/** A usable repo address or the refusal saying why not. The refusal never echoes the address. */
export function parseRepoAddress(raw: string, options: AddressOptions = {}): RepoAddress | LibraryRefusal {
	const text = raw.trim();
	if (!text) return LIBRARY_REFUSALS.invalidAddress;
	if (SCP_LIKE.test(text)) return LIBRARY_REFUSALS.notHttps;
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return LIBRARY_REFUSALS.invalidAddress;
	}
	const loopback = options.allowLoopbackHttp === true && url.protocol === "http:" && url.hostname === "127.0.0.1";
	if (url.protocol !== "https:" && !loopback) return LIBRARY_REFUSALS.notHttps;
	if (url.username || url.password) return LIBRARY_REFUSALS.credentialInAddress;
	if (url.search || url.hash || text.includes("#") || text.includes("?")) return LIBRARY_REFUSALS.invalidAddress;
	if (!url.hostname) return LIBRARY_REFUSALS.invalidAddress;
	const pathname = url.pathname.replace(/\/+$/, "");
	const shown = pathname.replace(/\.git$/i, "").replace(/\/+$/, "");
	if (!shown || shown === "/") return LIBRARY_REFUSALS.invalidAddress;
	const display = `${url.host}${shown}`;
	return { url: `${url.protocol}//${url.host}${pathname}`, display, repoBase: `${url.host.toLowerCase()}${shown}` };
}

/** The identity of "the same repo": address plus branch (owner approved 2026-11-08). */
export const repoKeyOf = (repoBase: string, branch: string): string => `${repoBase}#${branch}`;

/** git's ref-name rules (`git check-ref-format --branch`), for one branch name. */
export function isBranchName(raw: string): boolean {
	const name = raw.trim();
	if (!name || name.length > 255 || name === "@") return false;
	if (/[\x00-\x20\x7f~^:?*[\\]/.test(name)) return false;
	if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) return false;
	if (name.includes("..") || name.includes("//") || name.includes("@{")) return false;
	return name.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".lock"));
}

// ── Hosted address block (FR-030) ──

function ipv4Octets(ip: string): number[] | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
	return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

/** The 8 groups of an IPv6 address, or null. Handles "::" and a trailing IPv4. */
function ipv6Groups(raw: string): number[] | null {
	let ip = raw.replace(/^\[|\]$/g, "").split("%")[0]!.toLowerCase();
	let tail: number[] = [];
	const lastColon = ip.lastIndexOf(":");
	const v4 = lastColon >= 0 ? ipv4Octets(ip.slice(lastColon + 1)) : null;
	if (v4) {
		tail = [(v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!];
		ip = `${ip.slice(0, lastColon + 1)}0:0`;
	}
	const halves = ip.split("::");
	if (halves.length > 2) return null;
	const parse = (s: string) => (s ? s.split(":") : []).map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : NaN));
	const head = parse(halves[0]!);
	const rest = halves.length === 2 ? parse(halves[1]!) : [];
	const fill = 8 - head.length - rest.length;
	if (halves.length === 1 ? head.length !== 8 : fill < 0) return null;
	const groups = [...head, ...Array<number>(halves.length === 2 ? fill : 0).fill(0), ...rest];
	if (groups.some((g) => Number.isNaN(g))) return null;
	if (tail.length) groups.splice(6, 2, ...tail);
	return groups;
}

function blockedV4([a, b]: number[]): boolean {
	return a === 0 || a === 127 || a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** Loopback, private (RFC 1918, fc00::/7), link-local (169.254/16, fe80::/10) or
 *  unspecified: what the hosted app refuses to connect to. Unparsable is refused too. */
export function isBlockedAddress(ip: string): boolean {
	const v4 = ipv4Octets(ip);
	if (v4) return blockedV4(v4);
	const g = ipv6Groups(ip);
	if (!g) return true;
	if (g.every((x) => x === 0)) return true; // ::
	if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
	if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7
	if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10
	// IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) carry an IPv4 address.
	if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return blockedV4([g[6]! >> 8, g[6]! & 0xff]);
	return false;
}

// ── Which tree entries are mirrored (R5 step 4) ──

/** Directories never walked: `.git`, `node_modules`, anything starting with ".". */
export const isIgnoredDirectory = (name: string): boolean => name === "node_modules" || name.startsWith(".");

const LFS_HEAD = "version https://git-lfs.github.com/spec/v1";
/** A Git LFS pointer instead of the file: small and starting with the spec line. */
export function isLfsPointer(bytes: Uint8Array): boolean {
	if (bytes.length >= 1024 || bytes.length < LFS_HEAD.length) return false;
	return new TextDecoder().decode(bytes.subarray(0, LFS_HEAD.length)) === LFS_HEAD;
}

export interface TreeEntryFacts {
	/** Repo-relative, "/"-separated. */
	path: string;
	/** git mode: "100644", "100755", "120000" (symlink), "160000" (submodule), "040000" (tree). */
	mode: string;
	/** Known once the blob is read. */
	size?: number;
}

export type EntryClass =
	| { action: "keep"; kind: LibraryKind }
	/** Passed every check that needs no bytes; read the blob and classify again with it. */
	| { action: "read"; kind: LibraryKind }
	| { action: "skip"; file: SkippedFile }
	| { action: "count"; bucket: "unsupported" | "hiddenOrIgnored" };

/** What happens to one non-directory tree entry. Without `bytes`, a supported
 *  file answers "read"; with them, "keep" or a named skip. */
export function classifyEntry(entry: TreeEntryFacts, bytes?: Uint8Array): EntryClass {
	const segments = entry.path.split("/");
	const name = segments.at(-1) ?? "";
	if (segments.slice(0, -1).some(isIgnoredDirectory)) return { action: "count", bucket: "hiddenOrIgnored" };
	if (entry.mode === "120000") return { action: "skip", file: { path: entry.path, reason: "symlink" } };
	if (entry.mode === "160000") return { action: "skip", file: { path: entry.path, reason: "submodule" } };
	if (name.startsWith(".")) return { action: "count", bucket: "hiddenOrIgnored" };
	if (segments.some((s) => uploadName(s) !== s)) return { action: "skip", file: { path: entry.path, reason: "bad-name" } };
	const kind = kindForName(name);
	if (!kind) return { action: "count", bucket: "unsupported" };
	const size = bytes?.length ?? entry.size;
	if (size !== undefined && size > MAX_FILE_BYTES) return { action: "skip", file: { path: entry.path, reason: "too-large" } };
	if (!bytes) return { action: "read", kind };
	if (isLfsPointer(bytes)) return { action: "skip", file: { path: entry.path, reason: "lfs" } };
	if (!contentMatches(name, bytes)) return { action: "skip", file: { path: entry.path, reason: "content-mismatch" } };
	return { action: "keep", kind };
}

// ── Limits and sentences (R16, ui-contract.md) ──

const count = (n: number) => n.toLocaleString("en-US");

/** The limit a link's supported files break, or null. Only files that would be
 *  mirrored count: skipped and unsupported files never reach this. */
export function limitFailure(found: { files: number; bytes: number }): SyncFailure | null {
	if (found.files > REPO_MAX_FILES) {
		return {
			code: "limit-files",
			message: `The repo has ${count(found.files)} supported files, ${count(found.files - REPO_MAX_FILES)} over the 2,000 limit.`,
			detail: `${found.files} supported files; the limit is ${REPO_MAX_FILES}.`,
			limit: { kind: "files", limit: REPO_MAX_FILES, found: found.files },
		};
	}
	if (found.bytes > REPO_MAX_BYTES) {
		return {
			code: "limit-bytes",
			message: `The repo has ${formatBytes(found.bytes)} of supported files, ${formatBytes(found.bytes - REPO_MAX_BYTES)} over the 500 MB limit.`,
			detail: `${found.bytes} bytes of supported files; the limit is ${REPO_MAX_BYTES}.`,
			limit: { kind: "bytes", limit: REPO_MAX_BYTES, found: found.bytes },
		};
	}
	return null;
}

/** The plain sentence for a failure code. `auth` depends on whether a token was sent. */
export function failureMessage(code: Exclude<SyncFailureCode, "limit-files" | "limit-bytes">, options: { hadToken?: boolean } = {}): string {
	switch (code) {
		case "auth": return options.hadToken ? "The repo refused the token. Check that it can read this repo." : "This repo is private. Add a token that can read it.";
		case "not-found": return "No repo or branch was found at that address.";
		case "network": return "The repo's server couldn't be reached.";
		case "too-large-download": return "The repo's download is over 500 MB.";
		case "address-blocked": return LIBRARY_REFUSALS.addressBlocked.message;
		case "storage":
		case "server": return "The repo couldn't be pulled.";
	}
}

/** "Synced 5 min ago" and the other status lines (ui-contract.md). */
export function syncStatusText(sync: RepoSyncState, now: Date, options: { pending?: boolean } = {}): string {
	if (options.pending || sync.state === "never") return "Syncing for the first time…";
	if (sync.state === "syncing") return "Syncing…";
	if (sync.state === "failed") return `Sync failed · ${sync.failure?.message ?? failureMessage("server")}`;
	if (!sync.lastSuccessAt) return "Syncing for the first time…";
	const at = new Date(sync.lastSuccessAt);
	const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
	if (minutes < 1) return "Synced just now";
	if (minutes < 60) return `Synced ${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `Synced ${hours} h ago`;
	return `Synced on ${at.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

// ── Transport failures (R6) ──

/** What a RepoRemote throws: the failure is already a plain sentence with redacted detail. */
export class RepoRemoteError extends Error {
	readonly failure: SyncFailure;
	constructor(failure: SyncFailure) {
		super(failure.message);
		this.name = "RepoRemoteError";
		this.failure = failure;
	}
}

const base64 = (text: string): string => {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
};

/** Text with every secret, its Basic-auth encodings and any Authorization header value removed. */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[]): string {
	let out = text.replace(/(authorization["']?\s*[:=]\s*["']?)[^"'\r\n,}]*/gi, "$1[redacted]");
	for (const secret of secrets) {
		if (!secret) continue;
		for (const form of [secret, base64(`x-access-token:${secret}`), base64(secret), encodeURIComponent(secret)]) {
			out = out.split(form).join("[redacted]");
		}
	}
	return out;
}
