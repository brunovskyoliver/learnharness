import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { FAKE_CLAUDE_TOKEN, installFakeClaudeAuth } from "../../helpers/fake-claude-auth";
import { chord, clearStudyKey, hydrated, interceptModel, noPageOverflow, putSection, seedStudy, studySettings } from "./helpers";

// Feature 029, T042 (US2): Settings → Providers → External CLI. The
// installation probe (/api/claude-code) is answered here; the opt-in PUT
// reaches the e2e server and is recorded; the model catalog lists the three
// Claude Code models exactly while the saved opt-in is on, whatever CLI the
// machine has. No CLI process and no model request run.

const SHOTS = process.env.LH_E2E_SHOTS ?? path.join(homedir(), "agent-runs", "2026-11-11-claude-code", "ui");
const CLI_MODELS = ["opus", "sonnet", "haiku"].map((id) => ({
	id, name: `Claude ${id[0]!.toUpperCase()}${id.slice(1)}`, provider: "claude-code", reasoning: true, input: ["text"],
	supportedLevels: ["off", "low", "medium", "high"], cost: null, contextWindow: null, maxTokens: null,
}));
type Probe = { state: "not-found" | "meets-minimum" | "update-required" | "version-unchecked"; version: string | null };

const dialog = (page: Page) => page.getByTestId("settings-dialog");
const installation = (page: Page) => dialog(page).getByTestId("claude-code-installation");
const toggle = (page: Page) => installation(page).getByRole("switch", { name: "Claude Code" });
const status = (page: Page) => installation(page).getByRole("status");

async function routes(page: Page) {
	const state = { on: false, probe: { state: "meets-minimum", version: "2.1.321" } as Probe, probes: 0, puts: [] as unknown[] };
	await page.route("**/api/claude-code", async (route) => {
		expect(route.request().headers()["x-learnharness-claude-code"]).toBe("1");
		state.probes++;
		await route.fulfill({ json: { ...state.probe, minimumVersion: "2.1.259" } });
	});
	await page.route("**/api/settings/claudeCode", async (route) => {
		const response = await route.fetch();
		const body = (await response.json()) as { settings?: { claudeCode?: { enabled?: boolean } } };
		state.puts.push(route.request().postDataJSON());
		state.on = body.settings?.claudeCode?.enabled === true;
		await route.fulfill({ response, json: body });
	});
	await page.route("**/api/models", async (route) => {
		const response = await route.fetch();
		const body = (await response.json()) as { models: { provider: string }[] };
		body.models = [...body.models.filter((m) => m.provider !== "claude-code"), ...(state.on ? CLI_MODELS : [])];
		await route.fulfill({ response, json: body });
	});
	return state;
}

async function openProviders(page: Page) {
	await page.goto("/");
	await expect(page.getByText("What do you want to learn?")).toBeVisible({ timeout: 90_000 });
	await hydrated(page, '[aria-label="Open sidebar"]');
	await chord(page, "Control", ",");
	await expect(dialog(page)).toBeVisible();
	await page.getByTestId("settings-nav-keys").click();
	await expect(toggle(page)).toBeEnabled();
}

/** The strong slot's model menu lists exactly these Claude Code rows. */
async function pickerShows(page: Page, ids: string[]) {
	await page.getByTestId("settings-nav-agent").click();
	await dialog(page).getByTestId("slot-model-strong").click();
	const menu = page.getByTestId("slot-model-menu-strong");
	await expect(menu.getByTestId("model-list")).toBeVisible();
	for (const id of ["opus", "sonnet", "haiku"]) await expect(menu.getByTestId(`model-option-${id}`)).toHaveCount(ids.includes(id) ? 1 : 0);
	// US3: CLI rows read "CLI billing" and "—", never a price.
	for (const id of ids) {
		const row = menu.getByTestId(`model-option-${id}`);
		await expect(row).toContainText("CLI billing");
		await expect(row).toContainText("—");
		await expect(row).not.toContainText("/ 1M");
	}
	if (ids.length) {
		await menu.getByTestId("model-search").fill("claude");
		await menu.screenshot({ path: path.join(SHOTS, `model-menu-cli-${page.viewportSize()!.width}.png`) });
	}
	await page.keyboard.press("Escape");
	await expect(menu).toBeHidden();
	await page.getByTestId("settings-nav-keys").click();
	await expect(toggle(page)).toBeEnabled();
}

