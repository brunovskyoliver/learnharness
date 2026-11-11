/**
 * Hosted Claude Code sign-in (feature 029, fork-only; research R8-R11,
 * contracts/cli.md §4, contracts/http.md).
 *
 * LearnHarness relays the unmodified CLI's own `claude auth login`: it
 * shows the sign-in URL the CLI prints and writes the code the user pastes
 * to the CLI's stdin. The CLI writes its credentials into the tenant's own
 * folder. LearnHarness never reads that folder, and never logs or stores
 * the code, the URL, CLI output or a token. Status comes only from
 * `claude auth status --json`, reduced to { state, method, expiresAt }.
 *
 * Every registry here is tenant-scoped (constitution VII): one pending
 * sign-in and one status cache per tenant.
 */
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { hostedMode, tenantScoped } from "../../config.ts";
import { getClaudeBinary } from "../agent/claude-code/binary.ts";
import { claudeCodeEnv } from "../agent/claude-code/env.ts";
import { inspectClaudeInstallation } from "../agent/claude-code/installation.ts";
import type { ClaudeCodeAuthStatus, ClaudeCodePendingSignIn, ClaudeCodeSignInMethod } from "../core/contracts/claude-code.ts";
import { CLAUDE_CODE_UNAVAILABLE } from "../core/settings.ts";
import { ensureClaudeCodeHome } from "../store/claude-code-home.ts";
import { claudeCodeEnabled } from "./claude-code-config.ts";
import { subscriptionRequestOrigin } from "./web-subscription-http.ts";

// ─── Status (T053) ─────────────────────────────────────────────────────────

const STATUS_TIMEOUT_MS = 5000;
const LOGOUT_TIMEOUT_MS = 10_000;
/** Async admission re-reads a status older than this (R8). */
export const AUTH_STATUS_MAX_AGE_MS = 60_000;

const UNCHECKED: ClaudeCodeAuthStatus = { state: "unchecked", method: null, expiresAt: null };
const SIGNED_OUT: ClaudeCodeAuthStatus = { state: "signed-out", method: null, expiresAt: null };

type AuthCache = { entry?: { status: ClaudeCodeAuthStatus; checkedAt: number }; reading?: Promise<ClaudeCodeAuthStatus> };

function authCache(): AuthCache {
	return tenantScoped("__lhClaudeCodeAuth", (): AuthCache => ({}));
}

function remember(status: ClaudeCodeAuthStatus): ClaudeCodeAuthStatus {
	authCache().entry = { status, checkedAt: Date.now() };
	return status;
}

/** The CLI's raw `authMethod` → the client view. Only `claude.ai` is verified
 * (T048); the Console value is unverified and maps to `other` until seen. */
function toMethod(raw: unknown): ClaudeCodeAuthStatus["method"] {
	return raw === "claude.ai" ? "claude-subscription" : "other";
}

/** Keeps only loggedIn/authMethod/loginExpiresAt; paths, account and org
 * fields never leave this function. A past expiry is signed out. */
export function toAuthStatus(stdout: string, now = Date.now()): ClaudeCodeAuthStatus {
	let parsed: unknown;
	try { parsed = JSON.parse(stdout); } catch { return UNCHECKED; }
	if (!parsed || typeof parsed !== "object" || typeof (parsed as { loggedIn?: unknown }).loggedIn !== "boolean") return UNCHECKED;
	const raw = parsed as { loggedIn: boolean; authMethod?: unknown; loginExpiresAt?: unknown };
	if (!raw.loggedIn) return SIGNED_OUT;
	let expiresAt: string | null = null;
	if (typeof raw.loginExpiresAt === "string") {
		const time = Date.parse(raw.loginExpiresAt);
		if (!Number.isFinite(time)) return UNCHECKED;
		if (time <= now) return SIGNED_OUT;
		expiresAt = new Date(time).toISOString();
	}
	return { state: "signed-in", method: toMethod(raw.authMethod), expiresAt };
}

/** Run one hosted `claude auth …` child; never logs its output. Resolves the
 * exit code (null on timeout or spawn failure) and stdout. */
function runAuthCommand(binary: string, args: string[], timeout: number): Promise<{ code: number | null; stdout: string }> {
	return new Promise((resolve) => {
		execFile(binary, args, {
			cwd: ensureClaudeCodeHome(), env: claudeCodeEnv("auth"), timeout, killSignal: "SIGKILL",
			maxBuffer: 65_536, windowsHide: true,
		}, (error, stdout) => {
			if (!error) { resolve({ code: 0, stdout: String(stdout) }); return; }
			const code = (error as { code?: unknown }).code;
			resolve({ code: typeof code === "number" && !(error as { killed?: boolean }).killed ? code : null, stdout: String(stdout ?? "") });
		});
	});
}

