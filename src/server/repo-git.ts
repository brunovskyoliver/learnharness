/**
 * Library git sync's transport (feature 026, research R5, R6, FR-030): the one
 * file that loads isomorphic-git, always through `import()`, so neither
 * startup nor any client chunk carries it (VIII).
 *
 * The HTTP client is our own, in isomorphic-git's `HttpClient` shape, over
 * `node:http`/`node:https`, so it owns the socket's `lookup` hook: in hosted
 * mode every resolved address is checked right before the socket connects to
 * it (no gap for DNS rebinding, analyze M1), IP-literal hosts are checked
 * before the request, and each redirect is a new request through the same
 * check. It also refuses non-https targets, counts response bytes against the
 * download cap and applies the connect and total timeouts. Tokens go out as
 * Basic `x-access-token:<token>` and never into an error, a log line or a
 * response (FR-004).
 */
import * as dns from "node:dns";
import fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import path from "node:path";
import { nanoid } from "nanoid";
import { hostedMode, PATHS } from "../../config.ts";
import { failureMessage, isBlockedAddress, redactSecrets, REPO_MAX_BYTES, RepoRemoteError, type SyncFailure, type SyncFailureCode } from "../core/repo-link.ts";
import type { RepoRemote, RepoRemoteRequest, RepoSnapshotRequest, RepoTip, RepoTreeEntry } from "../core/ports.ts";

type Git = typeof import("isomorphic-git");
let gitModule: Promise<Git> | null = null;
const loadGit = (): Promise<Git> => (gitModule ??= import("isomorphic-git"));

export const CONNECT_TIMEOUT_MS = 30_000;
export const TOTAL_TIMEOUT_MS = 10 * 60_000;
const MAX_REDIRECTS = 5;

/** Tests and the e2e server only, never production: plain http to 127.0.0.1,
 *  and 127.0.0.1 (only it) past the hosted address block (analyze M3). */
export const loopbackTestMode = (): boolean => process.env.LH_TEST_GIT_LOOPBACK_HTTP === "1" && process.env.NODE_ENV !== "production";

/** Why the client stopped a pull on its own; read when mapping the error. */
type Stop = "address-blocked" | "too-large-download" | "insecure" | "timeout";

class TransportStop extends Error {
	constructor(readonly stop: Stop, message: string) {
		super(message);
		this.name = "TransportStop";
	}
}

interface GitHttpRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
}
interface GitHttpResponse {
	url: string;
	method: string;
	statusCode: number;
	statusMessage: string;
	headers: Record<string, string>;
	body: AsyncIterableIterator<Uint8Array>;
}

/** One pull's HTTP client: a shared byte counter and deadline across its requests. */
class PullClient {
	stopped: Stop | null = null;
	private received = 0;
	private readonly deadline: number;

	constructor(private readonly maxBytes: number, totalMs = TOTAL_TIMEOUT_MS, private readonly connectMs = CONNECT_TIMEOUT_MS) {
		this.deadline = Date.now() + totalMs;
	}

	private stop(stop: Stop, message: string): never {
		this.stopped ??= stop;
		throw new TransportStop(stop, message);
	}

	private addressAllowed(ip: string): boolean {
		if (!hostedMode()) return true;
		if (loopbackTestMode() && ip === "127.0.0.1") return true;
		return !isBlockedAddress(ip);
	}

	private checkTarget(url: URL): void {
		const loopback = loopbackTestMode() && url.protocol === "http:" && url.hostname === "127.0.0.1";
		if (url.protocol !== "https:" && !loopback) this.stop("insecure", `refused a non-https address (${url.protocol}//${url.host})`);
		const host = url.hostname.replace(/^\[|\]$/g, "");
		if (net.isIP(host) && !this.addressAllowed(host)) this.stop("address-blocked", `refused ${host}: not reachable from the hosted app`);
	}

