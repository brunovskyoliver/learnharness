import { expect, test, type Page } from "@playwright/test";
import { CHATS, chatView, chord, clearStudyKey, hydrated, interceptModel, noPageOverflow, openSidebar, seedStudy, studySettings, token, visible } from "./helpers";

// Feature 025, T062 (US1, US4, US6): Home and the overlay sidebar. The
// sidebar opens by ☰, by the left edge and by Mod+B, dims the page, filters
// by kind and opens a session; at 390 it is the phone sidebar with 44px rows.

const sidebar = (page: Page) => page.getByTestId("nb-sidebar");

async function openHome(page: Page) {
	await page.goto("/");
	await expect(page.getByText("What do you want to learn?")).toBeVisible({ timeout: 90_000 });
	await hydrated(page, '[aria-label="Open sidebar"]');
	await expect(page.getByTestId("waiting-section")).toBeVisible();
}

test.describe("Study: Home and the sidebar", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request }) => { await studySettings(request); });
	test.afterAll(async ({ request }) => { await clearStudyKey(request); });

	test("1440: Home lists what waits; the overlay opens by ☰, edge hover and Mod+B; filters; a session opens", async ({ page }) => {
		test.setTimeout(180_000);
		const posts = await interceptModel(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await openHome(page);

		// Home: the waiting list names each seeded check and problem, kind label in --bulb-ink.
		const rows = page.getByTestId("waiting-row");
		for (const title of ["UI review · Knowledge check", "UI review · Active practice", "E2E · Free-text check"]) await expect(rows.filter({ hasText: title })).toHaveCount(1);
		const kind = rows.filter({ hasText: "UI review · Knowledge check" }).locator(".waiting-row-kind");
		await expect(kind).toHaveText("Lesson check");
		expect(await kind.evaluate((el) => getComputedStyle(el).color)).toBe(await token(page, "--bulb-ink"));
		await noPageOverflow(page, "home 1440");

		// ☰: the 288px shelf over a dimmed page; focus inside; Escape returns focus to ☰.
		await openSidebar(page);
		// Measured once the sheet has slid in (feature 028, row 7: its slide is a transform).
		await sidebar(page).evaluate((el) => Promise.allSettled(el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished)));
		expect((await sidebar(page).boundingBox())!.width).toBe(288);
		await expect(page.getByTestId("nb-sidebar-dim")).toHaveAttribute("data-dim", "");
		expect(await sidebar(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
		await page.keyboard.press("Escape");
		await expect(sidebar(page)).toBeHidden();
		await expect(visible(page, '[aria-label="Open sidebar"]')).toBeFocused();

		// The left edge: a real pointer move into the strip opens it; leaving closes it.
		await page.mouse.move(500, 400);
		await page.mouse.move(3, 400, { steps: 5 });
		await page.mouse.move(4, 420);
		await expect(sidebar(page)).toBeVisible();
		await page.mouse.move(900, 420, { steps: 8 });
		await expect(sidebar(page)).toBeHidden();

		// Mod+B toggles it.
		await chord(page, "Control", "b");
		await expect(sidebar(page)).toBeVisible();
		await chord(page, "Control", "b");
		await expect(sidebar(page)).toBeHidden();

		// Filters: Lessons and Practice narrow the date shelves; again clears.
		await openSidebar(page);
		const sessionRows = page.getByTestId("session-row");
		await expect(sessionRows.filter({ hasText: "UI review · Active practice" })).toHaveCount(1);
		await page.getByTestId("sidebar-practice").click();
		await expect(page.getByTestId("sidebar-practice")).toHaveAttribute("aria-pressed", "true");
		await expect(sessionRows.filter({ hasText: "UI review · Knowledge check" })).toHaveCount(0);
		await expect(sessionRows.filter({ hasText: "UI review · Active practice" })).toHaveCount(1);
		await page.getByTestId("sidebar-lessons").click();
		await expect(page.getByTestId("sidebar-lessons")).toHaveAttribute("aria-pressed", "true");
		await expect(sessionRows.filter({ hasText: "UI review · Active practice" })).toHaveCount(0);
		await expect(sessionRows.filter({ hasText: "UI review · Knowledge check" })).toHaveCount(1);
		await page.getByTestId("sidebar-lessons").click();
		await expect(page.getByTestId("sidebar-lessons")).toHaveAttribute("aria-pressed", "false");
		await expect(sessionRows.filter({ hasText: "UI review · Active practice" })).toHaveCount(1);

		// The waiting dot is the bulb; a click opens the session and closes the sidebar.
		const waiting = page.locator(`[data-session-id="${CHATS.check}"] [data-testid="waiting-dot"]`);
		await expect(waiting).toBeVisible();
		await page.locator(`[data-session-id="${CHATS.check}"]`).click();
		await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.check}$`));
		await expect(sidebar(page)).toBeHidden();
		await expect(chatView(page, CHATS.check)).toBeVisible({ timeout: 60_000 });
		expect(posts).toEqual([]);
	});

	test("390: the phone sidebar, 44px rows, no overflow; a session opens from it", async ({ browser }) => {
		test.setTimeout(180_000);
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
		const page = await context.newPage();
		await interceptModel(page);
		await openHome(page);
		await noPageOverflow(page, "home 390");
		const menu = visible(page, '[aria-label="Open sidebar"]');
		expect((await menu.boundingBox())!.width).toBeGreaterThanOrEqual(44);
		await menu.tap();
		await expect(sidebar(page)).toBeVisible();
		// Measured once the sheet has slid in (feature 028, row 7: its slide is a transform).
		await sidebar(page).evaluate((el) => Promise.allSettled(el.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished)));
		expect((await sidebar(page).boundingBox())!.width).toBe(288);
		// A field's target is its row (a press anywhere on the row focuses it).
		const small = await sidebar(page).evaluate((root) => [...root.querySelectorAll<HTMLElement>("button, a[href], [role='button'], input")]
			.filter((el) => { const b = (el.tagName === "INPUT" ? el.closest<HTMLElement>(".nb-side-row") ?? el : el).getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.closest("[aria-hidden='true']") && b.height < 44; })
			.map((el) => `${el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.className} ${Math.round(el.getBoundingClientRect().height)}px`));
		expect(small).toEqual([]);
		await noPageOverflow(page, "sidebar 390");
		await page.locator(`[data-session-id="${CHATS.practice}"]`).tap();
		await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.practice}$`));
		await expect(chatView(page, CHATS.practice)).toBeVisible({ timeout: 60_000 });
		await noPageOverflow(page, "lesson 390");
		await context.close();
	});
});
