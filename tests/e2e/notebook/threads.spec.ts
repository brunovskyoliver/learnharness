import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// Feature 024, US3 (T029): margin threads. Threads are seeded straight into
// the test server's companion files; the faux engine answers a reply with
// "Fair point. …" (streamed at 60 tokens/s after 300 ms).

const CONTENT = "Video Ideas:\n\n1. college is becoming increasingly worthless with the advent of AI\n2. AI will create a huge economic gap\n3. AI is making people dumber\n4. LLMs will never become AGI\n\nThe last line.\n";
const Q = {
	a: "college is becoming increasingly worthless with the advent of AI",
	b: "AI will create a huge economic gap",
	c: "AI is making people dumber",
	d: "LLMs will never become AGI",
};

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}

async function newNote(request: APIRequestContext, name: string, content = CONTENT): Promise<string> {
	const response = await request.post("/api/library/pages", { data: { name: `${name} ${Date.now()}`, content } });
	expect(response.ok()).toBeTruthy();
	return ((await response.json()) as { item: { id: string } }).item.id;
}

type Stored = { id: string; status: string; messages: { author: string; text: string; state?: string }[] };
async function stored(request: APIRequestContext, id: string): Promise<Stored[]> {
	const body = (await (await request.get(`/api/notebook/${id}`)).json()) as { companion: { threads: Stored[] } };
	return body.companion.threads;
}

function seedCompanion(pageId: string, threads: unknown[]) {
	const dir = path.join(process.env.LH_E2E_DATA_DIR!, "library", "notebook");
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, `${pageId}.json`), JSON.stringify({ v: 1, pageId, instruction: "", threads, chat: [] }));
}

const AT = "2026-11-06T10:00:00.000Z";
const seedThread = (id: string, quote: string, side: "left" | "right", texts: string[]) => ({
	id, anchor: { quote, prefix: "", suffix: "" }, placement: "margin", side, status: "open", origin: "read", createdAt: AT, updatedAt: AT,
	messages: texts.map((text, i) => ({ id: `msg_${id}_${i}`, author: i % 2 ? "user" : "ai", text, at: AT })),
});

const seeded = () => [
	seedThread("thr_a", Q.a, "left", ["If AI makes competent-looking code cheap, college could become more valuable as a signal.", "I disagree.", "Why?"]),
	seedThread("thr_b", Q.b, "right", ["Who owns the systems?"]),
	seedThread("thr_c", Q.c, "left", ["Doing less thinking isn't the same as becoming less capable of thinking."]),
	seedThread("thr_d", Q.d, "left", ["“Never” requires showing a fundamental limit."]),
];

const note = (page: Page, id: string): Locator => page.locator(`[data-thread='${id}'][data-testid='nb-margin-note']`);
const opener = (page: Page, id: string): Locator => note(page, id).getByTestId("nb-thread-open");

async function openSeeded(page: Page, request: APIRequestContext, name: string, threads = seeded()): Promise<string> {
	const id = await newNote(request, name);
	seedCompanion(id, threads);
	await page.goto(`/notebook/${id}`);
	await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });
	return id;
}

