import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { GitRemote, skipReason } from "../../fixtures/git-remote";
import { chatView, clearStudyKey, createPage, hydrated, interceptModel, noPageOverflow, openChat, openSidebar, seedReferenceLesson, studySettings, visible, type ReferenceLesson } from "./helpers";

// Feature 027, US1 (T032, T055, T056): chips in sent messages and reference
// rows open the Library's full view at the passage; the Back pill and the
// browser's Back return to the same message, scroll and chip.
// Set LH_SHOTS_DIR to save screenshots.

const shots = process.env.LH_SHOTS_DIR;
async function shot(page: Page, name: string) {
	if (!shots) return;
	mkdirSync(shots, { recursive: true });
	await page.waitForTimeout(400);
	await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

const chipsOf = (page: Page, lesson: ReferenceLesson, key: keyof ReferenceLesson["messages"]) =>
	chatView(page, lesson.chatId).locator(`[data-ref-chip^="${lesson.messages[key]}:"][data-testid="ref-chip"]`);
const scrollTop = (page: Page, chatId: string) => page.evaluate((id) => {
	const view = [...document.querySelectorAll(`[data-chat-id="${id}"]`)].find((el) => el.getClientRects().length > 0);
	const main = view?.querySelector<HTMLElement>("[data-session-restored]") ?? [...(view?.querySelectorAll<HTMLElement>("*") ?? [])].find((el) => el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== "visible");
	return main?.scrollTop ?? -1;
}, chatId);
const focusedChip = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.refChip ?? null);
const fullView = (page: Page) => visible(page, '[data-testid="library-full-view"]');
const pill = (page: Page) => visible(page, '[data-testid="back-pill"]');

/** Click a chip so the lesson stays scrolled where it was, and remember where. */
async function clickChip(page: Page, lesson: ReferenceLesson, chip: ReturnType<typeof chipsOf>) {
	await chip.scrollIntoViewIfNeeded();
	// Let the transcript settle (its arrival scroll, late fonts) before measuring.
	let before = await scrollTop(page, lesson.chatId);
	for (let i = 0; i < 20; i++) {
		await page.waitForTimeout(250);
		const now = await scrollTop(page, lesson.chatId);
		if (now === before) break;
		before = now;
		await chip.scrollIntoViewIfNeeded();
	}
	const key = await chip.getAttribute("data-ref-chip");
	await chip.click();
	// The first visit compiles /library in dev.
	await expect(page).toHaveURL(/\/library\?/, { timeout: 60_000 });
	return { before, key };
}

async function expectReturned(page: Page, lesson: ReferenceLesson, from: { before: number; key: string | null }) {
	await expect(page).toHaveURL(new RegExp(`/chat/${lesson.chatId}$`));
	await expect(chatView(page, lesson.chatId)).toBeVisible();
	await expect.poll(() => focusedChip(page), { timeout: 10_000 }).toBe(from.key);
	expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle), "a visible focus ring").toBe("solid");
	// Within one line height of where he was (SC-002).
	const line = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".lh-user-turn .lh-prose") ?? document.body).lineHeight) || 24);
	expect(Math.abs((await scrollTop(page, lesson.chatId)) - from.before)).toBeLessThanOrEqual(line);
	await expect(page.locator('[data-testid="back-pill"]').filter({ visible: true })).toHaveCount(0);
}

let remote: GitRemote | undefined;

