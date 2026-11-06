import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, US2 (T025): it thinks with you. The faux engine answers a
// read with a margin question on the note's first sentence after
// LH_NOTEBOOK_FAUX_MS (1500 ms in playwright.config.ts).

const CLAIM = "Entropy always rises in a closed system. So a cup of tea cools down.";
const FIRST = "Entropy always rises in a closed system.";

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}

async function newNote(request: APIRequestContext, name: string): Promise<string> {
	const response = await request.post("/api/library/pages", { data: { name: `${name} ${Date.now()}`, content: "" } });
	expect(response.ok()).toBeTruthy();
	return ((await response.json()) as { item: { id: string } }).item.id;
}

async function companionThreads(request: APIRequestContext, id: string) {
	const body = (await (await request.get(`/api/notebook/${id}`)).json()) as { companion: { threads: { id: string; messages: { runId?: string; text: string }[] }[] } };
	return body.companion.threads;
}

async function openNote(page: Page, id: string) {
	await page.goto(`/notebook/${id}`);
	await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });
	await page.getByTestId("nb-editor").click();
}

/** Writes a companion file straight into the test server's data dir (playwright.config.ts). */
function seedCompanion(pageId: string, threads: unknown[]) {
	const dir = path.join(process.env.LH_E2E_DATA_DIR!, "library", "notebook");
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, `${pageId}.json`), JSON.stringify({ v: 1, pageId, instruction: "", threads, chat: [] }));
}

const AT = "2026-11-06T10:00:00.000Z";
const seedThread = (id: string, quote: string, side: "left" | "right", texts: string[], extra: Record<string, unknown> = {}) => ({
	id, anchor: { quote, prefix: "", suffix: "" }, placement: "margin", side, status: "open", origin: "read", createdAt: AT, updatedAt: AT,
	messages: texts.map((text, i) => ({ id: `msg_${id}_${i}`, author: i % 2 ? "user" : "ai", text, at: AT })),
	...extra,
});

const isRunPost = (url: string, method: string) => method === "POST" && /\/api\/notebook\/[^/]+\/runs$/.test(url);