test.describe("Notebook: margin threads", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "notebook" });
		await putSection(request, "notebook", { appearance: "light", startMode: "thinks", pace: "regular", layout: "both" });
		await page.setViewportSize({ width: 1440, height: 962 });
	});

	test("a click opens a thread in place: the others fade, its passage takes the wash; Escape closes it and returns to the passage", async ({ page, request }) => {
		// The frame's viewport (margin-thread.jpg): wide enough for the open thread to widen.
		await page.setViewportSize({ width: 1665, height: 962 });
		await openSeeded(page, request, "Open");
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(4, { timeout: 30_000 });
		const before = (await note(page, "thr_a").boundingBox())!;
		await opener(page, "thr_a").click();

		const open = note(page, "thr_a");
		await expect(open).toHaveAttribute("data-state", "open");
		await expect(open.getByTestId("nb-thread-message")).toHaveCount(3);
		await expect(open.locator("[data-author='user']")).toHaveText("I disagree.");
		expect(await open.locator("[data-author='user']").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Instrument Sans/i);
		await expect(open.getByTestId("nb-write-back")).toBeFocused();
		await expect(open.getByTestId("nb-write-back")).toHaveAttribute("placeholder", "Write back…");
		await expect(open.getByRole("button", { name: "Send" })).toBeVisible();
		await expect(open.getByRole("button", { name: "Resolve" })).toBeVisible();
		await expect(open.getByRole("button", { name: "Dismiss" })).toBeVisible();
		// Wider, left-aligned, in the same margin with the same right edge.
		const after = (await open.boundingBox())!;
		expect(after.width).toBeGreaterThan(before.width);
		expect(Math.round(after.x + after.width)).toBe(Math.round(before.x + before.width));
		expect(await open.evaluate((el) => getComputedStyle(el).textAlign)).toBe("left");
		// The underline grows under the focused field.
		await expect.poll(() => open.locator(".nb-reply-line").evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("1");

		// The others fade: the words to the ink's --nb-faded (4.5:1 on paper, still visibly faded),
		// the dot to Riddled's .38 (--nb-faded-mark); the "{n} replies" line keeps full strength.
		const root = page.locator(".nb-root");
		const ink = await root.getAttribute("data-nb-ink");
		const faded = await root.evaluate((el) => Number(getComputedStyle(el).getPropertyValue("--nb-faded")));
		const inkFade = await root.evaluate((el, name) => Number(getComputedStyle(el).getPropertyValue(`--nb-faded-${name}`)), ink ?? "ink");
		expect(faded).toBeCloseTo(inkFade, 2);
		expect(faded).toBeLessThan(1);
		if ((ink ?? "ink") === "ink") expect(faded).toBeLessThanOrEqual(0.7);
		for (const other of ["thr_b", "thr_c", "thr_d"]) {
			await expect.poll(() => note(page, other).locator(".nb-note-text").evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(faded, 2);
			expect(await note(page, other).evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
			await expect.poll(() => note(page, other).locator(".nb-note-dot").evaluate((el) => getComputedStyle(el).filter)).toBe("opacity(0.38)");
			for (const count of await note(page, other).getByTestId("nb-reply-count").all()) {
				expect(await count.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
			}
		}
		await expect(page.locator(".nb-anchor[data-active='true']")).toHaveText(Q.a);
		expect(await page.locator(".nb-anchor[data-active='true']").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
		await expect(page.locator("[data-testid='nb-tether'][data-thread='thr_a']")).toHaveCount(1);

		// ⋯ Copy text.
		await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
		await open.locator(".nb-thread-more-end").click();
		await page.getByRole("menuitem", { name: "Copy text" }).click();
		await expect(page.getByTestId("nb-live")).toHaveText("Copied.");
		expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("You: I disagree.");

		await open.getByTestId("nb-write-back").focus();
		await page.keyboard.press("Escape");
		await expect(note(page, "thr_a")).toHaveAttribute("data-state", "collapsed");
		await expect(page.getByTestId("nb-editor")).toBeFocused();
		await expect(page.locator(".nb-anchor[data-active='true']")).toHaveCount(0);
		await expect.poll(() => note(page, "thr_b").locator(".nb-note-text").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

		// A click outside closes it too.
		await opener(page, "thr_c").click();
		await expect(note(page, "thr_c")).toHaveAttribute("data-state", "open");
		await page.mouse.click(1300, 900);
		await expect(note(page, "thr_c")).toHaveAttribute("data-state", "collapsed");
	});

	test("write back: his words are stored first, the reply streams in, the count updates, and it all survives a reload", async ({ page, request }) => {
		const id = await openSeeded(page, request, "Write back");
		await opener(page, "thr_d").click();
		const field = note(page, "thr_d").getByTestId("nb-write-back");
		await expect(field).toBeFocused();
		// Shift+Enter breaks the line; Enter sends.
		await field.pressSequentially("Because nothing scales forever.");
		await field.press("Shift+Enter");
		await field.pressSequentially("Not even compute.");
		await expect(field).toHaveValue("Because nothing scales forever.\nNot even compute.");
		const posted = page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith("/threads/thr_d/messages"));
		const replied = page.waitForRequest((req) => req.method() === "POST" && /\/runs$/.test(req.url()));
		await field.press("Enter");
		// Write-ahead: the message is stored before the reply run is asked for.
		expect((await posted).status()).toBe(201);
		const run = await replied;
		expect(run.postDataJSON()).toMatchObject({ kind: "reply", threadId: "thr_d" });
		await expect(field).toHaveValue("");

		const open = note(page, "thr_d");
		await expect(open.locator("[data-author='user']")).toHaveText("Because nothing scales forever.\nNot even compute.");
		const answer = open.locator("[data-author='ai']").nth(1);
		await expect(answer).toContainText("Fair point.", { timeout: 15_000 });
		expect(await answer.locator(".nb-ink-word").count()).toBeGreaterThan(3);
		await expect(answer).toContainText("before you generalise.", { timeout: 15_000 });
		await expect(page.getByTestId("nb-live")).toHaveText("Reply ready.");

		await page.keyboard.press("Escape");
		await expect(note(page, "thr_d").getByTestId("nb-reply-count")).toHaveText("2 replies");
		await expect(note(page, "thr_a").getByTestId("nb-reply-count")).toHaveText("2 replies");
		await expect(note(page, "thr_c").getByTestId("nb-reply-count")).toHaveCount(0);

		// Another round makes it 4; the stored thread has every message in order.
		await opener(page, "thr_c").click();
		await note(page, "thr_c").getByTestId("nb-write-back").fill("Over time.");
		await note(page, "thr_c").getByRole("button", { name: "Send" }).click();
		await expect(note(page, "thr_c").locator("[data-author='ai']").nth(1)).toContainText("generalise.", { timeout: 15_000 });
		await page.keyboard.press("Escape");
		await expect(note(page, "thr_c").getByTestId("nb-reply-count")).toHaveText("2 replies");

		const threads = await stored(request, id);
		expect(threads.find((t) => t.id === "thr_d")!.messages.map((m) => [m.author, m.state ?? "ok"])).toEqual([["ai", "ok"], ["user", "ok"], ["ai", "ok"]]);

		await page.reload();
		await expect(note(page, "thr_d").getByTestId("nb-reply-count")).toHaveText("2 replies", { timeout: 60_000 });
		await opener(page, "thr_d").click();
		await expect(note(page, "thr_d").locator("[data-author='user']")).toHaveText("Because nothing scales forever.\nNot even compute.");
		await expect(note(page, "thr_d").locator("[data-author='ai']").nth(1)).toContainText("Fair point.");
		await expect(note(page, "thr_d").locator(".nb-ink-word")).toHaveCount(0);
	});

	test("a draft he did not send stays when the thread closes", async ({ page, request }) => {
		await openSeeded(page, request, "Draft");
		await opener(page, "thr_b").click();
		await note(page, "thr_b").getByTestId("nb-write-back").fill("Half a thought");
		// Escape with words in the field leaves the field first; the second closes the thread.
		await page.keyboard.press("Escape");
		await expect(note(page, "thr_b")).toHaveAttribute("data-state", "open");
		await page.keyboard.press("Escape");
		await expect(note(page, "thr_b")).toHaveAttribute("data-state", "collapsed");
		await opener(page, "thr_b").click();
		await expect(note(page, "thr_b").getByTestId("nb-write-back")).toHaveValue("Half a thought");
	});

	test("resolve leaves the page with Undo for 6 s; dismiss too; both persist", async ({ page, request }) => {
		const id = await openSeeded(page, request, "Resolve");
		await opener(page, "thr_a").click();
		await note(page, "thr_a").getByRole("button", { name: "Resolve" }).click();
		const line = note(page, "thr_a").getByTestId("nb-thread-status");
		await expect(line).toContainText("Resolved. It’s still in exports.");
		await expect(page.locator(".nb-anchor[data-thread='thr_a']")).toHaveCount(0);
		await expect(line.getByRole("button", { name: "Undo" })).toBeFocused();
		await expect.poll(async () => (await stored(request, id)).find((t) => t.id === "thr_a")!.status).toBe("resolved");

		// Undo brings it back, open again on the server.
		await line.getByRole("button", { name: "Undo" }).click();
		await expect(note(page, "thr_a")).toHaveAttribute("data-state", "collapsed");
		await expect(page.locator(".nb-anchor[data-thread='thr_a']")).toHaveCount(1);
		await expect.poll(async () => (await stored(request, id)).find((t) => t.id === "thr_a")!.status).toBe("open");

		// Resolve again and let the 6 s pass: the note is gone.
		await opener(page, "thr_a").click();
		await note(page, "thr_a").getByRole("button", { name: "Resolve" }).click();
		await expect(note(page, "thr_a").getByTestId("nb-thread-status")).toBeVisible();
		await expect(note(page, "thr_a")).toHaveCount(0, { timeout: 9_000 });

		await opener(page, "thr_b").click();
		await note(page, "thr_b").getByRole("button", { name: "Dismiss" }).click();
		await expect(note(page, "thr_b").getByTestId("nb-thread-status")).toContainText("Dismissed.");
		await expect.poll(async () => (await stored(request, id)).find((t) => t.id === "thr_b")!.status).toBe("dismissed");

		await page.reload();
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(2, { timeout: 60_000 });
		await expect(note(page, "thr_a")).toHaveCount(0);
		await expect(note(page, "thr_b")).toHaveCount(0);
	});

	test("layouts: Both margins, Right margin, Marks only", async ({ page, request }) => {
		const id = await openSeeded(page, request, "Layouts");
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(4, { timeout: 30_000 });
		const sides = () => page.getByTestId("nb-margin-note").evaluateAll((els) => Object.fromEntries(els.map((el) => [(el as HTMLElement).dataset.thread, (el as HTMLElement).dataset.side])));
		expect(await sides()).toEqual({ thr_a: "left", thr_b: "right", thr_c: "left", thr_d: "left" });
		await expect(page.getByTestId("nb-mark")).toHaveCount(0);

		await putSection(request, "notebook", { layout: "right" });
		await page.reload();
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(4, { timeout: 60_000 });
		expect(await sides()).toEqual({ thr_a: "right", thr_b: "right", thr_c: "right", thr_d: "right" });

		await putSection(request, "notebook", { layout: "marks" });
		await page.reload();
		await expect(page.getByTestId("nb-mark")).toHaveCount(4, { timeout: 60_000 });
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(0);
		const mark = page.getByRole("button", { name: "Open question about “college is becoming increasingly worthless with…”" });
		await expect(mark).toHaveText("?");
		// The "?" sits right after its passage.
		const passage = (await page.locator(".nb-anchor[data-thread='thr_a']").boundingBox())!;
		const box = (await mark.boundingBox())!;
		expect(box.x).toBeGreaterThan(passage.x + passage.width - 1);
		expect(Math.abs(box.y + box.height / 2 - (passage.y + passage.height / 2))).toBeLessThan(8);

		await mark.click();
		const inline = page.locator("[data-thread='thr_a'][data-testid='nb-inline-reply']");
		await expect(inline).toHaveAttribute("data-state", "open");
		await expect(inline.getByTestId("nb-write-back")).toBeFocused();
		// Under its paragraph, pushing the text below down.
		const item = page.locator(".nb-prose li p", { hasText: Q.a });
		const next = page.locator(".nb-prose li", { hasText: Q.b });
		const i = (await item.boundingBox())!, r = (await inline.boundingBox())!, n = (await next.boundingBox())!;
		expect(r.y).toBeGreaterThan(i.y + i.height - 1);
		expect(n.y).toBeGreaterThan(r.y + r.height - 1);
		await page.keyboard.press("Escape");
		await expect(inline).toHaveCount(0);
		await expect(page.getByTestId("nb-editor")).toBeFocused();
		void id;
	});

	test("opening the sidebar slides the page but keeps every note on its side", async ({ page, request }) => {
		await page.setViewportSize({ width: 1665, height: 962 });
		await openSeeded(page, request, "Sidebar sides");
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(4, { timeout: 30_000 });
		const sides = () => page.getByTestId("nb-margin-note").evaluateAll((els) => Object.fromEntries(els.map((el) => [(el as HTMLElement).dataset.thread, (el as HTMLElement).dataset.side])));
		const before = await sides();
		expect(before).toEqual({ thr_a: "left", thr_b: "right", thr_c: "left", thr_d: "left" });
		await page.getByTestId("nb-menu-button").filter({ visible: true }).click();
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await page.waitForTimeout(600);
		expect(await sides()).toEqual(before);
	});

	test("390 px wide: always marks, opening inline", async ({ page, request }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openSeeded(page, request, "Phone");
		await expect(page.getByTestId("nb-mark")).toHaveCount(4, { timeout: 60_000 });
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(0);
		await page.getByTestId("nb-mark").nth(2).click();
		const inline = page.locator("[data-thread='thr_c'][data-testid='nb-inline-reply']");
		await expect(inline).toHaveAttribute("data-state", "open");
		const box = (await inline.boundingBox())!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(390);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
		await inline.getByTestId("nb-write-back").fill("Over time.");
		await inline.getByRole("button", { name: "Send" }).click();
		await expect(inline.locator("[data-author='ai']").nth(1)).toContainText("Fair point.", { timeout: 15_000 });
	});

	test("a thread whose words are gone stacks at the top of the right margin, and still opens", async ({ page, request }) => {
		const threads = [...seeded().slice(0, 2), seedThread("thr_gone", "a sentence he deleted long ago", "left", ["Was this ever true?"])];
		await openSeeded(page, request, "Detached", threads);
		const gone = note(page, "thr_gone");
		await expect(gone).toBeVisible({ timeout: 30_000 });
		await expect(gone).toHaveAttribute("data-side", "right");
		await expect(gone).toContainText("The words this was about are gone.");
		const top = (await gone.boundingBox())!.y;
		const other = (await note(page, "thr_b").boundingBox())!.y;
		expect(top).toBeLessThan(other);
		await opener(page, "thr_gone").click();
		await expect(gone).toHaveAttribute("data-state", "open");
		// No passage to go back to: Escape returns to its button.
		await page.keyboard.press("Escape");
		await expect(opener(page, "thr_gone")).toBeFocused();
	});

	test("keyboard: Mod+Alt+↓ to a note, Enter opens it, type, Enter sends, Escape back to the passage", async ({ page, request }) => {
		await openSeeded(page, request, "Keys");
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(4, { timeout: 30_000 });
		await page.locator(".nb-prose li", { hasText: Q.c }).click();
		await page.keyboard.press("Control+Alt+ArrowDown");
		await expect(opener(page, "thr_d")).toBeFocused();
		await page.keyboard.press("Control+Alt+ArrowUp");
		await expect(opener(page, "thr_c")).toBeFocused();
		await page.keyboard.press("Control+Alt+ArrowUp");
		await expect(opener(page, "thr_b")).toBeFocused();
		await page.keyboard.press("Enter");
		const field = note(page, "thr_b").getByTestId("nb-write-back");
		await expect(field).toBeFocused();
		await page.keyboard.type("The owners, mostly.");
		await page.keyboard.press("Enter");
		await expect(note(page, "thr_b").locator("[data-author='ai']").nth(1)).toContainText("generalise.", { timeout: 15_000 });
		await expect(page.getByTestId("nb-live")).toHaveText("Reply ready.");
		await page.keyboard.press("Escape");
		await expect(note(page, "thr_b")).toHaveAttribute("data-state", "collapsed");
		await expect(page.getByTestId("nb-editor")).toBeFocused();
		// The caret is back at the passage.
		const caret = await page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? "");
		expect(caret).toContain("AI will create a huge economic gap");
		// From the first note, Mod+Alt+↑ goes back to the body.
		await page.keyboard.press("Control+Alt+ArrowDown");
		await expect(opener(page, "thr_b")).toBeFocused();
		await page.keyboard.press("Control+Alt+ArrowUp");
		await expect(opener(page, "thr_a")).toBeFocused();
		await page.keyboard.press("Control+Alt+ArrowUp");
		await expect(page.getByTestId("nb-editor")).toBeFocused();
	});
});
