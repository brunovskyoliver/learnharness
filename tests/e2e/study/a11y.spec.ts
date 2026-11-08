import { expect, test, type Page } from "@playwright/test";
import { CHATS, chord, clearStudyKey, hydrated, interceptModel, openChat, seedStudy, studySettings } from "./helpers";

// Feature 025, T062 (FR-040, FR-041): Study by keyboard alone, with the
// focus always seen (2px outline in --nb-focus, offset 2px; fields show their
// caret); every scroller hides its track; 44px targets on a coarse pointer at
// 390; under reduced motion no layer animates as it opens.

interface FocusInfo { body: boolean; what: string; testId: string | null; editable: boolean; scroller: boolean; outline: string; width: number; offset: number; color: string; line: string }

/** Where the focus is, how it shows, and the resolved --nb-focus. */
const focusInfo = (page: Page): Promise<FocusInfo> => page.evaluate(() => {
	const el = document.activeElement as HTMLElement | null;
	const probe = document.createElement("span");
	probe.style.color = "var(--nb-focus)";
	document.body.appendChild(probe);
	const line = getComputedStyle(probe).color;
	probe.remove();
	if (!el || el === document.body || el === document.documentElement) return { body: true, what: "body", testId: null, editable: false, scroller: false, outline: "none", width: 0, offset: 0, color: "", line };
	const cs = getComputedStyle(el);
	const editable = el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range"].includes((el as HTMLInputElement).type));
	const what = `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${el.getAttribute("data-testid") ?? ""}`;
	// A focusable scroller or page panel (settings) draws its ring inside, where its own edges can't clip it (024).
	const scroller = (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) || el.getAttribute("role") === "tabpanel";
	return { body: false, what, testId: el.getAttribute("data-testid"), editable, scroller, outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset), color: cs.outlineColor, line };
});

/** The focus is somewhere and visibly so. */
async function seen(page: Page, label: string): Promise<FocusInfo> {
	await expect.poll(async () => (await focusInfo(page)).body, { message: `${label}: the focus fell to <body>`, timeout: 3_000 }).toBe(false);
	// A control with transition-colors eases its outline colour in (≈150ms): read it settled.
	await expect.poll(async () => { const i = await focusInfo(page); return i.editable || i.color === i.line; }, { timeout: 1_000 }).toBe(true).catch(() => {});
	const info = await focusInfo(page);
	if (!info.editable) {
		expect(info.outline, `${label}: ${info.what} shows no outline`).not.toBe("none");
		expect(info.width, `${label}: ${info.what} outline width`).toBeGreaterThanOrEqual(2);
		if (info.scroller) expect(info.offset, `${label}: ${info.what} inset ring`).toBeLessThan(0);
		else expect(info.offset, `${label}: ${info.what} outline offset`).toBe(2);
		expect(info.color, `${label}: ${info.what} outline colour`).toBe(info.line);
	}
	return info;
}

/** Tabs (each stop checked) until `done` holds, at most `max` presses. */
async function tabUntil(page: Page, label: string, done: (info: FocusInfo) => boolean, max = 60, key: "Tab" | "Shift+Tab" = "Tab") {
	for (let i = 0; i < max; i++) {
		await page.keyboard.press(key);
		const info = await seen(page, `${label} (${key} ${i + 1})`);
		if (done(info)) return info;
	}
	throw new Error(`${label}: not reached in ${max} presses`);
}

