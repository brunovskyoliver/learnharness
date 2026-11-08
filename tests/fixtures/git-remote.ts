/**
 * A real git remote for tests (feature 026, research R14): bare repos built
 * with the `git` binary in a temp dir, served over smart HTTP by `git
 * http-backend` (CGI) behind a Node `http` server on 127.0.0.1. A repo can
 * demand a Basic token, and a path can answer with a redirect. Nothing here
 * talks to the network beyond 127.0.0.1.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";

/** What one repo path holds: text or bytes, a symlink, a submodule gitlink, or a Git LFS pointer. */
export type FixtureEntry =
	| string
	| Uint8Array
	| { symlink: string }
	| { submodule: string }
	| { lfs: { size: number } };
/** A path → entry map; `null` deletes the path in a commit. */
export type FixtureFiles = Record<string, FixtureEntry | null>;

export interface FixtureRequest { method: string; path: string; authorization: string | null }

export interface CreateRepoOptions {
	/** The branch the first commit lands on, and HEAD's target. Default "main". */
	branch?: string;
	/** Requests must carry `Authorization: Basic base64(<any user>:<token>)`. */
	token?: string;
}

export interface CommitOptions {
	branch?: string;
	message?: string;
	/** Start from an empty tree instead of the branch tip (with `force`, a rewrite). */
	replace?: boolean;
	/** Push with --force (a history rewrite upstream). */
	force?: boolean;
}

const run = (cwd: string, args: string[], input?: string) => execFileSync("git", args, {
	cwd,
	input,
	encoding: "utf8",
	env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid", GIT_CONFIG_NOSYSTEM: "1", HOME: os.tmpdir() },
	stdio: ["pipe", "pipe", "pipe"],
}).trim();

/** Why the git tests can't run here, or undefined when they can. */
export function skipReason(): string | undefined {
	const version = spawnSync("git", ["--version"], { encoding: "utf8" });
	if (version.status !== 0) return "the git binary is not installed, so the fixture remote can't be built";
	const exec = spawnSync("git", ["--exec-path"], { encoding: "utf8" });
	if (exec.status !== 0 || !fs.existsSync(path.join(exec.stdout.trim(), "git-http-backend"))) return "git-http-backend is not installed, so the fixture remote can't be served";
	return undefined;
}

/** A Git LFS pointer file's text, as `git lfs` writes it. */
export const lfsPointer = (size: number) => `version https://git-lfs.github.com/spec/v1\noid sha256:${"a".repeat(64)}\nsize ${size}\n`;

export class GitRemote {
	readonly root: string;
	readonly requests: FixtureRequest[] = [];
	private readonly tokens = new Map<string, string>();
	private readonly redirects = new Map<string, string>();
	private server: http.Server | null = null;
	private port = 0;

	private constructor(root: string) {
		this.root = root;
	}

