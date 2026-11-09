import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ARRIVAL_NAMES, CHATS, arrivalWindow, chord, clearStudyKey, hydrated, recordAnimations, recordedAnimations, seedStudy, studySettings, visible, type RecordedAnimation } from "./helpers";

// Feature 028 (one motion language): the cold-load signature (US1, rows 1-2)
// Each cold load
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
