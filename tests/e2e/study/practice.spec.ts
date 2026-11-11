import { expect, test, type Page } from "@playwright/test";
import { CHATS, clearStudyKey, interceptModel, openChat, seedStudy, studySettings } from "./helpers";

// Feature 025, T062 (US3): a practice problem in its thread. Solving sends
// the thinking on the active problem; Skip asks first and then dismisses;
// between problems, Next problem is the explicit move-on.

const thread = (page: Page) => page.getByTestId("check-thread");

async function openProblem(page: Page) {
	await openChat(page, CHATS.practice);
	await expect(page.getByTestId("check-pending")).toContainText("Solve the problem beside the lesson");
	await page.getByTestId("check-go-to").click();
	await expect(thread(page)).toHaveAttribute("data-state", "open");
	await expect(page.getByTestId("practice-dock")).toBeVisible();
}

test.describe("Study: practice", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => { await clearStudyKey(request); });

	test("solve: the thinking is sent on the active problem", async ({ page }) => {
		const posts = await interceptModel(page);
		await openProblem(page);
		const field = page.getByTestId("practice-thinking-field").locator("textarea");
		await expect(field).toBeFocused();
		await field.fill("Hidden state, noisy observations, and learning over time.");
		await page.getByTestId("practice-send").click();
		await expect.poll(() => posts.filter((p) => p.path === "/api/chat").length).toBe(1);
		const input = posts[0]!.body.input as { type: string; problemCallId: string; text: string };
		expect(posts[0]!.body.chatId).toBe(CHATS.practice);
		expect(input.type).toBe("thinking");
		expect(input.problemCallId).toBe(await thread(page).getAttribute("data-check"));
		expect(input.text).toBe("Hidden state, noisy observations, and learning over time.");
	});

	test("submit closes the card and it says the work is being checked, not Solve", async ({ page }) => {
		await interceptModel(page);
		// The tutor is still on it: the submission is held open.
		let release!: () => void;
		const held = new Promise<void>((resolve) => { release = resolve; });
		await page.route("**/api/chat", async (route) => { await held; await route.abort(); });
		await openProblem(page);
		await page.getByTestId("practice-thinking-field").locator("textarea").fill("x^3/3 + C");
		await page.getByTestId("practice-send").click();
		await expect(thread(page)).toHaveAttribute("data-state", "collapsed");
		await expect(thread(page).getByTestId("check-checking")).toHaveText("Checking your work…");
		await expect(thread(page).locator(".lh-check-action")).toHaveCount(0);
		// A submit that fails never reached the tutor: Solve comes back.
		release();
		await expect(thread(page).locator(".lh-check-action")).toHaveText("Solve");
	});

	test("skip asks first; Cancel keeps the problem, Skip dismisses it", async ({ page }) => {
		const posts = await interceptModel(page);
		await openProblem(page);
		const problem = await thread(page).getAttribute("data-check");
		await page.getByTestId("practice-skip").click();
		const dialog = page.getByTestId("abort-turn-dialog");
		await expect(dialog).toBeVisible();
		await page.getByTestId("abort-turn-cancel").click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId("practice-dock")).toBeVisible();
		expect(posts).toEqual([]);
		await page.getByTestId("practice-skip").click();
		await expect(dialog).toBeVisible();
		await page.getByTestId("abort-turn-confirm").click();
		await expect.poll(() => posts.length).toBe(1);
		expect(posts[0]!.path).toBe(`/api/chats/${CHATS.practice}/dismiss`);
		expect(JSON.stringify(posts[0]!.body)).toContain(problem!);
		await expect(page.getByTestId("practice-dock")).toHaveCount(0);
	});

	test("between problems: Next problem sends the move-on, nothing else", async ({ page }) => {
		const posts = await interceptModel(page);
		await openChat(page, CHATS.pause);
		await expect(page.getByTestId("check-thread")).toHaveCount(0);
		const composer = page.getByTestId("composer").locator("textarea");
		await expect(composer).toHaveAttribute("placeholder", "Ask anything, or press Enter for the next one.");
		await page.waitForTimeout(1500); // nothing is sent by opening it
		expect(posts).toEqual([]);
		await page.getByTestId("next-problem-button").click();
		await expect.poll(() => posts.length).toBe(1);
		expect(posts[0]).toEqual({ path: "/api/chat", body: { chatId: CHATS.pause, input: { type: "next" } } });
	});
});