test.describe("Notebook: it thinks with you", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "notebook" });
		await putSection(request, "notebook", { appearance: "light", startMode: "thinks", pace: "regular", layout: "both" });
		await page.setViewportSize({ width: 1440, height: 962 });
	});

	test("a pause reads: underline and blot, then a margin question inks in with its tether; reload keeps it", async ({ page, request }) => {
		const id = await newNote(request, "Thermo");
		await openNote(page, id);
		await page.keyboard.type(CLAIM);

		// The read shows in the corner with its cost and Stop (constitution V).
		const running = page.getByTestId("nb-hint-running");
		await expect(running).toBeVisible({ timeout: 5_000 });
		await expect(running).toContainText("Reading…");
		await expect(page.getByTestId("nb-hint-cost")).toHaveText("cost not known");
		await expect(page.getByTestId("nb-hint-stop")).toHaveText("Stop");

		// The considered passage: pencil underline and the breathing blot.
		await expect(page.getByTestId("nb-reading-mark")).toBeVisible({ timeout: 10_000 });
		expect(await page.getByTestId("nb-pencil").locator("path").count()).toBeGreaterThanOrEqual(2);
		await expect(page.getByTestId("nb-live")).toHaveText("Reading this passage.");
		// The question waits until the marks have had their moment.
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(0);

		const note = page.getByTestId("nb-margin-note");
		await expect(note).toBeVisible({ timeout: 10_000 });
		await expect(note).toHaveAttribute("aria-roledescription", "note");
		await expect(note).toContainText("What would have to be true for");
		const words = note.locator(".nb-ink-word");
		expect(await words.count()).toBeGreaterThan(5);
		const delays = await words.evaluateAll((spans) => spans.map((s) => parseFloat(getComputedStyle(s).animationDelay)));
		expect(delays[1]!).toBeGreaterThan(delays[0]!);
		expect(await words.first().evaluate((s) => getComputedStyle(s).animationName)).toBe("nb-ink-word");
		await expect(page.getByTestId("nb-tether")).toHaveCount(1);
		await expect(page.locator(".nb-anchor[data-state='open']")).toHaveText(FIRST);
		await expect(page.getByTestId("nb-live")).toContainText("New question in the margin");
		await expect(page.getByTestId("nb-reading")).toHaveCount(0);
		await expect(page.getByTestId("nb-hint-running")).toHaveCount(0);

		// After a reload the question is still there, written plainly (no ink-in).
		await page.reload();
		await expect(page.getByTestId("nb-margin-note")).toBeVisible({ timeout: 60_000 });
		await expect(page.getByTestId("nb-margin-note")).toContainText("What would have to be true for");
		await expect(page.getByTestId("nb-margin-note").locator(".nb-ink-word")).toHaveCount(0);
		await expect(page.locator(".nb-anchor[data-state='open']")).toHaveText(FIRST);
	});

	test("typing while it reads stops that read; nothing it was writing lands", async ({ page, request }) => {
		const id = await newNote(request, "Interrupted");
		await openNote(page, id);
		const aborted: string[] = [];
		page.on("request", (req) => {
			if (req.method() === "POST" && req.url().endsWith("/api/activity/abort")) aborted.push((req.postDataJSON() as { id: string }).id);
		});
		const started = page.waitForResponse((res) => isRunPost(res.url(), res.request().method()));
		await page.keyboard.type(CLAIM);
		const first = ((await (await started).json()) as { run: { id: string } }).run.id;
		await expect(page.getByTestId("nb-hint-running")).toBeVisible();

		await page.keyboard.type(" It never runs backwards.");
		await expect.poll(() => aborted).toContain(first);
		await expect(page.getByTestId("nb-reading")).toHaveCount(0);

		// Long enough for the first run to have answered, had it not been stopped.
		await page.waitForTimeout(2_500);
		const threads = await companionThreads(request, id);
		expect(threads.filter((t) => t.messages[0]?.runId === first)).toHaveLength(0);
	});

	test("Stop in the corner hint ends the read and nothing lands", async ({ page, request }) => {
		const id = await newNote(request, "Stopped");
		await openNote(page, id);
		await page.keyboard.type(CLAIM);
		const stop = page.getByTestId("nb-hint-stop");
		await expect(stop).toBeVisible({ timeout: 5_000 });
		await stop.click();
		await expect(page.getByTestId("nb-hint-running")).toHaveCount(0);
		await expect(page.getByTestId("nb-corner-hint")).toContainText("finds a note");
		await page.waitForTimeout(2_500);
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(0);
		expect(await companionThreads(request, id)).toHaveLength(0);
	});

	test("the corner hint lists what is running, with Stop each", async ({ page, request }) => {
		const id = await newNote(request, "Listed");
		await openNote(page, id);
		await page.keyboard.type(CLAIM);
		await page.getByTestId("nb-hint-activity").click({ timeout: 5_000 });
		const row = page.getByTestId("nb-activity-row");
		await expect(row).toContainText("Reading · Listed");
		await expect(row).toContainText("cost not known");
		await row.getByRole("button", { name: /^Stop/ }).click();
		await expect(page.getByTestId("nb-activity-empty")).toHaveText("Nothing running.");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-activity")).toHaveCount(0);
	});

	test("When you ask: typing and pausing makes no call", async ({ page, request }) => {
		await putSection(request, "notebook", { startMode: "ask" });
		const id = await newNote(request, "Quiet");
		let posts = 0;
		await page.route(/\/api\/notebook\/[^/]+\/runs$/, (route) => {
			if (route.request().method() === "POST") posts++;
			return route.continue();
		});
		await openNote(page, id);
		await expect(page.getByTestId("nb-mode-picker")).toHaveAttribute("data-mode", "ask");
		await page.keyboard.type(CLAIM);
		await page.waitForTimeout(4_000);
		expect(posts).toBe(0);
		await expect(page.getByTestId("nb-hint-running")).toHaveCount(0);
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(0);
	});

	test("reduced motion: the same states, without the animations", async ({ page, request }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		const id = await newNote(request, "Still");
		await openNote(page, id);
		await page.keyboard.type(CLAIM);
		const note = page.getByTestId("nb-margin-note");
		await expect(note).toBeVisible({ timeout: 10_000 });
		await expect(note).toContainText("What would have to be true for");
		expect(await note.locator(".nb-ink-word").first().evaluate((s) => getComputedStyle(s).animationName)).toBe("none");
		expect(await note.getByTestId("nb-ink-dot").evaluate((s) => getComputedStyle(s).animationName)).toBe("none");
		const reveal = page.locator(".nb-tether-reveal").first();
		expect(await reveal.evaluate((s) => [getComputedStyle(s).animationName, getComputedStyle(s).strokeDashoffset])).toEqual(["none", "0px"]);
	});

	test("seeded notes: both margins without overlap, reply counts, an inline reply that moves the text below", async ({ page, request }) => {
		const content = "Video Ideas:\n\n1. college is becoming increasingly worthless with the advent of AI\n2. AI will create a huge economic gap\n3. AI is making people dumber\n4. LLMs will never become AGI\n\nCan you help me picture the paths through a grid?\n\nThe last line.\n";
		const created = await request.post("/api/library/pages", { data: { name: `Seeded ${Date.now()}`, content } });
		const id = ((await created.json()) as { item: { id: string } }).item.id;
		const sketch = {
			title: "How many ways to each cell?", w: 320, h: 240,
			items: [{ step: 0, kind: "grid", x: 70, y: 30, cols: 3, rows: 3, cell: 60 }, { step: 1, kind: "text", x: 100, y: 60, text: "1" }],
			steps: [{ caption: "Start with the grid." }, { caption: "Every other cell adds above and left.", note: "Above plus left." }],
		};
		seedCompanion(id, [
			seedThread("thr_a", "college is becoming increasingly worthless with the advent of AI", "left", ["If AI makes competent-looking code cheap, college could become more valuable as a signal employers use to distinguish candidates whose output now looks identical.", "I disagree.", "Why?"]),
			seedThread("thr_b", "AI will create a huge economic gap", "right", ["Who owns the systems?"]),
			seedThread("thr_c", "AI is making people dumber", "left", ["Doing less thinking isn't the same as becoming less capable of thinking. Which do you mean?", "The second.", "Then measure it."]),
			seedThread("thr_d", "LLMs will never become AGI", "left", ["“Never” requires showing a fundamental limit."]),
			seedThread("thr_e", "Can you help me picture the paths through a grid?", "right", ["Think of a grid where you start in the top-left corner.", ], { placement: "inline", messages: [{ id: "msg_e", author: "ai", text: "Think of a grid where you start in the top-left corner.", at: AT, sketch }] }),
		]);
		// Opening a note is not a pause in typing: no read starts on its own.
		let posts = 0;
		page.on("request", (req) => { if (isRunPost(req.url(), req.method())) posts++; });
		await page.goto(`/notebook/${id}`);
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(4, { timeout: 60_000 });

		const notes = await page.getByTestId("nb-margin-note").evaluateAll((els) => els.map((el) => {
			const r = el.getBoundingClientRect();
			return { id: (el as HTMLElement).dataset.thread!, side: (el as HTMLElement).dataset.side!, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
		}));
		const column = await page.getByTestId("nb-column").evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
		const left = notes.filter((n) => n.side === "left").sort((a, b) => a.top - b.top);
		expect(left.map((n) => n.id)).toEqual(["thr_a", "thr_c", "thr_d"]);
		for (let i = 1; i < left.length; i++) expect(left[i]!.top).toBeGreaterThanOrEqual(left[i - 1]!.bottom);
		for (const n of left) expect(Math.round(column.left - n.right)).toBe(59);
		const right = notes.find((n) => n.id === "thr_b")!;
		expect(right.side).toBe("right");
		expect(Math.round(right.left - column.right)).toBe(71);
		await expect(page.locator("[data-thread='thr_a'] [data-testid='nb-reply-count']")).toHaveText("2 replies");
		await expect(page.locator("[data-thread='thr_d'] [data-testid='nb-reply-count']")).toHaveCount(0);
		// Old notes show no tether until the pointer is on one; then the faint one.
		await expect(page.getByTestId("nb-tether")).toHaveCount(0);
		await page.locator("[data-thread='thr_a'][data-testid='nb-margin-note']").hover();
		await expect(page.locator("[data-testid='nb-tether'].nb-tether-faint[data-thread='thr_a']")).toHaveCount(1);

		const inline = page.getByTestId("nb-inline-reply");
		await expect(inline).toBeVisible();
		await expect(inline.getByTestId("nb-sketch")).toBeVisible();
		const asked = page.locator(".nb-prose p", { hasText: "Can you help me picture" });
		const after = page.locator(".nb-prose p", { hasText: "The last line." });
		const box = { asked: (await asked.boundingBox())!, reply: (await inline.boundingBox())!, after: (await after.boundingBox())! };
		expect(box.reply.y).toBeGreaterThan(box.asked.y + box.asked.height);
		// The paragraph below keeps its 1.05em gap under the reply.
		expect(box.after.y).toBeGreaterThanOrEqual(box.reply.y + box.reply.height + 10);
		const indent = await inline.locator(".nb-inline-text").evaluate((el) => el.getBoundingClientRect().left);
		expect(Math.round(indent - column.left)).toBe(22);
		// His page is unchanged: the reply is not in the text.
		const stored = (await (await request.get(`/api/library/pages/${id}`)).json()) as { head: { content: string } };
		expect(stored.head.content).toBe(content);
		await page.waitForTimeout(2_000);
		expect(posts).toBe(0);
	});
});
