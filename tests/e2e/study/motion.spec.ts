import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ARRIVAL_NAMES, CHATS, arrivalWindow, chatView, chord, chromeClip, clearRecorded, clearStudyKey, clipFrames, createPage, hydrated, layoutShiftDuring, openChat, openSidebar, recordAnimations, recordedAnimations, seedStudy, studySettings, visible, withoutViewTransitions, type RecordedAnimation } from "./helpers";

// Feature 028 (one motion language): the cold-load signature (US1, rows 1-2)
// and the arrival fallback without view transitions (US2 AS2). Each cold load
// gets a fresh context, so its sessionStorage has not seen the signature.

const ROUTES = [
	{ name: "Home", path: "/" },
	{ name: "a lesson", path: `/chat/${CHATS.plain}` },
	{ name: "Library", path: "/library" },
	{ name: "Review", path: "/review" },
	{ name: "Settings", path: "/settings" },
] as const;
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 390, height: 844 }] as const;

async function fresh(browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
	await recordAnimations(context);
	return { context, page: await context.newPage() };
}

/** The arrival animations a cold load played: the regions' and the chrome's. */
const arrivals = (all: RecordedAnimation[]) => all.filter((a) => ARRIVAL_NAMES.has(a.name) && (a.kind !== null || a.inChrome));
const ends = (a: RecordedAnimation) => a.delay + a.duration;

