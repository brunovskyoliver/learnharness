import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, US6 (T036): the note chat. The note is in "When you ask", so
// nothing reads on its own; the faux engine answers a chat with
// “Fair point. Look again at “…”. …” after 300 ms, streamed.

const CONTENT = "Dynamic programming stores answers.\n\nEach cell adds the one above and the one to its left.\n";

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}

async function openNote(page: Page, request: APIRequestContext, name: string): Promise<{ id: string; name: string }> {
	const full = `${name} ${Date.now()}`;
	const response = await request.post("/api/library/pages", { data: { name: full, content: CONTENT } });
	expect(response.ok()).toBeTruthy();
	const id = ((await response.json()) as { item: { id: string } }).item.id;
	await page.goto(`/notebook/${id}`);
	await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });
	return { id, name: full };
}

type ChatMessage = { author: "ai" | "user"; text: string; state?: string };
const chatOf = async (request: APIRequestContext, id: string) =>
	((await (await request.get(`/api/notebook/${id}`)).json()) as { companion: { chat: ChatMessage[] } }).companion.chat;

const isRunPost = (url: string, method: string) => method === "POST" && /\/api\/notebook\/[^/]+\/runs$/.test(url);
/** After a reload, a hidden copy of the streamed page can sit in the DOM for a moment. */
const shown = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