test.describe("Study: Claude Code settings", () => {
	test.beforeAll(async () => { await seedStudy(); mkdirSync(SHOTS, { recursive: true }); });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await putSection(request, "claudeCode", { enabled: false });
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => {
		await putSection(request, "claudeCode", { enabled: false });
		await studySettings(request);
		await clearStudyKey(request);
	});

	test("off by default; on lists the models and the version; the labels follow the probe; off hides them", async ({ page }) => {
		test.setTimeout(180_000);
		const posts = await interceptModel(page);
		const state = await routes(page);
		await openProviders(page);

		// Off: no status, no probe, no Claude Code model in the picker.
		await expect(dialog(page).getByTestId("group-external-cli").locator("h3")).toHaveText("External CLI");
		await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
		await expect(status(page)).toHaveCount(0);
		await expect(installation(page).getByTestId("claude-code-check-again")).toHaveCount(0);
		await pickerShows(page, []);
		expect(state.probes).toBe(0);

		// On: saved first, then the probe; the three models appear.
		await toggle(page).click();
		await expect(status(page)).toHaveText("Version 2.1.321 · meets minimum");
		expect(state.puts).toEqual([{ enabled: true }]);
		await expect(installation(page)).toContainText("no background process required");
		await expect(installation(page)).not.toContainText("Verify AI claims");
		await expect(installation(page).getByRole("link", { name: "Setup", exact: true })).toHaveAttribute("href", "https://code.claude.com/docs/en/setup");
		await pickerShows(page, ["opus", "sonnet", "haiku"]);

		// Check again follows the probe.
		const again = installation(page).getByTestId("claude-code-check-again");
		state.probe = { state: "not-found", version: null };
		await again.click();
		await expect(status(page)).toHaveText("Not found");
		state.probe = { state: "update-required", version: "2.1.200" };
		await again.click();
		await expect(status(page)).toHaveText("Version 2.1.200 · update required");
		state.probe = { state: "version-unchecked", version: null };
		await again.click();
		await expect(status(page)).toHaveText("Version could not be checked");

		// Off again: the details and the models go.
		const probes = state.probes;
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
		await expect(status(page)).toHaveCount(0);
		expect(state.puts).toEqual([{ enabled: true }, { enabled: false }]);
		expect(state.probes).toBe(probes);
		await pickerShows(page, []);
		expect(posts).toEqual([]);
	});

	test("keyboard only: search lands on the switch, Space opts in, Tab reaches Check again", async ({ page }) => {
		const state = await routes(page);
		await openProviders(page);
		await page.getByTestId("settings-search").focus();
		await page.keyboard.type("Claude Code");
		await expect(page.getByTestId("settings-result-claude-code")).toContainText("External CLI");
		await page.keyboard.press("Enter");
		await expect(toggle(page)).toBeFocused();
		await page.keyboard.press("Space");
		await expect(status(page)).toHaveText("Version 2.1.321 · meets minimum");
		await expect(toggle(page)).toBeFocused();
		const outline = await toggle(page).evaluate((el) => getComputedStyle(el).outlineStyle);
		expect(outline).not.toBe("none");
		await page.keyboard.press("Tab");
		const again = installation(page).getByTestId("claude-code-check-again");
		await expect(again).toBeFocused();
		const probes = state.probes;
		await page.keyboard.press("Enter");
		await expect.poll(() => state.probes).toBe(probes + 1);
		await expect(again).toBeFocused();
	});

	for (const [width, height] of [[320, 640], [390, 844], [1440, 900]] as const) {
		test(`${width}px: the External CLI group fits, scrollbars hidden`, async ({ page }) => {
			await routes(page);
			await page.setViewportSize({ width, height });
			await openProviders(page);
			await toggle(page).click();
			await expect(status(page)).toHaveText("Version 2.1.321 · meets minimum");
			const group = dialog(page).getByTestId("group-external-cli");
			await group.scrollIntoViewIfNeeded();
			await noPageOverflow(page, `${width}px`);
			const fits = await group.evaluate((el) => {
				const box = el.getBoundingClientRect();
				const inside = [...el.querySelectorAll<HTMLElement>("*")].every((child) => child.getBoundingClientRect().right <= box.right + 0.5);
				return inside && el.scrollWidth <= el.clientWidth;
			});
			expect(fits, `${width}px: content inside the group`).toBe(true);
			const scrollbars = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="settings-dialog"] *')]
				.filter((el) => el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))
				.filter((el) => el.offsetWidth - el.clientWidth - parseFloat(getComputedStyle(el).borderLeftWidth) - parseFloat(getComputedStyle(el).borderRightWidth) > 0).length);
			expect(scrollbars, "no visible scrollbar track").toBe(0);
			await group.screenshot({ path: path.join(SHOTS, `external-cli-${width}.png`) });
			await page.screenshot({ path: path.join(SHOTS, `providers-${width}.png`) });
		});
	}
});