test.describe("Motion: the cold-load signature (feature 028, US1)", () => {
	test.beforeAll(async ({}, info) => { info.setTimeout(180_000); await seedStudy(); });
	test.beforeEach(async ({ request }) => { await studySettings(request); });
	test.afterAll(async ({ request }) => {
		await studySettings(request);
		await clearStudyKey(request);
	});

	test("plays once per tab: a reload has none, a new tab plays it again", async ({ browser }) => {
		test.setTimeout(180_000);
		const { context, page } = await fresh(browser);
		await page.goto("/");
		await hydrated(page, '[aria-label="Open sidebar"]');
		await page.waitForTimeout(1200);
		expect((await arrivalWindow(page)).set, "the signature attribute on the first load").not.toBeNull();
		expect((await recordedAnimations(page)).some((a) => a.name === "lh-mark-draw"), "the ring draws").toBe(true);
		expect(await page.locator("html").getAttribute("data-lh-arrival"), "cleared after it plays").toBeNull();

		await page.reload();
		await hydrated(page, '[aria-label="Open sidebar"]');
		await page.waitForTimeout(1200);
		expect((await arrivalWindow(page)).set, "no signature on a reload").toBeNull();
		expect((await recordedAnimations(page)).some((a) => a.name === "lh-mark-draw"), "no ring stroke on a reload").toBe(false);
		await context.close();

		const again = await fresh(browser);
		await again.page.goto("/library");
		await hydrated(again.page, '[aria-label="Open sidebar"]');
		await again.page.waitForTimeout(800);
		expect((await arrivalWindow(again.page)).set, "a new tab plays it again").not.toBeNull();
		await again.context.close();
	});

	test("a tab hidden at load skips it, and does not play it later", async ({ browser }) => {
		test.setTimeout(120_000);
		const { context, page } = await fresh(browser);
		await context.addInitScript(() => { Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => "hidden" }); });
		await page.goto("/");
		await hydrated(page, '[aria-label="Open sidebar"]');
		await page.waitForTimeout(800);
		expect((await arrivalWindow(page)).set).toBeNull();
		expect((await recordedAnimations(page)).some((a) => a.name === "lh-mark-draw")).toBe(false);
		expect(await page.evaluate(() => sessionStorage.getItem("lh.motion.signature"))).toBe("1");
		await context.close();
	});

	for (const viewport of VIEWPORTS) {
		test(`every first-viewport arrival ends by 600ms on the primary routes at ${viewport.width}px (SC-001)`, async ({ browser }) => {
			test.setTimeout(300_000);
			for (const route of ROUTES) {
				const { context, page } = await fresh(browser, { viewport });
				await page.goto(route.path);
				await hydrated(page, '[aria-label="Open sidebar"]');
				await page.waitForTimeout(1500);
				const played = arrivals(await recordedAnimations(page));
				expect(played.length, `${route.name}: something arrives`).toBeGreaterThan(0);
				for (const a of played) expect(ends(a), `${route.name}: ${a.name} on ${a.target}`).toBeLessThanOrEqual(600);
				// What first paint showed ends within 600ms of it, all together.
				const first = Math.min(...played.map((a) => a.start));
				const atPaint = played.filter((a) => a.start - first < 50);
				expect(Math.max(...atPaint.map((a) => a.start + ends(a))) - first, `${route.name}: the signature's span`).toBeLessThanOrEqual(650);
				if (route.path.startsWith("/chat/")) {
					// US1 AS4: settled history never animates; the title and the composer arrive.
					const turns = (await recordedAnimations(page)).filter((a) => a.inTurn && ARRIVAL_NAMES.has(a.name));
					expect(turns, "transcript turns stay still").toEqual([]);
				}
				await context.close();
			}
		});
	}

	test("Mod+K and a row click land while the signature plays (20 trials each, SC-002)", async ({ browser }) => {
		test.setTimeout(1_500_000);
		// A dev server hydrates late, after a 600ms signature has ended. The
		// arrivals are stretched to 8s here so they still run when React is
		// ready; the attribute's own 900ms clock bounds the window, and the
		// offsets span it. Each trial is a cold load in a tab that has not
		// seen the signature (its sessionStorage cleared).
		const { context, page } = await fresh(browser);
		await context.addInitScript(() => {
			document.addEventListener("DOMContentLoaded", () => {
				const style = document.createElement("style");
				style.textContent = "html[data-lh-arrival] :is([data-ink-order], .nb-wordmark-mark *) { animation-duration: 8s !important; }";
				document.head.append(style);
			});
		});
		const running = () => page.evaluate(() => document.getAnimations().some((a) => ["nb-ink-in", "lh-mark-draw", "nb-blot-splat"].includes((a as CSSAnimation).animationName) && a.playState === "running"));
		await page.goto("/");
		// A cold load in a tab that has not seen the signature: forget it, then load.
		const cold = async (path: string) => {
			await page.evaluate(() => sessionStorage.clear()).catch(() => {});
			await page.goto(path);
		};
		let during = 0;
		for (let trial = 0; trial < 20; trial++) {
			await cold("/");
			await hydrated(page, '[aria-label="Open sidebar"]');
			await page.waitForTimeout(trial * 35);
			if (await running()) during++;
			await chord(page, "Control", "k");
			await expect(page.getByTestId("command-palette"), `trial ${trial}: the palette opens`).toBeVisible({ timeout: 2000 });
		}
		expect(during, "palette trials that pressed during the signature").toBeGreaterThanOrEqual(15);

		during = 0;
		for (let trial = 0; trial < 20; trial++) {
			await cold("/");
			const row = visible(page, ".waiting-row-action");
			await hydrated(page, ".waiting-row-action");
			await page.waitForTimeout(trial * 20);
			if (await running()) during++;
			await row.click();
			await expect(page, `trial ${trial}: the row opens its lesson`).toHaveURL(/\/chat\//, { timeout: 30_000 });
		}
		expect(during, "row trials that clicked during the signature").toBeGreaterThanOrEqual(10);
		await context.close();
	});

	test("reduced motion: the signature is one fade of at most 150ms, no stroke and no splat (US1 AS3)", async ({ browser }) => {
		test.setTimeout(120_000);
		for (const path of ["/", "/library"]) {
			const { context, page } = await fresh(browser, { reducedMotion: "reduce" });
			await page.goto(path);
			await hydrated(page, '[aria-label="Open sidebar"]');
			await page.waitForTimeout(1000);
			expect((await arrivalWindow(page)).set, `${path}: the signature still marks the load`).not.toBeNull();
			const played = arrivals(await recordedAnimations(page));
			expect(played.length, `${path}: a fade plays`).toBeGreaterThan(0);
			for (const a of played) {
				expect(a.name, `${path}: ${a.target}`).toBe("lh-fade");
				expect(a.duration, `${path}: ${a.target}`).toBeLessThanOrEqual(150);
				expect(a.delay, `${path}: ${a.target}`).toBe(0);
				expect(a.properties, `${path}: ${a.target}`).toEqual(["opacity"]);
			}
			await context.close();
		}
	});

	test("without JavaScript the first viewport is in its final state (FR-008)", async ({ browser }) => {
		test.setTimeout(120_000);
		for (const path of ["/", "/library"]) {
			const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
			const page = await context.newPage();
			await page.goto(path);
			await page.waitForTimeout(800);
			const off = await page.evaluate(() => [...document.querySelectorAll("[data-lh-arrive], [data-ink-order], .nb-wordmark-mark, .nb-wordmark-mark *, .nb-menu-button")]
				.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; })
				.map((el) => ({ el: `${el.tagName}.${el.getAttribute("class") ?? ""}`.slice(0, 80), opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform }))
				.filter((s) => s.opacity !== "1" || s.transform !== "none"));
			expect(off, `${path}: elements not in their final state`).toEqual([]);
			await context.close();
		}
	});
});

