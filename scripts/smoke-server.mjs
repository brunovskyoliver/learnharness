/**
 * smoke-server.mjs — boot the packaged standalone server and prove it serves.
 *
 * The payload gate that pays for itself (2026-10-08): `next build` success
 * and a completed electron-builder run say NOTHING about whether the
 * packaged server actually starts. On its first day this smoke caught two
 * real defects nothing else saw: (1) a trace-exclude regression that
 * stripped the pi engine packages to bare package.jsons — the server
 * answered 500 on every route with ERR_MODULE_NOT_FOUND; (2) before that,
 * the dev auth.json (BYOK keys) shipping inside the bundle. It runs
 * between build-server.mjs and electron-builder so a broken payload fails
 * in seconds, not after a full packaging pass.
 *
 * What it does: spawns .next/standalone/server.js exactly the way the
 * Electron shell does (electron/main.cjs) — with --electron it uses
 * Electron's bundled Node via ELECTRON_RUN_AS_NODE, otherwise host Node —
 * 127.0.0.1 on a kernel-assigned
 * free port, NODE_ENV=production, a THROWAWAY LH_DATA_DIR and an EMPTY
 * LH_AUTH_FILE under os.tmpdir() (no real keys or data ever touch it) —
 * polls GET / until 200, then probes the GET-only API surface (graph /
 * models / settings — no side effects). Any non-200, an early server
 * exit, or a 30s boot timeout fails the gate and prints the server's own
 * log tail for diagnosis. The child is ALWAYS killed before exit — a
 * leaked server holds its port against the next run (learned the hard
 * way, same day).
 */
import { execFileSync, spawn } from "node:child_process";
import { probeEnv, verifyDemoRuntime } from "./smoke-demo-runtime.mjs";
import { verifyProviderRuntime } from "./smoke-provider-runtime.mjs";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const SERVER = path.join(STANDALONE, "server.js");
const ELECTRON_MODE = process.argv.includes("--electron");
const RUNTIME = ELECTRON_MODE ? createRequire(import.meta.url)("electron") : process.execPath;

const POLL_MS = 500;
const BOOT_TIMEOUT_MS = 30_000;
/** GET-only probes — the routes that exercised today's failure class. */
const PROBES = ["/api/graph", "/api/models", "/api/settings"];

if (!fs.existsSync(SERVER)) {
	console.error("[smoke-server] .next/standalone/server.js missing — run next build first.");
	process.exit(1);
}

/** A free TCP port (listen(0) → the kernel assigns one) — mirrors main.cjs. */
function freePort() {
	return new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
		srv.on("error", reject);
	});
}

/** One GET; resolves the status code (0 = connection refused/failed). */
function get(url) {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => {
			res.resume();
			resolve(res.statusCode ?? 0);
		});
		req.on("error", () => resolve(0));
		req.setTimeout(5000, () => {
			req.destroy();
			resolve(0);
		});
	});
}


/** One JSON request; resolves { status, body }. */
function requestJson(url, method, body) {
	return new Promise((resolve) => {
		const data = body === undefined ? undefined : JSON.stringify(body);
		const req = http.request(url, { method, headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} }, (res) => {
			const chunks = [];
			res.on("data", (c) => chunks.push(c));
			res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
		});
		req.on("error", (err) => resolve({ status: 0, body: String(err) }));
		req.setTimeout(60_000, () => req.destroy(new Error("timeout")));
		if (data) req.write(data);
		req.end();
	});
}

/**
 * Feature 026 (T052): a real git remote for one sync through the standalone
 * server, proving the trace carries isomorphic-git. The test fixture serves
 * smart HTTP on 127.0.0.1; production refuses plain http, so an https proxy
 * with a throwaway self-signed certificate for 127.0.0.1 sits in front, and
 * the server trusts it through NODE_EXTRA_CA_CERTS. Null when git or
 * git-http-backend is missing here (the step is skipped, said so).
 */
async function startGitFixture(home) {
	const fixture = await import(path.join(ROOT, "tests", "fixtures", "git-remote.ts"));
	const skip = fixture.skipReason();
	if (skip) {
		console.log(`[smoke-server] repo sync skipped: ${skip}`);
		return null;
	}
	const remote = await fixture.GitRemote.start();
	const token = "ghp_smokeSENTINEL0000";
	remote.createRepo("notes", { "README.md": "# smoke\n", "week1/notes.md": "# week 1\n" }, { token });
	const key = path.join(home, "fixture-key.pem");
	const cert = path.join(home, "fixture-cert.pem");
	execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
	const upstream = new URL(remote.url("notes")).port;
	const proxy = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
		const forward = http.request({ host: "127.0.0.1", port: upstream, path: req.url, method: req.method, headers: req.headers }, (answer) => {
			res.writeHead(answer.statusCode ?? 502, answer.headers);
			answer.pipe(res);
		});
		forward.on("error", () => { res.writeHead(502); res.end(); });
		req.pipe(forward);
	});
	await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
	const url = `https://127.0.0.1:${proxy.address().port}/notes.git`;
	return {
		url, token, cert,
		close: async () => {
			await new Promise((resolve) => proxy.close(() => resolve()));
			await remote.close();
		},
	};
}

