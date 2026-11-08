import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { GitRemote, skipReason } from "../../fixtures/git-remote";
import { clearStudyKey, hydrated, noPageOverflow, studySettings } from "./helpers";

// Feature 026, T023 (US1), journey part 1: link a repo from the Library.
// The fixture remote (real `git http-backend` on 127.0.0.1) serves the repos;
// the e2e server lets loopback http through (LH_TEST_GIT_LOOPBACK_HTTP=1).
// Set LH_SHOTS_DIR to save screenshots of the new UI there.

const TOKEN = "ghp_e2eSENTINEL9090zz";
const shots = process.env.LH_SHOTS_DIR;
let remote: GitRemote;

async function shot(page: Page, name: string) {
	if (!shots) return;
	mkdirSync(shots, { recursive: true });
	// Let the dialog's fade and the pill's transition settle.
	await page.waitForTimeout(400);
	await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

async function openLinkDialog(page: Page) {
	await page.goto("/library");
	await hydrated(page, '[data-testid="library-link-repo"]');
	await page.getByTestId("library-link-repo").click();
	await expect(page.getByTestId("repo-link-dialog")).toBeVisible();
}

const display = (name: string) => remote.url(name).replace(/^http:\/\//, "").replace(/\.git$/, "");

test.describe("Study: link a repo into the Library", () => {
	test.skip(Boolean(skipReason()), skipReason() ?? "");
	test.beforeAll(async () => {
		remote = await GitRemote.start();
		remote.createRepo("notes", {
			"README.md": "# Course notes\n\nStart here.\n",
			"week1/notes.md": "# Week 1\n\nWaves carry energy.\n",
			"week2/notes.md": "# Week 2\n\nInterference.\n",
			"week2/proofs/lemma.txt": "Lemma 1. qed\n",
			"papers/sample.pdf": readFileSync(path.join(process.cwd(), "tests/fixtures/sample-3page.pdf")),
			"tools/run.exe": new Uint8Array([0x4d, 0x5a, 0, 1]),
			"node_modules/x/index.js": "x",
		});
		remote.createRepo("private", { "secret.md": "# Private\n" }, { token: TOKEN });
	});
	test.afterAll(async () => { await remote?.close(); });
	test.beforeEach(async ({ request, page }) => {
		await studySettings(request);
		await page.setViewportSize({ width: 1440, height: 900 });
	});
	test.afterEach(async ({ request }) => { await clearStudyKey(request); });

	test("link → syncing → tree → a Markdown file opens read-only → a PDF opens", async ({ page }) => {
		test.setTimeout(180_000);
		const folder = `Course ${Date.now().toString(36)}`;
		await openLinkDialog(page);
		await expect(page.getByTestId("repo-link-location")).toHaveText("In Library");
		await page.getByTestId("repo-link-url").fill(remote.url("notes"));
		await expect(page.getByTestId("repo-link-folder")).toHaveValue("notes");
		await page.getByTestId("repo-link-folder").fill(folder);
		await shot(page, "dialog-1440-light");
		// Slow the remote down so the first pull can be watched.
		remote.delayMs = 700;
		await page.getByTestId("repo-link-submit").click();
		await expect(page.getByTestId("repo-link-submit")).toHaveText("Linking…");
		await expect(page.getByTestId("library-pending-link").filter({ hasText: folder })).toContainText("Syncing for the first time…");
		await shot(page, "linking-1440-light");
		remote.delayMs = 0;
		await expect(page.getByTestId("repo-link-dialog")).toBeHidden({ timeout: 60_000 });
		await expect(page.getByTestId("library-pending-link")).toHaveCount(0);

		const row = page.getByTestId("library-folder-row").filter({ hasText: folder });
		await expect(row).toContainText("Repo · 4 items");
		await shot(page, "linked-row-1440-light");
		await row.getByRole("link", { name: `Open folder ${folder}` }).click();
		const list = page.getByTestId("library-list");
		await expect(list.getByTestId("library-folder-row")).toHaveText([/papers/, /week1/, /week2/]);
		await expect(list).toContainText("README.md");
		await expect(list).not.toContainText("tools");
		await expect(list).not.toContainText("node_modules");

		await list.getByRole("link", { name: "Open folder week1" }).click();
		await page.getByRole("button", { name: "Open notes.md" }).click();
		await expect(page.getByTestId("library-read-only")).toContainText("Waves carry energy.");
		await expect(page.getByTestId("library-read-only-source")).toHaveText(`This comes from ${display("notes")}. Change it in the repo.`);
		await shot(page, "read-only-1440-light");

		await page.getByTestId("library-breadcrumbs").getByRole("link", { name: folder }).click();
		await page.getByTestId("library-list").getByRole("link", { name: "Open folder papers" }).click();
		await page.getByRole("button", { name: "Open sample.pdf" }).click();
		await expect(page.getByTestId("pdf-reader")).toBeVisible();
		await expect(page.getByTestId("pdf-repo-source")).toHaveText(`From ${display("notes")}`);
		await expect(page.getByTestId("pdf-page-count")).toHaveText("of 3", { timeout: 30_000 });
	});

	test("a private repo: refused without a token, linked with one; the token never reaches the page", async ({ page, request }) => {
		test.setTimeout(120_000);
		const folder = `Private ${Date.now().toString(36)}`;
		await openLinkDialog(page);
		await page.getByTestId("repo-link-url").fill(remote.url("private"));
		await page.getByTestId("repo-link-folder").fill(folder);
		await page.getByTestId("repo-link-submit").click();
		await expect(page.getByTestId("repo-link-refusal")).toContainText("This repo is private. Add a token that can read it.");
		await expect(page.getByTestId("repo-link-token")).toHaveAttribute("aria-invalid", "true");
		await page.getByRole("button", { name: "Show details" }).click();
		await expect(page.getByTestId("repo-link-detail")).toBeVisible();
		await shot(page, "refusal-1440-light");
		await expect(page.getByTestId("repo-link-token")).toHaveAttribute("type", "password");
		await expect(page.getByTestId("repo-link-token")).toHaveAttribute("autocomplete", "off");
		await page.getByTestId("repo-link-token").fill(TOKEN);
		await page.getByTestId("repo-link-submit").click();
		await expect(page.getByTestId("repo-link-dialog")).toBeHidden({ timeout: 60_000 });
		await expect(page.getByTestId("library-folder-row").filter({ hasText: folder })).toContainText("Repo · 1 item");
		expect(await page.content()).not.toContain(TOKEN);
		const links = await (await request.get("/api/library/links")).text();
		expect(links).not.toContain(TOKEN);
		expect(links).toContain("tokenMask");
	});

	test("a wrong address is refused under its field and creates nothing", async ({ page, request }) => {
		const before = (await (await request.get("/api/library")).json() as { folders: unknown[] }).folders.length;
		await openLinkDialog(page);
		await page.getByTestId("repo-link-url").fill("git@github.com:oliver/notes.git");
		await page.getByTestId("repo-link-folder").fill("Should not exist");
		await page.getByTestId("repo-link-submit").click();
		await expect(page.getByTestId("repo-link-refusal")).toHaveText("Only HTTPS addresses are supported.");
		await expect(page.getByTestId("repo-link-url")).toHaveAttribute("aria-invalid", "true");
		await page.getByTestId("repo-link-cancel").click();
		await expect(page.getByTestId("repo-link-dialog")).toBeHidden();
		await expect(page.getByTestId("library-link-repo")).toBeFocused();
		const after = (await (await request.get("/api/library")).json() as { folders: unknown[] }).folders.length;
		expect(after).toBe(before);
	});

	for (const width of [320, 390, 1440]) {
		test(`the dialog and the linked folder fit at ${width}px`, async ({ page, request }) => {
			test.setTimeout(120_000);
			await page.setViewportSize({ width, height: width < 500 ? 780 : 900 });
			await openLinkDialog(page);
			await page.getByRole("button", { name: "Default branch" }).click();
			await expect(page.getByTestId("repo-link-branch")).toBeFocused();
			await noPageOverflow(page, `dialog ${width}`);
			const box = await page.getByTestId("repo-link-dialog").boundingBox();
			expect(box!.x).toBeGreaterThanOrEqual(0);
			expect(box!.x + box!.width).toBeLessThanOrEqual(width);
			await page.keyboard.press("Escape");
			await expect(page.getByTestId("repo-link-dialog")).toBeHidden();
			await page.goto("/library");
			await hydrated(page, '[data-testid="library-link-repo"]');
			await noPageOverflow(page, `library ${width}`);
			if (shots && width !== 320) {
				for (const appearance of ["light", "dark"] as const) {
					await studySettings(request, { appearance });
					await page.goto("/library");
					await hydrated(page, '[data-testid="library-link-repo"]');
					await shot(page, `library-${width}-${appearance}`);
					await page.getByTestId("library-link-repo").click();
					await page.getByTestId("repo-link-url").fill("https://github.com/you/notes");
					await shot(page, `dialog-${width}-${appearance}`);
					await page.keyboard.press("Escape");
					const linked = page.getByTestId("library-folder-row").filter({ hasText: /^Course/ }).filter({ hasText: "Repo ·" }).first();
					await linked.getByRole("link").click();
					await page.getByTestId("library-list").getByRole("link", { name: "Open folder week1" }).click();
					await page.getByRole("button", { name: "Open notes.md" }).click();
					await expect(page.getByTestId("library-read-only-source")).toBeVisible();
					await shot(page, `read-only-${width}-${appearance}`);
					// The open file is remembered; close it so the next pass starts on the list.
					await page.locator("[data-testid=page-back], [data-testid=page-close]").filter({ visible: true }).first().click();
					await expect(page.getByTestId("page-pane")).toBeHidden();
				}
			}
		});
	}
});