test.describe("Study: reference chips in sent messages", () => {
	test.beforeAll(async () => {
		if (!skipReason()) remote = await GitRemote.start();
	});
	test.afterAll(async () => { await remote?.close(); remote = undefined; });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
		await interceptModel(page);
	});
	test.afterEach(async ({ request }) => { await clearStudyKey(request); });

	test("sent: every form renders as a chip, with its state and accessible name", async ({ page, request }) => {
		test.setTimeout(240_000);
		const lesson = await seedReferenceLesson(request, { remote });
		await openChat(page, lesson.chatId);
		const whole = chipsOf(page, lesson, "whole");
		await expect(whole).toHaveCount(4);
		// The longest name wins: "Untitled note" and "Untitled note 2" are two chips.
		await expect(whole.nth(0)).toHaveText("Untitled note");
		await expect(whole.nth(0)).toHaveAttribute("href", `/library?item=${lesson.items.note.id}`);
		await expect(whole.nth(0)).toHaveAttribute("aria-label", "Open Untitled note, Page");
		await expect(whole.nth(1)).toHaveText("Untitled note 2");
		// In the trash: opens its Trash entry. Deleted for good: faint text, not a link.
		await expect(whole.nth(2)).toHaveAttribute("href", `/library?view=trash&entry=${lesson.trashEntryId}`);
		await expect(whole.nth(2)).toHaveAttribute("aria-label", "Open Trashed note in the trash");
		await expect(whole.nth(3)).toHaveAttribute("data-state", "deleted");
		await expect(whole.nth(3)).toHaveText("Gone note · no longer in your Library");
		expect(await whole.nth(3).evaluate((el) => el.tagName)).toBe("SPAN");

		// Scenario 12: LEAD words, one chip carrying the passage, the tail ":".
		const quote = chipsOf(page, lesson, "quote");
		await expect(quote).toHaveCount(1);
		await expect(quote.getByTestId("ref-chip-hint")).toHaveText("· Second paragraph, the one he quoted.");
		const quoteTurn = quote.locator("xpath=ancestor::div[contains(@class,'lh-prose')][1]");
		await expect(quoteTurn).toHaveText(/^About this part of Untitled note · Second paragraph, the one he quoted\.:\s+Why\?$/);
		await expect(quoteTurn).not.toContainText("> Second");

		// A PDF passage: "· p. 4", and no "Sent from page".
		const pdf = chipsOf(page, lesson, "pdfPassage");
		await expect(pdf).toHaveCount(1);
		await expect(pdf.getByTestId("ref-chip-hint")).toHaveText("· p. 4");
		await expect(pdf).toHaveAttribute("aria-label", "Open Notes.pdf, page 4");
		await expect(chatView(page, lesson.chatId)).not.toContainText("Sent from page");
		await expect(chatView(page, lesson.chatId)).not.toContainText("library_passage");

		// Nine kinds, nine icons.
		const kinds = chipsOf(page, lesson, "kinds");
		await expect(kinds).toHaveCount(9);
		expect(await kinds.evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")))).toEqual(["page", "pdf", "markdown", "text", "code", "csv", "image", "diagram", "other"]);

		// Code stays text.
		await expect(chipsOf(page, lesson, "code")).toHaveCount(0);

		// The rows above a message keep their wording; the names are links.
		const rows = visible(page, `[data-ref-chip="${lesson.messages.whole}:row-${lesson.items.note.id}"]`);
		await expect(rows).toHaveAttribute("href", `/library?item=${lesson.items.note.id}`);

		// Copy across a chip gives back the characters sent.
		const copied = await quoteTurn.evaluate((el) => {
			const range = document.createRange();
			range.selectNodeContents(el);
			const selection = window.getSelection()!;
			selection.removeAllRanges();
			selection.addRange(range);
			const data = new DataTransfer();
			el.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
			selection.removeAllRanges();
			return data.getData("text/plain");
		});
		expect(copied).toBe("About this part of @Untitled note:\n\n> Second paragraph, the one he quoted.\n\nWhy?");

		for (const [width, height] of [[1440, 900], [390, 844], [320, 700]] as const) {
			await page.setViewportSize({ width, height });
			await quote.scrollIntoViewIfNeeded();
			await noPageOverflow(page, `sent ${width}`);
			// The hint gives way before the name does (owner, phase 3 review).
			const fit = await quote.evaluate((chip) => {
				const name = chip.querySelector<HTMLElement>(".lh-ref-chip-name")!;
				const hint = chip.querySelector<HTMLElement>(".lh-ref-chip-hint")!;
				return { nameCut: name.scrollWidth > name.getBoundingClientRect().width + 0.5, hintShown: hint.getBoundingClientRect().width > 1 };
			});
			if (fit.hintShown) expect(fit.nameCut, `sent ${width}: the name is whole while the hint shows`).toBe(false);
			await shot(page, `sent-light-${width}`);
		}
		await page.setViewportSize({ width: 1440, height: 900 });
		await whole.first().scrollIntoViewIfNeeded();
		await shot(page, "sent-deleted-light-1440");
	});

	test("back: a chip opens the full view; the pill and browser Back return to the chip", async ({ page, request }) => {
		test.setTimeout(240_000);
		const lesson = await seedReferenceLesson(request, { remote });
		await openChat(page, lesson.chatId);

		// Scenario 1 + 4: the whole note, then the pill.
		let from = await clickChip(page, lesson, chipsOf(page, lesson, "whole").first());
		await expect(page).toHaveURL(`/library?item=${lesson.items.note.id}`);
		await expect(fullView(page)).toHaveAttribute("data-item-id", lesson.items.note.id);
		await expect(visible(page, '[data-testid="page-editor"]')).toContainText("First paragraph about waves.");
		await expect(pill(page)).toHaveText("Back to E2E · Reference chips");
		await expect(visible(page, '[data-testid="full-view-library"]')).toHaveAttribute("aria-label", "Back to Library");
		await shot(page, "full-view-page-light-1440");
		await pill(page).click();
		await expectReturned(page, lesson, from);

		// Scenario 2 + 5: the quoted passage, highlighted; then browser Back; then Forward.
		from = await clickChip(page, lesson, chipsOf(page, lesson, "quote").first());
		await expect(visible(page, "[data-page-jump]")).toContainText("Second paragraph, the one he quoted.");
		await page.goBack();
		await expectReturned(page, lesson, from);
		await page.goForward();
		await expect(page).toHaveURL(/\/library\?item=/);
		await expect(visible(page, "[data-page-jump]")).toContainText("Second paragraph, the one he quoted.");
		await page.goBack();
		await expect(chatView(page, lesson.chatId)).toBeVisible();

		// Scenario 3: the PDF on page 4, the passage marked.
		from = await clickChip(page, lesson, chipsOf(page, lesson, "pdfPassage").first());
		await expect(visible(page, '[data-testid="pdf-page-field"]')).toHaveValue("4", { timeout: 20_000 });
		await expect(visible(page, '[data-pdf-page="4"] [data-testid="pdf-cite-mark"]').first()).toBeAttached({ timeout: 20_000 });
		await shot(page, "full-view-pdf-light-1440");
		await pill(page).click();
		await expectReturned(page, lesson, from);

		// Scenario 6 (SC-003): every kind opens in the full view, never a new tab.
		const kinds = chipsOf(page, lesson, "kinds");
		const expectations: Array<[string, string]> = [
			["page", '[data-testid="page-editor"]'], ["pdf", '[data-testid="pdf-page"]'], ["markdown", '[data-pane-full]'], ["text", '[data-pane-full]'], ["code", '[data-pane-full]'], ["csv", '[data-pane-full]'],
			["image", '[data-testid="full-view-image"] img'], ["diagram", '[data-pane-full]'], ["other", '[data-testid="full-view-download"]'],
		];
		for (let i = 0; i < expectations.length; i++) {
			const [kind, selector] = expectations[i]!;
			const chip = kinds.nth(i);
			await expect(chip).toHaveAttribute("data-kind", kind);
			const pages = page.context().pages().length;
			from = await clickChip(page, lesson, chip);
			await expect(visible(page, selector), kind).toBeVisible({ timeout: 20_000 });
			expect(page.context().pages().length, `${kind}: no new tab`).toBe(pages);
			if (kind === "image") await expect(visible(page, '[data-testid="full-view-image"] img')).toHaveAttribute("alt", lesson.items.image.name);
			if (kind === "image" || kind === "other") await shot(page, `full-view-${kind}-light-1440`);
			await page.goBack();
			await expectReturned(page, lesson, from);
		}

		// Scenario 8: the trash, its entry in view, Restore focused, the pill there.
		from = await clickChip(page, lesson, chipsOf(page, lesson, "whole").nth(2));
		await expect(page).toHaveURL(`/library?view=trash&entry=${lesson.trashEntryId}`);
		const entry = visible(page, `[data-entry-id="${lesson.trashEntryId}"]`);
		await expect(entry).toHaveAttribute("data-landing", "true");
		await expect(entry.getByRole("button", { name: "Restore Trashed note" })).toBeFocused();
		await expect(pill(page)).toBeVisible();
		await shot(page, "trash-landing-light-1440");
		await pill(page).click();
		await expectReturned(page, lesson, from);

		// Scenario 10: a row's name opens like a chip.
		const row = visible(page, `[data-ref-chip="${lesson.messages.whole}:row-${lesson.items.note2.id}"]`);
		await row.scrollIntoViewIfNeeded();
		from = { before: await scrollTop(page, lesson.chatId), key: await row.getAttribute("data-ref-chip") };
		await row.click();
		await expect(page).toHaveURL(`/library?item=${lesson.items.note2.id}`);
		await expect(pill(page)).toBeVisible();
		await pill(page).click();
		await expectReturned(page, lesson, from);
	});

	test("back: the pill lasts across items, folders and a reload, and goes when he leaves", async ({ page, request }) => {
		test.setTimeout(180_000);
		const lesson = await seedReferenceLesson(request, { remote });
		await openChat(page, lesson.chatId);
		const from = await clickChip(page, lesson, chipsOf(page, lesson, "whole").first());
		await expect(pill(page)).toBeVisible();
		// ← Library, then another item from the list, then a folder.
		await visible(page, '[data-testid="full-view-library"]').click();
		await expect(page).toHaveURL(/\/library$/);
		await expect(pill(page)).toBeVisible();
		await page.goto(`/library?item=${lesson.items.markdown.id}`);
		await expect(fullView(page)).toBeVisible();
		await expect(pill(page)).toBeVisible();
		await page.reload();
		await expect(pill(page)).toBeVisible();
		await expect(pill(page)).toHaveText("Back to E2E · Reference chips");
		// After a reload the lesson is no longer right behind: the pill pushes it.
		await pill(page).click();
		await expectReturned(page, lesson, from);

		// Leaving the Library by another route forgets it.
		await clickChip(page, lesson, chipsOf(page, lesson, "whole").first());
		await expect(pill(page)).toBeVisible();
		await page.goto("/");
		await expect.poll(() => page.evaluate(() => sessionStorage.getItem("lh:reference-return"))).toBeNull();
		await page.goto("/library");
		await expect(page.locator('[data-testid="back-pill"]').filter({ visible: true })).toHaveCount(0);
	});

	test("back: Ctrl-click opens a new tab with no pill; offline shows the Library's failed state", async ({ page, request }) => {
		test.setTimeout(180_000);
		const lesson = await seedReferenceLesson(request, { remote });
		await openChat(page, lesson.chatId);
		const chip = chipsOf(page, lesson, "whole").first();
		const opened = page.context().waitForEvent("page");
		await chip.click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
		const tab = await opened;
		await tab.waitForLoadState();
		await expect(tab).toHaveURL(new RegExp(`/library\\?item=${lesson.items.note.id}$`));
		await expect(visible(tab, '[data-testid="library-full-view"]')).toBeVisible({ timeout: 60_000 });
		await expect(tab.locator('[data-testid="back-pill"]')).toHaveCount(0);
		await tab.close();
		await expect(page).toHaveURL(new RegExp(`/chat/${lesson.chatId}$`));

		// Offline: the Library's own failed line, and the pill still works.
		await page.route(/\/api\/library(\?.*)?$/, (route) => route.abort());
		const from = await clickChip(page, lesson, chipsOf(page, lesson, "kinds").nth(2));
		await expect(visible(page, '[data-testid="library-full-view"]')).toContainText("Your Library could not be loaded.");
		await pill(page).click();
		await expectReturned(page, lesson, from);
		await page.unroute(/\/api\/library(\?.*)?$/);
	});

	test("sent: dark and phone widths, and the pill on a phone", async ({ page, request }) => {
		test.setTimeout(180_000);
		await studySettings(request, { appearance: "dark" });
		const lesson = await seedReferenceLesson(request, { remote });
		for (const [width, height] of [[1440, 900], [390, 844]] as const) {
			await page.setViewportSize({ width, height });
			await openChat(page, lesson.chatId);
			await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
			const quote = chipsOf(page, lesson, "quote").first();
			await quote.scrollIntoViewIfNeeded();
			await shot(page, `sent-dark-${width}`);
			await chipsOf(page, lesson, "whole").first().scrollIntoViewIfNeeded();
			await shot(page, `sent-deleted-dark-${width}`);
			const from = await clickChip(page, lesson, quote);
			await expect(pill(page)).toBeVisible();
			await noPageOverflow(page, `full view ${width}`);
			const box = await pill(page).boundingBox();
			if (width < 768) expect(box!.y + box!.height).toBeGreaterThan(height - 80);
			await shot(page, `full-view-page-dark-${width}`);
			await pill(page).click();
			await expectReturned(page, lesson, from);
			await shot(page, `returned-dark-${width}`);
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await studySettings(request);
		await openChat(page, lesson.chatId);
		const from = await clickChip(page, lesson, chipsOf(page, lesson, "pdfPassage").first());
		await expect(pill(page)).toBeVisible();
		await expect(visible(page, '[data-testid="pdf-page-field"]')).toHaveValue("4", { timeout: 20_000 });
		await expect(visible(page, '[data-pdf-page="4"] [data-testid="pdf-cite-mark"]').first()).toBeAttached({ timeout: 20_000 });
		await shot(page, "full-view-pdf-light-390");
		await pill(page).click();
		await expectReturned(page, lesson, from);
		await shot(page, "returned-light-390");
	});

	test("sent: a mirrored item is one chip over its path; one removed from the repo says so (T055)", async ({ page, request }) => {
		test.skip(Boolean(skipReason()), skipReason() ?? "");
		test.setTimeout(240_000);
		const lesson = await seedReferenceLesson(request, { remote });
		const mirrored = lesson.mirrored!;
		await openChat(page, lesson.chatId);
		const chips = chipsOf(page, lesson, "mirror");
		await expect(chips).toHaveCount(2);
		// Scenario 13: the whole path token is one chip, showing the file name.
		await expect(chips.nth(0)).toHaveAttribute("data-source", `@${mirrored.livePath}`);
		await expect(chips.nth(0)).toContainText("notes.md");
		await expect(chips.nth(0)).toHaveAttribute("href", `/library?item=${mirrored.live.id}`);
		await expect(chips.nth(1)).toHaveAttribute("data-source", `@${mirrored.removedPath}`);
		await expect(chips.nth(1)).toHaveAttribute("data-state", "removed");
		await expect(chips.nth(1)).toHaveText("notes.md · Removed from the repo");
		await chips.nth(0).scrollIntoViewIfNeeded();
		await shot(page, "sent-mirrored-removed-light-1440");
		const from = await clickChip(page, lesson, chips.nth(0));
		await expect(visible(page, '[data-pane-full]')).toContainText("Waves carry energy.");
		await page.goBack();
		await expectReturned(page, lesson, from);
	});

	test("every /library?item= address is the full view, with no pill; a citation inside a page still opens the side pane (T056)", async ({ page, request }) => {
		test.setTimeout(180_000);
		const lesson = await seedReferenceLesson(request, { remote });
		// The notebook links panel's address, a card source's, and a pasted one.
		for (const address of [
			`/library?item=${encodeURIComponent(lesson.items.markdown.id)}`,
			`/library?item=${encodeURIComponent(lesson.items.pdf.id)}&page=2`,
			`/library?item=${encodeURIComponent(lesson.items.pdf.id)}&page=3&quote=${encodeURIComponent("the cited words sit here.")}`,
		]) {
			await page.goto(address);
			await expect(fullView(page)).toBeVisible({ timeout: 60_000 });
			await expect(page).toHaveURL(address);
			await expect(page.locator('[data-testid="back-pill"]')).toHaveCount(0);
		}
		await expect(visible(page, '[data-testid="pdf-jump-status"]')).toContainText("Quote found on page 3.", { timeout: 20_000 });

		// A page holding a PDF citation: in the full view, the citation opens the side pane.
		const cited = await createPage(request, `Cites ${Date.now().toString(36)}`, `Read [PDF: Notes.pdf, p. 3](/library?item=${encodeURIComponent(lesson.items.pdf.id)}&page=3&quote=${encodeURIComponent("the cited words sit here.")}) first.`);
		await page.goto(`/library?item=${encodeURIComponent(cited.id)}`);
		await expect(visible(page, '[data-testid="page-editor"] a')).toBeVisible({ timeout: 60_000 });
		await page.waitForTimeout(500);
		await visible(page, '[data-testid="page-editor"] a').click();
		const side = page.locator('aside[data-testid="page-pane"]').filter({ visible: true });
		await expect(side).toBeVisible({ timeout: 20_000 });
		await expect(side).toHaveAttribute("aria-label", "Notes.pdf");
		await expect(page).toHaveURL(`/library?item=${encodeURIComponent(cited.id)}`);
	});
});

