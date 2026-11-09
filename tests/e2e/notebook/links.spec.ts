import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, T044: the Links panel in Notebook. The page's connections
// (features 016-017) in a lifted panel from the sidebar footer: each section
// with its empty sentence, a page opens as a note, Escape gives the focus back.

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}
async function page_(request: APIRequestContext, name: string, content: string): Promise<{ id: string; name: string }> {
	const response = await request.post("/api/library/pages", { data: { name, content } });
	expect(response.ok()).toBeTruthy();
	const item = ((await response.json()) as { item: { id: string; name: string } }).item;
	return { id: item.id, name: item.name };
}
async function openLinks(page: Page) {
	await page.getByTestId("nb-menu-button").filter({ visible: true }).click();
	await page.getByTestId("nb-side-links").click();
	const panel = page.getByTestId("nb-links-panel");
	await expect(panel).toBeVisible();
	return panel;
}

test.describe("Notebook: the Links panel", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "notebook" });
		await putSection(request, "notebook", { appearance: "light", startMode: "ask", layout: "both" });
		await page.setViewportSize({ width: 1665, height: 962 });
	});

	test("shows the page's links in Notebook type; a page opens as a note; Escape closes and returns the focus", async ({ page, request }) => {
		const stamp = Date.now();
		const target = await page_(request, `Entropy ${stamp}`, "Heat flows from hot to cold.\n");
		const source = await page_(request, `Tea ${stamp}`, `A cup of tea cools down. See [[${target.name}]] and [[Nowhere ${stamp}]].\n`);
		await page.goto(`/notebook/${target.id}`);
		await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });

		const panel = await openLinks(page);
		await expect(panel.getByRole("heading", { name: "Links", exact: true })).toBeVisible();
		await expect(panel).toContainText(`On “${target.name}”`);
		// Links to this page: the page that links here.
		const back = panel.getByTestId("nb-links-backlink");
		await expect(back).toHaveCount(1);
		await expect(back).toContainText(source.name);
		// Each other section with today's empty sentence.
		await expect(panel.getByRole("region", { name: "Links from this page" })).toContainText("Type [[ in the text to link a page.");
		await expect(panel.getByRole("region", { name: "Lessons" })).toContainText("No lesson is tied to this page.");
		await expect(panel.getByRole("region", { name: "Ideas in your graph" })).toContainText("No graph idea relates to this page yet.");
		await expect(panel.getByRole("region", { name: "Related notes" })).toBeVisible();
		// Notebook type, lifted, and the page slides aside as for the chat.
		await expect(panel).toHaveCSS("box-shadow", /rgba?\(/);
		await expect(page.getByTestId("nb-page").filter({ visible: true })).toHaveAttribute("data-chat", "");

		await page.keyboard.press("Escape");
		await expect(panel).toBeHidden();
		await expect(page.getByTestId("nb-menu-button").filter({ visible: true })).toBeFocused();

		// A row opens that page as a note in Notebook; its own links show a missing page.
		const again = await openLinks(page);
		await again.getByTestId("nb-links-backlink").click();
		await expect(page).toHaveURL(new RegExp(`/notebook/${source.id}$`), { timeout: 60_000 });
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
		const theirs = await openLinks(page);
		const links = theirs.getByTestId("nb-links-link");
		await expect(links).toHaveCount(2);
		await expect(links.filter({ hasText: "No such page yet" })).toHaveCount(1);
		// A missing page is said, not offered.
		expect(await theirs.locator("[data-testid='nb-links-link'][data-state='missing']").evaluate((el) => el.tagName)).toBe("DIV");
		await theirs.getByTestId("nb-links-link").filter({ hasText: target.name }).click();
		await expect(page).toHaveURL(new RegExp(`/notebook/${target.id}$`), { timeout: 60_000 });
	});
});
