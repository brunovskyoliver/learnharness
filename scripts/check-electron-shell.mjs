/** The real Electron shell on the shipped server (feature 023): electron/main.cjs, its
 * window, preload and guards, through scripts/electron-headless-entry.cjs. Two passes:
 * "server" lets main start .next/standalone itself and add the private API header, as a
 * packaged app does, and "dev" points LH_DEV_URL at a standalone server this script runs.
 * Needs `next build` and scripts/build-server.mjs.
 *
 * With no display it runs Electron's --headless mode, which draws no OS window: window
 * controls, real dragging and tiling can't be seen that way, only the CSS regions Electron
 * reads, and no screenshot: a hidden headless window paints no frames, so rendering is
 * checked from the DOM and its layout. This isn't a packaged build: electron-builder and signing don't run here.
 * On a machine without GTK on its library path, set LD_LIBRARY_PATH to a folder that has it.
 *
 * TMPDIR=~/lh-tmp node scripts/check-electron-shell.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

assert.ok(existsSync(".next/standalone/server.js"), "run next build and scripts/build-server.mjs first");
const port = Number(process.env.LH_UI_PORT ?? 9333);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const id = (name) => `[data-testid="${name}"]`;

async function run(mode) {
const packaged = mode === "server";
const root = mkdtempSync(path.join(os.tmpdir(), "learning-electron-"));
let shell, server, socket, stderr = "";
try {
	const env = { ...process.env, HOME: root, XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data"), LH_HOSTED: "0", NEXT_TELEMETRY_DISABLED: "1" };
	for (const name of ["ELECTRON_RUN_AS_NODE", "LH_DATA_DIR", "LH_AUTH_FILE", "LH_DEV_URL", "OPENROUTER_API_KEY"]) delete env[name];
	if (!packaged) {
		const serverPort = port + 1;
		server = spawn(process.execPath, [".next/standalone/server.js"], { env: { ...env, PORT: String(serverPort), HOSTNAME: "127.0.0.1", NODE_ENV: "production", LH_DATA_DIR: path.join(root, "server-data"), LH_AUTH_FILE: path.join(root, "server-auth.json") }, stdio: "ignore" });
		env.LH_DEV_URL = `http://127.0.0.1:${serverPort}`;
		let up = false;
		for (let i = 0; i < 240 && !up; i++) {
			up = await fetch(`${env.LH_DEV_URL}/api/library`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
			if (!up) await pause(250);
		}
		assert.ok(up, "the standalone server starts");
	}
	const flags = ["--no-sandbox", "--headless", "--disable-gpu", `--remote-debugging-port=${port}`, "--remote-allow-origins=*"];
	if (packaged) {
		// The folder a packaged app's main process finds its server in.
		const resources = path.join(root, "resources");
		mkdirSync(path.join(resources, "server"), { recursive: true });
		symlinkSync(path.resolve(".next/standalone"), path.join(resources, "server", "standalone"));
		copyFileSync("electron/server-title-guard.cjs", path.join(resources, "server-title-guard.cjs"));
		env.LH_TEST_RESOURCES = resources;
	}
	shell = spawn("node_modules/electron/dist/electron", [...flags, "scripts/electron-headless-entry.cjs"], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
	shell.stderr.on("data", (chunk) => { stderr += chunk; });
	shell.stdout.on("data", (chunk) => { stderr += chunk; });
	const json = (url) => fetch(url).then((r) => r.json(), () => null);
	let target;
	for (let i = 0; i < 480 && !target; i++) {
		target = (await json(`http://127.0.0.1:${port}/json/list`))?.find((row) => row.type === "page" && row.url.startsWith("http://127.0.0.1"));
		if (!target) await pause(250);
	}
	assert.ok(target, "the window opened on the app's own server");
	const origin = new URL(target.url).origin;
	console.log(`ok ${mode}: window on ${origin}`);

	// Puppeteer can't attach to Electron's page here ("Requesting main frame too early"), so plain CDP.
	socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error("the page's debugging socket")); setTimeout(() => reject(new Error("the page's debugging socket: no answer")), 15000).unref(); });
	let nextId = 0;
	const waiting = new Map();
	socket.onmessage = ({ data }) => {
		const message = JSON.parse(data);
		const pending = waiting.get(message.id);
		if (pending) { waiting.delete(message.id); pending(message); }
	};
	const cdp = (method, params = {}) => new Promise((resolve, reject) => {
		const key = ++nextId;
		waiting.set(key, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
		socket.send(JSON.stringify({ id: key, method, params }));
		setTimeout(() => reject(new Error(`${method} had no answer`)), 30000).unref();
	});
	const ev = async (expression) => {
		const { result, exceptionDetails } = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
		if (exceptionDetails) throw new Error(`${expression}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
		return result.value;
	};
	let lastError = "";
	const until = async (expression, label, ms = 60000) => {
		for (const end = Date.now() + ms; Date.now() < end; await pause(200)) if (await ev(expression).catch((err) => { lastError = err.message; return false; })) return;
		assert.fail(`waited for ${label}: ${lastError}`);
	};
	await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
	await until(`document.readyState !== "loading"`, "the document");

	// The preload bridge, sandboxed: nothing of Node reaches the page.
	const bridge = await ev(`({ platform: window.lh?.platform, chatgpt: typeof window.lh?.chatgpt?.status, require: typeof window.require, process: typeof window.process })`);
	assert.equal(bridge.platform, process.platform);
	assert.equal(bridge.chatgpt, "function");
	assert.equal(bridge.require, "undefined");
	assert.equal(bridge.process, "undefined");
	console.log(`ok preload bridge, platform ${bridge.platform}`);

	// The private API header: the window has it, another process doesn't.
	const status = (url) => ev(`fetch(${JSON.stringify(url)}).then((r) => r.status)`);
	assert.equal(await status("/api/library"), 200, "the window reaches the API");
	if (packaged) {
		const outside = await fetch(`${origin}/api/library`);
		assert.equal(outside.status, 403, "no header, no API");
		console.log("ok desktop API gate: window 200, outside 403");
	}

	// New surfaces on the shipped server: a page, a tab, the held edits' route, cards.
	const made = await ev(`fetch("/api/library/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Desktop note", content: "Text.\\n" }) }).then((r) => r.status)`);
	assert.equal(made, 201);
	assert.equal(await status("/api/library/page-proposals"), 200);
	assert.equal(await status("/api/cards"), 200);
	await cdp("Page.navigate", { url: `${origin}/library` });
	await until(`Boolean(document.querySelector('[aria-label="Open Desktop note"]'))`, "the Library row");
	await until(`(document.querySelector('[aria-label="Open Desktop note"]')?.click(), Boolean(document.querySelector('[data-testid="page-editor"]')))`, "the page's editor");
	await until(`Boolean(document.querySelector('[role="tablist"] [role="tab"]'))`, "the tab strip");
	const strip = await ev(`(() => { const el = document.querySelector('[role="tablist"]'); const r = el.getBoundingClientRect(); return { top: r.top, height: r.height, tabs: el.querySelectorAll('[role="tab"]').length }; })()`);
	assert.ok(strip.tabs >= 1 && strip.height > 0, `tab strip: ${JSON.stringify(strip)}`);
	console.log(`ok tab strip renders: ${JSON.stringify(strip)}`);

	// The native drag regions Electron reads from CSS, with interactive controls carved out.
	const regions = await ev(`(() => {
		const region = (el) => getComputedStyle(el).getPropertyValue("-webkit-app-region") || getComputedStyle(el).appRegion;
		const bands = [...document.querySelectorAll(".lh-drag")];
		return {
			electronClass: document.documentElement.classList.contains("lh-electron"),
			bands: bands.length,
			drag: bands.filter((el) => region(el) === "drag").length,
			visible: bands.filter((el) => el.getBoundingClientRect().height > 0).length,
			inBand: bands.flatMap((el) => [...el.querySelectorAll("button, a, input")]).filter((el) => el.getBoundingClientRect().height > 0).map((el) => region(el)),
		};
	})()`);
	assert.ok(regions.electronClass, "the page knows it is in Electron");
	assert.ok(regions.bands > 0 && regions.drag === regions.bands, `drag bands: ${JSON.stringify(regions)}`);
	assert.ok(regions.visible > 0, "a drag band shows");
	assert.ok(regions.inBand.every((value) => value === "no-drag"), `controls in the band stay clickable: ${JSON.stringify(regions)}`);
	console.log(`ok drag regions: ${regions.drag} drag bands, ${regions.inBand.length} carved-out controls`);

	// The palette opens from the keyboard and Escape closes it.
	const key = (type, code, keyName, modifiers = 0, vk = 0) => cdp("Input.dispatchKeyEvent", { type, code, key: keyName, modifiers, windowsVirtualKeyCode: vk });
	await key("rawKeyDown", "KeyK", "k", 2, 75);
	await key("keyUp", "KeyK", "k", 2, 75);
	await until(`Boolean(document.querySelector('[role="dialog"]')?.textContent.includes("Open Library"))`, "the palette", 30000);
	await key("rawKeyDown", "Escape", "Escape", 0, 27);
	await key("keyUp", "Escape", "Escape", 0, 27);
	await until(`!document.querySelector('[role="dialog"]')`, "the palette to close", 10000);
	console.log("ok palette opens and closes");

	// The shell's own window: Electron's view of it. The stored data is under this run's folder.
	console.log(`ok ${mode} pass`);
} catch (error) {
	console.error(stderr.split("\n").filter((line) => !/ERROR:|ERR:/.test(line)).slice(-20).join("\n"));
	throw error;
} finally {
	socket?.close();
	shell?.kill("SIGTERM");
	await pause(1000);
	shell?.kill("SIGKILL");
	server?.kill("SIGKILL");
	rmSync(root, { recursive: true, force: true });
}
}

await run("server");
await run("dev");
console.log("Electron shell checks passed.");