// Feature 027, US2 (T042, T057): chips drawn over the composer's text field.
// The field is today's textarea; a mirror behind it draws the same characters.

const field = (page: Page) => visible(page, '[data-testid="composer"] textarea');
const fieldBox = (page: Page) => visible(page, '[data-testid="composer"] .lh-ref-field');
const mirrorChips = (page: Page) => page.locator('[data-testid="composer"] .lh-ref-field[data-overlay="on"] [data-testid="ref-field-chip"]').filter({ visible: true });

/** Forces the overlay off, as a browser without `field-sizing` sees it. */
async function overlayOff(page: Page) {
	await page.addInitScript(() => {
		const supports = CSS.supports.bind(CSS);
		CSS.supports = ((...args: [string, string?]) => (args[0] === "field-sizing" ? false : supports(...(args as [string, string])))) as typeof CSS.supports;
	});
}

/** The caret's x/y in the field, measured by a full-style clone of the textarea
 *  (independent of the mirror), against the right edge of the chip that ends there. */
async function caretAgainstChip(page: Page, chipIndex: number) {
	return page.evaluate((index) => {
		const textarea = [...document.querySelectorAll<HTMLTextAreaElement>('[data-testid="composer"] textarea')].find((el) => el.getClientRects().length > 0)!;
		const chip = [...textarea.parentElement!.querySelectorAll<HTMLElement>('[data-testid="ref-field-chip"]')][index]!;
		const end = chip.textContent!.length + textarea.value.indexOf(chip.textContent!);
		const clone = document.createElement("div");
		const style = getComputedStyle(textarea);
		for (const name of style) clone.style.setProperty(name, style.getPropertyValue(name));
		const box = textarea.getBoundingClientRect();
		Object.assign(clone.style, { display: "block", position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: "auto", maxHeight: "none", visibility: "hidden", overflow: "hidden" });
		clone.textContent = textarea.value.slice(0, end);
		const marker = document.createElement("span");
		marker.textContent = "​";
		clone.append(marker);
		document.body.append(clone);
		const caret = marker.getBoundingClientRect();
		clone.remove();
		const rects = [...chip.getClientRects()];
		const last = rects.at(-1)!;
		return { caretX: caret.left, caretY: caret.top, chipRight: last.right, chipTop: last.top, scroll: textarea.scrollTop };
	}, chipIndex);
}

