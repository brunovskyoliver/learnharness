import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, T045: accessibility. One keyboard-only run through every
// scope item (no pointer after the first page load), checking after each
// step that the focus is somewhere (never <body>) and visibly so (2px
// outline in --nb-focus, offset 2px; text fields show their caret);
// then three sanity checks without new dependencies: every control has an
// accessible name, every scroller hides its track, Escape closes layers in
// order.

const CLAIM = "Entropy always rises in a closed system. So a cup of tea cools down.";

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}

interface FocusInfo { body: boolean; what: string; testId: string | null; editable: boolean; scroller: boolean; outline: string; width: number; offset: number; color: string; line: string }

/** Where the focus is, and how it shows. */
const focusInfo = (page: Page): Promise<FocusInfo> => page.evaluate(() => {
	const el = document.activeElement as HTMLElement | null;
	const root = document.querySelector(".nb-root") ?? document.body;
	const probe = document.createElement("span");
	probe.style.color = "var(--nb-focus)";
	root.appendChild(probe);
	const line = getComputedStyle(probe).color;
	probe.remove();
	if (!el || el === document.body || el === document.documentElement) return { body: true, what: "body", testId: null, editable: false, scroller: false, outline: "none", width: 0, offset: 0, color: "", line };
	const cs = getComputedStyle(el);
	const editable = el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((el as HTMLInputElement).type));
	const what = `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`;
	// A focusable scroller (the settings page) draws its ring inside, where its own edges can't clip it.
	const scroller = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight;
	return { body: false, what, testId: el.getAttribute("data-testid"), editable, scroller, outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth), offset: parseFloat(cs.outlineOffset), color: cs.outlineColor, line };
});

/** The focus is not lost and can be seen. */
async function seen(page: Page, label: string): Promise<FocusInfo> {
	// Once the step has settled (a moved focus may take a frame or two to land).
	await expect.poll(async () => (await focusInfo(page)).body, { message: `${label}: the focus fell to <body>`, timeout: 3_000 }).toBe(false);
	const info = await focusInfo(page);
	if (!info.editable) {
		expect(info.outline, `${label}: ${info.what} shows no outline`).not.toBe("none");
		expect(info.width, `${label}: ${info.what} outline width`).toBeGreaterThanOrEqual(2);
		if (info.scroller) expect(info.offset, `${label}: ${info.what} inset ring`).toBeLessThan(0);
		else expect(info.offset, `${label}: ${info.what} outline offset`).toBe(2);
		expect(info.color, `${label}: ${info.what} outline colour`).toBe(info.line);
	}
	return info;
}

/** Presses `key` until the focus is on `testId` (each stop checked), at most `max` times. */
async function tabTo(page: Page, testId: string, key: "Tab" | "Shift+Tab" = "Tab", max = 40) {
	for (let i = 0; i < max; i++) {
		const info = await focusInfo(page);
		if (info.testId === testId) return;
		await page.keyboard.press(key);
		await seen(page, `${key} towards ${testId} (${i + 1})`);
	}
	throw new Error(`${testId} was not reached with ${key}`);
}

const visibleRoot = (page: Page) => page.getByTestId("notebook-root").filter({ visible: true });