test.describe("Study: Claude Code settings on a coarse pointer", () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
	test.beforeEach(async ({ request }) => {
		await studySettings(request);
		await putSection(request, "claudeCode", { enabled: false });
	});
	test.afterAll(async ({ request }) => {
		await putSection(request, "claudeCode", { enabled: false });
		await clearStudyKey(request);
	});

	test("the switch and Check again are 44px targets", async ({ page }) => {
		await routes(page);
		await openProviders(page);
		expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
		await toggle(page).click();
		await expect(status(page)).toHaveText("Version 2.1.321 · meets minimum");
		const again = await installation(page).getByTestId("claude-code-check-again").boundingBox();
		expect(again!.height).toBeGreaterThanOrEqual(44);
		const hit = await toggle(page).evaluate((el) => {
			const after = getComputedStyle(el, "::after");
			const box = el.getBoundingClientRect();
			return { height: box.height - 2 * parseFloat(after.top), width: box.width - 2 * parseFloat(after.left) };
		});
		expect(hit.height).toBeGreaterThanOrEqual(44);
		expect(hit.width).toBeGreaterThanOrEqual(44);
	});
});

// ─── Hosted (T065, US2b) ─────────────────────────────────────────────────────
// The built standalone server in hosted mode (LH_HOSTED=1) with the real
// Clerk middleware verifying throwaway tokens offline (CLERK_JWT_KEY, as
// scripts/check-hosted-tenants.mjs does), the T056 fake `claude` on PATH, and
// a fresh data dir. Every request the browser makes to another origin is
// blocked. The auth endpoint runs for real against the fake CLI; the 409 and
// network cases are intercepted. Needs `npm run build && node
// scripts/build-server.mjs` first; skipped when the build is missing.

const STANDALONE = path.join(process.cwd(), ".next", "standalone", "server.js");
const HOSTED_PORT = 3125;
const HOSTED = `http://localhost:${HOSTED_PORT}`;
const HOSTED_USER = "user_claudeCodeSignIn";
const FAKE_CODE = "good-code";
const SIGN_IN_SENTENCE = "Sign in to Claude Code in Settings → Providers.";

type Hosted = { server: ChildProcess; token: string; fake: ReturnType<typeof installFakeClaudeAuth>; root: string; log: string };
let hosted: Hosted | undefined;

