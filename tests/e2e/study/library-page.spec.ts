import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { CHATS, clearStudyKey, createPage, hydrated, interceptModel, seedStudy, studySettings } from "./helpers";

// Feature 025, T062 (US4): a Library page in the paper editor. A new page
// opens beside the list; typing, the slash menu and a [[ link are stored as
// Markdown; the selection card's Explain goes to the chat beside it (the
// send is intercepted); Export downloads the Markdown file.

const editor = '[data-testid="page-editor"]';

async function pageContent(request: APIRequestContext, name: string): Promise<string> {
	const list = (await (await request.get("/api/library")).json()) as { items: Array<{ id: string; name: string; createdAt: string }> };
	const item = list.items.filter((i) => i.name === name).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
	if (!item) return "";
	const body = (await (await request.get(`/api/library/pages/${item.id}`)).json()) as { draft?: { content: string }; head: { content: string } };
	return body.draft?.content ?? body.head.content;
}

/** Selects the first paragraph of the editor (the editor reads selectionchange). */
async function selectFirstParagraph(page: Page) {
	await page.locator(`${editor} p`).first().click();
	await page.waitForTimeout(150);
	await page.keyboard.press("Home");
	await page.waitForTimeout(60);
	await page.keyboard.down("Shift");
	await page.keyboard.press("End");
	await page.keyboard.up("Shift");
	await expect(page.getByTestId("page-bubble")).toBeVisible();
	await page.waitForTimeout(400);
}

test.describe("Study: a Library page", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => { await clearStudyKey(request); });

	test("new page, typing, slash menu, [[ link, the selection card's Explain, Export as Markdown", async ({ page, request }) => {
		test.setTimeout(240_000);
		const posts = await interceptModel(page);
		const tag = Date.now().toString(36);
		const target = await createPage(request, `Waves ${tag}`, "A wave carries energy, not matter.\n");

		await page.goto("/library");
		await hydrated(page, '[data-testid="library-new-page"]');
		await expect(async () => {
			await page.getByTestId("library-new-page").click();
			await expect(page.getByTestId("page-pane")).toBeVisible({ timeout: 2_000 });
		}).toPass({ timeout: 60_000 });
		await expect(page.locator(editor)).toBeVisible({ timeout: 60_000 });
		const name = (await page.getByTestId("page-name").textContent())!.trim();
		expect(name).toMatch(/^Untitled page/);

		// A heading through the slash menu, then a paragraph and a [[ link.
		await page.locator(editor).click();
		await page.keyboard.type("/head");
		await expect(page.getByTestId("page-slash-menu")).toBeVisible();
		await expect(page.getByTestId("page-slash-option")).toHaveText(["Heading 1", "Heading 2", "Heading 3"]);
		await page.keyboard.press("Enter");
		await page.waitForTimeout(60);
		await page.keyboard.type("Oscillations");
		await page.keyboard.press("Enter");
		await page.keyboard.type("A pendulum swings back and forth. See [[");
		await expect(page.getByTestId("page-wiki-menu")).toBeVisible();
		await page.keyboard.type(`Waves ${tag}`);
		await expect(page.getByTestId("page-wiki-option").first()).toContainText(target.name);
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("page-wiki-link")).toHaveText(target.name);
		await expect(page.getByTestId("page-wiki-link")).toHaveAttribute("data-state", "live");
		await expect.poll(async () => (await pageContent(request, name)).trimEnd(), { timeout: 20_000 }).toBe(`# Oscillations\n\nA pendulum swings back and forth. See [[${target.name}]]`);

		// Export: the paper dialog downloads "<name>.md" with the stored text.
		await page.getByTestId("page-export").click();
		await expect(page.getByTestId("page-export-dialog")).toBeVisible();
		await page.getByTestId("page-export-format-md").click();
		const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("page-export-run").click()]);
		expect(download.suggestedFilename()).toBe(`${name}.md`);
		const file = readFileSync((await download.path())!, "utf8");
		expect(file).toContain("# Oscillations");
		expect(file).toContain(`[[${target.name}]]`);
		await expect(page.getByTestId("page-export-dialog")).toBeHidden();
		await expect(page.getByTestId("page-exported")).toHaveText(`Exported “${name}.md”.`);
		expect(posts).toEqual([]);

		// The page stays open beside a lesson; Explain from its selection card sends to that lesson.
		await page.goto(`/chat/${CHATS.plain}`);
		await expect(page.locator(editor)).toBeVisible({ timeout: 60_000 });
		await hydrated(page, '[data-testid="composer"] textarea');
		await page.locator(`${editor} p`).first().click();
		await selectFirstParagraph(page);
		await page.getByTestId("page-tutor-explain").click();
		await expect.poll(() => posts.length).toBe(1);
		expect(posts[0]!.path).toBe("/api/chat");
		expect(posts[0]!.body).toEqual({ chatId: CHATS.plain, input: { type: "text", text: `Explain this part of @${name}:\n\n> A pendulum swings back and forth. See [[${target.name}]]` } });
	});
});