test.describe("Notebook: note chat", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "notebook" });
		await putSection(request, "notebook", { appearance: "light", startMode: "ask", pace: "regular", layout: "both" });
		await page.setViewportSize({ width: 1665, height: 962 });
	});

	test("opens from the chat button over the faded page; a starter fills the field and sends nothing", async ({ page, request }) => {
		const note = await openNote(page, request, "Chat open");
		const posts: string[] = [];
		page.on("request", (r) => { if (isRunPost(r.url(), r.method())) posts.push(r.url()); });
		await expect(page.getByTestId("nb-chat-panel")).toHaveCount(0);

		await page.getByTestId("nb-chat").click();
		const panel = page.getByTestId("nb-chat-panel");
		await expect(panel).toBeVisible();
		await expect(page.getByTestId("nb-chat")).toHaveAttribute("aria-expanded", "true");
		// Once it has slid in: 466px at the right edge.
		await expect.poll(async () => { const b = (await panel.boundingBox())!; return [Math.round(b.x), Math.round(b.width)]; }).toEqual([1199, 466]);
		await expect(panel.getByRole("heading", { name: "This note" })).toBeVisible();
		await expect(panel).toContainText(`On “${note.name}”`);
		await expect(panel.getByTestId("nb-chat-opening")).toHaveText("I’ve read all of this note. Ask me anything about it.");
		await expect(panel.getByTestId("nb-chat-context")).toHaveText("Read the whole note.");
		await expect(panel.getByTestId("nb-chat-starter")).toHaveText(["What am I still getting wrong?", "What have we worked out so far?", "What should I do next?"]);
		const field = panel.getByTestId("nb-chat-field");
		await expect(field).toBeFocused();
		await expect(field).toHaveAttribute("placeholder", "Ask about this note…");
		// The page moves aside and fades.
		await expect.poll(() => page.getByTestId("nb-page").evaluate((el) => getComputedStyle(el).opacity)).toBe("0.5");
		await expect.poll(() => page.getByTestId("nb-page").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)).toBe(-210);

		await panel.getByTestId("nb-chat-starter").nth(2).click();
		await expect(field).toHaveValue("What should I do next?");
		await expect(field).toBeFocused();
		await page.waitForTimeout(500);
		expect(posts).toEqual([]);
		expect(await chatOf(request, note.id)).toEqual([]);

		// Escape closes; the focus is back on the chat button and the page is back in place.
		await page.keyboard.press("Escape");
		await expect(panel).toBeHidden();
		await expect(page.getByTestId("nb-chat")).toBeFocused();
		await expect.poll(() => page.getByTestId("nb-page").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
	});

	test("send writes his message, streams the answer in the AI lettering, and the history is there after a reload", async ({ page, request }) => {
		const note = await openNote(page, request, "Chat send");
		await request.patch(`/api/notebook/${note.id}`, { data: { instruction: "Only hints." } });
		await page.getByTestId("nb-chat").click();
		const panel = page.getByTestId("nb-chat-panel");
		await expect(panel.getByTestId("nb-chat-context")).toHaveText("Read the whole note and your instructions.");
		const field = panel.getByTestId("nb-chat-field");
		await field.fill("What have we worked out so far?");
		// Shift+Enter breaks the line; Enter sends.
		await page.keyboard.press("Shift+Enter");
		await expect(field).toHaveValue("What have we worked out so far?\n");
		const sent = page.waitForRequest((r) => isRunPost(r.url(), r.method()));
		await page.keyboard.press("Enter");
		const body = (await sent).postDataJSON() as { kind: string; message: string; text: string };
		expect(body.kind).toBe("chat");
		expect(body.message).toBe("What have we worked out so far?");
		expect(body.text).toContain("Each cell adds the one above");
		await expect(field).toHaveValue("");

		const messages = panel.getByTestId("nb-chat-message");
		await expect(messages.first()).toHaveText("What have we worked out so far?");
		await expect(panel.getByTestId("nb-chat-opening")).toHaveCount(0);
		const answer = messages.nth(1);
		await expect(answer).toHaveAttribute("data-author", "ai");
		await expect(answer).toContainText("Fair point.", { timeout: 15_000 });
		// While it streams, the send button is Stop; when it lands, Send is back.
		await expect(answer).not.toHaveAttribute("data-state", "streaming", { timeout: 15_000 });
		await expect(panel.getByTestId("nb-chat-send")).toBeVisible();
		await expect(answer.locator(".nb-voice")).toHaveCSS("font-family", /Newsreader|newsreader/i);
		await expect.poll(async () => (await chatOf(request, note.id)).map((m) => [m.author, m.state ?? "ok"])).toEqual([["user", "ok"], ["ai", "ok"]]);
		const stored = (await chatOf(request, note.id))[1]!.text;
		expect(stored).toMatch(/^Fair point\./);

		await page.reload();
		await expect(shown(page, "nb-editor")).toBeVisible({ timeout: 60_000 });
		await shown(page, "nb-chat").click();
		const again = page.getByTestId("nb-chat-panel");
		await expect(again.getByTestId("nb-chat-message")).toHaveText(["What have we worked out so far?", stored]);
		await expect(again.getByTestId("nb-chat-starter")).toHaveCount(0);
	});

	test("stopping an answer keeps its words and offers Try again", async ({ page, request }) => {
		await openNote(page, request, "Chat stop");
		await page.getByTestId("nb-chat").click();
		const panel = page.getByTestId("nb-chat-panel");
		await panel.getByTestId("nb-chat-field").fill("Why?");
		await page.keyboard.press("Enter");
		await panel.getByTestId("nb-chat-stop").click();
		const answer = panel.getByTestId("nb-chat-message").nth(1);
		await expect(panel.getByTestId("nb-chat-stopped")).toContainText("Stopped.", { timeout: 15_000 });
		await panel.getByRole("button", { name: "Try again" }).click();
		await expect(answer).toContainText("Fair point.", { timeout: 15_000 });
		await expect(panel.getByTestId("nb-chat-stopped")).toHaveCount(0, { timeout: 15_000 });
		await expect(panel.getByTestId("nb-chat-message")).toHaveCount(2);
	});

	test("below 768px the chat takes the whole screen", async ({ page, request }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openNote(page, request, "Chat phone");
		await page.getByTestId("nb-chat").click();
		await expect.poll(async () => page.getByTestId("nb-chat-panel").boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
		await page.getByRole("button", { name: "Close chat" }).click();
		await expect(page.getByTestId("nb-chat-panel")).toBeHidden();
		await expect(page.getByTestId("nb-chat")).toBeFocused();
	});
});