	static async start(): Promise<GitRemote> {
		const remote = new GitRemote(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-git-remote-"))));
		fs.mkdirSync(remote.bareRoot, { recursive: true });
		fs.mkdirSync(remote.workRoot, { recursive: true });
		await remote.listen();
		return remote;
	}

	private get bareRoot() { return path.join(this.root, "bare"); }
	private get workRoot() { return path.join(this.root, "work"); }
	private bare(name: string) { return path.join(this.bareRoot, `${name}.git`); }
	private work(name: string) { return path.join(this.workRoot, name); }

	/** The repo's address on this server: `http://127.0.0.1:<port>/<name>.git`. */
	url(name: string): string {
		return `http://127.0.0.1:${this.port}/${name}.git`;
	}

	/** Answer every request under `/<from>` with a 301 to `to` + the rest of the path. */
	redirect(from: string, to: string): string {
		this.redirects.set(`/${from}`, to);
		return `http://127.0.0.1:${this.port}/${from}`;
	}

	/** A bare repo with one commit of `files` on `branch` (HEAD points at it). */
	createRepo(name: string, files: FixtureFiles, options: CreateRepoOptions = {}): string {
		const branch = options.branch ?? "main";
		run(this.bareRoot, ["init", "--bare", "-q", "-b", branch, this.bare(name)]);
		run(this.bareRoot, ["init", "-q", "-b", branch, this.work(name)]);
		run(this.work(name), ["remote", "add", "origin", this.bare(name)]);
		if (options.token) this.tokens.set(name, options.token);
		this.commit(name, files, { branch, message: "first" });
		return this.url(name);
	}

	/** An empty bare repo (no commits, no branches). */
	createEmptyRepo(name: string): string {
		run(this.bareRoot, ["init", "--bare", "-q", "-b", "main", this.bare(name)]);
		return this.url(name);
	}

	/** Point the bare repo's HEAD (the default branch) at `branch`. */
	setDefaultBranch(name: string, branch: string): void {
		run(this.bare(name), ["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
	}

	/** Apply `files` on top of `branch` (or an empty tree with `replace`), commit and push. Returns the new tip. */
	commit(name: string, files: FixtureFiles, options: CommitOptions = {}): string {
		const work = this.work(name);
		const branch = options.branch ?? "main";
		const exists = run(this.bare(name), ["for-each-ref", "--format=%(refname)", `refs/heads/${branch}`]) !== "";
		if (options.replace || !exists) {
			run(work, ["checkout", "-q", "--orphan", `fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`]);
			run(work, ["rm", "-rfq", "--cached", "--ignore-unmatch", "."]);
			for (const entry of fs.readdirSync(work)) if (entry !== ".git") fs.rmSync(path.join(work, entry), { recursive: true, force: true });
		} else {
			run(work, ["fetch", "-q", "origin"]);
			run(work, ["checkout", "-q", "-B", branch, `origin/${branch}`]);
			run(work, ["reset", "-q", "--hard", `origin/${branch}`]);
		}
		const gitlinks: [string, string][] = [];
		for (const [repoPath, entry] of Object.entries(files)) {
			const target = path.join(work, repoPath);
			if (entry === null) { fs.rmSync(target, { recursive: true, force: true }); continue; }
			fs.mkdirSync(path.dirname(target), { recursive: true });
			if (typeof entry === "string" || entry instanceof Uint8Array) fs.writeFileSync(target, entry);
			else if ("symlink" in entry) fs.symlinkSync(entry.symlink, target);
			else if ("lfs" in entry) fs.writeFileSync(target, lfsPointer(entry.lfs.size));
			else gitlinks.push([repoPath, entry.submodule]);
		}
		run(work, ["add", "-A"]);
		for (const [repoPath, url] of gitlinks) {
			// A gitlink entry needs no checkout of the submodule: the index records mode 160000 and a commit oid.
			run(work, ["update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},${repoPath}`]);
			fs.appendFileSync(path.join(work, ".gitmodules"), `[submodule "${repoPath}"]\n\tpath = ${repoPath}\n\turl = ${url}\n`);
			run(work, ["add", ".gitmodules"]);
		}
		run(work, ["commit", "-q", "--allow-empty", "-m", options.message ?? "change"]);
		run(work, ["push", "-q", ...(options.force ? ["--force"] : []), "origin", `HEAD:refs/heads/${branch}`]);
		return run(work, ["rev-parse", "HEAD"]);
	}

	/** The branch's tip oid in the bare repo. */
	tip(name: string, branch = "main"): string {
		return run(this.bare(name), ["rev-parse", `refs/heads/${branch}`]);
	}

	private listen(): Promise<void> {
		const backend = path.join(execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(), "git-http-backend");
		this.server = http.createServer((req, res) => {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			const authorization = req.headers.authorization ?? null;
			this.requests.push({ method: req.method ?? "GET", path: url.pathname + url.search, authorization });
			for (const [prefix, to] of this.redirects) {
				if (url.pathname.startsWith(prefix)) {
					res.writeHead(301, { location: to + url.pathname.slice(prefix.length) + url.search });
					res.end();
					return;
				}
			}
			const repo = /^\/([^/]+)\.git\//.exec(url.pathname)?.[1];
			const token = repo ? this.tokens.get(repo) : undefined;
			if (token) {
				const given = authorization?.startsWith("Basic ") ? Buffer.from(authorization.slice(6), "base64").toString("utf8") : "";
				if (given.slice(given.indexOf(":") + 1) !== token) {
					res.writeHead(401, { "www-authenticate": 'Basic realm="fixture"' });
					res.end("unauthorized");
					return;
				}
			}
			const env: Record<string, string> = {
					PATH: process.env.PATH ?? "",
					GIT_PROJECT_ROOT: this.bareRoot,
					GIT_HTTP_EXPORT_ALL: "1",
					GIT_CONFIG_NOSYSTEM: "1",
					HOME: os.tmpdir(),
					REQUEST_METHOD: req.method ?? "GET",
					PATH_INFO: decodeURIComponent(url.pathname),
					QUERY_STRING: url.search.slice(1),
					CONTENT_TYPE: req.headers["content-type"] ?? "",
					REMOTE_ADDR: "127.0.0.1",
					REMOTE_USER: authorization ? "fixture" : "",
					...(req.headers["git-protocol"] ? { GIT_PROTOCOL: String(req.headers["git-protocol"]) } : {}),
					...(req.headers["content-encoding"] ? { HTTP_CONTENT_ENCODING: String(req.headers["content-encoding"]) } : {}),
			};
			const child = spawn(backend, [], { env: env as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "ignore"] });
			req.pipe(child.stdin);
			let head = Buffer.alloc(0);
			let started = false;
			child.stdout.on("data", (chunk: Buffer) => {
				if (started) { res.write(chunk); return; }
				head = Buffer.concat([head, chunk]);
				const end = head.indexOf("\r\n\r\n");
				if (end < 0) return;
				started = true;
				let status = 200;
				const headers: Record<string, string> = {};
				for (const line of head.subarray(0, end).toString("latin1").split("\r\n")) {
					const colon = line.indexOf(":");
					const key = line.slice(0, colon).trim();
					const value = line.slice(colon + 1).trim();
					if (key.toLowerCase() === "status") status = Number.parseInt(value, 10);
					else headers[key] = value;
				}
				res.writeHead(status, headers);
				res.write(head.subarray(end + 4));
			});
			child.stdout.on("end", () => {
				if (!started) res.writeHead(500);
				res.end();
			});
			child.on("error", () => { if (!res.headersSent) res.writeHead(500); res.end(); });
		});
		return new Promise((resolve) => {
			this.server!.listen(0, "127.0.0.1", () => {
				this.port = (this.server!.address() as AddressInfo).port;
				resolve();
			});
		});
	}

	async close(): Promise<void> {
		await new Promise<void>((resolve) => {
			if (!this.server) return resolve();
			this.server.closeAllConnections();
			this.server.close(() => resolve());
		});
		fs.rmSync(this.root, { recursive: true, force: true });
	}
}