test.describe("Motion: arrivals without view transitions (feature 028, US2 AS2, FR-023)", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request }) => { await studySettings(request); });
	test.afterAll(async ({ request }) => {
		await studySettings(request);
		await clearStudyKey(request);
	});

	test("the mode switch and a route change still arrive and end finished, with no console error", async ({ browser }) => {
		test.setTimeout(240_000);
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		await withoutViewTransitions(context);
		await recordAnimations(context);
		const page = await context.newPage();
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
		await page.goto(`/chat/${CHATS.plain}`);
		await hydrated(page, '[aria-label="Open sidebar"]');
		expect(await page.evaluate(() => "startViewTransition" in document)).toBe(false);
		await page.waitForTimeout(1200);

		// Study → Notebook by the shortcut: the note arrives as a mode switch.
		await page.keyboard.press("Control+Shift+O");
		await expect(page).toHaveURL(/\/notebook/, { timeout: 60_000 });
		await expect(visible(page, '[data-testid="nb-editor"]')).toBeVisible({ timeout: 90_000 });
		await page.waitForTimeout(800);
		const mode = (await recordedAnimations(page)).filter((a) => a.kind === "mode" && ARRIVAL_NAMES.has(a.name));
		expect(mode.map((a) => a.name), "the note unfolds and inks in").toEqual(expect.arrayContaining(["nb-unfold", "nb-ink-in"]));
		expect(await page.locator("[data-lh-arrive]").count(), "the arrival attribute is gone").toBe(0);

		// Back to Study, then a route change by a link (the arrival CSS alone).
		await page.keyboard.press("Control+Shift+O");
		await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.plain}$`), { timeout: 60_000 });
		await hydrated(page, '[aria-label="Open sidebar"]');
		await page.waitForTimeout(800);
		await visible(page, '[data-testid="nb-wordmark"]').click();
		await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
		await page.waitForTimeout(1000);
		const home = (await recordedAnimations(page)).filter((a) => a.kind !== null && a.name === "nb-ink-in" && a.target.startsWith("h1"));
		expect(home.length, "Home's heading inks in").toBeGreaterThan(0);
		expect(await page.locator("[data-lh-arrive]").count(), "the arrival attribute is gone").toBe(0);
		const unfinished = await page.evaluate(() => document.getAnimations().filter((a) => ["nb-ink-in", "nb-unfold"].includes((a as CSSAnimation).animationName) && a.playState === "running").length);
		expect(unfinished).toBe(0);
		expect(errors.filter((e) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(e))).toEqual([]);
		await context.close();
	});
});

// Feature 028, US3 (rows 4-6): a route change lifts the old page and inks
// the new one in within 300ms (the row stagger by 600ms, O1), the chrome
// holds still, input lands at once, back/forward is a plain ink-in, and a
// tab select slides the tab marker.

/** The route's own motion: the regions' ink-in and the view-transition lift (a page's own pieces, such as a check thread unfolding as it mounts, are theirs). */
const routeMotion = (all: RecordedAnimation[], kind = "route") => all.filter((a) => a.duration > 0 && ((a.kind === kind && a.name === "nb-ink-in") || (a.pseudo ?? "").startsWith("::view-transition")));
/** A typed in-app link: the wordmark (to Home) or a Home row (to its lesson). */
const toHome = async (page: Page) => {
	await visible(page, '[data-testid="nb-wordmark"]').click();
	await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
	await expect(visible(page, "h1")).toHaveText("What do you want to learn?", { timeout: 60_000 });
};
const toRow = async (page: Page) => {
	await visible(page, ".waiting-row-action").click();
	await expect(page).toHaveURL(/\/chat\//, { timeout: 60_000 });
	await expect(visible(page, "[data-chat-id]")).toBeVisible({ timeout: 60_000 });
};
/** Opens two lessons so both have tabs, ending on the second. */
async function twoTabs(page: Page) {
	await openChat(page, CHATS.plain);
	await openChat(page, CHATS.check);
	await expect(page.getByTestId("workspace-tab")).toHaveCount(2, { timeout: 30_000 });
	await page.waitForTimeout(1200);
}
const tab = (page: Page, id: string) => visible(page, `[data-testid="workspace-tab"][data-tab-id$="${id}"]`);

test.describe("Motion: routes and tabs (feature 028, US3)", () => {
	test.beforeAll(async () => { await seedStudy(); });
	test.beforeEach(async ({ request, context, page }) => {
		await studySettings(request);
		await recordAnimations(context);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => {
		await studySettings(request);
		await clearStudyKey(request);
	});

	test("a route change: the lift and the heading in 300ms, the rows by 600ms, the chrome still (SC-003, FR-003)", async ({ page }) => {
		test.setTimeout(240_000);
		await openChat(page, CHATS.plain);
		await page.mouse.move(900, 600);
		await page.waitForTimeout(1200);
		const clip = await chromeClip(page);
		for (const [label, go] of [["lesson → Home", toHome], ["Home → lesson", toRow], ["lesson → Home again", toHome]] as const) {
			await clearRecorded(page);
			const before = await clipFrames(page, clip, 0);
			const framing = clipFrames(page, clip, 1500);
			await go(page);
			const frames = await framing;
			await page.waitForTimeout(600);
			const after = await clipFrames(page, clip, 0);
			const moved = frames.filter((frame) => !frame.equals(before[0]!) && !frame.equals(after[0]!));
			if (moved.length) for (const [i, frame] of frames.entries()) await test.info().attach(`${label}-${String(i).padStart(3, "0")}.png`, { body: frame, contentType: "image/png" });
			expect(moved.length, `${label}: chrome frames that differ from both ends (of ${frames.length})`).toBe(0);
			const motion = routeMotion(await recordedAnimations(page));
			expect(motion.some((a) => a.kind === "route"), `${label}: the new page inks in`).toBe(true);
			expect(motion.some((a) => (a.pseudo ?? "").startsWith("::view-transition-old")), `${label}: the old page lifts`).toBe(true);
			for (const a of motion) {
				const reading = a.delay === 0 || a.pseudo; // the lift, and the heading (the first in reading order)
				expect(a.delay + a.duration, `${label}: ${a.name} ${a.pseudo ?? a.target}`).toBeLessThanOrEqual(reading ? 300 : 600);
			}
			expect(motion.some((a) => a.inChrome), `${label}: nothing in the chrome animates`).toBe(false);
		}
	});

	test("a route change shifts no layout: Home, Library, Review and back (SC-007)", async ({ page }) => {
		test.setTimeout(240_000);
		// Pages that hold still once loaded (a lesson's own content settles as it
		// loads, with or without motion; motion animates no layout property, FR-017).
		await page.goto("/");
		await hydrated(page, '[aria-label="Open sidebar"]');
		await page.waitForTimeout(1500);
		const viaSidebar = (testId: string, url: RegExp) => async () => {
			await openSidebar(page);
			await page.getByTestId(testId).click();
			await expect(page).toHaveURL(url, { timeout: 60_000 });
		};
		for (const [label, go] of [["Home → Library", viaSidebar("sidebar-library", /\/library$/)], ["Library → Review", viaSidebar("sidebar-review", /\/review$/)], ["Review → Home", () => toHome(page)]] as const) {
			await clearRecorded(page);
			const shift = await layoutShiftDuring(page, go, 1200, true);
			expect(shift, `${label}: layout shift`).toBe(0);
			const motion = routeMotion(await recordedAnimations(page));
			expect(motion.some((a) => a.kind === "route"), `${label}: the page inks in`).toBe(true);
			for (const a of motion) {
				const reading = a.delay === 0 || a.pseudo;
				expect(a.delay + a.duration, `${label}: ${a.name} ${a.pseudo ?? a.target}`).toBeLessThanOrEqual(reading ? 300 : 600);
			}
		}
	});

	test("ten rapid clicks end on the last route they reached, with at most one transition running (FR-007)", async ({ page }) => {
		test.setTimeout(240_000);
		await twoTabs(page);
		const at = async (id: string) => { const box = (await tab(page, id).boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
		const a = await at(CHATS.plain), b = await at(CHATS.check);
		const word = (await visible(page, '[data-testid="nb-wordmark"]').boundingBox())!;
		const home = { x: word.x + word.width / 2, y: word.y + word.height / 2 };
		const sequence = [a, b, home, a, b, a, home, b, a, b];
		// Where each click landed. A click in the frame or two in which the
		// browser captures the leaving page (rendering paused until React's
		// update) hits the root and does nothing (progress.md, phase 6 finding).
		await page.evaluate(() => {
			const w = window as unknown as { __lhClicks: string[] };
			w.__lhClicks = [];
			window.addEventListener("click", (event) => {
				const target = event.target as Element;
				w.__lhClicks.push(target.closest("[data-tab-id]")?.getAttribute("data-tab-id") ?? (target.closest('[data-testid="nb-wordmark"]') ? "home" : `lost:${target.tagName}`));
			}, true);
		});
		// Every frame shows one page: a newer click replaces the transition in
		// flight, never stacks a second page or a second lift (FR-007).
		await page.evaluate(() => {
			const w = window as unknown as { __lhPagesMax: number; __lhLiftsMax: number; __lhStop?: boolean };
			w.__lhPagesMax = 0;
			w.__lhLiftsMax = 0;
			const shown = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
			const tick = () => {
				const pages = [...document.querySelectorAll("[data-chat-id]")].filter(shown).length + [...document.querySelectorAll("h1")].filter((h) => shown(h) && h.textContent === "What do you want to learn?").length;
				const lifts = new Set(document.getAnimations().filter((x) => x.playState === "running" && ((x.effect as KeyframeEffect | null)?.pseudoElement ?? "").startsWith("::view-transition-old")).map((x) => (x as CSSAnimation).animationName)).size;
				w.__lhPagesMax = Math.max(w.__lhPagesMax, pages);
				w.__lhLiftsMax = Math.max(w.__lhLiftsMax, lifts);
				if (!w.__lhStop) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});
		for (const point of sequence) {
			await page.mouse.click(point.x, point.y);
			await page.waitForTimeout(60);
		}
		const clicks = await page.evaluate(() => (window as unknown as { __lhClicks: string[] }).__lhClicks);
		const landed = clicks.filter((c) => !c.startsWith("lost:"));
		test.info().annotations.push({ type: "clicks", description: clicks.join(", ") });
		const last = landed.at(-1)!;
		const url = last === "home" ? /\/$/ : new RegExp(`/chat/${last.replace(/^chat:/, "")}$`);
		await expect(page, `the last click that reached a target (${clicks.join(", ")})`).toHaveURL(url, { timeout: 60_000 });
		await page.waitForTimeout(1200);
		const max = await page.evaluate(() => { const w = window as unknown as { __lhPagesMax: number; __lhLiftsMax: number; __lhStop?: boolean }; w.__lhStop = true; return { pages: w.__lhPagesMax, lifts: w.__lhLiftsMax }; });
		expect(max.pages, "pages on screen at once").toBeLessThanOrEqual(1);
		expect(max.lifts, "lifts running at once").toBeLessThanOrEqual(1);
		expect(await page.locator("[data-lh-arrive]").count(), "every arrival ended").toBe(0);
		// (Chrome keeps the finished, zero-length root groups of skipped transitions in getAnimations: only running ones count.)
		expect(await page.evaluate(() => document.getAnimations().filter((x) => x.playState === "running" && ((x.effect as KeyframeEffect | null)?.pseudoElement ?? "").startsWith("::view-transition")).length), "no transition left").toBe(0);
		expect(await page.evaluate(() => Boolean((document as unknown as { activeViewTransition?: unknown }).activeViewTransition)), "no transition active").toBe(false);
	});

	test("a click 50ms into a route transition lands (20 trials across the transition, SC-002)", async ({ page }) => {
		test.setTimeout(600_000);
		await openChat(page, CHATS.plain);
		await page.waitForTimeout(1200);
		const field = () => visible(page, '[data-testid="composer"] textarea');
		for (let trial = 0; trial < 20; trial++) {
			await visible(page, '[data-testid="nb-wordmark"]').click();
			await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
			await field().waitFor({ timeout: 60_000 });
			await page.waitForTimeout(trial * 15);
			await field().click();
			await page.keyboard.type("a");
			await expect(field(), `trial ${trial} (${trial * 15}ms in)`).toHaveValue("a");
			await field().fill("");
			await page.goto(`/chat/${CHATS.plain}`);
			await hydrated(page, '[aria-label="Open sidebar"]');
		}
	});

	test("back and forward ink in plainly: no lift and no stagger (row 5)", async ({ page }) => {
		test.setTimeout(240_000);
		await openChat(page, CHATS.plain);
		await page.waitForTimeout(1200);
		await toHome(page);
		await page.waitForTimeout(800);
		for (const [label, step] of [["back", () => page.goBack()], ["forward", () => page.goForward()]] as const) {
			await clearRecorded(page);
			await step();
			await page.waitForTimeout(1000);
			const all = await recordedAnimations(page);
			expect(all.filter((a) => (a.pseudo ?? "").startsWith("::view-transition")), `${label}: no lift`).toEqual([]);
			const arrivals = all.filter((a) => a.kind === "history" && ARRIVAL_NAMES.has(a.name));
			expect(arrivals.length, `${label}: the page inks in`).toBeGreaterThan(0);
			for (const a of arrivals) {
				expect(a.delay, `${label}: ${a.target}`).toBe(0);
				expect(a.duration, `${label}: ${a.target}`).toBeLessThanOrEqual(200);
			}
		}
	});

	test("a tab select slides the marker and inks the page once, without stagger (US3 AS2)", async ({ page }) => {
		test.setTimeout(240_000);
		await twoTabs(page);
		const marker = (await tab(page, CHATS.check).boundingBox())!;
		await clearRecorded(page);
		await tab(page, CHATS.plain).click();
		await expect(page).toHaveURL(new RegExp(`/chat/${CHATS.plain}$`), { timeout: 60_000 });
		await expect(chatView(page, CHATS.plain)).toBeVisible({ timeout: 60_000 });
		await page.waitForTimeout(1000);
		const all = await recordedAnimations(page);
		const slide = all.filter((a) => a.target.includes("lh-tab-marker") && a.name === "transform");
		expect(slide.length, "the marker slides").toBe(1);
		expect(slide[0]!.duration).toBe(280);
		const arrivals = all.filter((a) => a.kind === "tab" && ARRIVAL_NAMES.has(a.name));
		expect(arrivals.length, "the page inks in").toBeGreaterThan(0);
		const targets = arrivals.map((a) => a.target);
		expect(new Set(targets).size, "each part once").toBe(targets.length);
		for (const a of arrivals) {
			expect(a.delay, a.target).toBe(0);
			expect(a.duration, a.target).toBeLessThanOrEqual(200);
		}
		expect(await page.locator("[data-tab-sliding]").count(), "the underline is back").toBe(0);
		// At rest the selected tab's own underline shows, where the marker ended.
		const underline = await tab(page, CHATS.plain).evaluate((el) => getComputedStyle(el, "::after").opacity);
		expect(underline).toBe("1");
		expect(marker.width).toBeGreaterThan(0);
	});

	test("Home → lesson → Library → Back → Back keeps the lesson's scroll, transcript and draft (FR-014)", async ({ page }) => {
		test.setTimeout(240_000);
		// The plain lesson in a short window, so its transcript scrolls.
		const lesson = CHATS.plain;
		await page.setViewportSize({ width: 1440, height: 420 });
		await page.goto("/");
		await hydrated(page, '[aria-label="Open sidebar"]');
		await openChat(page, lesson);
		await page.waitForTimeout(1500);
		const scroller = () => page.evaluate((id) => {
			const view = [...document.querySelectorAll(`[data-chat-id="${id}"]`)].find((el) => el.getClientRects().length > 0);
			const main = view?.querySelector<HTMLElement>("[data-session-restored]") ?? [...(view?.querySelectorAll<HTMLElement>("*") ?? [])].find((el) => el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== "visible");
			return main ? { top: main.scrollTop, max: main.scrollHeight - main.clientHeight } : null;
		}, lesson);
		const transcript = () => chatView(page, lesson).locator(".is-user, .is-assistant").allInnerTexts();
		// Somewhere in the middle of the transcript, and an unsent draft.
		await page.evaluate((id) => {
			const view = [...document.querySelectorAll(`[data-chat-id="${id}"]`)].find((el) => el.getClientRects().length > 0);
			const main = view?.querySelector<HTMLElement>("[data-session-restored]") ?? [...(view?.querySelectorAll<HTMLElement>("*") ?? [])].find((el) => el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== "visible");
			if (main) main.scrollTop = Math.round((main.scrollHeight - main.clientHeight) / 2);
		}, lesson);
		const composer = visible(page, '[data-testid="composer"] textarea');
		await composer.fill("A draft that crosses routes");
		await page.waitForTimeout(800);
		const before = { scroll: await scroller(), turns: await transcript() };
		expect(before.scroll?.max ?? 0, "the lesson scrolls").toBeGreaterThan(40);

		await page.goto("/library");
		await hydrated(page, '[aria-label="Open sidebar"]');
		await page.waitForTimeout(800);
		await page.goBack();
		await expect(chatView(page, lesson)).toBeVisible({ timeout: 60_000 });
		await page.waitForTimeout(1500);
		const back = { scroll: await scroller(), turns: await transcript() };
		expect(back.turns, "the transcript").toEqual(before.turns);
		expect(Math.abs((back.scroll?.top ?? -1) - (before.scroll?.top ?? 0)), "the scroll position").toBeLessThanOrEqual(24);
		await expect(visible(page, '[data-testid="composer"] textarea'), "the draft").toHaveValue("A draft that crosses routes");
		await page.goBack();
		await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
		await expect(visible(page, "h1")).toHaveText("What do you want to learn?");
		await visible(page, '[data-testid="composer"] textarea').waitFor();
	});
});

// Feature 028, US4 (rows 7-12): layers open like paper and lift away; focus
// moves in on open and back to the opener on close in the same frame, and
// Escape closes the innermost layer at once (FR-005); every exit is opacity
// only and short (FR-004).

/**
 * Where focus is by the frame after the last input: read as soon as the key
 * or click has been handled, and once more after one animation frame (the
 * callbacks an app queues for that frame run before it paints).
 */
const focusByNextFrame = (page: Page, kind: "in" | "on", selector: string, frames = 1) => page.evaluate(async ([how, sel, n]) => {
	const test = () => {
		const at = document.activeElement;
		return how === "in" ? Boolean(at?.closest(sel)) : Boolean(at && [...document.querySelectorAll(sel)].includes(at));
	};
	if (test()) return true;
	// After that frame's callbacks and paint (a task queued from the frame).
	for (let i = 0; i < n; i++) await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
	return test();
}, [kind, selector, frames] as const);
/** Whether focus was inside `selector` (or on it) by the frame after the last input. */
const focusWasIn = (page: Page, selector: string) => focusByNextFrame(page, "in", selector);
/** Whether focus was on the element `selector` names by the frame after the last input. */
const focusWasOn = (page: Page, selector: string, frames = 1) => focusByNextFrame(page, "on", selector, frames);

interface LayerCase {
	name: string;
	/** Where the layer lives (navigates and waits). */
	setup: (page: Page) => Promise<void>;
	/** The opener, focused before the key that opens the layer. */
	opener: string;
	/** The key that opens it from the opener. */
	key: string;
	layer: string;
	/** What the closing layer's own elements are called in the recorder. */
	own: RegExp;
	/** The longest exit (FR-004: dialogs 120ms, menus 100ms, the sidebar 160ms). */
	exitMax: number;
	/** Tooltips leave focus where it is. */
	takesFocus?: boolean;
	/** Focused first, so focusing the opener is a new focus (a tooltip opens on focus). */
	prefocus?: string;
	/** Frames focus may take to come back (Settings gives it back in its own frame callback, before 028). */
	returnFrames?: number;
}

test.describe("Motion: layers (feature 028, US4)", () => {
	let diagramId = "";
	let pageId = "";
	test.beforeAll(async ({ request }) => {
		await seedStudy();
		const diagram = await request.post("/api/library/diagrams", { data: { name: `Motion map ${Date.now().toString(36)}`, form: "diagram", folderId: null } });
		expect(diagram.ok()).toBeTruthy();
		diagramId = ((await diagram.json()) as { item: { id: string } }).item.id;
		pageId = (await createPage(request, `Motion page ${Date.now().toString(36)}`, "A page to export.")).id;
	});
	test.beforeEach(async ({ request, context, page }) => {
		await studySettings(request);
		await recordAnimations(context);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterAll(async ({ request }) => {
		await studySettings(request);
		await clearStudyKey(request);
	});

	const settle = async (page: Page, path: string, ready: string) => {
		await page.goto(path);
		await hydrated(page, '[aria-label="Open sidebar"]');
		await hydrated(page, ready);
		await page.waitForTimeout(1200);
	};
	const cases: LayerCase[] = [
		{ name: "the sidebar", setup: (page) => settle(page, `/chat/${CHATS.plain}`, '[aria-label="Open sidebar"]'), opener: '[aria-label="Open sidebar"]', key: "Enter", layer: '[data-testid="nb-sidebar"]', own: /nb-sidebar|nb-side-dim/, exitMax: 160 },
		{ name: "the palette", setup: (page) => settle(page, "/", '[data-testid="composer"] textarea'), opener: '[data-testid="composer"] textarea', key: "Control+k", layer: '[data-testid="command-palette"]', own: /command-palette|lh-layer/, exitMax: 120 },
		{ name: "a menu", setup: (page) => settle(page, "/library", '[data-testid="library-more"]'), opener: '[data-testid="library-more"]', key: "Enter", layer: '[role="menu"]', own: /nb-menu/, exitMax: 100 },
		{ name: "a popover", setup: (page) => settle(page, `/library?item=${encodeURIComponent(diagramId)}`, '[data-testid="diagram-export"]'), opener: '[data-testid="diagram-export"]', key: "Enter", layer: '[data-testid="diagram-export-menu"]', own: /diagram-export-menu|lh-layer-pop/, exitMax: 100 },
		{ name: "a tooltip", setup: async (page) => { await settle(page, `/chat/${CHATS.plain}`, '[aria-label="Open sidebar"]'); await openSidebar(page); }, prefocus: '[data-testid="nb-sidebar"] input', opener: '[data-testid="kind-filter"]', key: "", layer: '[role="tooltip"]', own: /lh-layer-pop/, exitMax: 100, takesFocus: false },
		{ name: "settings", setup: (page) => settle(page, `/chat/${CHATS.plain}`, '[aria-label="Open sidebar"]'), opener: '[aria-label="Open sidebar"]', key: "Control+Comma", layer: '[data-testid="nb-settings"]', own: /nb-settings|nb-dialog-backdrop/, exitMax: 120, returnFrames: 2 },
		{ name: "export", setup: (page) => settle(page, `/library?item=${encodeURIComponent(pageId)}`, '[data-testid="page-export"]'), opener: '[data-testid="page-export"]', key: "Enter", layer: '[data-testid="page-export-dialog"]', own: /page-export-dialog|page-export-backdrop|nb-export|nb-dialog-backdrop/, exitMax: 120 },
		{ name: "link a repo", setup: (page) => settle(page, "/library", '[data-testid="library-link-repo"]'), opener: '[data-testid="library-link-repo"]', key: "Enter", layer: '[data-testid="repo-link-dialog"]', own: /repo-link-dialog|lh-layer/, exitMax: 120 },
	];

	for (const layer of cases) {
		test(`${layer.name}: focus in on open and back on close in the same frame, a short opacity exit (20 trials; FR-004, FR-005)`, async ({ page }) => {
			test.setTimeout(300_000);
			await layer.setup(page);
			const opener = () => visible(page, layer.opener);
			const open = async () => {
				if (layer.prefocus) await visible(page, layer.prefocus).focus();
				await opener().focus();
				if (layer.key) await page.keyboard.press(layer.key);
				await expect(visible(page, layer.layer)).toBeVisible({ timeout: 10_000 });
			};
			// Warm up: the first open may load the layer's code.
			await open();
			await page.keyboard.press("Escape");
			await expect(page.locator(layer.layer).filter({ visible: true })).toHaveCount(0);
			await page.waitForTimeout(400);
			for (let trial = 0; trial < 20; trial++) {
				await open();
				if (layer.takesFocus !== false && layer.key) expect(await focusWasIn(page, layer.layer), `${layer.name} trial ${trial}: focus inside on open`).toBe(true);
				await page.waitForTimeout(trial === 0 ? 500 : 80);
				if (trial === 0) await clearRecorded(page);
				const closedAt = await page.evaluate(() => performance.now());
				await page.keyboard.press("Escape");
				expect(await focusWasOn(page, layer.opener, layer.returnFrames), `${layer.name} trial ${trial}: focus back on the opener`).toBe(true);
				await expect(page.locator(layer.layer).filter({ visible: true }), `${layer.name} trial ${trial}: closed`).toHaveCount(0, { timeout: 2000 });
				if (trial === 0) {
					await page.waitForTimeout(400);
					const exits = (await recordedAnimations(page)).filter((a) => a.start >= closedAt - 5 && layer.own.test(a.target) && a.duration > 0);
					for (const a of exits) {
						expect(a.properties, `${layer.name}: ${a.name} on ${a.target}`).toEqual(["opacity"]);
						expect(a.delay + a.duration, `${layer.name}: ${a.name} on ${a.target}`).toBeLessThanOrEqual(layer.exitMax);
					}
				}
				await page.waitForTimeout(layer.exitMax + 60);
			}
		});
	}

	test("Escape twice within 50ms closes a tooltip and the sidebar under it, focus back on ☰", async ({ page }) => {
		test.setTimeout(240_000);
		await settle(page, `/chat/${CHATS.plain}`, '[aria-label="Open sidebar"]');
		for (let trial = 0; trial < 5; trial++) {
			await openSidebar(page);
			await page.getByTestId("kind-filter").focus();
			await expect(page.getByRole("tooltip")).toBeVisible({ timeout: 5000 });
			await page.keyboard.press("Escape");
			await page.waitForTimeout(30);
			await page.keyboard.press("Escape");
			await expect(page.getByRole("tooltip").filter({ hasText: "Filter" }), `trial ${trial}: the tooltip`).toHaveCount(0, { timeout: 1000 });
			await expect(page.getByTestId("nb-sidebar"), `trial ${trial}: the sidebar`).toHaveCount(0, { timeout: 1000 });
			await expect(visible(page, '[aria-label="Open sidebar"]'), `trial ${trial}: focus on ☰`).toBeFocused();
			await page.waitForTimeout(300);
		}
	});

	test("the sidebar's rows ink in on its first open of a page load only (row 7)", async ({ page }) => {
		test.setTimeout(120_000);
		await settle(page, `/chat/${CHATS.plain}`, '[aria-label="Open sidebar"]');
		const rowInks = async () => (await recordedAnimations(page)).filter((a) => a.name === "nb-ink-in" && /nb-side-row|nb-side-note/.test(a.target));
		await clearRecorded(page);
		await openSidebar(page);
		await page.waitForTimeout(800);
		const first = await rowInks();
		expect(first.length, "the rows ink in").toBeGreaterThan(1);
		for (const a of first) expect(a.delay, a.target).toBeLessThanOrEqual(200);
		expect(new Set(first.map((a) => a.delay)).size, "in reading order").toBeGreaterThan(1);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(1200);
		await clearRecorded(page);
		await openSidebar(page);
		await page.waitForTimeout(800);
		expect(await rowInks(), "not again").toEqual([]);
		const sheet = (await recordedAnimations(page)).filter((a) => a.name === "lh-sheet-in");
		expect(sheet.length, "the sheet still slides in").toBe(1);
	});
});
