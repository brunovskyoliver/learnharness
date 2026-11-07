import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, US4 (T032): the selection menu and sketches. The note is in
// "When you ask", so nothing reads on its own; the faux engine answers a
// think with “Is “…” always so…”, a visualize with the 4-step DP grid and a
// reply with “Fair point. …” (LH_NOTEBOOK_FAUX_MS=1500 before a structured answer).

const FIRST = "Dynamic programming stores answers.";
const SECOND = "Each cell adds the one above and the one to its left.";
const CONTENT = `${FIRST}\n\n${SECOND}\n`;

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}

async function openNote(page: Page, request: APIRequestContext, name: string): Promise<string> {
	const response = await request.post("/api/library/pages", { data: { name: `${name} ${Date.now()}`, content: CONTENT } });
	expect(response.ok()).toBeTruthy();
	const id = ((await response.json()) as { item: { id: string } }).item.id;
	await page.goto(`/notebook/${id}`);
	await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });
	return id;
}

async function stored(request: APIRequestContext, id: string): Promise<string> {
	const body = (await (await request.get(`/api/library/pages/${id}`)).json()) as { head: { content: string }; draft: { content: string } | null };
	return body.draft?.content ?? body.head.content;
}

/** Selects one paragraph's whole line, as a drag would. */
async function selectParagraph(page: Page, text: string) {
	await page.locator(".nb-prose p", { hasText: text }).click();
	await page.keyboard.press("Home");
	await page.keyboard.press("Shift+End");
	await expect(page.getByTestId("nb-selection-menu")).toBeVisible();
}

const isRunPost = (url: string, method: string) => method === "POST" && /\/api\/notebook\/[^/]+\/runs$/.test(url);

