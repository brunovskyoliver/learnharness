import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, US5 (T034): the instruction line and reviewers. The note is
// in "When you ask", so nothing reads on its own while these run.

const CONTENT = "Entropy always rises in a closed system.\n";

type Reviewer = { id: string; name: string; instructions: string };

async function settingsSection(request: APIRequestContext, section: string): Promise<Record<string, unknown>> {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	return record[section] ?? {};
}

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>, drop: string[] = []) {
	const next: Record<string, unknown> = { ...(await settingsSection(request, section)), ...patch };
	for (const key of drop) delete next[key];
	const response = await request.put(`/api/settings/${section}`, { data: next });
	expect(response.ok()).toBeTruthy();
}

async function newNote(request: APIRequestContext, name: string): Promise<string> {
	const response = await request.post("/api/library/pages", { data: { name: `${name} ${Date.now()}`, content: CONTENT } });
	expect(response.ok()).toBeTruthy();
	return ((await response.json()) as { item: { id: string } }).item.id;
}

/** After a reload, a hidden copy of the streamed page can sit in the DOM for a moment. */
const shown = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

async function openNote(page: Page, id: string) {
	await page.goto(`/notebook/${id}`);
	await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });
}

const companion = async (request: APIRequestContext, id: string) =>
	((await (await request.get(`/api/notebook/${id}`)).json()) as { companion: { instruction: string; reviewerId?: string } }).companion;

const storedReviewers = async (request: APIRequestContext): Promise<Reviewer[] | undefined> =>
	(await settingsSection(request, "notebook")).reviewers as Reviewer[] | undefined;

