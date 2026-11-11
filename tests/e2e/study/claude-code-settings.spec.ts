import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
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
