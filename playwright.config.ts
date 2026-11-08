/**
 * Playwright for Notebook mode (feature 024, research R11) and Study
 * (feature 025, T062): projects `notebook` and `study`.
 *
 * - Browser: the system Chromium (CHROME_PATH or /usr/bin/chromium-browser).
 *   Playwright never downloads browsers here (install with
 *   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).
 * - Snap Chromium cannot reach /tmp or hidden folders in $HOME (~/.cache,
 *   ~/.t3), so TMPDIR for the runner (browser profiles) and the browser
 *   points into the snap's own ~/snap/chromium/common when it exists.
 *   Override with PW_TMPDIR.
 * - The app: its own `next dev` on 127.0.0.1:3124 with a fresh data dir and
 *   auth file, local (not hosted) mode, keys from the environment ignored,
 *   and the faux Notebook model (LH_NOTEBOOK_FAUX=1).
 *
 * Run: npm run test:e2e
 */

import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3124;
const HOST = "127.0.0.1";

const snapCommon = path.join(homedir(), "snap", "chromium", "common");
const tmpRoot =
	process.env.PW_TMPDIR ?? path.join(existsSync(snapCommon) ? snapCommon : tmpdir(), "learnharness-e2e");
mkdirSync(tmpRoot, { recursive: true });
process.env.TMPDIR = tmpRoot;

// The config is loaded by the runner and by every worker; only the first
// load makes the data dir, later loads reuse it through the environment.
const dataDir = (process.env.LH_E2E_DATA_DIR ??= mkdtempSync(path.join(tmpRoot, "lh-data-")));

export default defineConfig({
	testDir: "tests/e2e",
	testMatch: "**/*.spec.ts",
	outputDir: path.join(tmpRoot, "test-results"),
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [["list"]],
	use: {
		baseURL: `http://${HOST}:${PORT}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	// Feature 024's Notebook journeys and feature 025's Study journeys, on one
	// isolated server (Study seeds its own chats and pages into the data dir).
	projects: ["notebook", "study"].map((name) => ({
		name,
		testDir: `tests/e2e/${name}`,
		use: {
			...devices["Desktop Chrome"],
			launchOptions: {
				executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium-browser",
				env: { ...process.env, TMPDIR: tmpRoot },
			},
		},
	})),
	webServer: {
		command: `node node_modules/next/dist/bin/next dev -p ${PORT} -H ${HOST}`,
		url: `http://${HOST}:${PORT}`,
		reuseExistingServer: false,
		timeout: 240_000,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			LH_DATA_DIR: dataDir,
			LH_AUTH_FILE: path.join(dataDir, "auth.json"),
			LH_HOSTED: "0",
			LH_IGNORE_ENV_KEYS: "1",
			LH_NOTEBOOK_FAUX: "1",
			LH_NOTEBOOK_FAUX_MS: "1500",
			// Feature 026: repo links may pull from the 127.0.0.1 fixture remote over http (never in production).
			LH_TEST_GIT_LOOPBACK_HTTP: "1",
			NEXT_TELEMETRY_DISABLED: "1",
			TMPDIR: tmpRoot,
		},
	},
});
