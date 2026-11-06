import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, US1 (T019): write a note on paper, keep it across a reload,
// see the same page in Study's Library, switch back, both themes, two widths.

const MOD = process.platform === "darwin" ? "Meta" : "Control";

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}

async function pageText(request: APIRequestContext, id: string): Promise<{ name: string; text: string }> {
	const response = await request.get(`/api/library/pages/${id}`);
	const body = (await response.json()) as { item: { name: string }; head: { content: string }; draft: { content: string } | null };
	return { name: body.item.name, text: body.draft?.content ?? body.head.content };
}

const noteId = (page: Page) => decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");

async function noHorizontalOverflow(page: Page) {
	const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
	expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
}

test.describe("Notebook: a note on paper", () => {
	test.beforeEach(async ({ request }) => {
		await putSection(request, "general", { interface: "study" });
		await putSection(request, "notebook", { appearance: "light" });
	});

	test("write, reload, read it in Study, switch back", async ({ page, request }) => {
		await page.setViewportSize({ width: 1440, height: 962 });
		await page.goto("/library");
		await expect(page.getByTestId("switch-to-notebook")).toBeVisible();

		// Study → Notebook with the one shortcut.
		await page.keyboard.press(`${MOD}+Shift+O`);
		await expect(page).toHaveURL(/\/notebook\/[A-Za-z0-9_-]+$/);
		await expect(page.getByTestId("nb-editor")).toBeVisible();

		// A new note from the sidebar.
		await page.getByTestId("nb-menu-button").click();
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		const before = noteId(page);
		await page.getByTestId("nb-new-note").click();
		await expect(page).not.toHaveURL(new RegExp(`${before}$`));
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		const id = noteId(page);
		await expect(page.getByTestId("nb-editor")).toHaveAttribute("aria-label", /^Note /);
		const title = page.getByTestId("nb-title");
		await expect(title).toHaveValue("");
		await expect(title).toHaveAttribute("placeholder", "Untitled");

		// Title, Enter into the body, two paragraphs.
		await title.click();
		await expect(title).toBeFocused();
		await page.keyboard.type("Paper round trip");
		await expect(title).toHaveValue("Paper round trip");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-editor")).toBeFocused();
		await page.keyboard.type("The first paragraph on paper.");
		await page.keyboard.press("Enter");
		await page.keyboard.type("A second one, saved as a page.");
		await expect.poll(async () => (await pageText(request, id)).text, { timeout: 15_000 }).toContain("A second one, saved as a page.");
		await expect.poll(async () => (await pageText(request, id)).name, { timeout: 15_000 }).toBe("Paper round trip");

		// Reload: the same words.
		await page.reload();
		await expect(page.getByTestId("nb-title")).toHaveValue("Paper round trip");
		await expect(page.getByTestId("nb-editor")).toContainText("The first paragraph on paper.");
		await expect(page.getByTestId("nb-editor")).toContainText("A second one, saved as a page.");
		const stored = (await pageText(request, id)).text;
		expect(stored).toBe("The first paragraph on paper.\n\nA second one, saved as a page.");

		// Notebook → Study; the Library holds the same page and text.
		await page.keyboard.press(`${MOD}+Shift+O`);
		await expect(page).not.toHaveURL(/\/notebook/);
		await page.goto("/library");
		await page.getByRole("button", { name: "Open Paper round trip" }).click();
		await expect(page.getByTestId("page-editor")).toContainText("The first paragraph on paper.");
		await expect(page.getByTestId("page-editor")).toContainText("A second one, saved as a page.");
		expect((await pageText(request, id)).text).toBe(stored);

		// And back to the same note.
		await page.keyboard.press(`${MOD}+Shift+O`);
		await expect(page).toHaveURL(new RegExp(`/notebook/${id}$`));
		await expect(page.getByTestId("nb-title")).toHaveValue("Paper round trip");
	});

	test("light and dark paper, 1440 and 390 wide, no scrollbars", async ({ page, request }) => {
		await putSection(request, "general", { interface: "notebook" });
		for (const [appearance, paper] of [["light", "rgb(248, 247, 244)"], ["dark", "rgb(26, 26, 25)"]] as const) {
			await putSection(request, "notebook", { appearance });
			for (const width of [1440, 390]) {
				await page.setViewportSize({ width, height: width > 600 ? 962 : 844 });
				await page.goto("/notebook");
				const root = page.getByTestId("notebook-root");
				await expect(page.getByTestId("nb-editor")).toBeVisible();
				await expect(root).toHaveAttribute("data-nb-theme", appearance);
				expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(paper);
				await expect(page.getByTestId("nb-toolbar")).toBeVisible();
				await expect(page.getByTestId("nb-title")).toBeVisible();
				await noHorizontalOverflow(page);
				const column = await page.getByTestId("nb-column").boundingBox();
				expect(column).not.toBeNull();
				if (width === 1440) expect(Math.round(column!.x)).toBe(390);
				else expect(column!.x).toBeGreaterThanOrEqual(16);
				// Scroll tracks are hidden; scrolling still works.
				expect(await root.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe("none");
				expect(await page.getByTestId("nb-editor").evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe("none");
			}
		}
	});

	test("the sidebar opens and closes by keyboard and returns focus", async ({ page, request }) => {
		await putSection(request, "general", { interface: "notebook" });
		await page.setViewportSize({ width: 1440, height: 962 });
		await page.goto("/notebook");
		await expect(page.getByTestId("nb-editor")).toBeVisible();
		await page.getByTestId("nb-menu-button").focus();
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		await expect(page.getByTestId("nb-menu-button")).toBeFocused();

		await page.keyboard.press(`${MOD}+K`);
		await expect(page.getByTestId("nb-side-search")).toBeFocused();
		await page.keyboard.type("A note from the finder");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		await expect(page.getByTestId("nb-title")).toHaveValue("A note from the finder");

		await page.keyboard.press(`${MOD}+\\`);
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await page.getByTestId("nb-sidebar-close").click();
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
	});
});