async function main() {
	// HTTP boot alone never imports the dynamically loaded demo engine.
	// Fail before packaging if its standalone dependency graph is incomplete.
	verifyDemoRuntime(STANDALONE, RUNTIME);
	// /api/models only reads catalogs; initialize the real lazy SDK offline too.
	verifyProviderRuntime(STANDALONE, RUNTIME);
	const port = await freePort();
	const url = `http://127.0.0.1:${port}`;
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "lh-smoke-"));
	const dataDir = path.join(home, "data");
	const authFile = path.join(home, "auth.json");
	fs.writeFileSync(authFile, "{}\n", "utf-8");
	const git = await startGitFixture(home);

	const tail = []; // rolling log tail for failure diagnosis
	let tailBytes = 0;
	const keep = (buf) => {
		for (const line of buf.toString().split("\n")) {
			tail.push(line);
			tailBytes += line.length + 1;
		}
		while (tailBytes > 16_000 && tail.length > 2) {
			tailBytes -= tail[0].length + 1;
			tail.shift();
		}
	};
	const dumpTail = () => {
		console.error("--- server log tail " + "-".repeat(20));
		for (const line of tail.slice(-40)) if (line.trim()) console.error(`    ${line}`);
	};

	console.log(`[smoke-server] runtime: ${ELECTRON_MODE ? "Electron bundled Node" : "host Node"}`);
	const child = spawn(RUNTIME, [SERVER], {
		cwd: STANDALONE,
		env: {
			...probeEnv(process.env, home),
			...(ELECTRON_MODE ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
			NODE_ENV: "production",
			PORT: String(port),
			HOSTNAME: "127.0.0.1",
			LH_DATA_DIR: dataDir,
			LH_AUTH_FILE: authFile,
			...(git ? { NODE_EXTRA_CA_CERTS: git.cert } : {}),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let exited = false;
	child.stdout.on("data", keep);
	child.stderr.on("data", keep);
	child.on("exit", () => {
		exited = true;
	});

	const kill = () =>
		new Promise((resolve) => {
			if (exited) return resolve();
			const done = () => resolve();
			child.once("exit", done);
			child.kill("SIGTERM");
			setTimeout(() => {
				if (!exited) {
					try {
						child.kill("SIGKILL");
					} catch {
						/* already gone */
					}
				}
				done();
			}, 3000);
		});

	let failed = null;
	try {
		// 1) Boot: poll GET / until 200 (or timeout / early exit).
		let boot = 0;
		const deadline = Date.now() + BOOT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (exited) throw new Error(`server exited before answering on ${url}`);
			boot = await get(url);
			if (boot === 200) break;
			await new Promise((r) => setTimeout(r, POLL_MS));
		}
		if (boot !== 200) throw new Error(`server never answered 200 on ${url} (last status: ${boot})`);
		console.log(`[smoke-server] boot ok: GET / → 200 (${url})`);

		// 2) API surface: every probe must be 200.
		for (const route of PROBES) {
			const status = await get(url + route);
			if (status !== 200) throw new Error(`GET ${route} → ${status} (expected 200)`);
			console.log(`[smoke-server] GET ${route} → 200`);
		}

		// 3) Feature 026: link a token-protected repo, so isomorphic-git loads and pulls in the packaged server.
		if (git) {
			const created = await requestJson(`${url}/api/library/links`, "POST", { url: git.url, folderName: "Smoke repo", parentId: null, requestId: "req_smoke", token: git.token });
			if (created.status !== 201) throw new Error(`POST /api/library/links → ${created.status} (expected 201): ${created.body.slice(0, 300)}`);
			if (created.body.includes(git.token)) throw new Error("POST /api/library/links answered with the token");
			const library = await requestJson(`${url}/api/library`, "GET");
			const items = library.status === 200 ? JSON.parse(library.body).items ?? [] : [];
			const readme = items.find((item) => item.name === "README.md");
			if (!readme) throw new Error(`GET /api/library → ${library.status}, no synced README.md`);
			const content = await requestJson(`${url}/api/library/items/${readme.id}/content`, "GET");
			if (content.status !== 200 || !content.body.includes("# smoke")) throw new Error(`GET the synced README.md → ${content.status}`);
			console.log(`[smoke-server] repo sync ok: linked over https, ${items.length} synced files, README.md readable`);
		}
	} catch (err) {
		failed = err;
	} finally {
		await kill();
		await git?.close().catch(() => {});
		try {
			fs.rmSync(home, { recursive: true, force: true });
		} catch {
			/* best effort — it's under os.tmpdir() */
		}
	}

	if (failed) {
		console.error(`[smoke-server] FAIL: ${failed.message}`);
		dumpTail();
		process.exit(1);
	}
	console.log("[smoke-server] smoke passed — the packaged server boots and serves.");
}

main().catch((err) => {
	console.error(`[smoke-server] FAIL: ${err.message}`);
	process.exit(1);
});
