import { expect, test, type Locator, type Page } from "@playwright/test";
import { CHATS, clearStudyKey, hydrated, openChat, seedStudy, studySettings, visible, arrived } from "./helpers";

// Feature 025, phase 11 (spec US1, "nothing jumps"): the ☰ and the wordmark
// sit at the same place in both modes at every width. Notebook's header is the
// reference (024, frame-matched: centres (39, 36) and the wordmark 1.5px above
// at 1440; 8/12 from the corner below 640px); Study's bands put their row on the
// ☰'s centre line, so the breadcrumb and actions share it.

const WIDTHS = [1440, 1024, 768, 390, 320] as const;
const TOLERANCE = 0.5;

interface Centre { x: number; y: number }
async function centre(locator: Locator): Promise<Centre> {
	const box = await locator.boundingBox();
	expect(box, "on screen").not.toBeNull();
	return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
function same(actual: Centre, expected: Centre, label: string) {
	expect(Math.abs(actual.x - expected.x), `${label}: x ${actual.x} vs ${expected.x}`).toBeLessThanOrEqual(TOLERANCE);
	expect(Math.abs(actual.y - expected.y), `${label}: y ${actual.y} vs ${expected.y}`).toBeLessThanOrEqual(TOLERANCE);
}

async function notebookChrome(page: Page) {
	await page.goto("/notebook");
	await expect(page).toHaveURL(/\/notebook\/[A-Za-z0-9_-]+$/, { timeout: 60_000 });
	const menu = visible(page, '[data-testid="nb-menu-button"]');
	await expect(menu).toBeVisible({ timeout: 90_000 });
	return { menu: await centre(menu), wordmark: await centre(visible(page, '.nb-header [data-testid="nb-wordmark"]')) };
}

const studyMenu = (page: Page) => visible(page, '[aria-label="Open sidebar"]');
const studyWordmark = (page: Page) => visible(page, '.lh-study-chrome [data-testid="nb-wordmark"]');

test.describe("The top-left chrome: one place in both modes", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request }) => { await studySettings(request); });
	test.afterAll(async ({ request }) => {
		await studySettings(request);
		await clearStudyKey(request);
	});

	for (const width of WIDTHS) {
		test(`☰ and wordmark match Notebook's at ${width}px; the band shares their centre line`, async ({ page }) => {
			test.setTimeout(240_000);
			await page.setViewportSize({ width, height: 900 });
			const reference = await notebookChrome(page);
			// 024's geometry: the ☰'s box 23/20 in (8/12 on phones), 32px square on a fine pointer.
			const phone = width < 640;
			console.log(`chrome ${width}: Notebook ☰ ${JSON.stringify(reference.menu)} wordmark ${JSON.stringify(reference.wordmark)}`);
			same(reference.menu, phone ? { x: 24, y: 28 } : { x: 39, y: 36 }, "Notebook ☰");

			// Home: the band has no title, so the wordmark shows at every width.
			await page.goto("/");
			await hydrated(page, '[aria-label="Open sidebar"]');
			same(await centre(studyMenu(page)), reference.menu, `Home ☰ at ${width}`);
			same(await centre(studyWordmark(page)), reference.wordmark, `Home wordmark at ${width}`);

			// A lesson: ☰ (and the wordmark from 640px) in place; the title on the same centre line.
			await openChat(page, CHATS.plain);
			await arrived(page);
			same(await centre(studyMenu(page)), reference.menu, `lesson ☰ at ${width}`);
			if (!phone) same(await centre(studyWordmark(page)), reference.wordmark, `lesson wordmark at ${width}`);
			const title = visible(page, "header button:has-text('E2E · Plain lesson')");
			expect(Math.abs((await centre(title)).y - reference.menu.y), `lesson title on the ☰'s line at ${width}`).toBeLessThanOrEqual(TOLERANCE);
			const band = await visible(page, "header:has([aria-label='Open sidebar'])").boundingBox();
			console.log(`chrome ${width}: lesson ☰ ${JSON.stringify(await centre(studyMenu(page)))} title y ${(await centre(title)).y} band ${band!.height}px`);
			expect(band!.height, "the band keeps its 52px floor").toBeGreaterThanOrEqual(52);
			expect(Math.abs(band!.y + band!.height / 2 - reference.menu.y), `the band's row is centred on the ☰ at ${width}`).toBeLessThanOrEqual(TOLERANCE);

			// The Library under the shared TopBar.
			await page.goto("/library");
			await hydrated(page, '[aria-label="Open sidebar"]');
			same(await centre(studyMenu(page)), reference.menu, `Library ☰ at ${width}`);
			if (!phone) same(await centre(studyWordmark(page)), reference.wordmark, `Library wordmark at ${width}`);
		});
	}
});
