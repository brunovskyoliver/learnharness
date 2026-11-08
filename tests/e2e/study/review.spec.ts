import { expect, test, type APIRequestContext } from "@playwright/test";
import { clearStudyKey, interceptModel, seedStudy, studySettings } from "./helpers";

// Feature 025, T062 (US4): Review on the paper. Show answer reveals the back
// (absent before), a rating moves to the next card, Undo brings it back.

const SECRET = "BACKSECRET";

async function clearCards(request: APIRequestContext) {
	const { cards } = (await (await request.get("/api/cards")).json()) as { cards: Array<{ id: string }> };
	for (const card of cards) {
		await request.delete(`/api/cards/${card.id}`);
		await request.delete(`/api/cards/${card.id}?forGood=1`);
	}
}

test.describe("Study: Review", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await clearCards(request);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => {
		await clearCards(request);
		await clearStudyKey(request);
	});

	test("show answer, rate, undo", async ({ page, request }) => {
		const posts = await interceptModel(page);
		for (const [front, back] of [["What carries a wave's energy?", `${SECRET} the medium's motion`], ["What is a period?", `${SECRET} the time of one cycle`]]) {
			const made = await request.post("/api/cards", { data: { front, back } });
			expect(made.ok(), await made.text()).toBeTruthy();
		}
		await page.goto("/review");
		await expect(page.getByTestId("queue-reveal")).toBeVisible({ timeout: 90_000 });
		await expect(page.getByTestId("queue-count")).toContainText("2 cards due");
		expect(await page.evaluate((s) => document.documentElement.outerHTML.includes(s), SECRET)).toBe(false);
		const first = (await page.getByTestId("queue-front").textContent())!;

		await page.getByTestId("queue-reveal").click();
		await expect(page.getByTestId("queue-back")).toContainText(SECRET);
		await expect(page.getByTestId("queue-live")).toContainText("Answer shown");
		await page.getByTestId("queue-rate-good").click();
		await expect(page.getByTestId("queue-count")).toContainText("1 card due");
		await expect(page.getByTestId("queue-live")).toContainText("Good, back in 10 min");
		await expect(page.getByTestId("queue-front")).not.toHaveText(first);
		await expect(page.getByTestId("queue-reveal")).toBeFocused();

		await page.getByTestId("queue-undo").click();
		await expect(page.getByTestId("queue-count")).toContainText("2 cards due");
		await expect(page.getByTestId("queue-note")).toContainText("Last rating undone");
		await expect(page.getByTestId("queue-front")).toHaveText(first);
		expect(posts).toEqual([]);
	});
});
