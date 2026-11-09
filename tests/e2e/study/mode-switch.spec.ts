import { expect, test, type Page } from "@playwright/test";
import { ARRIVAL_NAMES, CHATS, chatView, chord, clearRecorded, clearStudyKey, hydrated, interceptModel, openChat, openSidebar, recordAnimations, recordedAnimations, seedStudy, studySettings, token, visible, type RecordedAnimation } from "./helpers";

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

// Feature 028, US2 (row 3): the switch turns the page, not the desk. The
// chrome holds still, the old page lifts, the new one unfolds and inks in
// within 400ms, and the incoming page takes input at once.

/** Screenshots of one fixed clip on every frame for `ms` (at least one). */
async function framesOf(page: Page, clip: { x: number; y: number; width: number; height: number }, ms: number): Promise<Buffer[]> {
	const frames: Buffer[] = [];
	const end = Date.now() + ms;
	do {
		frames.push(await page.screenshot({ clip, animations: "allow" }));
		await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	} while (Date.now() < end);
	return frames;
}

/** The switch's own motion: the arrival of the new page and the lift of the old one. */
const switchMotion = (all: RecordedAnimation[]) => all.filter((a) => (a.kind === "mode" && ARRIVAL_NAMES.has(a.name)) || (a.pseudo ?? "").startsWith("::view-transition"));
const toNotebook = async (page: Page) => {
	await expect(page).toHaveURL(/\/notebook/, { timeout: 60_000 });
	await expect(visible(page, '[data-testid="nb-editor"]')).toBeVisible({ timeout: 90_000 });
};
const toLesson = async (page: Page) => {
	await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.plain}$`), { timeout: 60_000 });
	await expect(chatView(page, CHATS.plain)).toBeVisible({ timeout: 60_000 });
};

test.describe("Study: the mode switch's motion (feature 028, US2)", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request, context, page }) => {
		await studySettings(request);
		await recordAnimations(context);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => {
		await studySettings(request);
		await clearStudyKey(request);
	});

	test("the chrome holds still and the switch ends within 400ms, both ways", async ({ page }) => {
		test.setTimeout(240_000);
		await openChat(page, CHATS.plain);
		await page.mouse.move(900, 600);
		await page.waitForTimeout(1200);
		// One clip for both modes: the Study chrome's box (the ☰ and the wordmark sit at one place in both).
		const box = (await visible(page, ".lh-study-chrome").boundingBox())!;
		const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) };
		for (const [label, arrive] of [["to Notebook", toNotebook], ["to Study", toLesson]] as const) {
			await clearRecorded(page);
			// The route gap: between the two pages the App Router briefly renders
			// neither (pre-existing, also without view transitions and before
			// feature 028; progress.md). That frame is the bare paper, never a
			// moving or fading chrome, so it is counted apart.
			await page.addStyleTag({ content: ".lh-study-chrome, .nb-header { visibility: hidden !important; }" }).then((tag) => tag.evaluate((el) => (el as Element).setAttribute("data-bare", "")));
			const bare = (await framesOf(page, clip, 0))[0]!;
			await page.evaluate(() => document.querySelector("style[data-bare]")?.remove());
			const before = await framesOf(page, clip, 0);
			await page.keyboard.press("Control+Shift+O");
			// Every frame shows the chrome of one mode or the other, never a frame between (FR-003).
			const frames = await framesOf(page, clip, 2500);
			await arrive(page);
			await page.waitForTimeout(600);
			const after = await framesOf(page, clip, 0);
			const moved = frames.filter((frame) => !frame.equals(before[0]!) && !frame.equals(after[0]!) && !frame.equals(bare));
			const gap = frames.filter((frame) => frame.equals(bare)).length;
			if (gap) test.info().annotations.push({ type: "route gap", description: `${label}: ${gap} bare frame(s) of ${frames.length}` });
			if (moved.length) for (const [i, frame] of [before[0]!, ...frames, after[0]!].entries()) await test.info().attach(`${label}-${String(i).padStart(3, "0")}${moved.includes(frame) ? "-moved" : ""}.png`, { body: frame, contentType: "image/png" });
			expect(moved.length, `${label}: chrome frames that differ from both ends (of ${frames.length})`).toBe(0);
			const motion = switchMotion(await recordedAnimations(page));
			expect(motion.length, `${label}: the switch moves`).toBeGreaterThan(0);
			for (const a of motion) expect(a.delay + a.duration, `${label}: ${a.name} ${a.pseudo ?? a.target}`).toBeLessThanOrEqual(400);
			expect(motion.some((a) => a.inChrome), `${label}: nothing in the chrome animates`).toBe(false);
		}
	});

	test("the shortcut, the sidebar and the palette all switch with the mode motion", async ({ page }) => {
		test.setTimeout(240_000);
		const triggers: Array<[string, () => Promise<void>]> = [
			["the shortcut", async () => { await page.keyboard.press("Control+Shift+O"); }],
			["the sidebar", async () => { await openSidebar(page); await page.getByTestId("switch-to-notebook").click(); }],
			["the palette", async () => {
				await chord(page, "Control", "k");
				await expect(page.getByTestId("command-palette")).toBeVisible();
				await page.getByTestId("command-palette-input").fill("Switch to Notebook");
				await page.getByTestId("command-palette-option").filter({ hasText: "Switch to Notebook" }).first().click();
			}],
		];
		for (const [label, trigger] of triggers) {
			await openChat(page, CHATS.plain);
			await page.waitForTimeout(1200);
			await clearRecorded(page);
			await trigger();
			await toNotebook(page);
			await page.waitForTimeout(600);
			const names = switchMotion(await recordedAnimations(page)).map((a) => a.name);
			expect(names, `${label}: the note unfolds and inks in`).toEqual(expect.arrayContaining(["nb-unfold", "nb-ink-in"]));
		}
	});

	test("typing right after the switch lands in the field (20 trials across the transition, SC-002)", async ({ page }) => {
		test.setTimeout(600_000);
		await openChat(page, CHATS.plain);
		const field = () => visible(page, '[data-testid="composer"] textarea');
		await field().fill("");
		for (let trial = 0; trial < 20; trial++) {
			await page.keyboard.press("Control+Shift+O");
			await toNotebook(page);
			await page.waitForTimeout(500);
			await page.keyboard.press("Control+Shift+O");
			await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.plain}$`), { timeout: 60_000 });
			await field().waitFor({ timeout: 60_000 });
			await page.waitForTimeout(trial * 20);
			await field().click();
			await page.keyboard.type("a");
			await expect(field(), `trial ${trial} (${trial * 20}ms in)`).toHaveValue("a");
			await field().fill("");
		}
	});

	test("reduced motion: the switch is a cross-fade of at most 150ms with no transform (US2 AS3)", async ({ page }) => {
		test.setTimeout(240_000);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openChat(page, CHATS.plain);
		await page.waitForTimeout(1200);
		for (const arrive of [toNotebook, toLesson]) {
			await clearRecorded(page);
			await page.keyboard.press("Control+Shift+O");
			await arrive(page);
			await page.waitForTimeout(600);
			const motion = switchMotion(await recordedAnimations(page));
			expect(motion.length).toBeGreaterThan(0);
			for (const a of motion) {
				expect(["lh-fade", "lh-lift"], `${a.name} ${a.pseudo ?? a.target}`).toContain(a.name);
				expect(a.duration + a.delay, `${a.name} ${a.pseudo ?? a.target}`).toBeLessThanOrEqual(150);
				expect(a.properties.filter((p) => p !== "opacity"), `${a.name} ${a.pseudo ?? a.target}`).toEqual([]);
			}
		}
	});

	test("the switch never reloads a demo: none while the lesson lifts, one load when it is back (FR-020)", async ({ page }) => {
		// A mode switch is a route change: Next unmounts the lesson (no Activity
		// cache in this app), so its iframe is a new one on return, as before
		// feature 028. What the motion must not add is a reload: none while the
		// old page lifts away, and exactly the remount's one load on return.
		test.setTimeout(240_000);
		const loads = () => page.evaluate(() => (window as unknown as { __lhLoads: number }).__lhLoads);
		const count = () => page.evaluate(() => {
			const w = window as unknown as { __lhLoads: number; __lhCounting?: boolean };
			w.__lhLoads = 0;
			if (w.__lhCounting) return;
			w.__lhCounting = true;
			document.addEventListener("load", (event) => { if ((event.target as Element).tagName === "IFRAME") w.__lhLoads++; }, true);
		});
		await openChat(page, "review-gradient-descent");
		const frame = visible(page, '[data-chat-id="review-gradient-descent"] iframe[sandbox]');
		await expect(frame).toBeVisible({ timeout: 60_000 });
		await page.waitForTimeout(1500);
		await count();
		await page.keyboard.press("Control+Shift+O");
		await toNotebook(page);
		expect(await loads(), "no demo reloads while the lesson lifts").toBe(0);
		await page.waitForTimeout(800);
		await page.keyboard.press("Control+Shift+O");
		await expect(page).toHaveURL(/\/chat\/review-gradient-descent$/, { timeout: 60_000 });
		await expect(frame).toBeVisible({ timeout: 60_000 });
		await page.waitForTimeout(2000);
		expect(await loads(), "the remounted demo loads once").toBeLessThanOrEqual(1);
		expect(await page.locator("iframe[sandbox]").count()).toBeGreaterThan(0);
	});
});
