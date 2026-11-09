import { expect, test, type Page } from "@playwright/test";
import { CHATS, chatView, clearStudyKey, hydrated, interceptModel, openChat, openSidebar, seedStudy, studySettings, type Submission } from "./helpers";

// Feature 025, T062 (US3, R8): a pending check is a thread beside the
// lesson (inline when the margin has no room); its controls send the same
// bodies as before: confidence on a real answer, none on "I don't know".

const thread = (page: Page) => page.getByTestId("check-thread");
const answers = (posts: Submission[]) => posts.filter((p) => p.path === "/api/chat" && (p.body.input as { type?: string })?.type === "answer");
type Answer = { dontKnow: boolean; answers: Array<{ index: number }>; confidence?: number; text?: string; thinking?: string };
const answerOf = (post: Submission) => (post.body.input as { answer: Answer }).answer;

/** Reveal-gated teach check: "Check your understanding" opens it. */
async function reveal(page: Page) {
	await expect(thread(page)).toHaveAttribute("data-state", "collapsed");
	await page.getByTestId("teach-check-reveal").click();
	await expect(thread(page)).toHaveAttribute("data-state", "open");
}

/** The chosen confidence stop's stored probability (its title, "NN% sure."). */
const chosenStop = async (page: Page) => Number(/^(\d+)%/.exec((await page.locator('[data-testid="confidence-segments"] [aria-checked="true"]').getAttribute("title")) ?? "")?.[1]);

