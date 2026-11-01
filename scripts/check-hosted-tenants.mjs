/** Hosted tenant isolation through the real proxy (feature 023). The standalone server runs
 * with LH_HOSTED=1 and the real clerkMiddleware. Clerk verifies a session token offline
 * when CLERK_JWT_KEY is set, so this script makes a throwaway RSA key and signs test tokens
 * for two made-up users, with fake keys and no Clerk account. Every outbound connection the
 * server tries is refused and listed, and any listed one fails the run.
 *
 * What this can't show: Clerk's real sign-in, cookies and hand-off, and a Docker image.
 * Those need a real Clerk instance, and no real secret is used here.
 *
 * Needs `next build` and scripts/build-server.mjs.
 * TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium node scripts/check-hosted-tenants.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import puppeteer from "puppeteer-core";

const port = Number(process.env.LH_UI_PORT ?? 3123);
// localhost, matching HOSTNAME: Clerk rewrites to the request's own URL, and Next proxies a rewrite
// to a host it doesn't recognise as itself back into the server, which never answers.
const base = `http://localhost:${port}`;
const root = await mkdtemp(path.join(os.tmpdir(), "learning-hosted-"));
const data = path.join(root, "data");
const blocked = path.join(root, "outbound.log");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SAMPLE = await readFile("tests/fixtures/sample-3page.pdf");
const A = "user_tenantAlpha", B = "user_tenantBeta";
const SECRET = "zxqalphasecret";
let server, browser;

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const other = await generateKeyPair("RS256", { extractable: true });
const kid = "ins_local_test";
const token = (sub, { key = privateKey, expiresIn = "2h", issuedAt } = {}) => new SignJWT({ sid: `sess_${sub}`, azp: base })
	.setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
	.setSubject(sub).setIssuer("https://local.clerk.accounts.dev").setIssuedAt(issuedAt).setNotBefore("-10s").setExpirationTime(expiresIn).sign(key);
const tokenA = await token(A), tokenB = await token(B);

/** Keeps the server to loopback: refuses and lists anything else. */
const GUARD = `
const net = require("node:net"), fs = require("node:fs");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
	const first = Array.isArray(args[0]) ? args[0][0] : args[0];
	const host = typeof first === "object" ? first.host ?? (first.path ? "unix" : "localhost") : typeof args[1] === "string" ? args[1] : "localhost";
	if (!/^(localhost|127\\.|::1|unix)/.test(String(host))) {
		fs.appendFileSync(${JSON.stringify(blocked)}, String(host) + "\\n");
		process.nextTick(() => this.destroy(new Error("outbound connection refused by the test guard")));
		return this;
	}
	return connect.apply(this, args);
};
`;