/** The values a field goes through for one fixed key sequence. */
async function editSequence(page: Page, chatId: string): Promise<string[]> {
	await openChat(page, chatId);
	await hydrated(page, '[data-testid="composer"] textarea');
	const input = field(page);
	await input.click();
	await input.fill("");
	const values: string[] = [];
	const read = async () => values.push(await input.inputValue());
	await page.keyboard.type("Read @Untit");
	await expect(visible(page, '[data-testid="mention-menu"]')).toBeVisible();
	await page.keyboard.press("Enter");
	await read();
	await page.keyboard.type("and ");
	await page.keyboard.insertText("a pasted line\nwith @Notes.pdf in it");
	await read();
	await page.keyboard.press("Control+z");
	await read();
	await page.keyboard.press("Control+Shift+z");
	await read();
	// IME: a composition, then its commit.
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Input.imeSetComposition", { text: "かな", selectionStart: 2, selectionEnd: 2 });
	await read();
	await cdp.send("Input.insertText", { text: "仮名" });
	await read();
	await cdp.detach();
	return values;
}

test.describe("Study: reference chips in the composer", () => {
	test.beforeAll(async () => {
		if (!skipReason() && !remote) remote = await GitRemote.start();
	});
	test.afterAll(async () => { await remote?.close(); remote = undefined; });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterEach(async ({ request }) => { await clearStudyKey(request); });

	test("composer: the @ list inserts a chip; typing, paste, undo, redo and IME give the same values as with the overlay off", async ({ page, browser, request }) => {
		test.setTimeout(240_000);
		const lesson = await seedReferenceLesson(request, { remote });
		await interceptModel(page);
		const on = await editSequence(page, lesson.chatId);
		await expect(fieldBox(page)).toHaveAttribute("data-overlay", "on");

		const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 900 } });
		const other = await context.newPage();
		await overlayOff(other);
		await interceptModel(other);
		const off = await editSequence(other, lesson.chatId);
		await expect(fieldBox(other)).not.toHaveAttribute("data-overlay", "on");
		await context.close();

		expect(on).toEqual(off);
		expect(on[0]).toBe("Read @Untitled note ");
		expect(on[1]).toBe("Read @Untitled note and a pasted line\nwith @Notes.pdf in it");
		expect(on.at(-1)).toContain("仮名");
	});

	test("composer: chips, caret, whole-chip Backspace, reload and send", async ({ page, request }) => {
		test.setTimeout(240_000);
		const lesson = await seedReferenceLesson(request, { remote });
		const posts = await interceptModel(page);
		await openChat(page, lesson.chatId);
		await hydrated(page, '[data-testid="composer"] textarea');
		const input = field(page);
		await input.click();
		await page.keyboard.type("Read @Untit");
		await expect(visible(page, '[data-testid="mention-menu"]')).toBeVisible();
		await shot(page, "composer-list-open-light-1440");
		await page.keyboard.press("Enter");
		await page.keyboard.type("then @Notes.pdf");
		await expect(mirrorChips(page)).toHaveCount(2);
		await expect(mirrorChips(page).nth(0)).toHaveText("@Untitled note");
		await expect(mirrorChips(page).nth(0)).toHaveAttribute("data-kind", "page");
		await expect(mirrorChips(page).nth(1)).toHaveAttribute("data-kind", "pdf");
		// The textarea's own text is transparent; the field is still the combobox.
		expect(await input.evaluate((el) => getComputedStyle(el).color)).toBe("rgba(0, 0, 0, 0)");
		await expect(input).toHaveAttribute("role", "combobox");

		// The caret sits at the chip's end, within 1px (both chips).
		for (const index of [0, 1]) {
			const at = await caretAgainstChip(page, index);
			expect(Math.abs(at.caretX - at.chipRight), `chip ${index} x`).toBeLessThanOrEqual(1);
			expect(Math.abs(at.caretY - at.chipTop), `chip ${index} y`).toBeLessThanOrEqual(2);
		}

		// Backspace at a chip's end removes it whole; one undo brings it back.
		await page.keyboard.press("Backspace");
		await expect(input).toHaveValue("Read @Untitled note then ");
		await expect(mirrorChips(page)).toHaveCount(1);
		await page.keyboard.press("Control+z");
		await expect(input).toHaveValue("Read @Untitled note then @Notes.pdf");
		await expect(mirrorChips(page)).toHaveCount(2);
		// Delete right before a chip removes it whole too.
		await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(5, 5));
		await page.keyboard.press("Delete");
		await expect(input).toHaveValue("Read  then @Notes.pdf");
		await page.keyboard.press("Control+z");
		await expect(input).toHaveValue("Read @Untitled note then @Notes.pdf");

		// Caret mid-text and a selection across a chip, as the browser draws them.
		await input.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(12, 12); });
		await shot(page, "composer-caret-mid-light-1440");
		await input.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(2, 24); });
		await shot(page, "composer-selection-light-1440");

		// A deleted and a removed item are drawn faint (M1).
		await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
		await page.keyboard.type(` and @${lesson.items.gone.name}`);
		await page.keyboard.press("Escape");
		if (lesson.mirrored) await page.keyboard.insertText(` with @${lesson.mirrored.removedPath}`);
		const gone = mirrorChips(page).filter({ hasText: lesson.items.gone.name });
		await expect(gone).toHaveAttribute("data-state", "deleted");
		if (lesson.mirrored) await expect(mirrorChips(page).filter({ hasText: lesson.mirrored.removedPath })).toHaveAttribute("data-state", "removed");
		await shot(page, "composer-deleted-removed-light-1440");

		// A reload keeps the draft, and its chips come back.
		const draft = await input.inputValue();
		await page.reload();
		await hydrated(page, '[data-testid="composer"] textarea');
		await expect(field(page)).toHaveValue(draft, { timeout: 20_000 });
		await expect(mirrorChips(page)).toHaveCount(lesson.mirrored ? 4 : 3, { timeout: 20_000 });

		// Send: the body carries the draft's characters exactly.
		await field(page).click();
		await page.keyboard.press("Control+End");
		await page.keyboard.press("Enter");
		await expect.poll(() => posts.filter((p) => p.path === "/api/chat").length).toBe(1);
		const sent = posts.find((p) => p.path === "/api/chat")!.body.input as { type: string; text: string };
		expect(sent).toEqual({ type: "text", text: draft.trim() });
	});

	test("composer: Ask… forms on a page and a PDF, at 320, 390 and 1440, light and dark", async ({ page, request }) => {
		test.setTimeout(300_000);
		const lesson = await seedReferenceLesson(request, { remote });
		await interceptModel(page);
		const pageAsk = `About this part of @${lesson.items.note.name}:\n\n> Second paragraph, the one he quoted.\n\n`;
		const pdfAsk = `About this part of @${lesson.items.pdf.name}, page 4:\n\n<library_passage item="${lesson.items.pdf.id}" page="4">\nPage 4: the passage he sent sits here.\n</library_passage>\n\n`;
		for (const appearance of ["light", "dark"] as const) {
			await studySettings(request, { appearance });
			for (const [width, height] of [[1440, 900], [390, 844], [320, 700]] as const) {
				await page.setViewportSize({ width, height });
				for (const [name, draft] of [["page", pageAsk], ["pdf", pdfAsk]] as const) {
					await page.goto(`/chat/new?draft=${encodeURIComponent(draft)}`);
					await hydrated(page, '[data-testid="composer"] textarea');
					await expect(field(page)).toHaveValue(draft, { timeout: 60_000 });
					await expect(fieldBox(page)).toHaveAttribute("data-overlay", "on");
					const head = mirrorChips(page).first();
					await expect(head).toBeVisible({ timeout: 20_000 });
					await expect(visible(page, '[data-testid="composer"] .lh-ref-chip-body')).toBeVisible();
					if (name === "pdf") await expect(head.locator(".lh-ref-chip-page")).toHaveText(", page 4");
					// The caret after the chip's head sits at its end.
					const at = await caretAgainstChip(page, 0);
					expect(Math.abs(at.caretX - at.chipRight), `${name} ${width} x`).toBeLessThanOrEqual(1);
					await noPageOverflow(page, `composer ${name} ${width}`);
					await field(page).focus();
					await shot(page, `composer-${name}-form-${appearance}-${width}`);
					// One Backspace at the form's end removes it whole, LEAD words kept.
					await field(page).evaluate((el: HTMLTextAreaElement) => { const end = el.value.trimEnd().length; el.setSelectionRange(end, end); });
					await page.keyboard.press("Backspace");
					await expect(field(page)).toHaveValue(/^About this part of \n\n$/);
				}
			}
		}
	});

	test("composer: a mirrored item from the @ list is one chip over its whole path (T057)", async ({ page, browser, request }) => {
		test.skip(Boolean(skipReason()), skipReason() ?? "");
		test.setTimeout(240_000);
		const lesson = await seedReferenceLesson(request, { remote });
		const mirrored = lesson.mirrored!;
		const run = async (target: Page) => {
			const posts = await interceptModel(target);
			await openChat(target, lesson.chatId);
			await hydrated(target, '[data-testid="composer"] textarea');
			await field(target).click();
			await field(target).fill("");
			// The linked folder's name keeps another spec's week1/notes.md out of the rows.
			await target.keyboard.type(`Compare @${mirrored.folder.split(" ").at(-1)}/week1/no`);
			await expect(visible(target, '[data-testid="mention-menu"]')).toBeVisible();
			// The row for the live week1 notes.md.
			await visible(target, '[data-testid="mention-option"]').waitFor();
			const option = target.locator('[data-testid="mention-option"]').filter({ visible: true }).filter({ hasText: "week1" }).first();
			await option.click();
			return { posts, value: await field(target).inputValue() };
		};
		const { posts, value } = await run(page);
		expect(value).toBe(`Compare @${mirrored.livePath} `);
		await expect(mirrorChips(page)).toHaveCount(1);
		await expect(mirrorChips(page).first()).toHaveText(`@${mirrored.livePath}`);
		await expect(mirrorChips(page).first()).toHaveAttribute("data-kind", "markdown");
		await page.keyboard.type(`and @${mirrored.folder}/week2/notes.md`);
		await expect(mirrorChips(page)).toHaveCount(2);
		await shot(page, "composer-mirrored-paths-light-1440");
		// Backspace removes the removed path whole, then (after the space) the live one.
		await page.keyboard.press("Backspace");
		await expect(field(page)).toHaveValue(`Compare @${mirrored.livePath} and `);
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Backspace");
		await expect(field(page)).toHaveValue(`Compare @${mirrored.livePath}`);
		await page.keyboard.press("Backspace");
		await expect(field(page)).toHaveValue("Compare ");
		await page.keyboard.press("Control+z");
		await expect(field(page)).toHaveValue(`Compare @${mirrored.livePath}`);
		await page.keyboard.press("Enter");
		await expect.poll(() => posts.filter((p) => p.path === "/api/chat").length).toBe(1);
		const sentOn = (posts.find((p) => p.path === "/api/chat")!.body.input as { text: string }).text;

		// The same with the overlay off.
		const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 900 } });
		const other = await context.newPage();
		await overlayOff(other);
		const off = await run(other);
		await other.keyboard.press("Enter");
		await expect.poll(() => off.posts.filter((p) => p.path === "/api/chat").length).toBe(1);
		const sentOff = (off.posts.find((p) => p.path === "/api/chat")!.body.input as { text: string }).text;
		await context.close();
		expect(sentOn).toBe(`Compare @${mirrored.livePath}`);
		expect(sentOff).toBe(`Compare @${mirrored.livePath}`);
	});

	test("owner fixes (2026-11-08): gone lines under the field, the controls below the field at 360 and under, the quote chip keeps its ':'", async ({ page, request }) => {
		test.setTimeout(300_000);
		const lesson = await seedReferenceLesson(request, { remote });
		await interceptModel(page);
		const fixShot = (name: string) => shot(page, name);
		const measured: string[] = [];
		const goneLines = () => page.locator('[data-testid="attaching-gone-line"]').filter({ visible: true });
		for (const appearance of ["light", "dark"] as const) {
			await studySettings(request, { appearance });
			for (const [width, height] of [[1440, 900], [390, 844], [360, 740], [320, 700]] as const) {
				await page.setViewportSize({ width, height });
				await openChat(page, lesson.chatId);
				await hydrated(page, '[data-testid="composer"] textarea');

				// The sent quote chip and its ':' share a line at every width.
				await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
				const quote = chipsOf(page, lesson, "quote").first();
				await quote.scrollIntoViewIfNeeded();
				// Reading up the transcript folds the dock to its compact row.
				await page.mouse.move(width / 2, 200);
				for (let i = 0; i < 8 && (await visible(page, '[data-testid="dock-shell"]').getAttribute("data-compact")) !== "true"; i++) {
					// From the end, then up: a real gesture away from the bottom.
					if (i % 4 === 0) {
						await page.mouse.wheel(0, 4000);
						await page.waitForTimeout(400);
					}
					await page.mouse.wheel(0, -300);
					await page.waitForTimeout(400);
				}
				await quote.scrollIntoViewIfNeeded();
				const colon = await quote.evaluate((chip) => {
					const glue = chip.parentElement!;
					const glued = glue.querySelector<HTMLElement>(".lh-ref-chip-glued");
					if (!glue.classList.contains("lh-ref-chip-glue") || !glued) return "not glued";
					const a = chip.getBoundingClientRect();
					const b = glued.getBoundingClientRect();
					return { text: glued.textContent, sameLine: Math.abs(a.bottom - b.bottom) < 6, after: b.left >= a.right - 1 };
				});
				expect(colon, `${appearance} ${width}`).toEqual({ text: ":", sameLine: true, after: true });
				await noPageOverflow(page, `sent ${appearance} ${width}`);
				if (width !== 360) await fixShot(`quote-colon-${appearance}-${width}`);

				// Compact composer: with the setup controls showing, at 360 and under
				// they sit below the field and the placeholder has the whole width.
				const shell = visible(page, '[data-testid="dock-shell"]');
				if ((await shell.getAttribute("data-compact")) === "true" && (await visible(page, '[data-testid="composer"] .prompt-setup').count()) > 0) {
					const area = (await field(page).boundingBox())!;
					const bar = (await visible(page, '[data-testid="composer"] .prompt-toolbar').boundingBox())!;
					const outer = (await shell.boundingBox())!;
					if (width <= 360) {
						expect(bar.y, `controls below the field at ${width}`).toBeGreaterThanOrEqual(area.y + area.height - 1);
						expect(area.width, `the field's width at ${width}`).toBeGreaterThan(outer.width - 24);
					} else {
						expect(bar.y, `one row at ${width}`).toBeLessThan(area.y + area.height);
					}
					measured.push(`${appearance} ${width}`);
					if (width !== 360) await fixShot(`composer-compact-${appearance}-${width}`);
				}

				// Gone names say so under the field, beside "Attaching"; sending stays open.
				await field(page).click();
				await field(page).fill("");
				await page.keyboard.type(`Compare @${lesson.items.note.name} with @${lesson.items.gone.name}`);
				await page.keyboard.press("Escape");
				await page.keyboard.insertText(` and @${lesson.items.trashed.name}`);
				if (lesson.mirrored) await page.keyboard.insertText(` and @${lesson.mirrored.removedPath}`);
				await expect(visible(page, '[data-testid="attaching-line"]')).toHaveText(`Attaching ${lesson.items.note.name}`);
				const expected = [`${lesson.items.gone.name} is no longer in your Library`, `${lesson.items.trashed.name} is no longer in your Library`];
				if (lesson.mirrored) expected.push(`${lesson.mirrored.removedPath} was removed from the repo`);
				await expect(goneLines()).toHaveText(expected);
				await expect(visible(page, '[data-testid="composer"] button[type="submit"]')).toBeEnabled();
				await noPageOverflow(page, `gone lines ${appearance} ${width}`);
				if (width !== 360) await fixShot(`composer-gone-lines-${appearance}-${width}`);
				await field(page).fill("");
				await expect(goneLines()).toHaveCount(0);
			}
		}
		expect(measured, "the compact row was measured at the narrow widths").toEqual(expect.arrayContaining(["light 320", "light 360", "dark 320"]));
	});

	test("composer: dark and phone widths", async ({ page, request }) => {
		test.setTimeout(240_000);
		const lesson = await seedReferenceLesson(request, { remote });
		await interceptModel(page);
		for (const appearance of ["light", "dark"] as const) {
			await studySettings(request, { appearance });
			for (const [width, height] of [[1440, 900], [390, 844], [320, 700]] as const) {
				await page.setViewportSize({ width, height });
				await openChat(page, lesson.chatId);
				await hydrated(page, '[data-testid="composer"] textarea');
				await field(page).click();
				await field(page).fill("");
				await page.keyboard.type(`What does @${lesson.items.note.name} say about @${lesson.items.pdf.name}? And @${lesson.items.gone.name}`);
				await expect(mirrorChips(page)).toHaveCount(3);
				for (const index of [0, 1]) {
					const at = await caretAgainstChip(page, index);
					expect(Math.abs(at.caretX - at.chipRight), `${appearance} ${width} chip ${index}`).toBeLessThanOrEqual(1);
				}
				await noPageOverflow(page, `composer ${appearance} ${width}`);
				await shot(page, `composer-chips-${appearance}-${width}`);
				if (width === 390) {
					await page.keyboard.type(" and @Untit");
					await expect(visible(page, '[data-testid="mention-menu"]')).toBeVisible();
					await shot(page, `composer-list-open-${appearance}-390`);
					await page.keyboard.press("Escape");
				}
				await field(page).fill("");
			}
		}
	});
});