async function startHosted(): Promise<Hosted> {
	const root = mkdtempSync(path.join(homedir(), "tmp-lh", "hosted-e2e-"));
	const data = path.join(root, "data");
	mkdirSync(data, { recursive: true });
	const fake = installFakeClaudeAuth();
	const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
	const token = await new SignJWT({ sid: `sess_${HOSTED_USER}`, azp: HOSTED })
		.setProtectedHeader({ alg: "RS256", kid: "ins_local_test", typ: "JWT" })
		.setSubject(HOSTED_USER).setIssuer("https://local.clerk.accounts.dev").setIssuedAt().setNotBefore("-10s").setExpirationTime("2h").sign(privateKey);
	const log = path.join(SHOTS, "hosted-server.log");
	const out = openSync(log, "w");
	const server = spawn(process.execPath, [STANDALONE], {
		env: {
			PATH: process.env.PATH, HOME: root, PORT: String(HOSTED_PORT), HOSTNAME: "localhost", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
			TMPDIR: path.join(homedir(), "tmp-lh"), LH_HOSTED: "1", LH_DATA_DIR: data,
			CLERK_SECRET_KEY: "sk_test_local_only_not_a_real_key",
			CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("local.clerk.accounts.dev$").toString("base64")}`,
			CLERK_JWT_KEY: await exportSPKI(publicKey),
		},
		stdio: ["ignore", out, out],
	});
	for (let i = 0; i < 240; i++) {
		const up = await fetch(`${HOSTED}/api/library`, { signal: AbortSignal.timeout(2000) }).then((r) => r.status === 401, () => false);
		if (up) break;
		await new Promise((done) => setTimeout(done, 250));
	}
	const put = async (section: string, data: unknown) => {
		const response = await fetch(`${HOSTED}/api/settings/${section}`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json", origin: HOSTED }, body: JSON.stringify(data) });
		expect(response.ok, `hosted PUT ${section}: ${response.status}`).toBe(true);
	};
	await put("general", { interface: "study" });
	await put("notebook", { appearance: "light", textSize: "default", lettering: "serif", ink: "ink" });
	await put("claudeCode", { enabled: true });
	const slot = { model: { provider: "claude-code", id: "sonnet" } };
	await put("models", { strong: slot, cheap: slot, vision: slot });
	return { server, token, fake, root, log };
}

/** A page signed in as the hosted user: the token rides each same-origin request; other origins are blocked. */
async function hostedPage(page: Page, width: number, height: number) {
	await page.setViewportSize({ width, height });
	await page.context().route("**/*", (route) => {
		const url = new URL(route.request().url());
		if (url.origin !== HOSTED) return route.abort();
		return route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${hosted!.token}` } });
	});
}
const signInRow = (page: Page) => installation(page).getByTestId("claude-code-sign-in-row");
const signInStatus = (page: Page) => installation(page).getByTestId("claude-code-sign-in-status");
const signInDialog = (page: Page) => page.getByTestId("claude-code-sign-in-dialog");

async function openHostedProviders(page: Page) {
	await page.goto(`${HOSTED}/`);
	await expect(page.getByText("What do you want to learn?")).toBeVisible({ timeout: 90_000 });
	await hydrated(page, '[aria-label="Open sidebar"]');
	await chord(page, "Control", ",");
	await expect(dialog(page)).toBeVisible();
	await page.getByTestId("settings-nav-keys").click();
	await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
	await expect(signInStatus(page)).not.toHaveText("Checking…");
}

/** Every animation under the selector has finished (layers rise from .98 as they open). */
async function settledLayer(page: Page, selector: string) {
	await page.locator(selector).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}

/** No element in the open layers shows a scrollbar track. */
async function noScrollbars(page: Page, scope: string) {
	const count = await page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(`${sel}, ${sel} *`)]
		.filter((el) => el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))
		.filter((el) => el.offsetWidth - el.clientWidth - parseFloat(getComputedStyle(el).borderLeftWidth) - parseFloat(getComputedStyle(el).borderRightWidth) > 0).length, scope);
	expect(count, `${scope}: no visible scrollbar track`).toBe(0);
}

