import { expect, test } from "@playwright/test";
import { CHATS, chatView, clearStudyKey, hydrated, interceptModel, openChat, openSidebar, seedStudy, studySettings, token, visible } from "./helpers";

// Feature 025, T062 (US1): Study → Notebook → Study keeps the theme, the
// place he was in and an unsent draft; the paper is the same in both.

test.describe("Study: the mode switch round trip", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request, { appearance: "dark" });
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => {
		await studySettings(request);
		await clearStudyKey(request);
	});

	test("Study → Notebook → Study keeps the theme, the session and its draft", async ({ page }) => {
		test.setTimeout(180_000);
		const posts = await interceptModel(page);
		await openChat(page, CHATS.plain);
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		const studyPaper = await token(page, "--paper");
		const composer = page.getByTestId("composer").locator("textarea");
		await hydrated(page, '[data-testid="composer"] textarea');
		await composer.fill("A draft that crosses modes");
		await page.waitForTimeout(500);

		// To Notebook by the sidebar footer.
		await openSidebar(page);
		await page.getByTestId("switch-to-notebook").click();
		await expect(page).toHaveURL(/\/notebook/, { timeout: 60_000 });
		await expect(visible(page, '[data-testid="nb-editor"]')).toBeVisible({ timeout: 90_000 });
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		expect(await token(page, "--paper")).toBe(studyPaper);

		// Back by Notebook's own footer row.
		await visible(page, '[data-testid="nb-menu-button"]').click();
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await page.getByTestId("nb-switch-to-study").click();
		await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.plain}$`), { timeout: 60_000 });
		await expect(chatView(page, CHATS.plain)).toBeVisible({ timeout: 60_000 });
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await expect(page.getByTestId("composer").locator("textarea")).toHaveValue("A draft that crosses modes");
		expect(posts).toEqual([]);
	});
});