/** Every visible control in Notebook has a non-empty accessible name. */
async function everyControlNamed(page: Page, label: string) {
	const nameless = await page.evaluate(() => {
		const name = (el: HTMLElement): string => {
			const labelled = el.getAttribute("aria-labelledby");
			if (labelled) return labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
			const aria = el.getAttribute("aria-label");
			if (aria?.trim()) return aria.trim();
			// <label for> names any labelable element (inputs, buttons, switches).
			const viaFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : null;
			if (viaFor?.trim()) return viaFor.trim();
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
				if (el.closest("label")?.textContent?.trim()) return el.closest("label")!.textContent!.trim();
				return (el.placeholder || el.title || "").trim();
			}
			if (el.isContentEditable) return "";
			return (el.textContent || el.title || el.querySelector("img")?.alt || "").trim();
		};
		const roots = [...document.querySelectorAll<HTMLElement>(".nb-root")];
		const controls = roots.flatMap((r) => [...r.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select, [contenteditable='true'], [role='button'], [role='radio'], [role='tab'], [role='switch'], [role='menuitem'], [role='menuitemradio'], [role='checkbox'], [role='slider']")]);
		return controls.filter((el) => {
			const box = el.getBoundingClientRect();
			if (!box.width || !box.height || el.closest("[aria-hidden='true'], [inert]")) return false;
			return !name(el);
		}).map((el) => el.outerHTML.slice(0, 160));
	});
	expect(nameless, `${label}: controls with no accessible name`).toEqual([]);
}

/** No element in Notebook shows a scrollbar. */
async function noScrollbars(page: Page, label: string) {
	const shown = await page.evaluate(() => {
		const roots = [...document.querySelectorAll<HTMLElement>(".nb-root")];
		return roots.flatMap((r) => [r, ...r.querySelectorAll<HTMLElement>("*")]).filter((el) => {
			const cs = getComputedStyle(el);
			if (cs.scrollbarWidth !== "none") return true;
			// A scroller that still lays out a track (the WebKit pseudo-element would show).
			const scrolls = /(auto|scroll)/.test(cs.overflowY + cs.overflowX);
			const borders = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
			return scrolls && el.offsetWidth - el.clientWidth - borders > 0.5;
		}).map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`);
	});
	expect(shown, `${label}: elements with a scrollbar`).toEqual([]);
}

test.describe("Notebook: accessibility", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "study" });
		await putSection(request, "notebook", { appearance: "light", startMode: "thinks", pace: "regular", layout: "both", textSize: "default", lettering: "serif", ink: "ink", pointerInk: false });
		await page.setViewportSize({ width: 1665, height: 962 });
	});

	test("keyboard only through every scope item; the focus is never lost and always seen", async ({ page, request, context }) => {
		test.setTimeout(240_000);
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const other = ((await (await request.post("/api/library/pages", { data: { name: `Keyboard other ${Date.now()}`, content: "Heat flows from hot to cold.\n" } })).json()) as { item: { id: string; name: string } }).item;
		await page.emulateMedia({ reducedMotion: "reduce" });

		// Switch mode: from Study, Mod+Shift+O.
		await page.goto("/library");
		await page.waitForLoadState("networkidle");
		await page.keyboard.press("Control+Shift+O");
		await expect(page).toHaveURL(/\/notebook/, { timeout: 60_000 });
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeVisible({ timeout: 60_000 });

		// New note: Mod+K, a name with no match, Enter.
		await page.keyboard.press("Control+k");
		await expect(page.getByTestId("nb-side-search")).toBeFocused();
		await seen(page, "sidebar search");
		const name = `Keyboard ${Date.now()}`;
		await page.keyboard.type(name);
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-title").filter({ visible: true })).toHaveValue(name, { timeout: 60_000 });
		await seen(page, "after the new note");
		await everyControlNamed(page, "a new note");
		await noScrollbars(page, "a new note");

		// Type: Tab to the title, Enter to the body, write; the automatic read lands a margin note.
		await tabTo(page, "nb-title", "Shift+Tab");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeFocused();
		await page.keyboard.type(CLAIM);
		const note = page.getByTestId("nb-margin-note").filter({ visible: true });
		await expect(note).toHaveCount(1, { timeout: 30_000 });
		await expect(page.getByTestId("nb-thread-open")).toBeVisible();

		// Mod+Alt+↓ to the note, Enter expands it in place with the field focused; write back; Escape order.
		await page.keyboard.press("Control+Alt+ArrowDown");
		await expect(page.getByTestId("nb-thread-open")).toBeFocused();
		await seen(page, "the note");
		await page.keyboard.press("Enter");
		const field = note.getByTestId("nb-write-back");
		await expect(field).toBeFocused();
		await page.keyboard.type("Because the tea gives its heat to the room.");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-live")).toHaveText("Reply ready.", { timeout: 20_000 });
		await seen(page, "after the reply");
		await page.keyboard.type("And the room");
		// Escape: the field with words first (the thread keeps the focus), then the thread.
		await page.keyboard.press("Escape");
		await expect(note).toHaveAttribute("data-state", "open");
		await seen(page, "the open thread");
		await everyControlNamed(page, "an open thread");
		// Resolve: Tab to it and press Enter; the Undo line holds the focus, then the passage gets it back.
		await tabTo(page, "nb-resolve");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-thread-status")).toBeVisible();
		await seen(page, "Undo");
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeFocused({ timeout: 10_000 });

		// Select by keyboard, Shift+F10 into the selection menu, Visualize.
		await page.keyboard.press("Control+Home");
		await page.keyboard.press("Shift+End");
		const menu = page.getByTestId("nb-selection-menu");
		await expect(menu).toBeVisible();
		await page.keyboard.press("Shift+F10");
		await expect(menu.getByRole("button", { name: "Text", exact: true })).toBeFocused();
		await seen(page, "selection menu");
		await everyControlNamed(page, "the selection menu");
		await tabTo(page, "nb-sel-visualize");
		await page.keyboard.press("Enter");
		const sketch = page.getByTestId("nb-inline-reply").getByTestId("nb-sketch");
		await expect(sketch).toBeVisible({ timeout: 30_000 });
		await seen(page, "after Visualize");
		// The stepper by arrows, then See it larger, then Escape back.
		await tabTo(page, "nb-sketch-prev");
		await expect(sketch.getByTestId("nb-sketch-count")).toHaveText("4/4");
		await page.keyboard.press("ArrowLeft");
		await expect(sketch.getByTestId("nb-sketch-count")).toHaveText("3/4");
		await page.keyboard.press("ArrowRight");
		await expect(sketch.getByTestId("nb-sketch-count")).toHaveText("4/4");
		await seen(page, "stepper");
		await tabTo(page, "nb-sketch-larger");
		await page.keyboard.press("Enter");
		const big = page.getByTestId("nb-sketch-dialog");
		await expect(big).toBeVisible();
		await seen(page, "See it larger");
		await everyControlNamed(page, "the larger drawing");
		await page.keyboard.press("Escape");
		await expect(big).toBeHidden();
		await expect(page.getByTestId("nb-sketch-larger")).toBeFocused();

		// The instruction line: from the toolbar, write one, Enter saves and goes to the title.
		await tabTo(page, "nb-instructions", "Shift+Tab", 80);
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-instruction-field")).toBeFocused();
		await page.keyboard.type("Ask me one thing at a time.");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-title").filter({ visible: true })).toBeFocused();

		// The reviewer picker: a menu of radio items, arrows choose, Escape order puts the focus back.
		await tabTo(page, "nb-reviewer-picker", "Shift+Tab");
		await page.keyboard.press("Enter");
		const reviewers = page.getByTestId("nb-reviewer-menu");
		await expect(reviewers).toBeVisible();
		await expect(reviewers.getByRole("menuitemradio").first()).toBeVisible();
		await seen(page, "reviewer menu");
		await everyControlNamed(page, "the reviewer menu");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
		await expect(reviewers).toBeHidden();
		await expect(page.getByTestId("nb-reviewer-picker")).toBeFocused();
		await seen(page, "back on the picker");

		// Chat: open, send, close.
		await tabTo(page, "nb-chat");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-chat-field")).toBeFocused();
		await everyControlNamed(page, "the chat");
		await noScrollbars(page, "the chat");
		await page.keyboard.type("What should I do next?");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-live")).toHaveText("Reply ready.", { timeout: 20_000 });
		await seen(page, "chat after the answer");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-chat-panel")).toBeHidden();
		await expect(page.getByTestId("nb-chat")).toBeFocused();
		await seen(page, "chat button");

		// Just my words: on and off by shortcut, said in the live region; the focus stays.
		await page.keyboard.press("Control+Shift+H");
		await expect(page.getByTestId("nb-live")).toHaveText("Just your words. The notes are hidden, not gone.");
		await expect(visibleRoot(page)).toHaveAttribute("data-plain", "");
		await seen(page, "Just my words on");
		await page.keyboard.press("Control+Shift+H");
		await expect(page.getByTestId("nb-live")).toHaveText("The notes are back.");

		// The export dialog: arrows choose a format, Escape returns the focus.
		await page.keyboard.press("Control+Shift+E");
		const exporting = page.getByTestId("nb-export-dialog");
		await expect(exporting).toBeVisible();
		await seen(page, "export dialog");
		await everyControlNamed(page, "the export dialog");
		await tabTo(page, "nb-export-format-pdf");
		await page.keyboard.press("ArrowRight");
		await expect(page.getByTestId("nb-export-format-docx")).toBeFocused();
		await expect(page.getByTestId("nb-export-format-docx")).toHaveAttribute("aria-checked", "true");
		await page.keyboard.press("ArrowLeft");
		await expect(page.getByTestId("nb-export-format-pdf")).toHaveAttribute("aria-checked", "true");
		await seen(page, "a format card");
		await page.keyboard.press("Escape");
		await expect(exporting).toBeHidden();
		await expect(page.getByTestId("nb-chat")).toBeFocused();

		// Settings: Mod+, then a radio group by arrows; Escape returns the focus.
		await page.keyboard.press("Control+,");
		const settings = page.getByTestId("nb-settings");
		await expect(settings).toBeVisible();
		await seen(page, "settings");
		await everyControlNamed(page, "settings");
		await noScrollbars(page, "settings");
		await tabTo(page, "nb-set-startMode-thinks");
		await page.keyboard.press("ArrowRight");
		await expect(page.getByTestId("nb-set-startMode-ask")).toHaveAttribute("aria-checked", "true");
		await page.keyboard.press("ArrowLeft");
		await expect(page.getByTestId("nb-set-startMode-thinks")).toHaveAttribute("aria-checked", "true");
		await seen(page, "a settings card");
		await page.keyboard.press("Escape");
		await expect(settings).toBeHidden();
		await seen(page, "after settings");

		// The sidebar: search, open another note.
		await page.keyboard.press("Control+k");
		await expect(page.getByTestId("nb-side-search")).toBeFocused();
		await everyControlNamed(page, "the sidebar");
		await noScrollbars(page, "the sidebar");
		await page.keyboard.type(other.name);
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(new RegExp(`/notebook/${other.id}$`), { timeout: 60_000 });
		await expect(page.getByTestId("nb-title").filter({ visible: true })).toHaveValue(other.name, { timeout: 60_000 });
		await seen(page, "after opening a note");

		// The Links panel: Mod+\ opens the sidebar, Tab to Links, Enter; Escape returns the focus to ☰.
		await page.keyboard.press("Control+\\");
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await tabTo(page, "nb-side-links");
		await page.keyboard.press("Enter");
		const links = page.getByTestId("nb-links-panel");
		await expect(links).toBeVisible();
		await expect(links.getByTestId("nb-links-body")).toBeVisible();
		await seen(page, "links panel");
		await everyControlNamed(page, "the Links panel");
		await noScrollbars(page, "the Links panel");
		await page.keyboard.press("Escape");
		await expect(links).toBeHidden();
		await expect(page.getByTestId("nb-menu-button").filter({ visible: true })).toBeFocused();
		await seen(page, "back on ☰");

		// Switch back to Study.
		await page.keyboard.press("Control+Shift+O");
		await expect(page).not.toHaveURL(/\/notebook/, { timeout: 60_000 });
	});

	test("Escape closes one layer at a time: menu, selection menu, field, thread, panel, dialog, sidebar", async ({ page, request }) => {
		await putSection(request, "general", { interface: "notebook" });
		const id = ((await (await request.post("/api/library/pages", { data: { name: `Escape ${Date.now()}`, content: "Entropy always rises in a closed system.\n" } })).json()) as { item: { id: string } }).item.id;
		await page.goto(`/notebook/${id}`);
		await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });
		await page.getByTestId("nb-editor").locator("p").first().click();

		// A menu over the toolbar first.
		await page.getByTestId("nb-mode-picker").focus();
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-mode-menu")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-mode-menu")).toBeHidden();
		await expect(page.getByTestId("nb-mode-picker")).toBeFocused();

		// The selection menu, then the text keeps its selection.
		await page.getByTestId("nb-editor").locator("p").first().click();
		await page.keyboard.press("Home");
		await page.keyboard.press("Shift+End");
		await expect(page.getByTestId("nb-selection-menu")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-selection-menu")).toBeHidden();
		await expect(page.getByTestId("nb-editor")).toBeFocused();

		// The settings modal over the open sidebar: the modal first, then the sidebar.
		await page.keyboard.press("Control+\\");
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await page.getByTestId("nb-side-settings").focus();
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-settings")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-settings")).toBeHidden();
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-sidebar")).toBeHidden();
		// Back where it was before the sidebar opened.
		await expect(page.getByTestId("nb-editor")).toBeFocused();

		// A panel (chat) closes before anything under it, focus back on its button.
		await page.getByTestId("nb-chat").focus();
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("nb-chat-panel")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("nb-chat-panel")).toBeHidden();
		await expect(page.getByTestId("nb-chat")).toBeFocused();
	});

	test("touch: controls are at least 44px on a coarse pointer", async ({ browser }) => {
		const context = await browser.newContext({ hasTouch: true, isMobile: false, viewport: { width: 1280, height: 900 } });
		const page = await context.newPage();
		await page.goto("/notebook");
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
		expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
		await page.getByTestId("nb-menu-button").filter({ visible: true }).tap();
		await expect(page.getByTestId("nb-sidebar")).toBeVisible();
		const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".nb-root :is(.nb-header, .nb-toolbar, [data-testid='nb-sidebar']) :is(button, a[href], [role='button'])")]
			.filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.closest("[aria-hidden='true']") && b.height < 44; })
			.map((el) => `${el.getAttribute("data-testid") ?? el.className} ${Math.round(el.getBoundingClientRect().height)}px`));
		expect(small).toEqual([]);
		await context.close();
	});
});