test.describe("Study: Claude Code sign-in on the hosted site", () => {
	test.skip(!existsSync(STANDALONE), "needs the standalone build (npm run build && node scripts/build-server.mjs)");
	test.beforeAll(async () => { test.setTimeout(120_000); mkdirSync(SHOTS, { recursive: true }); hosted = await startHosted(); });
	test.afterAll(async () => {
		hosted?.server.kill("SIGTERM");
		hosted?.fake.restore();
		if (hosted) rmSync(hosted.root, { recursive: true, force: true });
		// The server's own log must hold no code, token or CLI folder (T075 runs the full scan).
		if (hosted && existsSync(hosted.log)) {
			const text = readFileSync(hosted.log, "utf8");
			for (const secret of [FAKE_CODE, FAKE_CLAUDE_TOKEN, "configDirectory", hosted.root]) expect(text.includes(secret), `server log holds ${secret}`).toBe(false);
		}
		hosted = undefined;
	});

	test("signed out: the models show and a send is refused with the sign-in sentence (O6)", async ({ page }) => {
		test.setTimeout(180_000);
		await hostedPage(page, 1440, 900);
		await openHostedProviders(page);
		await expect(signInStatus(page)).toHaveText("Signed out");
		await expect(installation(page)).toContainText("Sign in with your own Claude account. Your usage is billed to that account.");
		await expect(installation(page)).toContainText("Claude Code controls billing. Requires v2.1.259+.");
		await expect(installation(page)).not.toContainText("Install and authenticate");
		await expect(installation(page).getByRole("link", { name: "Setup", exact: true })).toHaveCount(0);
		await pickerShows(page, ["opus", "sonnet", "haiku"]);
		await page.keyboard.press("Escape");
		await expect(dialog(page)).toBeHidden();

		const refusal = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/chat" && r.request().method() === "POST");
		const field = page.getByPlaceholder("A topic, a question, or a chapter to work through");
		await field.fill("Teach me Bayes' rule.");
		await field.press("Enter");
		const reply = await refusal;
		expect(reply.status()).toBe(503);
		expect(await reply.json()).toMatchObject({ code: "provider_key_missing", provider: "claude-code", error: SIGN_IN_SENTENCE });
		expect(hosted!.fake.calls().some((call) => call.argv[0] === "-p" || call.argv.includes("--print")), "no model process starts").toBe(false);
		await page.waitForLoadState("networkidle");
		await page.screenshot({ path: path.join(SHOTS, "hosted-refusal-1440.png") });
	});

	test("keyboard only: sign in with the fake CLI, Escape order, focus return, then sign out", async ({ page }) => {
		test.setTimeout(180_000);
		await hostedPage(page, 1440, 900);
		await openHostedProviders(page);
		const signIn = installation(page).getByTestId("claude-code-sign-in");
		await signIn.focus();
		await page.keyboard.press("Enter");
		await expect(signInDialog(page)).toBeVisible();
		await expect(signInDialog(page).locator(".lh-dialog-title")).toHaveText("Sign in to Claude Code");
		const subscription = signInDialog(page).getByTestId("claude-code-method-claudeai");
		await expect(subscription).toBeFocused();
		expect(await subscription.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
		await page.keyboard.press("ArrowRight");
		await expect(signInDialog(page).getByTestId("claude-code-method-console")).toHaveAttribute("aria-checked", "true");
		await page.keyboard.press("ArrowLeft");
		await expect(subscription).toHaveAttribute("aria-checked", "true");
		await settledLayer(page, '[data-testid="claude-code-sign-in-dialog"]');
		await page.screenshot({ path: path.join(SHOTS, "hosted-sign-in-method-1440.png") });

		// Escape closes the sign-in dialog first, the settings modal stays; focus is back on Sign in.
		await page.keyboard.press("Escape");
		await expect(signInDialog(page)).toBeHidden();
		await expect(dialog(page)).toBeVisible();
		await expect(signIn).toBeFocused();

		// Tab order inside the dialog stays inside it (trap), then Continue → code step.
		await page.keyboard.press("Enter");
		await expect(subscription).toBeFocused();
		for (let i = 0; i < 4; i++) {
			await page.keyboard.press("Tab");
			expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="claude-code-sign-in-dialog"]'))).toBe(true);
		}
		await signInDialog(page).getByTestId("claude-code-sign-in-continue").focus();
		await page.keyboard.press("Enter");
		const link = signInDialog(page).getByTestId("claude-code-sign-in-link");
		await expect(link).toBeFocused();
		await expect(link).toHaveAttribute("href", /^https:\/\/claude\.com\/cai\/oauth\/authorize\?/);
		await expect(link).toHaveAttribute("target", "_blank");
		await expect(link).toHaveAttribute("rel", "noreferrer");
		const code = signInDialog(page).getByLabel("Code", { exact: true });
		await expect(code).toHaveAttribute("autocomplete", "off");
		await expect(code).toHaveAttribute("spellcheck", "false");
		await page.keyboard.press("Tab");
		await expect(code).toBeFocused();
		await noScrollbars(page, '[data-testid="claude-code-sign-in-dialog"]');
		await page.screenshot({ path: path.join(SHOTS, "hosted-sign-in-code-1440.png") });

		// A wrong code: the CLI's message, the field emptied, Start again.
		await page.keyboard.type("wrong#code");
		await page.keyboard.press("Enter");
		await expect(signInDialog(page).getByTestId("claude-code-sign-in-error")).toContainText(/^Sign-in failed: .*That code wasn't accepted\./);
		await expect(code).toHaveValue("");
		const restart = signInDialog(page).getByTestId("claude-code-sign-in-restart");
		await expect(restart).toBeFocused();
		await page.screenshot({ path: path.join(SHOTS, "hosted-sign-in-failed-1440.png") });
		await page.keyboard.press("Enter");
		await expect(subscription).toBeFocused();
		await page.keyboard.press("Enter"); // Space/Enter on a radio keeps the choice; Continue is next
		await signInDialog(page).getByTestId("claude-code-sign-in-continue").focus();
		await page.keyboard.press("Enter");
		await expect(link).toBeFocused();
		await page.keyboard.press("Tab");
		await page.keyboard.type(FAKE_CODE);
		await page.keyboard.press("Enter");
		await expect(signInDialog(page)).toBeHidden();
		await expect(signInStatus(page)).toHaveText(/^Signed in · Claude subscription · until \d{1,2} [A-Z][a-z]{2}$/);
		const signOut = installation(page).getByTestId("claude-code-sign-out");
		await expect(signOut).toBeFocused();
		expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + location.href)).not.toContain(FAKE_CODE);
		await signInRow(page).screenshot({ path: path.join(SHOTS, "hosted-signed-in-row-1440.png") });

		// Sign out: no confirmation, back to Signed out, focus stays on the action.
		await page.keyboard.press("Enter");
		await expect(signInStatus(page)).toHaveText("Signed out");
		await expect(installation(page).getByTestId("claude-code-sign-in")).toBeFocused();
	});

	test("an expired sign-in (409) reads 'This sign-in expired. Start again.'", async ({ page }) => {
		await hostedPage(page, 1440, 900);
		await page.route(`${HOSTED}/api/claude-code/auth`, async (route) => {
			const body = route.request().method() === "POST" ? route.request().postDataJSON() as { action: string } : null;
			if (body?.action === "code") return route.fulfill({ status: 409, json: { error: "This sign-in expired. Start again." } });
			return route.continue({ headers: { ...route.request().headers(), authorization: `Bearer ${hosted!.token}` } });
		});
		await openHostedProviders(page);
		await installation(page).getByTestId("claude-code-sign-in").click();
		await signInDialog(page).getByTestId("claude-code-sign-in-continue").click();
		await signInDialog(page).getByLabel("Code", { exact: true }).fill("any#code");
		await signInDialog(page).getByTestId("claude-code-sign-in-submit").click();
		await expect(signInDialog(page).getByTestId("claude-code-sign-in-error")).toContainText("This sign-in expired. Start again.");
		await expect(signInDialog(page).getByTestId("claude-code-sign-in-submit")).toBeDisabled();
	});

	for (const [width, height] of [[320, 640], [390, 844], [1440, 900]] as const) {
		test(`${width}px: the sign-in row and dialog fit, scrollbars hidden`, async ({ page }) => {
			await hostedPage(page, width, height);
			await openHostedProviders(page);
			const group = dialog(page).getByTestId("group-external-cli");
			await group.scrollIntoViewIfNeeded();
			await noPageOverflow(page, `${width}px`);
			const fits = await group.evaluate((el) => {
				const box = el.getBoundingClientRect();
				return [...el.querySelectorAll<HTMLElement>("*")].every((child) => child.getBoundingClientRect().right <= box.right + 0.5) && el.scrollWidth <= el.clientWidth;
			});
			expect(fits, `${width}px: content inside the group`).toBe(true);
			await noScrollbars(page, '[data-testid="settings-dialog"]');
			await group.screenshot({ path: path.join(SHOTS, `hosted-external-cli-${width}.png`) });
			await installation(page).getByTestId("claude-code-sign-in").click();
			await expect(signInDialog(page)).toBeVisible();
			for (const step of ["method", "code"] as const) {
				if (step === "code") {
					await signInDialog(page).getByTestId("claude-code-sign-in-continue").click();
					await expect(signInDialog(page).getByTestId("claude-code-sign-in-link")).toBeVisible();
				}
				const box = (await signInDialog(page).boundingBox())!;
				expect(box.x).toBeGreaterThanOrEqual(0);
				expect(box.x + box.width).toBeLessThanOrEqual(width);
				const inside = await signInDialog(page).evaluate((el) => {
					const outer = el.getBoundingClientRect();
					return [...el.querySelectorAll<HTMLElement>("*")].every((child) => child.getBoundingClientRect().right <= outer.right + 0.5);
				});
				expect(inside, `${width}px ${step}: content inside the dialog`).toBe(true);
				await noScrollbars(page, '[data-testid="claude-code-sign-in-dialog"]');
				await settledLayer(page, '[data-testid="claude-code-sign-in-dialog"]');
				await page.screenshot({ path: path.join(SHOTS, `hosted-sign-in-${step}-${width}.png`) });
			}
			await page.keyboard.press("Escape");
			await expect(signInDialog(page)).toBeHidden();
		});
	}
});

