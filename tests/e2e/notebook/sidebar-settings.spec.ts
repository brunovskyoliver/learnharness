import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, US8 (T043): the sidebar footer (every action by click and by
// shortcut, the open-thread dots), the settings modal (every setting applies
// live and persists, keyboard only, a failed save), and the pointer's ink.

const CONTENT = "Entropy always rises in a closed system.\n\nSo a cup of tea cools down.\n";
const AT = "2026-11-06T10:00:00.000Z";
const THREAD = {
	id: "thr_l", anchor: { quote: "closed system", prefix: "", suffix: "" }, placement: "margin", side: "left", status: "open", origin: "read", createdAt: AT, updatedAt: AT,
	messages: [{ id: "msg_l", author: "ai", text: "Closed to what, exactly?", at: AT }],
};

async function settingsRecord(request: APIRequestContext): Promise<Record<string, Record<string, unknown>>> {
	const read = await request.get("/api/settings");
	return ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
}
async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const record = await settingsRecord(request);
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}
const stored = async (request: APIRequestContext) => (await settingsRecord(request)).notebook ?? {};

async function seededNote(request: APIRequestContext, name: string, threads: unknown[] = [THREAD]): Promise<string> {
	const response = await request.post("/api/library/pages", { data: { name: `${name} ${Date.now()}`, content: CONTENT } });
	expect(response.ok()).toBeTruthy();
	const id = ((await response.json()) as { item: { id: string } }).item.id;
	const dir = path.join(process.env.LH_E2E_DATA_DIR!, "library", "notebook");
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ v: 1, pageId: id, instruction: "", threads, chat: [] }));
	return id;
}

const root = (page: Page) => page.getByTestId("notebook-root").filter({ visible: true });