/** `claude auth status --json` in the tenant's folder (exit 1 is the normal
 * signed-out answer); writes the tenant cache. Never throws. */
export async function readClaudeCodeAuth(): Promise<ClaudeCodeAuthStatus> {
	const binary = getClaudeBinary();
	if (!binary) return remember(UNCHECKED);
	try {
		const { code, stdout } = await runAuthCommand(binary, ["auth", "status", "--json"], STATUS_TIMEOUT_MS);
		return remember(code === null ? UNCHECKED : toAuthStatus(stdout));
	} catch {
		return remember(UNCHECKED);
	}
}

/** The cached status when younger than maxAgeMs, else a fresh read
 * (concurrent callers share one child). */
export async function refreshClaudeCodeAuth({ maxAgeMs = AUTH_STATUS_MAX_AGE_MS }: { maxAgeMs?: number } = {}): Promise<ClaudeCodeAuthStatus> {
	const cache = authCache();
	if (cache.entry && Date.now() - cache.entry.checkedAt < maxAgeMs) return cache.entry.status;
	cache.reading ??= readClaudeCodeAuth().finally(() => { cache.reading = undefined; });
	return cache.reading;
}

/** Sync admission: a cached signed-in status whose expiry has not passed.
 * No cache entry counts as signed out (R8). */
export function cachedClaudeCodeSignedIn(now = Date.now()): boolean {
	const status = authCache().entry?.status;
	if (status?.state !== "signed-in") return false;
	return status.expiresAt === null || Date.parse(status.expiresAt) > now;
}

/** The CLI reported authentication_failed during a model turn. */
export function markClaudeCodeSignedOut(): void {
	remember(SIGNED_OUT);
}

// ─── Sign-in relay (T055) ──────────────────────────────────────────────────

/** Test seam (liveProcessIdleTimeoutMs idiom): URL wait, pending life, code wait. */
export const signInTimeouts = { urlMs: 15_000, pendingMs: 10 * 60_000, codeMs: 60_000 };

export const SIGN_IN_ALLOWED_HOSTS: ReadonlySet<string> = new Set(["claude.com", "claude.ai", "console.anthropic.com", "platform.claude.com"]);

export const SIGN_IN_EXPIRED = "This sign-in expired. Start again.";
export const SIGN_IN_NOT_STARTED = "Sign-in could not be started.";
export const SIGN_IN_CODE_INVALID = "Paste the code from Anthropic's page.";
export const SIGN_OUT_FAILED = "Sign-out could not be completed.";

type PendingLogin = {
	method: ClaudeCodeSignInMethod;
	url: string | null;
	startedAt: number;
	expiresAt: number;
	child: ChildProcessWithoutNullStreams;
	/** Receives each non-empty output line while someone listens; lines are
	 * held in memory only for the failure message and never logged. */
	onLine: ((line: string, stream: "stdout" | "stderr") => void) | null;
	/** Resolves with the exit code (null: spawn error or signal) once the
	 * child closed and both output streams were read to the end. */
	exited: Promise<number | null>;
	exitCode: number | null | undefined;
	timer: NodeJS.Timeout | undefined;
	submitting: boolean;
};

type LoginRegistry = { pending?: PendingLogin };

function logins(): LoginRegistry {
	return tenantScoped("__lhClaudeCodeLogins", (): LoginRegistry => ({}));
}

/** Every live login child of every tenant, only so server exit can kill
 * them; never used for lookups. */
const LOGIN_CHILDREN = Symbol.for("lh.claudeCodeLoginChildren");
function loginChildren(): Set<ChildProcessWithoutNullStreams> {
	const g = globalThis as Record<symbol, unknown>;
	if (!g[LOGIN_CHILDREN]) {
		const children = new Set<ChildProcessWithoutNullStreams>();
		g[LOGIN_CHILDREN] = children;
		process.once("exit", () => { for (const child of children) child.kill("SIGKILL"); });
	}
	return g[LOGIN_CHILDREN] as Set<ChildProcessWithoutNullStreams>;
}

function endLogin(login: PendingLogin): void {
	clearTimeout(login.timer);
	login.onLine = null;
	if (login.exitCode === undefined) login.child.kill("SIGKILL");
	const registry = logins();
	if (registry.pending === login) registry.pending = undefined;
}

function toView(login: PendingLogin): ClaudeCodePendingSignIn {
	return { method: login.method, url: login.url!, expiresAt: new Date(login.expiresAt).toISOString() };
}