// Feature 027, US3 (T047, T058): Library links and resolving @names in the
// tutor's replies are chips that open like a sent message's.
test.describe("Study: reference chips in tutor replies", () => {
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
		await interceptModel(page);
	});
	test.afterEach(async ({ request }) => { await clearStudyKey(request); });

	const tutorReply = (page: Page, lesson: ReferenceLesson) =>
		chatView(page, lesson.chatId).locator(`[data-answer-part-id]`).filter({ hasText: "In code it stays" });

	test("tutor: a citation and an @name are chips; code stays text; the citation opens page 3 and the pill returns", async ({ page, request }) => {
		test.setTimeout(240_000);
		const lesson = await seedReferenceLesson(request);
		await openChat(page, lesson.chatId);
		const chips = chipsOf(page, lesson, "tutor");
		await expect(chips).toHaveCount(2);
		// Scenario 1: the PDF icon, its name and "· p. 3".
		const cite = chips.nth(0);
		await expect(cite).toHaveAttribute("data-kind", "pdf");
		await expect(cite.locator(".lh-ref-chip-name")).toHaveText(lesson.items.pdf.name);
		await expect(cite.getByTestId("ref-chip-hint")).toHaveText("· p. 3");
		await expect(cite).toHaveAttribute("aria-label", `Open ${lesson.items.pdf.name}, page 3`);
		// The @name in prose; the one in code stays text.
		const named = chips.nth(1);
		await expect(named).toHaveAttribute("data-kind", "page");
		await expect(named).toHaveText(lesson.items.note.name);
		await expect(named).toHaveAttribute("href", `/library?item=${lesson.items.note.id}`);
		const reply = tutorReply(page, lesson);
		await expect(reply.locator("code")).toHaveText(`@${lesson.items.pdf.name}`);
		await expect(reply.locator('[title="lh-ref"]')).toHaveCount(0);
		// History never inks in.
		await expect(reply.locator(".nb-ink-word")).toHaveCount(0);

		// T058: copy across the chips gives the text as it read before.
		const copied = await reply.locator(".lh-prose").first().evaluate((el) => {
			const range = document.createRange();
			range.selectNodeContents(el);
			const selection = window.getSelection()!;
			selection.removeAllRanges();
			selection.addRange(range);
			const data = new DataTransfer();
			el.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
			selection.removeAllRanges();
			return data.getData("text/plain");
		});
		expect(copied.trim()).toBe(`See ${lesson.items.pdf.name}, p. 3 and @${lesson.items.note.name}. In code it stays: @${lesson.items.pdf.name}.`);

		for (const appearance of ["light", "dark"] as const) {
			if (appearance === "dark") {
				await studySettings(request, { appearance });
				await openChat(page, lesson.chatId);
				await expect(chips).toHaveCount(2);
			}
			for (const [width, height] of [[1440, 900], [390, 844], [320, 700]] as const) {
				await page.setViewportSize({ width, height });
				await chips.first().scrollIntoViewIfNeeded();
				await noPageOverflow(page, `tutor ${appearance} ${width}`);
				await shot(page, `tutor-${appearance}-${width}`);
			}
		}
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChat(page, lesson.chatId);

		// Scenario 2: page 3, the cited words checked, then back to the reply.
		let from = await clickChip(page, lesson, chips.nth(0));
		await expect(fullView(page)).toHaveAttribute("data-item-id", lesson.items.pdf.id);
		await expect(visible(page, '[data-testid="pdf-page-field"]')).toHaveValue("3", { timeout: 20_000 });
		await expect(visible(page, '[data-testid="pdf-jump-status"]')).toContainText("Quote found on page 3.", { timeout: 20_000 });
		await expect(pill(page)).toHaveText("Back to E2E · Reference chips");
		await shot(page, "tutor-full-view-pdf-light-1440");
		await pill(page).click();
		await expectReturned(page, lesson, from);

		from = await clickChip(page, lesson, chips.nth(1));
		await expect(page).toHaveURL(`/library?item=${lesson.items.note.id}`);
		await page.goBack();
		await expectReturned(page, lesson, from);
	});

	test("tutor: going back to a lesson started from a topic never sends its first message again (T059)", async ({ page, request }) => {
		test.setTimeout(180_000);
		const lesson = await seedReferenceLesson(request);
		const seen = await interceptModel(page);
		// What Home and the new-session view do: make the session, then open it with its topic.
		const topic = `What does @${lesson.items.note.name} say?`;
		const created = await request.post("/api/chats", { data: { title: topic } });
		const { id: chatId } = (await created.json()) as { id: string };
		await openChat(page, chatId, `?prompt=${encodeURIComponent(topic)}`);
		const sends = () => seen.filter((s) => s.path === "/api/chat").length;
		await expect.poll(sends, { timeout: 30_000 }).toBe(1);
		// Out to the Library in the app, then the browser's Back (the pill's way back is router.back too).
		await expect(chatView(page, chatId)).toContainText(topic);
		await openSidebar(page);
		await page.getByTestId("nb-sidebar").getByRole("link", { name: "Library", exact: true }).first().click();
		await expect(page).toHaveURL(/\/library$/, { timeout: 60_000 });
		await page.goBack();
		await expect(chatView(page, chatId)).toBeVisible();
		await page.waitForTimeout(3000);
		expect(sends(), "the first message went out once").toBe(1);
	});

	test("tutor: a reference turning into a chip leaves the lines around it where they were", async ({ page, request }) => {
		test.setTimeout(180_000);
		const lesson = await seedReferenceLesson(request);
		// Hold the Library list, so the reply first renders as it did before chips.
		let release!: () => void;
		const held = new Promise<void>((resolve) => { release = resolve; });
		await page.route(/\/api\/library$/, async (route) => { await held; await route.continue(); });
		await openChat(page, lesson.chatId);
		const reply = tutorReply(page, lesson);
		await expect(reply).toBeVisible();
		await expect(chipsOf(page, lesson, "tutor")).toHaveCount(0);
		const lines = () => reply.locator(".lh-prose p").first().evaluate((p) => {
			const box = p.getBoundingClientRect();
			// Against its own reply: chips above it (sent messages) arrive at the same time.
			return { height: box.height, top: box.top - p.closest("[data-answer-part-id]")!.getBoundingClientRect().top };
		});
		const before = await lines();
		release();
		await expect(chipsOf(page, lesson, "tutor")).toHaveCount(2);
		const after = await lines();
		expect(Math.abs(after.height - before.height), "the paragraph keeps its height").toBeLessThanOrEqual(0.5);
		expect(Math.abs(after.top - before.top), "the paragraph stays put").toBeLessThanOrEqual(0.5);
	});
});