/** No element shows a scrollbar track. */
async function noScrollbars(page: Page, label: string) {
	const shown = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("*")].filter((el) => {
		const cs = getComputedStyle(el);
		if (cs.scrollbarWidth !== "none") return true;
		const scrolls = /(auto|scroll)/.test(cs.overflowY + cs.overflowX);
		const borders = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
		return scrolls && el.offsetWidth - el.clientWidth - borders > 0.5;
	}).map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`));
	expect(shown, `${label}: elements with a scrollbar`).toEqual([]);
}

/** Every running animation on the page (finite ones that already ended don't count). */
const running = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => `${(a as CSSAnimation).animationName ?? a.constructor.name} on ${((a.effect as KeyframeEffect | null)?.target as Element | null)?.className?.toString().slice(0, 50)}`));

test.describe("Study: accessibility", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request }) => { await studySettings(request); });
	test.afterAll(async ({ request }) => { await clearStudyKey(request); });

	test("keyboard only: sidebar, palette, a check thread and settings; the focus is always seen", async ({ page }) => {
		test.setTimeout(180_000);
		const posts = await interceptModel(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChat(page, CHATS.check);
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

		// The check first, as the page opens: Study replaces the browser's Tab
		// walk outside dialogs (owner, 2026-09-17), and Enter opens the waiting
		// check (R8) on its first choice; arrows walk, Space chooses, Tab goes
		// to the thinking field.
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("check-thread")).toHaveAttribute("data-state", "open");
		await expect(page.locator('[data-kbdrow="0"]')).toBeFocused();
		await seen(page, "first choice");
		await page.keyboard.press("ArrowDown");
		await expect(page.locator('[data-kbdrow="1"]')).toBeFocused();
		await seen(page, "second choice");
		await page.keyboard.press("Space");
		await expect(page.locator('[data-kbdrow="1"]')).toHaveAttribute("aria-checked", "true");
		await page.keyboard.press("ArrowRight");
		await seen(page, "confidence by arrow");
		await page.keyboard.press("Tab");
		await expect(page.getByLabel("Your thinking", { exact: true })).toBeFocused();
		expect((await seen(page, "thinking field")).editable).toBe(true);

		// The sidebar by Mod+B (a dialog: the browser's Tab walk), each stop seen; Escape returns the focus.
		await chord(page, "Control", "b");
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await seen(page, "sidebar opened");
		await tabUntil(page, "sidebar walk", (i) => i.testId === "settings-entry");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		await seen(page, "sidebar closed");

		// The palette by Mod+K: its field holds focus, Escape closes it with the focus kept.
		await chord(page, "Control", "k");
		await expect(page.getByTestId("command-palette")).toBeVisible();
		expect((await seen(page, "palette")).editable).toBe(true);
		await page.keyboard.type("review");
		await page.keyboard.press("ArrowDown");
		await seen(page, "palette walk");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("command-palette")).toBeHidden();
		await seen(page, "palette closed");

		// Settings by Mod+,: focus inside, each stop seen, Escape closes and returns focus.
		await chord(page, "Control", ",");
		await expect(page.getByTestId("settings-dialog")).toBeVisible();
		await seen(page, "settings opened");
		for (let i = 0; i < 16; i++) {
			await page.keyboard.press("Tab");
			const info = await seen(page, `settings Tab ${i + 1}`);
			expect(await page.getByTestId("nb-settings").evaluate((el) => el.contains(document.activeElement)), `${info.what} is inside the modal`).toBe(true);
		}
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("settings-dialog")).toBeHidden();
		await seen(page, "settings closed");
		expect(posts).toEqual([]);
	});

	test("every scroller hides its track: lesson, sidebar, palette, settings, Library, Review", async ({ page }) => {
		test.setTimeout(180_000);
		await interceptModel(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChat(page, CHATS.check);
		await page.getByTestId("teach-check-reveal").click();
		await noScrollbars(page, "lesson with an open check");
		await chord(page, "Control", "b");
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await noScrollbars(page, "sidebar");
		await page.keyboard.press("Escape");
		await chord(page, "Control", "k");
		await expect(page.getByTestId("command-palette")).toBeVisible();
		await noScrollbars(page, "palette");
		await page.keyboard.press("Escape");
		await chord(page, "Control", ",");
		await expect(page.getByTestId("settings-dialog")).toBeVisible();
		await noScrollbars(page, "settings");
		await page.keyboard.press("Escape");
		for (const [url, ready] of [["/library", "library-new-page"], ["/review", "review-new"], ["/", "waiting-section"]] as const) {
			await page.goto(url);
			await expect(page.getByTestId(ready).first()).toBeVisible({ timeout: 90_000 });
			await noScrollbars(page, url);
		}
	});

	test("390, coarse pointer: a lesson's band, check thread, bottom bar and the sidebar have 44px targets", async ({ browser }) => {
		test.setTimeout(180_000);
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
		const page = await context.newPage();
		await interceptModel(page);
		const small = (scope: string) => page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(`${sel} :is(button, [role="button"], [role="radio"], [role="tab"], [role="menuitem"])`)]
			.filter((el) => {
				const b = el.getBoundingClientRect();
				if (b.width === 0 || b.height === 0 || el.closest("[aria-hidden='true'], [inert], [hidden]") || !el.checkVisibility({ visibilityProperty: true })) return false;
				return b.height < 44;
			})
			.map((el) => `${el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().height)}px`), scope);
		expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

		await openChat(page, CHATS.check);
		await page.getByTestId("check-go-to").tap();
		await expect(page.getByTestId("check-thread")).toHaveAttribute("data-state", "open");
		expect(await small('[data-testid="check-thread"]'), "check thread").toEqual([]);
		expect(await small('[data-testid="dock-shell"]'), "bottom bar").toEqual([]);
		expect(await small("header"), "band").toEqual([]);
		await page.locator('[aria-label="Open sidebar"]').filter({ visible: true }).first().tap();
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		expect(await small('[data-testid="nb-sidebar"]'), "sidebar").toEqual([]);
		await context.close();
	});

	// T069 (reviews.md): the lesson's title is its one h1, Study's corner hint has
	// a polite live region, and a dialog the Library opens gives the focus back.
	test("headings, live regions and focus return found by the T069 review", async ({ page }) => {
		test.setTimeout(180_000);
		await interceptModel(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChat(page, CHATS.check);
		const h1 = page.locator("h1").filter({ visible: true });
		await expect(h1).toHaveCount(1);
		await expect(h1).toHaveText("UI review · Knowledge check");
		await expect(page.getByTestId("corner-hint-live")).toHaveAttribute("aria-live", "polite");

		await page.goto("/library");
		await hydrated(page, '[data-testid="library-new-diagram"]');
		const opener = page.getByTestId("library-new-diagram");
		await opener.focus();
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("diagram-new-dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("diagram-new-dialog")).toBeHidden();
		await expect(opener).toBeFocused();
		await opener.focus();
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("diagram-new-dialog")).toBeVisible();
		await page.getByTestId("diagram-new-dialog").getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(page.getByTestId("diagram-new-dialog")).toBeHidden();
		await expect(opener).toBeFocused();

		// The keyboard cheat sheet takes the focus itself: its ring shows, inset.
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await page.keyboard.press("Shift+?");
		const sheet = page.getByTestId("cheat-sheet").getByRole("dialog");
		await expect(sheet).toBeFocused();
		const ring = await sheet.evaluate((el) => { const cs = getComputedStyle(el); return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset) }; });
		expect(ring.style).toBe("solid");
		expect(ring.width).toBe(2);
		expect(ring.offset).toBeLessThan(0);
		await page.keyboard.press("Escape");
	});

	test("reduced motion: no animation runs after opening each layer", async ({ page }) => {
		test.setTimeout(180_000);
		await interceptModel(page);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChat(page, CHATS.check);
		const settle = async (label: string) => {
			await page.waitForTimeout(80);
			expect(await running(page), `${label}: running animations`).toEqual([]);
		};
		await settle("lesson");
		await page.getByTestId("teach-check-reveal").click();
		await expect(page.getByTestId("check-thread")).toHaveAttribute("data-state", "open");
		await settle("check thread");
		await chord(page, "Control", "b");
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await settle("sidebar");
		await page.getByTestId("new-menu").click();
		await expect(page.getByTestId("new-menu-list")).toBeVisible();
		await settle("New menu");
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		await chord(page, "Control", "k");
		await expect(page.getByTestId("command-palette")).toBeVisible();
		await settle("palette");
		await page.keyboard.press("Escape");
		await chord(page, "Control", ",");
		await expect(page.getByTestId("settings-dialog")).toBeVisible();
		await settle("settings");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("settings-dialog")).toBeHidden();
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("abort-turn-dialog")).toBeVisible();
		await settle("dismiss dialog");
		await page.keyboard.press("Escape");
	});
});