test.describe("Study: a lesson check in its thread", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => { await clearStudyKey(request); });

	test("1440, pane closed: a margin thread; a choice with confidence is submitted with that confidence", async ({ page }) => {
		const posts = await interceptModel(page);
		await openChat(page, CHATS.check);
		await expect(thread(page)).toHaveAttribute("data-variant", "margin");
		await expect(page.getByTestId("check-pending")).toContainText("Answer the check beside the lesson");
		// Reveal-gated: closed, the form is hidden and inert until revealed.
		expect(await page.getByTestId("lesson-question").evaluate((el) => !!el.closest("[hidden][inert]"))).toBe(true);
		await reveal(page);
		const box = await thread(page).boundingBox();
		const column = await page.getByTestId("lesson-content").evaluate((el) => el.getBoundingClientRect().right - parseFloat(getComputedStyle(el).paddingRight));
		expect(box!.x).toBeGreaterThan(column);
		expect(box!.x + box!.width).toBeLessThanOrEqual(1440);

		await page.locator('[data-kbdrow="1"]').click();
		await expect(page.locator('[data-kbdrow="1"]')).toHaveAttribute("aria-checked", "true");
		await page.locator('[data-testid="confidence-segments"] [role="radio"]').nth(2).click();
		const stop = await chosenStop(page);
		expect(stop).toBeGreaterThan(0);
		await thread(page).getByRole("button", { name: "Submit answer" }).click();
		await expect.poll(() => answers(posts).length).toBe(1);
		const answer = answerOf(answers(posts)[0]!);
		expect(answers(posts)[0]!.body.chatId).toBe(CHATS.check);
		expect(answer.dontKnow).toBe(false);
		expect(answer.answers.map((a) => a.index)).toEqual([2]);
		expect(answer.confidence).toBe(stop);
	});

	test("\"I don't know\" sends no confidence", async ({ page }) => {
		const posts = await interceptModel(page);
		await openChat(page, CHATS.check);
		await reveal(page);
		await page.locator('[data-kbdrow="0"]').click();
		await thread(page).getByRole("button", { name: "I don't know" }).click();
		await expect(thread(page).getByRole("button", { name: "I don't know" })).toHaveAttribute("aria-pressed", "true");
		await expect(page.locator('[data-testid="confidence-segments"] [role="radio"]').first()).toBeDisabled();
		await thread(page).getByRole("button", { name: "Submit answer" }).click();
		await expect.poll(() => answers(posts).length).toBe(1);
		const answer = answerOf(answers(posts)[0]!);
		expect(answer.dontKnow).toBe(true);
		expect(answer.answers).toEqual([]);
		expect("confidence" in answer).toBe(false);
	});

	test("a free-text check: the answer field is focused on open and its text is sent", async ({ page }) => {
		const posts = await interceptModel(page);
		await openChat(page, CHATS.text);
		await expect(thread(page)).toHaveAttribute("data-state", "collapsed");
		await page.getByTestId("question-dock-bar").click();
		await expect(thread(page)).toHaveAttribute("data-state", "open");
		const field = thread(page).getByLabel("Your answer", { exact: true });
		await expect(field).toBeFocused();
		await field.fill("Advance the belief by the learn rate first, then condition on the response.");
		await thread(page).getByRole("button", { name: "Submit answer" }).click();
		await expect.poll(() => answers(posts).length).toBe(1);
		const answer = answerOf(answers(posts)[0]!);
		expect(answer.text).toBe("Advance the belief by the learn rate first, then condition on the response.");
		expect("confidence" in answer).toBe(false);
	});

	test("Home's Answer opens the session at its check, open, with the first choice focused", async ({ page }) => {
		const posts = await interceptModel(page);
		await page.goto("/");
		await expect(page.getByTestId("waiting-section")).toBeVisible({ timeout: 90_000 });
		await hydrated(page, '[data-testid="waiting-row"] a');
		const row = page.getByTestId("waiting-row").filter({ hasText: "UI review · Knowledge check" });
		await row.getByRole("link", { name: /Answer/ }).click();
		await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.check}`));
		await expect(thread(page)).toHaveAttribute("data-state", "open", { timeout: 60_000 });
		await expect(page.locator('[data-kbdrow="0"]')).toBeFocused();
		// The parameter is dropped once used.
		await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.check}$`));
		expect(posts).toEqual([]);
	});

	test("a draft (choice, confidence, thinking) survives a reload", async ({ page }) => {
		const posts = await interceptModel(page);
		await openChat(page, CHATS.check);
		await reveal(page);
		await page.locator('[data-kbdrow="2"]').click();
		await page.locator('[data-testid="confidence-segments"] [role="radio"]').last().click();
		await thread(page).getByLabel("Your thinking", { exact: true }).fill("The predict step only moves unmastered mass.");
		await page.waitForTimeout(400);
		await page.reload();
		await expect(chatView(page, CHATS.check)).toBeVisible({ timeout: 60_000 });
		await hydrated(page, '[aria-label="Open sidebar"]');
		// Closed, it says a draft is kept; opened, everything is where it was.
		if ((await thread(page).getAttribute("data-state")) !== "open") {
			await expect(page.getByTestId("check-draft-kept")).toHaveText("Draft kept");
			await page.getByTestId("check-go-to").click();
		}
		await expect(thread(page)).toHaveAttribute("data-state", "open");
		await expect(page.locator('[data-kbdrow="2"]')).toHaveAttribute("aria-checked", "true");
		await expect(page.locator('[data-testid="confidence-segments"] [role="radio"]').last()).toHaveAttribute("aria-checked", "true");
		await expect(thread(page).getByLabel("Your thinking", { exact: true })).toHaveValue("The predict step only moves unmastered mass.");
		expect(posts).toEqual([]);
	});

	test("Escape closes the innermost layer first: sidebar, then the dismiss dialog; the check stays", async ({ page }) => {
		const posts = await interceptModel(page);
		await openChat(page, CHATS.check);
		await reveal(page);
		await page.locator('[data-kbdrow="0"]').click();
		await openSidebar(page);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		await expect(page.getByTestId("abort-turn-dialog")).toBeHidden();
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("abort-turn-dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("abort-turn-dialog")).toBeHidden();
		await expect(thread(page)).toHaveCount(1);
		await expect(page.locator('[data-kbdrow="0"]')).toHaveAttribute("aria-checked", "true");
		expect(posts).toEqual([]);
	});

	test("with the right pane open the thread sits inline under its paragraph", async ({ page }) => {
		await interceptModel(page);
		await openChat(page, CHATS.check);
		await expect(thread(page)).toHaveAttribute("data-variant", "margin");
		await page.getByTestId("right-pane-toggle").click();
		await expect(page.getByTestId("right-pane-toggle")).toHaveAttribute("aria-expanded", "true");
		await expect(thread(page)).toHaveAttribute("data-variant", "inline");
		await expect(page.getByTestId("check-pending")).toContainText("Answer the check above");
		await reveal(page);
		expect(await thread(page).evaluate((el) => !!el.closest('[data-testid="lesson-content"]'))).toBe(true);
	});

	test("390: inline, on screen, no page overflow", async ({ browser }) => {
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
		const page = await context.newPage();
		const posts = await interceptModel(page);
		await openChat(page, CHATS.check);
		await expect(thread(page)).toHaveAttribute("data-variant", "inline");
		await page.getByTestId("check-go-to").tap();
		await expect(thread(page)).toHaveAttribute("data-state", "open");
		const box = (await thread(page).boundingBox())!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(390);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
		await page.locator('[data-kbdrow="0"]').tap();
		await thread(page).getByRole("button", { name: "Submit answer" }).tap();
		await expect.poll(() => answers(posts).length).toBe(1);
		expect(typeof answerOf(answers(posts)[0]!).confidence).toBe("number");
		await context.close();
	});
});
