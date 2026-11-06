import { expect, test } from "@playwright/test";

// Harness smoke (feature 024, T001): the isolated dev server answers and
// the app shell renders with its title.
test("the app loads with its title", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveTitle("Brunovský's study");
});