test.describe("Notebook: the selection menu and sketches", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "notebook" });
		await putSection(request, "notebook", { appearance: "light", startMode: "ask", pace: "regular", layout: "both" });
		await page.setViewportSize({ width: 1665, height: 962 });
	});

	test("a selection opens the menu in the right margin; bold and an ink colour are his text and survive a reload; Escape hides it", async ({ page, request }) => {
		const id = await openNote(page, request, "Format");
		await selectParagraph(page, FIRST);
		const menu = page.getByTestId("nb-selection-menu");
		const column = (await page.getByTestId("nb-column").boundingBox())!;
		const box = (await menu.boundingBox())!;
		expect(box.x).toBeGreaterThan(column.x + column.width);
		await expect(menu.getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
		for (const name of ["Heading 1", "Heading 2", "Heading 3", "Heading 4", "Quote", "Bulleted list", "Numbered list", "Bold", "Italic", "Underline", "Strikethrough", "Code", "Default ink", "Purple ink", "Think about this", "Ask about this", "Visualize", "Make flashcards"]) {
			await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
		}

		await menu.getByRole("button", { name: "Bold" }).click();
		await expect(menu.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
		await menu.getByRole("button", { name: "Blue ink" }).click();
		await expect(menu.getByRole("button", { name: "Blue ink" })).toHaveAttribute("aria-pressed", "true");
		await expect.poll(() => stored(request, id), { timeout: 15_000 }).toBe(`**<span data-color="blue">${FIRST}</span>**\n\n${SECOND}\n`);

		await page.reload();
		const strong = page.locator(".nb-prose p strong", { hasText: FIRST });
		await expect(strong).toBeVisible({ timeout: 60_000 });
		await expect(strong.locator("span[data-color='blue']")).toHaveText(FIRST);
		const colour = await strong.locator("span[data-color='blue']").evaluate((el) => getComputedStyle(el).color);
		expect(colour).not.toBe(await page.locator(".nb-prose p", { hasText: SECOND }).evaluate((el) => getComputedStyle(el).color));

		// Escape hides the menu first and keeps the selection.
		await selectParagraph(page, SECOND);
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-selection-menu")).toBeHidden();
		expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(SECOND);

		// Shift+F10 goes into the menu; Escape there hands the text back, selection kept.
		await page.keyboard.press("End");
		await page.keyboard.press("Shift+Home");
		await expect(page.getByTestId("nb-selection-menu")).toBeVisible();
		await page.keyboard.press("Shift+F10");
		await expect(page.getByTestId("nb-selection-menu").getByRole("button", { name: "Text" })).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(page.getByTestId("nb-selection-menu").getByRole("button", { name: "Heading 1" })).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-selection-menu")).toBeHidden();
		await expect(page.getByTestId("nb-editor")).toBeFocused();
		expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(SECOND);
	});

	test("Think about this: the passage is read and a margin note lands on it", async ({ page, request }) => {
		await openNote(page, request, "Think");
		await selectParagraph(page, SECOND);
		const started = page.waitForResponse((res) => isRunPost(res.url(), res.request().method()));
		await page.getByTestId("nb-sel-think").click();
		const body = (await started).request().postDataJSON() as { kind: string; anchor: { quote: string } };
		expect(body.kind).toBe("think");
		expect(body.anchor.quote).toBe(SECOND);
		await expect(page.getByTestId("nb-selection-menu")).toBeHidden();
		// While it thinks: the passage's pencil underline and blot.
		await expect(page.getByTestId("nb-reading")).toBeVisible();
		const note = page.getByTestId("nb-margin-note");
		await expect(note).toHaveCount(1, { timeout: 20_000 });
		await expect(note).toContainText("always so");
		await expect(page.locator(".nb-anchor", { hasText: "Each cell adds" })).toBeVisible();
	});

	test("Ask about this: a thread opens with its field focused, nothing is sent until Send, then the reply streams", async ({ page, request }) => {
		const id = await openNote(page, request, "Ask");
		let posts = 0;
		page.on("request", (req) => { if (isRunPost(req.url(), req.method()) || (req.method() === "POST" && /\/threads$/.test(req.url()))) posts++; });
		await selectParagraph(page, FIRST);
		await page.getByTestId("nb-sel-ask").click();
		const field = page.getByTestId("nb-write-back");
		await expect(field).toBeFocused();
		await expect(field).toHaveAttribute("placeholder", "Ask about this passage…");
		await expect(page.getByTestId("nb-ask-hint")).toHaveText("Enter to ask. Esc to cancel.");
		await expect(page.locator(".nb-asking", { hasText: "Dynamic programming" })).toBeVisible();
		await page.keyboard.type("Why store them at all?");
		await page.waitForTimeout(1_500);
		expect(posts).toBe(0);

		const asked = page.waitForResponse((res) => res.request().method() === "POST" && /\/threads$/.test(res.url()));
		const run = page.waitForResponse((res) => isRunPost(res.url(), res.request().method()));
		await page.keyboard.press("Enter");
		const thread = ((await (await asked).json()) as { thread: { id: string; origin: string; messages: { text: string }[] } }).thread;
		expect(thread.origin).toBe("ask");
		expect(thread.messages[0]!.text).toBe("Why store them at all?");
		expect(((await run).request().postDataJSON() as { kind: string; threadId: string })).toMatchObject({ kind: "reply", threadId: thread.id });
		const open = page.locator(`[data-thread='${thread.id}'][data-testid='nb-margin-note']`);
		await expect(open.getByTestId("nb-thread-message").first()).toHaveText("Why store them at all?");
		await expect(open.getByTestId("nb-thread-message").nth(1)).toContainText("Fair point.", { timeout: 20_000 });
		type Body = { companion: { threads: { id: string; messages: { author: string; state?: string }[] }[] } };
		await expect.poll(async () => ((await (await request.get(`/api/notebook/${id}`)).json()) as Body).companion.threads.find((t) => t.id === thread.id)?.messages.at(-1)?.state ?? "done", { timeout: 20_000 }).toBe("done");
	});

	test("Ask about this, then Escape: cancelled, nothing sent, back to the passage", async ({ page, request }) => {
		await openNote(page, request, "Ask cancel");
		let posts = 0;
		page.on("request", (req) => { if (req.method() === "POST" && /\/api\/notebook\//.test(req.url())) posts++; });
		await selectParagraph(page, FIRST);
		await page.getByTestId("nb-sel-ask").click();
		await expect(page.getByTestId("nb-write-back")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-write-back")).toHaveCount(0);
		await expect(page.locator(".nb-asking")).toHaveCount(0);
		await expect(page.getByTestId("nb-editor")).toBeFocused();
		expect(posts).toBe(0);
	});

	test("Visualize: Sketching it…, then a sketch inks in step by step; the stepper, replay, and See it larger with Escape", async ({ page, request }) => {
		await openNote(page, request, "Visualize");
		await selectParagraph(page, SECOND);
		const started = page.waitForResponse((res) => isRunPost(res.url(), res.request().method()));
		await page.getByTestId("nb-sel-visualize").click();
		expect(((await started).request().postDataJSON() as { kind: string }).kind).toBe("visualize");
		await expect(page.getByTestId("nb-sketching")).toHaveText("Sketching it…");
		const sketch = page.getByTestId("nb-inline-reply").getByTestId("nb-sketch");
		await expect(sketch).toBeVisible({ timeout: 20_000 });
		await expect(page.getByTestId("nb-sketching")).toHaveCount(0);
		// It plays itself once: 1/4 first, See it larger hidden until the end.
		const count = sketch.getByTestId("nb-sketch-count");
		await expect(count).toHaveText("1/4");
		await expect(sketch.getByTestId("nb-sketch-caption")).toHaveText("Start with 1 way to reach every edge cell.");
		await expect(sketch.getByTestId("nb-sketch-larger")).toBeHidden();
		await expect(count).toHaveText("2/4", { timeout: 5_000 });
		await expect(count).toHaveText("4/4", { timeout: 10_000 });
		await expect(sketch.getByTestId("nb-sketch-note")).toHaveText("Above + left = this cell.");
		// Frame inline-sketch-and-selection: the drawing keeps 18px clear of the reply's right edge
		// (the stepper ends 18px in), and the step's line starts on the grid's edge.
		const reply = page.getByTestId("nb-inline-reply");
		const replyRight = await reply.evaluate((el) => el.getBoundingClientRect().right - parseFloat(getComputedStyle(el).paddingRight));
		const stepperRight = await sketch.locator(".nb-stepper").evaluate((el) => el.getBoundingClientRect().right);
		expect(replyRight - stepperRight).toBeCloseTo(18, 0);
		const noteLeft = await sketch.getByTestId("nb-sketch-note").evaluate((el) => el.getBoundingClientRect().left);
		const gridLeft = await sketch.locator("svg [data-kind='grid'] path").first().evaluate((el) => el.getBoundingClientRect().left);
		expect(Math.abs(noteLeft - gridLeft)).toBeLessThan(2);
		const hidden = await sketch.locator("svg [data-step]").evaluateAll((gs) => gs.map((g) => (g as SVGGElement).style.opacity));
		expect(hidden).toEqual(["1", "1", "1", "1"]);

		// Step back and forward; arrow keys while the stepper has focus.
		await sketch.getByTestId("nb-sketch-prev").click();
		await expect(count).toHaveText("3/4");
		await expect(sketch.getByTestId("nb-sketch-caption")).toHaveText("The next two cells each get 1 + 2 = 3.");
		expect(await sketch.locator("svg [data-step='3']").evaluate((g) => (g as SVGGElement).style.opacity)).toBe("0");
		// A pointer click leaves no focus behind (the app's focus hygiene); from the keyboard, arrows step.
		await sketch.getByTestId("nb-sketch-prev").focus();
		await page.keyboard.press("ArrowLeft");
		await expect(count).toHaveText("2/4");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowRight");
		await expect(count).toHaveText("4/4");
		await expect(sketch.getByTestId("nb-sketch-next")).toHaveAttribute("aria-disabled", "true");

		// Draw it again: back to the first step, playing.
		await sketch.getByTestId("nb-sketch-replay").click();
		await expect(count).toHaveText("1/4");
		await expect(count).toHaveText("4/4", { timeout: 10_000 });

		// See it larger: a dialog; Escape closes it and the focus comes back.
		const larger = sketch.getByTestId("nb-sketch-larger");
		await expect(larger).toBeVisible();
		await larger.click();
		const dialog = page.getByTestId("nb-sketch-dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByTestId("nb-sketch-count")).toHaveText("4/4");
		await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(larger).toBeFocused();

		// Played once: after a reload it shows finished.
		await page.reload();
		const again = page.getByTestId("nb-inline-reply").getByTestId("nb-sketch");
		await expect(again.getByTestId("nb-sketch-count")).toHaveText("4/4", { timeout: 60_000 });
		await page.waitForTimeout(500);
		await expect(again.getByTestId("nb-sketch-count")).toHaveText("4/4");
	});

	test("reduced motion: a new sketch shows its last step at once", async ({ page, request }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openNote(page, request, "Reduced");
		await selectParagraph(page, SECOND);
		await page.getByTestId("nb-sel-visualize").click();
		const sketch = page.getByTestId("nb-inline-reply").getByTestId("nb-sketch");
		await expect(sketch).toBeVisible({ timeout: 20_000 });
		await expect(sketch.getByTestId("nb-sketch-count")).toHaveText("4/4");
		await expect(sketch.getByTestId("nb-sketch-larger")).toBeVisible();
		const animations = await sketch.locator("svg .nb-sketch-line").first().evaluate((el) => getComputedStyle(el).animationName);
		expect(animations).toBe("none");
	});

	test("row 1 makes a heading, a quote and lists; Text lifts the block back to a paragraph", async ({ page, request }) => {
		const id = await openNote(page, request, "Blocks");
		const menu = page.getByTestId("nb-selection-menu");
		const press = async (name: string) => {
			await page.locator(".nb-prose :is(p, h3)", { hasText: SECOND }).click();
			await page.keyboard.press("End");
			await page.keyboard.press("Shift+Home");
			await expect(menu).toBeVisible();
			await menu.getByRole("button", { name, exact: true }).click();
			await expect(menu.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
		};
		await press("Heading 3");
		await expect.poll(() => stored(request, id), { timeout: 15_000 }).toBe(`${FIRST}\n\n### ${SECOND}\n`);
		await press("Text");
		await press("Bulleted list");
		await expect.poll(() => stored(request, id), { timeout: 15_000 }).toBe(`${FIRST}\n\n- ${SECOND}\n`);
		await press("Text");
		await press("Quote");
		await expect.poll(() => stored(request, id), { timeout: 15_000 }).toBe(`${FIRST}\n\n> ${SECOND}\n`);
		await press("Text");
		await expect.poll(() => stored(request, id), { timeout: 15_000 }).toBe(CONTENT);
	});

	test("Make flashcards hands only the passage to the drafting panel, which sends nothing until Generate", async ({ page, request }) => {
		const id = await openNote(page, request, "Cards");
		const generated: string[] = [];
		page.on("request", (req) => {
			if (req.method() === "POST" && req.url().endsWith("/api/cards/generate")) generated.push(req.postData() ?? "");
		});
		await selectParagraph(page, SECOND);
		await page.getByTestId("nb-sel-flashcards").click();
		await expect(page).toHaveURL(/\/review\?make=passage$/, { timeout: 60_000 });
		await expect(page.getByTestId("make-panel")).toContainText("Make flashcards from a passage of", { timeout: 60_000 });
		// Only the preview went: it names what would be sent (this passage's characters) and calls no model.
		expect(generated.length).toBeGreaterThan(0);
		for (const body of generated) {
			const sent = JSON.parse(body) as { kind: string; itemId: string; text: string; preview?: boolean };
			expect(sent).toMatchObject({ kind: "passage", itemId: id, text: SECOND, preview: true });
		}
	});
});