/** An https URL on an allowed Anthropic host, else null. */
export function allowedSignInUrl(candidate: string): string | null {
	try {
		const url = new URL(candidate);
		return url.protocol === "https:" && SIGN_IN_ALLOWED_HOSTS.has(url.hostname) ? url.toString() : null;
	} catch {
		return null;
	}
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const CONTROL = /[\u0000-\u001f\u007f]/g;

function cleanLine(line: string): string {
	return line.replace(ANSI, "").replace(CONTROL, "").trim();
}

/** The tenant's waiting sign-in, if any (an expired one ends here). */
export function pendingSignIn(): ClaudeCodePendingSignIn | null {
	const login = logins().pending;
	if (!login?.url) return null;
	if (Date.now() >= login.expiresAt || login.exitCode !== undefined) { endLogin(login); return null; }
	return toView(login);
}

/** Ends the tenant's pending sign-in, if any (also on opt-in off, O5). */
export function cancelSignIn(): void {
	const login = logins().pending;
	if (login) endLogin(login);
}

export type StartSignInResult =
	| { ok: true; pending: ClaudeCodePendingSignIn }
	| { ok: false; status: 409 | 502; error: string };

/** `claude auth login --claudeai|--console` in the tenant's folder; resolves
 * once the CLI prints its sign-in URL. Replaces any earlier pending sign-in. */
export async function startSignIn(method: ClaudeCodeSignInMethod): Promise<StartSignInResult> {
	cancelSignIn();
	const binary = getClaudeBinary();
	if (!binary) return { ok: false, status: 409, error: CLAUDE_CODE_UNAVAILABLE };
	if ((await inspectClaudeInstallation(() => binary)).state !== "meets-minimum") return { ok: false, status: 409, error: CLAUDE_CODE_UNAVAILABLE };
	cancelSignIn();

	let child: ChildProcessWithoutNullStreams;
	try {
		child = spawn(binary, ["auth", "login", `--${method}`], {
			cwd: ensureClaudeCodeHome(), env: claudeCodeEnv("auth"), stdio: "pipe", windowsHide: true,
		});
	} catch {
		return { ok: false, status: 502, error: SIGN_IN_NOT_STARTED };
	}
	const children = loginChildren();
	children.add(child);
	const startedAt = Date.now();
	const readLines = (input: NodeJS.ReadableStream, stream: "stdout" | "stderr") => new Promise<void>((resolve) => {
		createInterface({ input }).on("line", (raw) => {
			const line = cleanLine(raw);
			if (line) login.onLine?.(line, stream);
		}).once("close", resolve);
	});
	const closed = new Promise<number | null>((resolve) => {
		child.once("error", () => resolve(null));
		child.once("close", (code) => resolve(code));
	});
	const login: PendingLogin = {
		method, url: null, startedAt, expiresAt: startedAt + signInTimeouts.pendingMs, child,
		onLine: null, exitCode: undefined, timer: undefined, submitting: false,
		exited: Promise.all([closed, readLines(child.stdout, "stdout"), readLines(child.stderr, "stderr")]).then(([code]) => {
			children.delete(child);
			login.exitCode = code;
			return code;
		}),
	};
	child.stdin.on("error", () => {});
	logins().pending = login;

	const url = await new Promise<string | null>((resolve) => {
		const timer = setTimeout(() => resolve(null), signInTimeouts.urlMs);
		login.onLine = (line) => {
			const match = /visit:\s*(https:\/\/\S+)/.exec(line);
			if (!match) return;
			clearTimeout(timer);
			resolve(allowedSignInUrl(match[1] ?? ""));
		};
		void login.exited.then(() => { clearTimeout(timer); resolve(null); });
	});
	login.onLine = null;
	if (!url || logins().pending !== login) {
		endLogin(login);
		return { ok: false, status: 502, error: SIGN_IN_NOT_STARTED };
	}
	login.url = url;
	login.timer = setTimeout(() => endLogin(login), Math.max(0, login.expiresAt - Date.now()));
	login.timer.unref();
	return { ok: true, pending: toView(login) };
}

export type SubmitCodeResult =
	| { ok: true; auth: ClaudeCodeAuthStatus }
	| { ok: false; status: 400 | 409 | 422; error: string };

/** 1-512 characters, no control characters (a single line). */
export function validSignInCode(code: unknown): code is string {
	return typeof code === "string" && code.length >= 1 && code.length <= 512 && !/[\u0000-\u001f\u007f]/.test(code);
}

/** Writes the code once to the pending CLI's stdin and waits for its
 * verdict. The code is never stored, logged or echoed back. */
export async function submitSignInCode(code: unknown): Promise<SubmitCodeResult> {
	if (!validSignInCode(code)) return { ok: false, status: 400, error: SIGN_IN_CODE_INVALID };
	const login = logins().pending;
	if (!login?.url || login.submitting || login.exitCode !== undefined || Date.now() >= login.expiresAt) {
		if (login && !login.submitting) endLogin(login);
		return { ok: false, status: 409, error: SIGN_IN_EXPIRED };
	}
	login.submitting = true;
	// Only lines printed after the code: earlier ones carry the sign-in URL.
	// The CLI reports failures on stderr; its stdout ends with the prompt.
	const after: { line: string; stream: "stdout" | "stderr" }[] = [];
	// 2.1.321 answers a malformed code with "Invalid code. …" and keeps
	// waiting for another line instead of exiting (T048); that ends the attempt.
	const verdict = await new Promise<number | null>((resolve) => {
		const timer = setTimeout(() => resolve(null), signInTimeouts.codeMs);
		login.onLine = (line, stream) => {
			after.push({ line, stream });
			if (stream === "stderr" && /^Invalid code\b/i.test(line)) { clearTimeout(timer); resolve(null); }
		};
		void login.exited.then((exit) => { clearTimeout(timer); resolve(exit); });
		login.child.stdin.write(`${code}\n`);
	});
	endLogin(login);
	if (verdict === 0) return { ok: true, auth: await readClaudeCodeAuth() };
	const last = after.findLast((entry) => entry.stream === "stderr")?.line
		?? after.findLast((entry) => !entry.line.startsWith("Paste code here"))?.line ?? "";
	const message = last.split(code).join("…") || `Claude Code exited with code ${verdict ?? "unknown"}`;
	return { ok: false, status: 422, error: `Sign-in failed: ${message}` };
}

/** `claude auth logout`, then the status (only while the opt-in is on, O5;
 * off, a successful logout is reported as signed out without a status run). */
export async function signOut({ readStatus = true }: { readStatus?: boolean } = {}): Promise<{ ok: boolean; auth: ClaudeCodeAuthStatus }> {
	cancelSignIn();
	const binary = getClaudeBinary();
	if (!binary) return { ok: false, auth: authCache().entry?.status ?? UNCHECKED };
	const { code } = await runAuthCommand(binary, ["auth", "logout"], LOGOUT_TIMEOUT_MS).catch(() => ({ code: null }));
	if (readStatus) return { ok: code === 0, auth: await readClaudeCodeAuth() };
	if (code === 0) return { ok: true, auth: remember(SIGNED_OUT) };
	return { ok: false, auth: authCache().entry?.status ?? UNCHECKED };
}

// ─── HTTP (T058) ───────────────────────────────────────────────────────────

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(body: unknown, status = 200): Response {
	return Response.json(body, { status, headers: HEADERS });
}

/** GET status / POST start|code|cancel|sign-out for the current tenant
 * (contracts/http.md). Hosted only; same-origin browser intent required. */
export async function claudeCodeAuthResponse(request: Request): Promise<Response> {
	if (!hostedMode()) return json({ error: "Claude Code sign-in is only available on the hosted site." }, 404);
	const origin = subscriptionRequestOrigin(request);
	const supplied = request.headers.get("origin");
	if ((request.method !== "GET" && request.method !== "POST") || !origin
		|| request.headers.get("x-learnharness-claude-code") !== "1"
		|| request.headers.get("sec-fetch-site") === "cross-site"
		|| (supplied !== null && supplied !== origin)
		|| (request.method === "POST" && supplied === null)) {
		return json({ error: "Claude Code checks require a same-origin LearnHarness request." }, 403);
	}
	const disabled = () => json({ error: "Claude Code is disabled." }, 403);

	if (request.method === "GET") {
		if (!claudeCodeEnabled()) return disabled();
		const auth = await readClaudeCodeAuth();
		return json({ auth, pending: pendingSignIn() });
	}

	const body = await request.json().catch(() => null) as Record<string, unknown> | null;
	const action = body && typeof body === "object" ? body.action : undefined;
	if (action === "start" && (body!.method === "claudeai" || body!.method === "console")) {
		if (!claudeCodeEnabled()) return disabled();
		const started = await startSignIn(body!.method);
		return started.ok ? json({ pending: started.pending }) : json({ error: started.error }, started.status);
	}
	if (action === "code") {
		if (!claudeCodeEnabled()) return disabled();
		const result = await submitSignInCode(body!.code);
		return result.ok ? json({ auth: result.auth, pending: null }) : json({ error: result.error }, result.status);
	}
	if (action === "cancel") {
		cancelSignIn();
		return json({ pending: null });
	}
	if (action === "sign-out") {
		const result = await signOut({ readStatus: claudeCodeEnabled() });
		return result.ok ? json({ auth: result.auth, pending: null }) : json({ error: SIGN_OUT_FAILED, auth: result.auth, pending: null }, 502);
	}
	return json({ error: "Unknown action." }, 400);
}