async function open(page: Page, id: string) {
	await page.goto(`/notebook/${id}`);
	await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });
}
async function openSidebar(page: Page) {
	await page.getByTestId("nb-menu-button").filter({ visible: true }).click();
	await expect(page.getByTestId("nb-sidebar")).toBeVisible();
}
async function openSettings(page: Page) {
	await openSidebar(page);
	await page.getByTestId("nb-side-settings").click();
	const dialog = page.getByTestId("nb-settings");
	await expect(dialog).toBeVisible();
	return dialog;
}
const cssVar = (page: Page, name: string) => root(page).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test.describe("Notebook: sidebar and settings", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "notebook" });
		await putSection(request, "notebook", { appearance: "light", startMode: "thinks", pace: "regular", layout: "both", textSize: "default", lettering: "serif", ink: "ink", pointerInk: false });
		await page.setViewportSize({ width: 1665, height: 962 });
	});

	test("the footer: every action by click, with its shortcut shown; a dot on notes with open threads", async ({ page, request, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const id = await seededNote(request, "Footer");
		const quiet = await seededNote(request, "Quiet", []);
		await open(page, id);
		await openSidebar(page);

		// Shortcut hints (Ctrl on this platform), right-aligned in faint ink.
		for (const [row, keys] of [["nb-side-copy", "Ctrl+Shift+C"], ["nb-side-export", "Ctrl+Shift+E"], ["nb-side-plain", "Ctrl+Shift+H"], ["nb-side-settings", "Ctrl+,"], ["nb-switch-to-study", "Ctrl+Shift+O"]] as const) {
			await expect(page.getByTestId(row).locator("kbd")).toHaveText(keys);
		}
		const hint = page.getByTestId("nb-side-copy").locator("kbd");
		const [rowBox, kbdBox] = [await page.getByTestId("nb-side-copy").boundingBox(), await hint.boundingBox()];
		expect(rowBox!.x + rowBox!.width - (kbdBox!.x + kbdBox!.width)).toBeLessThan(10);
		await expect(page.getByTestId("nb-side-reviewers").locator("kbd")).toHaveCount(0);

		// The dot: this note has an open thread, the quiet one has none.
		const rows = page.getByTestId("nb-side-note");
		await expect(rows.filter({ hasText: "Footer" }).getByTestId("nb-side-dot")).toBeVisible();
		await expect(rows.filter({ hasText: "Quiet" }).getByTestId("nb-side-dot")).toHaveCount(0);
		expect(quiet).toBeTruthy();

		// Copy this note.
		await page.getByTestId("nb-side-copy").click();
		await expect(page.getByTestId("nb-live")).toHaveText("Copied.");
		const copied = await page.evaluate(() => navigator.clipboard.readText());
		expect(copied).toContain("Entropy always rises in a closed system.");
		expect(copied).toContain("Closed to what, exactly?");

		// Just my words: toggles and shows its state.
		const plain = page.getByTestId("nb-side-plain");
		await expect(plain).toHaveAttribute("aria-pressed", "false");
		await plain.click();
		await expect(plain).toHaveAttribute("aria-pressed", "true");
		await expect(root(page)).toHaveAttribute("data-plain", "");
		await plain.click();
		await expect(plain).toHaveAttribute("aria-pressed", "false");
		await expect(root(page)).not.toHaveAttribute("data-plain", "");

		// Settings, over the open sidebar; Escape closes it first, then the sidebar.
		await page.getByTestId("nb-side-settings").click();
		const settings = page.getByTestId("nb-settings");
		await expect(settings).toBeVisible();
		await expect(settings.getByTestId("nb-settings-nav-customize")).toHaveAttribute("aria-selected", "true");
		await expect(settings.getByRole("heading", { name: "Customize" })).toBeVisible();
		// The backdrop dims the open sidebar too (frame sidebar-and-settings).
		const over = await page.getByTestId("nb-sidebar").evaluate((side) => {
			const box = side.getBoundingClientRect();
			return document.elementFromPoint(box.left + 40, box.top + 120)?.getAttribute("data-testid");
		});
		expect(over).toBe("nb-settings-backdrop");
		await page.keyboard.press("Escape");
		await expect(settings).toBeHidden();
		await expect(page.getByTestId("nb-side-settings")).toBeFocused();
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();

		// Reviewers: the settings modal on its Reviewers page.
		await page.getByTestId("nb-side-reviewers").click();
		await expect(settings.getByTestId("nb-settings-nav-reviewers")).toHaveAttribute("aria-selected", "true");
		await expect(settings.getByTestId("nb-reviewer-row")).toHaveCount(5);
		await page.keyboard.press("Escape");
		await expect(settings).toBeHidden();

		// Links: the sidebar closes and the Links panel opens; Escape gives the focus back to ☰.
		await page.getByTestId("nb-side-links").click();
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		await expect(page.getByTestId("nb-links-panel")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-links-panel")).toBeHidden();
		await expect(page.getByTestId("nb-menu-button").filter({ visible: true })).toBeFocused();

		// Export this note: the sidebar closes and the dialog opens.
		await openSidebar(page);
		await page.getByTestId("nb-side-export").click();
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		await expect(page.getByTestId("nb-export-dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-export-dialog")).toBeHidden();

		// Make flashcards: Study's card drafting for this whole note (saved first).
		await openSidebar(page);
		await page.getByTestId("nb-side-flashcards").click();
		await expect(page).toHaveURL(new RegExp(`/review\\?make=page%3A${id}$`), { timeout: 60_000 });

		// Switch to Study, and back.
		await open(page, id);
		await openSidebar(page);
		await page.getByTestId("nb-switch-to-study").click();
		await expect(page).not.toHaveURL(/\/notebook/, { timeout: 60_000 });
		await expect.poll(async () => (await settingsRecord(request)).general?.interface).toBe("study");
	});

	test("every footer shortcut, and Mod+, opens Settings on notebook routes only", async ({ page, request, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const id = await seededNote(request, "Keys");
		await open(page, id);
		await page.getByTestId("nb-editor").locator("p").first().click();

		await page.keyboard.press("Control+Shift+C");
		await expect(page.getByTestId("nb-live")).toHaveText("Copied.");
		expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Closed to what, exactly?");

		await page.keyboard.press("Control+Shift+H");
		await expect(root(page)).toHaveAttribute("data-plain", "");
		await page.keyboard.press("Control+Shift+H");
		await expect(root(page)).not.toHaveAttribute("data-plain", "");

		await page.keyboard.press("Control+Shift+E");
		await expect(page.getByTestId("nb-export-dialog")).toBeVisible();
		await page.keyboard.press("Escape");

		await page.keyboard.press("Control+,");
		const settings = page.getByTestId("nb-settings");
		await expect(settings).toBeVisible();
		await expect(settings.getByTestId("nb-settings-nav-customize")).toHaveAttribute("aria-selected", "true");
		// One settings modal for both modes (feature 025): no second dialog opens with it.
		await expect(page.getByTestId("nb-settings")).toHaveCount(1);
		await expect(page.getByTestId("settings-dialog")).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(settings).toBeHidden();

		await page.keyboard.press("Control+Shift+O");
		await expect(page).not.toHaveURL(/\/notebook/, { timeout: 60_000 });
		// The modal stays shut across the switch (it opens again only when asked).
		await expect(page.getByTestId("nb-settings")).toHaveCount(0);
	});

	test("every setting applies at once and survives a reload", async ({ page, request }) => {
		const id = await seededNote(request, "Settings");
		await open(page, id);
		// By key, so the page is not moved aside by the sidebar (that narrows the right margin).
		await page.getByTestId("nb-editor").locator("p").first().click();
		await page.keyboard.press("Control+,");
		const dialog = page.getByTestId("nb-settings");
		await expect(dialog).toBeVisible();
		// Default: the left thread sits on the left.
		await expect(page.getByTestId("nb-margin-note")).toHaveAttribute("data-side", "left");

		await dialog.getByTestId("nb-set-appearance-dark").click();
		await expect(root(page)).toHaveAttribute("data-nb-theme", "dark");
		expect(await cssVar(page, "--paper")).toBe("#1a1a19");

		await dialog.getByTestId("nb-set-textSize-large").click();
		await expect(root(page)).toHaveAttribute("data-nb-text-size", "large");
		expect(await cssVar(page, "--note-size")).toBe("18px");

		await dialog.getByTestId("nb-set-lettering-plain").click();
		await expect(root(page)).toHaveAttribute("data-nb-lettering", "plain");
		await expect(page.locator(".nb-note-text.nb-voice").first()).toHaveCSS("font-family", /Instrument/i);

		await dialog.getByTestId("nb-set-ink-blue").click();
		await expect(root(page)).toHaveAttribute("data-nb-ink", "blue");
		expect(await cssVar(page, "--riddle")).toBe("#84afe3");

		await dialog.getByTestId("nb-set-layout-right").click();
		await expect(page.getByTestId("nb-margin-note")).toHaveAttribute("data-side", "right");
		await dialog.getByTestId("nb-set-layout-marks").click();
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(0);
		await expect(page.locator(".nb-mark")).toHaveCount(1);

		await dialog.getByTestId("nb-set-pace-slow").click();
		await dialog.getByTestId("nb-set-startMode-ask").click();
		for (const field of ["appearance", "textSize", "lettering", "ink", "layout", "pace", "startMode"]) {
			await expect(dialog.getByTestId(`nb-set-${field}`).locator('[aria-checked="true"]')).toHaveCount(1);
		}
		await expect.poll(async () => stored(request)).toMatchObject({ appearance: "dark", textSize: "large", lettering: "plain", ink: "blue", layout: "marks", pace: "slow", startMode: "ask" });

		await page.reload();
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
		await expect(root(page)).toHaveAttribute("data-nb-theme", "dark");
		await expect(root(page)).toHaveAttribute("data-nb-text-size", "large");
		await expect(root(page)).toHaveAttribute("data-nb-lettering", "plain");
		await expect(root(page)).toHaveAttribute("data-nb-ink", "blue");
		await expect(page.locator(".nb-mark")).toHaveCount(1);
		const again = await openSettings(page);
		await expect(again.getByTestId("nb-set-pace-slow")).toHaveAttribute("aria-checked", "true");
		await expect(again.getByTestId("nb-set-startMode-ask")).toHaveAttribute("aria-checked", "true");
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");

		// The start mode applies to a NEW note.
		await openSidebar(page);
		await page.getByTestId("nb-new-note").click();
		await expect(page).not.toHaveURL(new RegExp(id), { timeout: 60_000 });
		await expect(page.getByTestId("nb-mode-picker").filter({ visible: true })).toHaveAttribute("data-mode", "ask", { timeout: 60_000 });
	});

	test("New notes start in: only new notes take it; an older note keeps the mode it opened with", async ({ page, request }) => {
		const companionMode = async (id: string) => ((await (await request.get(`/api/notebook/${id}`)).json()) as { companion: { mode?: string } }).companion.mode;
		// A page made elsewhere and never opened here has no mode; its first open here stamps the start mode.
		const old = await seededNote(request, "Older", []);
		expect(await companionMode(old)).toBeUndefined();
		await open(page, old);
		await expect(page.getByTestId("nb-mode-picker")).toHaveAttribute("data-mode", "thinks");
		await expect.poll(() => companionMode(old)).toBe("thinks");

		const dialog = await openSettings(page);
		await dialog.getByTestId("nb-set-startMode-ask").click();
		await expect.poll(async () => (await stored(request)).startMode).toBe("ask");
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");

		// The open note and, after a reload, the older note keep "Thinks with you".
		await page.reload();
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
		await expect(page.getByTestId("nb-mode-picker").filter({ visible: true })).toHaveAttribute("data-mode", "thinks");
		expect(await companionMode(old)).toBe("thinks");

		// A new note from the sidebar starts in "When you ask", and keeps it when the setting changes back.
		await openSidebar(page);
		await page.getByTestId("nb-new-note").click();
		await expect(page).not.toHaveURL(new RegExp(old), { timeout: 60_000 });
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
		const made = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
		await expect(page.getByTestId("nb-mode-picker").filter({ visible: true })).toHaveAttribute("data-mode", "ask");
		await expect.poll(() => companionMode(made)).toBe("ask");
		await putSection(request, "notebook", { startMode: "thinks" });
		await page.reload();
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
		await expect(page.getByTestId("nb-mode-picker").filter({ visible: true })).toHaveAttribute("data-mode", "ask");
	});

	test("reading pace: Regular reads after about 1.6 s, Slow after about 3.2 s", async ({ page, request }) => {
		const timing = async () => {
			const response = await request.post("/api/library/pages", { data: { name: `Pace ${Date.now()}`, content: "" } });
			const pageId = ((await response.json()) as { item: { id: string } }).item.id;
			await open(page, pageId);
			await page.getByTestId("nb-editor").click();
			await page.keyboard.type("Entropy always rises in a closed system.");
			const typed = Date.now();
			const run = await page.waitForRequest((r) => r.method() === "POST" && /\/api\/notebook\/[^/]+\/runs$/.test(r.url()), { timeout: 15_000 });
			expect(run).toBeTruthy();
			return Date.now() - typed;
		};
		const regular = await timing();
		expect(regular).toBeGreaterThan(1200);
		expect(regular).toBeLessThan(3000);
		await putSection(request, "notebook", { pace: "slow" });
		const slow = await timing();
		expect(slow).toBeGreaterThan(3000);
		expect(slow).toBeLessThan(6000);
	});

	test("keyboard only: open, move through the cards with arrows, change, close, focus back", async ({ page, request }) => {
		const id = await seededNote(request, "Keyboard");
		await open(page, id);
		await page.getByTestId("nb-editor").locator("p").first().click();
		await page.keyboard.press("Control+,");
		const dialog = page.getByTestId("nb-settings");
		await expect(dialog.getByTestId("nb-settings-nav-customize")).toBeFocused();
		// Arrow down to the Reviewers page and back.
		await page.keyboard.press("ArrowDown");
		await expect(dialog.getByTestId("nb-settings-nav-reviewers")).toHaveAttribute("aria-selected", "true");
		await expect(dialog.getByTestId("nb-reviewer-new")).toBeVisible();
		await page.keyboard.press("ArrowUp");
		await expect(dialog.getByTestId("nb-settings-nav-customize")).toHaveAttribute("aria-selected", "true");
		// Tab: the page (its tab panel), the close button, then the first group's chosen card.
		await page.keyboard.press("Tab");
		await expect(dialog.getByTestId("nb-settings-customize")).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(dialog.getByTestId("nb-settings-close")).toBeFocused();
		await page.keyboard.press("Tab");
		// Feature 025: the shared Appearance comes first, Notebook's own options after it.
		const light = dialog.getByTestId("nb-set-appearance-light");
		await expect(light).toBeFocused();
		const outline = await light.evaluate((el) => getComputedStyle(el).outlineStyle);
		expect(outline).toBe("solid");
		// Text size, lettering and ink, then "New notes start in".
		for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
		const thinks = dialog.getByTestId("nb-set-startMode-thinks");
		await expect(thinks).toBeFocused();
		await page.keyboard.press("ArrowRight");
		await expect(dialog.getByTestId("nb-set-startMode-ask")).toBeFocused();
		await expect(dialog.getByTestId("nb-set-startMode-ask")).toHaveAttribute("aria-checked", "true");
		await expect.poll(async () => (await stored(request)).startMode).toBe("ask");
		// The switch: Tab to it, Space turns the pointer ink on.
		await page.keyboard.press("Tab");
		await expect(dialog.getByTestId("nb-set-pointerInk")).toBeFocused();
		await page.keyboard.press("Space");
		await expect(dialog.getByTestId("nb-set-pointerInk")).toHaveAttribute("aria-checked", "true");
		await expect.poll(async () => (await stored(request)).pointerInk).toBe(true);
		// Focus stays inside while open.
		for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
		expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="nb-settings"]'))).toBe(true);
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(page.locator(".ProseMirror").filter({ visible: true })).toBeFocused();
	});

	test("a failed save says so and Try again stores it", async ({ page, request }) => {
		const id = await seededNote(request, "Fail");
		await open(page, id);
		const dialog = await openSettings(page);
		await page.route("**/api/settings/notebook", (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 500, body: "{}" }) : route.continue()));
		await dialog.getByTestId("nb-set-textSize-small").click();
		// It still applies here.
		await expect(root(page)).toHaveAttribute("data-nb-text-size", "small");
		await expect(dialog.getByTestId("nb-settings-problem")).toContainText("That change wasn’t saved.");
		await page.unroute("**/api/settings/notebook");
		await dialog.getByTestId("nb-settings-retry").click();
		await expect(dialog.getByTestId("nb-settings-problem")).toHaveCount(0);
		await expect.poll(async () => (await stored(request)).textSize).toBe("small");
	});

	test("pointer ink: off means no canvas; on draws drops where the pointer moves", async ({ page, request }) => {
		const id = await seededNote(request, "Ink", []);
		await open(page, id);
		await expect(page.getByTestId("nb-pointer-ink")).toHaveCount(0);
		const dialog = await openSettings(page);
		await dialog.getByTestId("nb-set-pointerInk").click();
		await expect(page.getByTestId("nb-pointer-ink")).toHaveCount(1);
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await page.mouse.move(200, 500);
		for (let x = 200; x <= 1400; x += 40) await page.mouse.move(x, 500 + (x % 80));
		const inked = await page.getByTestId("nb-pointer-ink").evaluate((canvas: HTMLCanvasElement) => {
			const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
			let painted = 0;
			for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) painted++;
			return painted;
		});
		expect(inked).toBeGreaterThan(0);
		await expect.poll(async () => (await stored(request)).pointerInk).toBe(true);

		// Reduced motion: no canvas even while it is on.
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(page.getByTestId("nb-pointer-ink")).toHaveCount(0);
		await page.emulateMedia({ reducedMotion: "no-preference" });

		const off = await openSettings(page);
		await off.getByTestId("nb-set-pointerInk").click();
		await expect(page.getByTestId("nb-pointer-ink")).toHaveCount(0);
		await expect.poll(async () => (await stored(request)).pointerInk).toBe(false);
	});
});