test.describe("Study: Claude Code sign-in on the hosted site, coarse pointer", () => {
	test.skip(!existsSync(STANDALONE), "needs the standalone build");
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
	test.beforeAll(async () => { test.setTimeout(120_000); mkdirSync(SHOTS, { recursive: true }); hosted ??= await startHosted(); });
	test.afterAll(async () => { hosted?.server.kill("SIGTERM"); hosted?.fake.restore(); if (hosted) rmSync(hosted.root, { recursive: true, force: true }); hosted = undefined; });

	test("Sign in, the method cards, the link, the field and the dialog's actions are 44px targets", async ({ page }) => {
		await hostedPage(page, 390, 844);
		await openHostedProviders(page);
		expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
		const tall = async (locator: ReturnType<Page["locator"]>, name: string) => expect((await locator.boundingBox())!.height, name).toBeGreaterThanOrEqual(44);
		await tall(installation(page).getByTestId("claude-code-sign-in"), "Sign in");
		await installation(page).getByTestId("claude-code-sign-in").click();
		const d = signInDialog(page);
		// Measure the dialog at rest: it rises from .98 as it opens.
		const settled = () => d.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
		await settled();
		await tall(d.getByTestId("claude-code-method-claudeai"), "method card");
		await tall(d.getByRole("button", { name: "Cancel" }), "Cancel");
		await tall(d.getByTestId("claude-code-sign-in-continue"), "Continue");
		await d.getByTestId("claude-code-sign-in-continue").click();
		await tall(d.getByTestId("claude-code-sign-in-link"), "sign-in link");
		await tall(d.getByLabel("Code", { exact: true }), "Code field");
		await tall(d.getByTestId("claude-code-sign-in-submit"), "Sign in pill");
		await page.screenshot({ path: path.join(SHOTS, "hosted-sign-in-code-390-coarse.png") });
	});
});