test.describe("Notebook: instructions and reviewers", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "notebook" });
		// Back to the seeded reviewers (no stored list).
		await putSection(request, "notebook", { appearance: "light", startMode: "ask", pace: "regular", layout: "both" }, ["reviewers"]);
		await page.setViewportSize({ width: 1665, height: 962 });
	});

	test("Instructions opens the line; Enter saves and moves to the title; it persists after a reload; Escape reverts; emptied, the button returns", async ({ page, request }) => {
		const id = await newNote(request, "Instructions");
		await openNote(page, id);
		await expect(page.getByTestId("nb-instruction")).toHaveCount(0);

		await page.getByTestId("nb-instructions").click();
		const field = page.getByTestId("nb-instruction-field");
		await expect(field).toBeFocused();
		await expect(field).toHaveAttribute("placeholder", "How should this note be read? Only hints, say, or argue with everything.");
		await expect(page.getByTestId("nb-instructions")).toHaveCount(0);
		await field.pressSequentially("Only hints, never the full answer.");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-title")).toBeFocused();
		await expect.poll(async () => (await companion(request, id)).instruction).toBe("Only hints, never the full answer.");
		await expect(page.getByTestId("nb-instructions")).toHaveCount(0);

		await page.reload();
		await expect(shown(page, "nb-instruction-field")).toHaveValue("Only hints, never the full answer.", { timeout: 60_000 });
		await expect(page.getByTestId("nb-instructions")).toHaveCount(0);
		// The label sits on the text's line, the title under the line.
		const label = (await page.locator(".nb-instruction-label").boundingBox())!;
		const text = (await field.boundingBox())!;
		const title = (await page.getByTestId("nb-title").boundingBox())!;
		expect(Math.abs(label.y + label.height / 2 - (text.y + 13))).toBeLessThan(6);
		expect(title.y).toBeGreaterThan(text.y + text.height - 1);

		// Escape puts back the saved words; leaving then saves nothing new.
		await field.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.type("Argue with everything.");
		await page.keyboard.press("Escape");
		await expect(field).toHaveValue("Only hints, never the full answer.");
		await page.getByTestId("nb-title").click();
		await page.waitForTimeout(300);
		expect((await companion(request, id)).instruction).toBe("Only hints, never the full answer.");

		// Leaving it empty clears the instruction: the line hides and the button is back.
		await field.click();
		await page.keyboard.press("ControlOrMeta+a");
		await page.keyboard.press("Backspace");
		await page.getByTestId("nb-title").click();
		await expect.poll(async () => (await companion(request, id)).instruction).toBe("");
		await expect(page.getByTestId("nb-instruction")).toHaveCount(0);
		await expect(page.getByTestId("nb-instructions")).toBeVisible();

		// Escape on a new, empty line closes it and gives the focus back to the button.
		await page.getByTestId("nb-instructions").click();
		await expect(page.getByTestId("nb-instruction-field")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-instruction")).toHaveCount(0);
		await expect(page.getByTestId("nb-instructions")).toBeFocused();
	});

	test("a reviewer picked from the row is kept per note", async ({ page, request }) => {
		const id = await newNote(request, "Reviewer");
		const other = await newNote(request, "Other");
		await openNote(page, id);
		const picker = page.getByTestId("nb-reviewer-picker");
		await expect(picker).toContainText("Plain reader");
		await picker.click();
		const menu = page.getByTestId("nb-reviewer-menu");
		await expect(menu.getByTestId("nb-reviewer-option")).toHaveText([
			/^Plain reader/, /^Examiner/, /^Editor/, /^Sceptic/, /^Professor/,
		]);
		await menu.getByRole("menuitemradio", { name: /^Examiner/ }).click();
		await expect(picker).toContainText("Examiner");
		await expect.poll(async () => (await companion(request, id)).reviewerId).toBe("examiner");

		await page.reload();
		await expect(shown(page, "nb-reviewer-picker")).toContainText("Examiner", { timeout: 60_000 });
		await openNote(page, other);
		await expect(shown(page, "nb-reviewer-picker")).toContainText("Plain reader");
	});

	test("reviewers: create, edit, delete with Undo; the picker follows", async ({ page, request }) => {
		const id = await newNote(request, "Reviewers");
		await openNote(page, id);
		const picker = page.getByTestId("nb-reviewer-picker");
		await picker.click();
		await page.getByTestId("nb-edit-reviewers").click();
		const dialog = page.getByTestId("nb-reviewers-dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByTestId("nb-reviewer-row")).toHaveCount(5);
		await expect(dialog.getByTestId("nb-reviewer-row").nth(1)).toContainText("Reads like the person grading this.");

		// New reviewer: named in place, then how they read.
		await dialog.getByTestId("nb-reviewer-new").click();
		const name = dialog.getByTestId("nb-reviewer-name");
		await expect(name).toBeFocused();
		await expect(name).toHaveValue("New reviewer");
		await page.keyboard.type("Quizmaster");
		await page.keyboard.press("Enter");
		await expect(dialog.getByTestId("nb-reviewer-instructions")).toBeFocused();
		await page.keyboard.type("Asks for one worked example every time.");
		await expect.poll(async () => (await storedReviewers(request))?.at(-1)).toMatchObject({ name: "Quizmaster", instructions: "Asks for one worked example every time." });
		expect((await storedReviewers(request))?.map((r) => r.id).slice(0, 5)).toEqual(["plain", "examiner", "editor", "sceptic", "professor"]);

		// Edit a seeded one.
		await dialog.getByTestId("nb-reviewer-row-button").filter({ hasText: "Editor" }).click();
		const editorName = dialog.getByTestId("nb-reviewer-name");
		await editorName.fill("Copy editor");
		await editorName.blur();
		await expect.poll(async () => (await storedReviewers(request))?.find((r) => r.id === "editor")?.name).toBe("Copy editor");

		// Escape closes and the focus goes back to the picker, which lists the new reviewer.
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(picker).toBeFocused();
		await picker.click();
		await expect(page.getByTestId("nb-reviewer-menu").getByTestId("nb-reviewer-option")).toHaveText([
			/^Plain reader/, /^Examiner/, /^Copy editor/, /^Sceptic/, /^Professor/, /^Quizmaster.*Asks for one worked example/,
		]);
		await page.getByRole("menuitemradio", { name: /^Quizmaster/ }).click();
		await expect.poll(async () => (await companion(request, id)).reviewerId).toMatch(/^rev_/);

		// Delete with Undo: it comes back where it was.
		await picker.click();
		await page.getByTestId("nb-edit-reviewers").click();
		await dialog.getByTestId("nb-reviewer-row-button").filter({ hasText: "Sceptic" }).click();
		await dialog.getByTestId("nb-reviewer-delete").click();
		await expect(dialog.getByTestId("nb-reviewer-deleted")).toContainText("Reviewer deleted.");
		await expect(dialog.getByTestId("nb-reviewer-undo")).toBeFocused();
		await expect.poll(async () => (await storedReviewers(request))?.map((r) => r.id).includes("sceptic")).toBe(false);
		await dialog.getByTestId("nb-reviewer-undo").click();
		await expect.poll(async () => (await storedReviewers(request))?.map((r) => r.id).indexOf("sceptic")).toBe(3);

		// Deleting the note's own reviewer: the note reads as Plain reader.
		await dialog.getByTestId("nb-reviewer-row-button").filter({ hasText: "Quizmaster" }).click();
		await dialog.getByTestId("nb-reviewer-delete").click();
		await expect.poll(async () => (await storedReviewers(request))?.some((r) => r.name === "Quizmaster")).toBe(false);
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(picker).toContainText("Plain reader");

		await page.reload();
		await shown(page, "nb-reviewer-picker").click({ timeout: 60_000 });
		await expect(page.getByTestId("nb-reviewer-menu").getByTestId("nb-reviewer-option")).toHaveText([
			/^Plain reader/, /^Examiner/, /^Copy editor/, /^Sceptic/, /^Professor/,
		]);
	});
});
