import { expect, test, type Locator, type Page } from "@playwright/test";

import { chord, hydrated, studySettings, visible } from "./helpers";

/* Bug setup-model-picker-clicks (.specify/bugs/setup-model-picker-clicks):
   a dialog's filled open animation left an identity transform on the dialog,
   which made it the containing block for the fixed-position menus portaled
   into it. Menus opened offset by the dialog's corner and clipped; a click on
   the hidden part hit the backdrop and closed the dialog. These picks use raw
   pointer input at the option's coordinates (no Playwright actionability
   help), the way a person clicks. */

async function press(page: Page, target: Locator, tap: boolean) {
	await target.scrollIntoViewIfNeeded();
	const box = (await target.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + Math.min(box.height / 2, 20);
	if (tap) await page.touchscreen.tap(x, y);
	else await page.mouse.click(x, y);
}

/** Opens the menu from its trigger, checks it sits next to the trigger, and
 *  picks the third option by pointer. */
async function pickByPointer(page: Page, trigger: Locator, menu: Locator, tap: boolean) {
	await press(page, trigger, tap);
	await expect(menu).toBeVisible();
	const t = (await trigger.boundingBox())!;
	const m = (await menu.boundingBox())!;
	const gap = Math.min(Math.abs(m.y - (t.y + t.height)), Math.abs(t.y - (m.y + m.height)));
	expect(gap, "menu opens against its trigger").toBeLessThan(24);
	expect(m.x < t.x + t.width && t.x < m.x + m.width, "menu overlaps its trigger horizontally").toBe(true);
	await press(page, menu.getByRole("option").nth(2), tap);
	await expect(menu).toBeHidden();
}

for (const tap of [false, true]) {
	test(`setup dialog (${tap ? "phone" : "desktop"}): every tier's model is picked by pointer`, async ({ browser, request }) => {
		await studySettings(request);
		const context = await browser.newContext(tap
			? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
			: { viewport: { width: 1440, height: 900 } });
		const page = await context.newPage();
		await page.goto("/");
		await press(page, visible(page, '[data-testid="setup-cta"]'), tap);
		await expect(page.getByTestId("setup-dialog")).toBeVisible();
		for (const slot of ["strong", "cheap", "vision"]) {
			const trigger = page.getByTestId(`setup-trigger-${slot}`);
			await pickByPointer(page, trigger, page.getByTestId(`setup-menu-${slot}`), tap);
			await expect(page.getByTestId("setup-dialog"), "the dialog stays open").toBeVisible();
			await expect(trigger).not.toHaveText(/Pick a model/);
		}
		await context.close();
	});
}

test("settings (desktop): the agent model menu opens against its trigger and takes a click", async ({ page, request }) => {
	await studySettings(request);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	await hydrated(page, '[aria-label="Open sidebar"]');
	await chord(page, "Control", ",");
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await page.getByTestId("settings-nav-agent").click();
	await pickByPointer(page, page.getByTestId("slot-model-strong"), page.getByTestId("slot-model-menu-strong"), false);
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
});
