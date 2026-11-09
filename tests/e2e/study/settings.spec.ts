import { expect, test, type Page } from "@playwright/test";
import { chord, clearStudyKey, createPage, hydrated, interceptModel, openSidebar, seedStudy, settingsRecord, studySettings, token, visible } from "./helpers";

// Feature 025, T062 (US5): one settings modal in Study. It opens from the
// sidebar footer and by Mod+,; every page of its nav opens; search lands on a
// Study row; a theme change applies to Study and Notebook and persists.

const NAV = [
	["nb-settings-nav-customize", "nb-settings-customize"],
	["nb-settings-nav-reviewers", "nb-settings-reviewers"],
	["settings-nav-keys", "section-keys"],
	["settings-nav-agent", "section-agent"],
	["settings-nav-graph", "section-graph"],
	["settings-nav-keyboard", "section-keyboard"],
	["settings-nav-general", "section-general"],
] as const;

const dialog = (page: Page) => page.getByTestId("settings-dialog");

async function openHome(page: Page) {
	await page.goto("/");
	await expect(page.getByText("What do you want to learn?")).toBeVisible({ timeout: 90_000 });
	await hydrated(page, '[aria-label="Open sidebar"]');
}

test.describe("Study: settings", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => {
		await studySettings(request);
		await clearStudyKey(request);
	});

	test("opens by the footer and by Mod+,; every page; search lands on a Study row", async ({ page }) => {
		const posts = await interceptModel(page);
		await openHome(page);

		// The footer row, over the sidebar; Escape closes the modal first.
		await openSidebar(page);
		await page.getByTestId("settings-entry").click();
		await expect(dialog(page)).toBeVisible();
		await expect(page.getByTestId("settings-nav").locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(dialog(page)).toBeHidden();

		// Mod+, from the page.
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		await chord(page, "Control", ",");
		await expect(dialog(page)).toBeVisible();

		// The seven pages of the nav.
		await expect(page.getByTestId("settings-nav").getByRole("tab")).toHaveCount(NAV.length);
		for (const [nav, content] of NAV) {
			await page.getByTestId(nav).click();
			await expect(page.getByTestId(nav)).toHaveAttribute("aria-selected", "true");
			await expect(dialog(page).getByTestId(content).filter({ visible: true }).first()).toBeVisible();
		}

		// Search a Study row: the Agent page opens on it, its control focused.
		await page.getByTestId("settings-search").fill("compaction");
		await page.getByTestId("settings-result-compaction-threshold").click();
		await expect(page.getByTestId("settings-nav-agent")).toHaveAttribute("aria-selected", "true");
		const row = dialog(page).locator('[data-settings-row="compaction-threshold"]');
		await expect(row).toBeVisible();
		await expect.poll(() => row.evaluate((el) => el.contains(document.activeElement))).toBe(true);
		await expect(row).toBeInViewport();
		await page.keyboard.press("Escape");
		await expect(dialog(page)).toBeHidden();
		expect(posts).toEqual([]);
	});

	test("dark theme: Study and Notebook both follow, and it persists after a reload", async ({ page, request }) => {
		test.setTimeout(180_000);
		const note = await createPage(request, `Theme note ${Date.now()}`, "Heat flows from hot to cold.\n");
		await interceptModel(page);
		await openHome(page);
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		const lightPaper = await token(page, "--paper");

		await chord(page, "Control", ",");
		await expect(dialog(page)).toBeVisible();
		await page.getByTestId("nb-settings-nav-customize").click();
		const saved = page.waitForResponse((r) => r.url().endsWith("/api/settings/notebook") && r.request().method() === "PUT");
		await page.getByTestId("nb-set-appearance-dark").click();
		expect((await saved).ok()).toBe(true);
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect.poll(() => token(page, "--paper")).toBe("rgb(26, 26, 25)");
		expect(lightPaper).not.toBe("rgb(26, 26, 25)");
		expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(26, 26, 25)");
		expect((await settingsRecord(request)).notebook?.appearance).toBe("dark");
		await page.keyboard.press("Escape");

		// After a reload, from the server's first paint.
		await page.reload();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect(page.getByText("What do you want to learn?")).toBeVisible();
		expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(26, 26, 25)");

		// Notebook reads the same setting.
		await page.goto(`/notebook/${note.id}`);
		await expect(visible(page, '[data-testid="nb-editor"]')).toBeVisible({ timeout: 90_000 });
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect(visible(page, '[data-testid="notebook-root"]')).toHaveAttribute("data-nb-theme", "dark");
		expect(await token(page, "--paper")).toBe("rgb(26, 26, 25)");
	});
});