	/** dns.lookup that refuses before connecting when any resolved address is blocked. */
	private lookup: net.LookupFunction = (hostname, options, callback) => {
		dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
			if (err) return callback(err, "", 4);
			const list = addresses as dns.LookupAddress[];
			const blocked = list.find((a) => !this.addressAllowed(a.address));
			if (blocked) {
				this.stopped ??= "address-blocked";
				return callback(new TransportStop("address-blocked", `refused ${hostname} (${blocked.address}): not reachable from the hosted app`), "", 4);
			}
			if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
			return callback(null, list[0]!.address, list[0]!.family);
		});
	};

	request = async (request: GitHttpRequest): Promise<GitHttpResponse> => {
		const method = (request.method ?? "GET").toUpperCase();
		const chunks: Uint8Array[] = [];
		if (request.body) for await (const chunk of request.body as AsyncIterable<Uint8Array>) chunks.push(chunk);
		const payload = chunks.length ? Buffer.concat(chunks) : null;
		let url = new URL(request.url);
		for (let hop = 0; ; hop++) {
			this.checkTarget(url);
			const res = await this.once(url, method, request.headers ?? {}, payload);
			const location = res.headers.location;
			const redirect = [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && location && (method === "GET" || res.statusCode === 307 || res.statusCode === 308);
			if (!redirect) return this.wrap(url, method, res);
			res.resume();
			if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
			url = new URL(location, url);
		}
	};

	private once(url: URL, method: string, headers: Record<string, string>, payload: Buffer | null): Promise<http.IncomingMessage> {
		const remaining = this.deadline - Date.now();
		if (remaining <= 0) this.stop("timeout", "the pull took longer than 10 minutes");
		const transport = url.protocol === "https:" ? https : http;
		return new Promise((resolve, reject) => {
			const req = transport.request(url, {
				method,
				headers: { ...headers, ...(payload ? { "content-length": String(payload.length) } : {}) },
				// A fresh socket per request: each one goes through the lookup check.
				agent: false,
				lookup: this.lookup,
			}, (res) => {
				clearTimeout(connectTimer);
				resolve(res);
			});
			const connectTimer = setTimeout(() => req.destroy(new TransportStop("timeout", "the connection took longer than 30 seconds")), Math.min(this.connectMs, remaining));
			const totalTimer = setTimeout(() => {
				this.stopped ??= "timeout";
				req.destroy(new TransportStop("timeout", "the pull took longer than 10 minutes"));
			}, remaining);
			req.on("close", () => { clearTimeout(connectTimer); clearTimeout(totalTimer); });
			req.on("error", (err) => {
				clearTimeout(connectTimer);
				if (err instanceof TransportStop) this.stopped ??= err.stop;
				reject(err);
			});
			req.end(payload ?? undefined);
		});
	}

	private wrap(url: URL, method: string, res: http.IncomingMessage): GitHttpResponse {
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) headers[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
		const client = this;
		async function* body(): AsyncGenerator<Uint8Array> {
			for await (const chunk of res as AsyncIterable<Buffer>) {
				client.received += chunk.length;
				if (client.received > client.maxBytes) {
					res.destroy();
					client.stop("too-large-download", `the download passed ${client.maxBytes} bytes`);
				}
				yield new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
			}
		}
		return { url: url.href, method, statusCode: res.statusCode ?? 0, statusMessage: res.statusMessage ?? "", headers, body: body() };
	}
}

const NETWORK_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ECONNABORTED", "ERR_SOCKET_CONNECTION_TIMEOUT"]);

/** Any error from a pull as a plain failure, the detail redacted. */
export function toFailure(err: unknown, client: PullClient | null, token: string | undefined): SyncFailure {
	const e = err as { code?: string; name?: string; message?: string; data?: { statusCode?: number } };
	const raw = `${e?.name ?? "Error"}: ${e?.message ?? String(err)}`;
	const detail = redactSecrets(raw, [token]);
	const make = (code: Exclude<SyncFailureCode, "limit-files" | "limit-bytes">): SyncFailure => ({ code, message: failureMessage(code, { hadToken: Boolean(token) }), detail });
	if (err instanceof RepoRemoteError) return err.failure;
	const stop = client?.stopped ?? (err instanceof TransportStop ? err.stop : null);
	if (stop === "address-blocked") return make("address-blocked");
	if (stop === "too-large-download") return make("too-large-download");
	if (stop === "timeout") return make("network");
	if (stop === "insecure") return make("server");
	if (e?.code === "UserCanceledError") return make("auth");
	if (e?.code === "HttpError") {
		const status = e.data?.statusCode ?? 0;
		if (status === 401 || status === 403) return make("auth");
		if (status === 404) return make("not-found");
		return make("server");
	}
	if (e?.code === "NotFoundError" || e?.code === "SmartHttpError") return make("not-found");
	if (e?.code && (NETWORK_CODES.has(e.code) || /CERT|TLS|SSL/i.test(e.code))) return make("network");
	return make("server");
}