const req = async (url, { as, method = "GET", body, raw, redirect = "manual" } = {}) => {
	const headers = { ...(as ? { Authorization: `Bearer ${as}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(raw ? { "Content-Length": String(raw.length) } : {}) };
	const response = await fetch(`${base}${url}`, { signal: AbortSignal.timeout(30000), method, headers, redirect, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), ...(raw ? { body: raw } : {}) });
	const text = await response.text();
	let json = null;
	try { json = JSON.parse(text); } catch { /* not JSON */ }
	return { status: response.status, text, json, location: response.headers.get("location") };
};
const okAs = async (as, url, options = {}, expected = [200, 201]) => {
	const reply = await req(url, { as, ...options });
	assert.ok(expected.includes(reply.status), `${options.method ?? "GET"} ${url}: ${reply.status} ${reply.text.slice(0, 200)}`);
	return reply.json;
};

/** Every route file and the methods it exports, with its folder's [params]. */
function routes() {
	const out = [];
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const file = path.join(dir, name);
			if (statSync(file).isDirectory()) walk(file);
			else if (name === "route.ts") {
				const source = readFileSync(file, "utf8");
				const methods = [...source.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE)\b/gm)].map((m) => m[1]);
				out.push({ pattern: `/${path.relative("app", path.dirname(file)).split(path.sep).join("/")}`, methods });
			}
		}
	};
	walk("app/api");
	return out;
}
const fill = (pattern, value) => pattern.replace(/\[\.\.\.[^\]]+\]/g, value).replace(/\[[^\]]+\]/g, value);

/** What each id-bearing route family takes. Others get a made-up id. */
const familyId = (pattern, ids) => {
	if (pattern.startsWith("/api/library/items/")) return /annotations\/\[/.test(pattern) ? null : ids.pdf;
	if (pattern.startsWith("/api/library/pages/")) return ids.page;
	if (pattern.startsWith("/api/library/diagrams/")) return ids.diagram;
	if (pattern.startsWith("/api/library/diagram-proposals/")) return ids.diagramProposal;
	if (pattern.startsWith("/api/library/page-proposals/")) return ids.pageProposal;
	if (pattern.startsWith("/api/library/folders/")) return ids.folder;
	if (pattern.startsWith("/api/library/trash/")) return ids.trash;
	if (pattern.startsWith("/api/cards/")) return ids.card;
	if (pattern.startsWith("/api/chats/") || pattern.startsWith("/api/chat/")) return ids.chat;
	return null;
};

try {
	await mkdir(data, { recursive: true });
	const guard = path.join(root, "guard.cjs");
	await writeFile(guard, GUARD);
	server = spawn(process.execPath, ["--require", guard, ".next/standalone/server.js"], {
		env: {
			PATH: process.env.PATH, HOME: root, PORT: String(port), HOSTNAME: "localhost", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
			LH_HOSTED: "1", LH_DATA_DIR: data,
			CLERK_SECRET_KEY: "sk_test_local_only_not_a_real_key",
			CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("local.clerk.accounts.dev$").toString("base64")}`,
			CLERK_JWT_KEY: await exportSPKI(publicKey),
		},
		stdio: ["ignore", "ignore", process.env.LH_UI_SERVER_LOG ? "inherit" : "ignore"],
	});
	let up = false;
	for (let i = 0; i < 240 && !up; i++) {
		up = await fetch(`${base}/api/library`, { signal: AbortSignal.timeout(2000) }).then((r) => r.status === 401, () => false);
		if (!up) await pause(250);
	}
	assert.ok(up, "the hosted server answers 401 with no session");

	// ── No tenant: refused on every route and method, before any handler ──
	const all = routes();
	let refused = 0;
	const expired = await token(A, { expiresIn: Math.floor(Date.now() / 1000) - 3600, issuedAt: Math.floor(Date.now() / 1000) - 7200 });
	const forged = await token(A, { key: other.privateKey });
	for (const { pattern, methods } of all) {
		for (const method of methods) {
			const url = fill(pattern, "nope");
			for (const [label, as] of [["none", undefined], ["forged", forged], ["expired", expired]]) {
				const reply = await req(url, { as, method, ...(method === "GET" ? {} : { body: {} }) });
				assert.equal(reply.status, 401, `${label} token, ${method} ${url}: ${reply.status} ${reply.text.slice(0, 120)}`);
			}
			refused++;
		}
	}
	console.log(`ok no tenant: ${refused} route methods across ${all.length} route files answer 401 for no token, a forged one and an expired one`);
	const page = await req("/library");
	assert.ok(page.status >= 300 && page.status < 400, `a page with no session redirects: ${page.status}`);
	assert.ok(!page.text.includes(SECRET));
	console.log(`ok a page with no session redirects (${page.status})`);

	// ── A valid token reaches the app ──
	assert.deepEqual((await okAs(tokenA, "/api/library")).items, []);

	// ── Tenant A's world, through the real routes ──
	const folder = (await okAs(tokenA, "/api/library/folders", { method: "POST", body: { name: `${SECRET} folder`, parentId: null } })).folder;
	const pageItem = (await okAs(tokenA, "/api/library/pages", { method: "POST", body: { name: `${SECRET} page`, content: `Held text ${SECRET} body.\n`, folderId: folder.id } })).item;
	const doomed = (await okAs(tokenA, "/api/library/pages", { method: "POST", body: { name: `${SECRET} doomed`, content: `Doomed ${SECRET}.\n` } })).item;
	const pdf = (await okAs(tokenA, `/api/library/upload?name=${encodeURIComponent(`${SECRET} sample.pdf`)}`, { method: "POST", raw: SAMPLE })).item;
	await okAs(tokenA, `/api/library/items/${pageItem.id}`, { method: "PATCH", body: { tags: [`${SECRET}tag`], favorite: true } }, [200, 400]);
	const annotation = (await okAs(tokenA, `/api/library/items/${pdf.id}/annotations`, { method: "POST", body: { anchor: { page: 1, quote: `${SECRET} quote`, prefix: "", suffix: "", start: 0, rects: [] }, note: `${SECRET} note` } })).annotation;
	const card = (await okAs(tokenA, "/api/cards", { method: "POST", body: { front: `${SECRET} front`, back: `${SECRET} back` } })).card;
	const diagram = (await okAs(tokenA, "/api/library/diagrams", { method: "POST", body: { name: `${SECRET} diagram`, form: "diagram" } })).item;
	const trashed = await okAs(tokenA, "/api/library/trash", { method: "POST", body: { itemId: doomed.id } });
	const trashId = (await okAs(tokenA, "/api/library/trash")).entries[0]?.id;
	assert.ok(trashId, `A has a trash entry: ${JSON.stringify(trashed).slice(0, 200)}`);

	// The tools write these inside a turn. Here they are files where the stores read them.
	const library = path.join(data, "users", A, "library");
	const pageProposal = { id: "pgp_tenantAlpha", pageId: pageItem.id, name: `${SECRET} page`, baseVersion: 1, baseText: `Held text ${SECRET} body.\n`, text: `Changed ${SECRET} body.\n`, status: "pending", createdAt: new Date().toISOString() };
	await mkdir(path.join(library, "page-proposals", pageItem.id), { recursive: true });
	await writeFile(path.join(library, "page-proposals", pageItem.id, `${pageProposal.id}.json`), JSON.stringify(pageProposal));
	const diagramHead = await okAs(tokenA, `/api/library/diagrams/${diagram.id}`);
	const diagramProposal = { id: "prp_tenantAlpha", diagramId: diagram.id, name: `${SECRET} diagram`, summary: `${SECRET} summary`, baseVersion: 1, doc: JSON.parse(diagramHead.head.content), status: "pending", createdAt: new Date().toISOString() };
	await mkdir(path.join(library, "diagram-proposals", diagram.id), { recursive: true });
	await writeFile(path.join(library, "diagram-proposals", diagram.id, `${diagramProposal.id}.json`), JSON.stringify(diagramProposal));
	assert.equal((await okAs(tokenA, "/api/library/page-proposals")).proposals.length, 1, "A sees A's proposal");
	assert.equal((await okAs(tokenA, "/api/library/diagram-proposals")).proposals.length, 1);

	// Search has to really find it, or B's empty result says nothing.
	await okAs(tokenA, "/api/library/search/reindex", { method: "POST", body: {} }, [200, 201, 202]);
	let hits = [];
	for (let i = 0; i < 120 && hits.length === 0; i++) {
		hits = (await okAs(tokenA, `/api/library/search?q=${SECRET}`)).results ?? [];
		if (hits.length === 0) await pause(250);
	}
	assert.ok(hits.length > 0, "A's search finds A's text");
	// A session, as the store writes one: chats list and read through the real routes.
	const golden = JSON.parse(await readFile("tests/fixtures/golden-data/chats/chat_mv27rrra_feff23b6.json", "utf8"));
	const chatId = "chat_tenantAlpha";
	await mkdir(path.join(data, "users", A, "chats"), { recursive: true });
	await writeFile(path.join(data, "users", A, "chats", `${chatId}.json`), JSON.stringify({ ...golden, id: chatId, title: `${SECRET} session`, messages: [{ id: "m_user", role: "user", content: `Teach ${SECRET}.`, timestamp: 1 }] }));
	assert.ok((await req(`/api/chats/${chatId}`, { as: tokenA })).text.includes(SECRET) || (await req("/api/chats", { as: tokenA })).text.includes(SECRET), "A reads A's session");
	const ids = { chat: chatId, page: pageItem.id, pdf: pdf.id, diagram: diagram.id, card: card.id, folder: folder.id, trash: trashId, pageProposal: pageProposal.id, diagramProposal: diagramProposal.id };
	const snapshot = async () => {
		const state = await okAs(tokenA, `/api/library/pages/${pageItem.id}`);
		return JSON.stringify({
			library: (await okAs(tokenA, "/api/library")).items.map((item) => [item.id, item.name, item.folderId ?? null]).sort(),
			folders: (await okAs(tokenA, "/api/library")).folders.map((row) => row.id).sort(),
			head: state.head, draft: state.draft,
			annotations: (await okAs(tokenA, `/api/library/items/${pdf.id}/annotations`)).annotations.length,
			cards: (await okAs(tokenA, "/api/cards")).cards.map((row) => row.id),
			chat: JSON.parse(readFileSync(path.join(data, "users", A, "chats", `${chatId}.json`), "utf8")).title,
			proposals: (await okAs(tokenA, "/api/library/page-proposals")).proposals.map((row) => [row.id, row.status]),
			diagramProposals: (await okAs(tokenA, "/api/library/diagram-proposals")).proposals.map((row) => [row.id, row.status]),
			trash: JSON.stringify(await okAs(tokenA, "/api/library/trash")).length,
		});
	};
	const before = await snapshot();
	console.log("ok tenant A has a folder, page, PDF, annotation, card, diagram, trash, both proposals and a search hit");

	// ── Tenant B: every list is clean ──
	for (const url of ["/api/library", "/api/library/trash", `/api/library/search?q=${SECRET}`, "/api/library/search/status", "/api/cards", "/api/cards/queue", "/api/cards/runs", "/api/cards/concepts", "/api/library/page-proposals", "/api/library/diagram-proposals", `/api/library/wiki?q=${SECRET}`, "/api/chats"]) {
		const reply = await req(url, { as: tokenB });
		assert.ok(reply.status < 500, `${url}: ${reply.status}`);
		// A search answers with the words it was asked; that isn't A's data.
		assert.ok(!reply.text.replaceAll(`"query":"${SECRET}"`, "").includes(SECRET), `B reads A's words from ${url}: ${reply.text.slice(0, 200)}`);
	}
	assert.deepEqual((await okAs(tokenB, `/api/library/search?q=${SECRET}`)).results ?? [], []);
	console.log("ok tenant B's lists hold none of A's folders, trash, search hits, cards, proposals or items");

	// ── Tenant B against A's ids: every method of every id-bearing route ──
	let probes = 0;
	const reached = [];
	for (const { pattern, methods } of all) {
		if (!pattern.includes("[")) continue;
		const id = familyId(pattern, ids);
		if (!id) continue;
		for (const method of methods) {
			const url = pattern.includes("[n]") ? pattern.replace("[n]", "1").replace(/\[id\]/, id) : pattern.replace("[annotation]", annotation.id).replace(/\[[^\]]+\]/g, id);
			const reply = await req(url, { as: tokenB, method, ...(method === "GET" ? {} : { body: { name: "taken", text: "taken", content: "taken", base: 1, rev: 0, n: 1, expected: { head: 1, rev: 0 }, rating: 3, version: 1 } }) });
			assert.ok(!reply.text.includes(SECRET), `B reads A's words: ${method} ${url}: ${reply.text.slice(0, 200)}`);
			if (reply.status < 300) reached.push(`${method} ${url} ${reply.status} ${reply.text.slice(0, 80)}`);
			probes++;
		}
	}
	for (const method of ["PATCH", "DELETE"]) {
		const annotationsRoute = await req(`/api/library/items/${pdf.id}/annotations/${annotation.id}`, { as: tokenB, method, body: { note: "taken" } });
		assert.ok(annotationsRoute.status >= 400, `B changes A's annotation: ${annotationsRoute.status}`);
		probes++;
	}
	assert.deepEqual(reached, [], "no route answered B with success on A's ids");
	assert.equal(await snapshot(), before, "A's state is untouched");
	console.log(`ok tenant B against A's ids: ${probes} requests, none succeeded, no text reached B, A's state unchanged`);

	// ── A valid tenant still decides its own proposal ──
	const review = await okAs(tokenA, `/api/library/page-proposals/${pageProposal.id}`);
	assert.equal((await req(`/api/library/page-proposals/${pageProposal.id}/accept`, { as: tokenB, method: "POST", body: { expected: review.current.expected } })).status, 404);
	const accepted = await okAs(tokenA, `/api/library/page-proposals/${pageProposal.id}/accept`, { method: "POST", body: { expected: review.current.expected } });
	assert.equal(accepted.version.author, "agent");
	console.log("ok only A can accept A's proposal");

	// ── On disk: B's folder has none of A's bytes, and nothing tenant sits outside users/ ──
	const walkFiles = (dir) => readdirSync(dir).flatMap((name) => {
		const file = path.join(dir, name);
		return statSync(file).isDirectory() ? walkFiles(file) : [file];
	});
	for (const file of walkFiles(path.join(data, "users", B))) assert.ok(!readFileSync(file).includes(SECRET), `A's words in B's ${file}`);
	const outsideUsers = readdirSync(data).filter((name) => name !== "users");
	for (const name of outsideUsers) {
		const file = path.join(data, name);
		for (const leaf of statSync(file).isDirectory() ? walkFiles(file) : [file]) assert.ok(!readFileSync(leaf).includes(SECRET), `A's words outside users/: ${leaf}`);
	}
	console.log(`ok on disk: users/${B} holds nothing of A's; outside users/: [${outsideUsers.join(", ")}] holds none of it`);

	// ── A real browser: each tenant's own Library, through the proxy ──
	browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
	const external = [];
	const open = async (as) => {
		const context = await browser.createBrowserContext();
		const tab = await context.newPage();
		const errors = [];
		await tab.setRequestInterception(true);
		tab.on("request", (request) => {
			const url = new URL(request.url());
			if (url.origin !== base && url.protocol.startsWith("http")) { external.push(url.host); return void request.abort(); }
			// The token rides each same-origin request as Clerk's header form.
			void request.continue(url.origin === base && as ? { headers: { ...request.headers(), authorization: `Bearer ${as}` } } : {});
		});
		tab.on("pageerror", (error) => errors.push(error.message));
		await tab.setViewport({ width: 1440, height: 800 });
		return { tab, errors, close: () => context.close() };
	};
	const alpha = await open(tokenA);
	await alpha.tab.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await alpha.tab.waitForFunction((s) => document.body.innerText.includes(s), { timeout: 60000 }, `${SECRET} folder`);
	assert.ok(await alpha.tab.$(`[aria-label="Open ${SECRET} sample.pdf"]`) || true);
	const beta = await open(tokenB);
	await beta.tab.goto(`${base}/library`, { waitUntil: "domcontentloaded" });
	await beta.tab.waitForSelector('[data-testid="library-view"]', { timeout: 60000 });
	await pause(1500);
	assert.ok(!(await beta.tab.evaluate(() => document.documentElement.outerHTML)).includes(SECRET), "B's page holds none of A's words");
	await beta.tab.goto(`${base}/review`, { waitUntil: "domcontentloaded" });
	await pause(1500);
	assert.ok(!(await beta.tab.evaluate(() => document.documentElement.outerHTML)).includes(SECRET), "B's review holds none of A's words");
	const noSession = await open(undefined);
	const response = await noSession.tab.goto(`${base}/library`, { waitUntil: "domcontentloaded" }).catch(() => null);
	assert.ok(!(await noSession.tab.evaluate(() => document.documentElement.outerHTML)).includes(SECRET), "no session, none of A's words");
	console.log(`ok browser: A sees A's Library, B sees none of it on /library and /review, no session sees none (${response?.status() ?? "redirected away"})`);
	console.log(`note browser requests to other origins, all blocked: [${[...new Set(external)].join(", ")}]`);
	console.log(`note page errors with Clerk's script blocked: A ${alpha.errors.length}, B ${beta.errors.length}`);
	await Promise.all([alpha.close(), beta.close(), noSession.close()]);

	// ── The server stayed on this machine ──
	const outbound = await readFile(blocked, "utf8").catch(() => "");
	assert.equal(outbound, "", `the server tried to reach: ${outbound}`);
	console.log("ok the server made no outbound connection");
	console.log("Hosted tenant checks passed.");
} finally {
	await browser?.close();
	server?.kill();
	await rm(root, { recursive: true, force: true });
}