const headersFor = (token: string | undefined): Record<string, string> => ({
	"user-agent": "learnharness-git",
	...(token ? { authorization: `Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}` } : {}),
});
// The token is sent up front; a 401 then means it was refused (or none was
// given), so neither callback retries: one request, never a loop.
const cancel = () => ({ cancel: true });

async function withFailures<T>(client: PullClient, token: string | undefined, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		throw new RepoRemoteError(toFailure(err, client, token));
	}
}

async function tip(request: RepoRemoteRequest): Promise<RepoTip> {
	const client = new PullClient(REPO_MAX_BYTES);
	return withFailures(client, request.token, async () => {
		const git = await loadGit();
		const refs = await git.listServerRefs({ http: client, url: request.url, headers: headersFor(request.token), onAuth: cancel, onAuthFailure: cancel, protocolVersion: 2, symrefs: true });
		const head = refs.find((r) => r.ref === "HEAD");
		const branch = request.branch ?? head?.target?.replace(/^refs\/heads\//, "");
		const ref = branch ? refs.find((r) => r.ref === `refs/heads/${branch}`) : undefined;
		if (!branch || !ref) throw Object.assign(new Error(branch ? `no branch ${branch}` : "no default branch"), { code: "NotFoundError" });
		return { branch, commit: ref.oid };
	});
}

const gitWorkDir = () => path.join(PATHS.library, "git-work");

async function snapshot(request: RepoSnapshotRequest, visit: (entry: RepoTreeEntry) => Promise<void> | void): Promise<RepoTip> {
	const client = new PullClient(request.maxDownloadBytes ?? REPO_MAX_BYTES);
	const gitdir = path.join(gitWorkDir(), `${request.linkId}-${nanoid(10)}`);
	try {
		return await withFailures(client, request.token, async () => {
			const git = await loadGit();
			await fs.promises.mkdir(gitdir, { recursive: true });
			await git.clone({
				fs, http: client, dir: gitdir, gitdir, url: request.url, ref: request.branch,
				singleBranch: true, depth: 1, noCheckout: true, noTags: true,
				headers: headersFor(request.token), onAuth: cancel, onAuthFailure: cancel,
			});
			const commit = await git.resolveRef({ fs, gitdir, ref: `refs/remotes/origin/${request.branch}` });
			const { commit: parsed } = await git.readCommit({ fs, gitdir, oid: commit });
			const walk = async (treeOid: string, prefix: string): Promise<void> => {
				const { tree } = await git.readTree({ fs, gitdir, oid: treeOid });
				for (const entry of tree) {
					const entryPath = prefix ? `${prefix}/${entry.path}` : entry.path;
					if (entry.type === "tree") {
						if (!request.skipDirectory?.(entryPath, entry.path)) await walk(entry.oid, entryPath);
						continue;
					}
					await visit({
						path: entryPath,
						mode: entry.mode,
						oid: entry.oid,
						type: entry.type === "commit" ? "commit" : "blob",
						read: async () => (await git.readBlob({ fs, gitdir, oid: entry.oid })).blob,
					});
				}
			};
			await walk(parsed.tree, "");
			return { branch: request.branch, commit };
		});
	} finally {
		await fs.promises.rm(gitdir, { recursive: true, force: true });
	}
}

/** The real remote. Tests and the scheduler use the RepoRemote port. */
export const repoRemote: RepoRemote = { tip, snapshot };

/** The hosted address block before any fetch (FR-030): false when the hosted
 *  app must refuse the address's host. Local and Electron allow everything. An
 *  unresolvable host passes here; the pull then fails it as `network`. The
 *  connect-time check above still guards every request and redirect. */
export async function hostedAddressAllowed(raw: string): Promise<boolean> {
	if (!hostedMode()) return true;
	const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
	// Only the literal 127.0.0.1 passes under the test flag, never a name resolving to it.
	if (loopbackTestMode() && host === "127.0.0.1") return true;
	if (net.isIP(host)) return !isBlockedAddress(host);
	try {
		const addresses = await dns.promises.lookup(host, { all: true });
		return addresses.every((a) => !isBlockedAddress(a.address));
	} catch {
		return true;
	}
}
