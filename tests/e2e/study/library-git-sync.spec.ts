import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { GitRemote, skipReason } from "../../fixtures/git-remote";
import { clearStudyKey, hydrated, noPageOverflow, studySettings } from "./helpers";

// Feature 026, T023 (US1), journey part 1: link a repo from the Library.
// T033 (US2), journey part 2: it keeps itself up to date (Sync now, the
// status line, a changed and a removed open file, a revoked token).
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

	test.describe("part 2: it keeps itself up to date", () => {
		const LIVE_TOKEN = "ghp_e2eLIVE7171zz";
		let folderId = "";
		let linkId = "";
		let folder = "";
		test.beforeAll(async ({ request }) => {
			remote.createRepo("live", {
				"README.md": "# Live notes\n\nFirst version.\n",
				"week1/a.md": "# A\n",
				"week1/b.md": "# B\n",
			}, { token: LIVE_TOKEN });
			folder = `Live ${Date.now().toString(36)}`;
			await studySettings(request);
			const response = await request.post("/api/library/links", {
				data: { url: remote.url("live"), token: LIVE_TOKEN, folderName: folder, parentId: null, requestId: `req_live${Date.now().toString(36)}` },
			});
			expect(response.status()).toBe(201);
			const created = await response.json() as { folder: { id: string }; link: { id: string } };
			folderId = created.folder.id;
			linkId = created.link.id;
		});
		test.afterAll(() => { remote.setToken("live", LIVE_TOKEN); });

		const openFolder = async (page: Page) => {
			await page.goto(`/library?folder=${encodeURIComponent(folderId)}`);
			await hydrated(page, '[data-testid="library-sync-now"]');
		};

		test("push upstream → Sync now → tree and open file follow; a revoked token fails and the files stay", async ({ page }) => {
			test.setTimeout(180_000);
			await openFolder(page);
			const status = page.getByTestId("repo-status");
			await expect(status).toHaveText("Synced just now");
			const list = page.getByTestId("library-list");
			await expect(list.getByTestId("library-folder-row")).toHaveText([/week1/]);
			await page.getByRole("button", { name: "Open README.md" }).click();
			await expect(page.getByTestId("library-read-only")).toContainText("First version.");

			// Change, add and delete upstream.
			remote.commit("live", { "README.md": "# Live notes\n\nSecond version.\n", "week2/c.md": "# C\n", "week1/b.md": null });
			remote.delayMs = 700;
			await page.getByTestId("library-sync-now").click();
			await expect(page.getByTestId("library-sync-now")).toHaveText("Syncing…");
			await expect(page.getByTestId("library-sync-now")).toHaveAttribute("aria-disabled", "true");
			await expect(status).toHaveText("Syncing…");
			await shot(page, "sync-now-1440-light");
			remote.delayMs = 0;
			await expect(status).toHaveText("Synced just now", { timeout: 60_000 });
			await expect(page.getByTestId("library-sync-now")).toHaveText("Sync now");
			await expect(list.getByTestId("library-folder-row")).toHaveText([/week1/, /week2/]);
			await expect(page.getByTestId("repo-freshness")).toHaveText(/Updated from the repo/);
			await shot(page, "updated-1440-light");
			await page.getByTestId("repo-freshness-reload").click();
			await expect(page.getByTestId("library-read-only")).toContainText("Second version.");
			await expect(page.getByTestId("repo-freshness")).toHaveCount(0);
			await list.getByRole("link", { name: "Open folder week1" }).click();
			await expect(page.getByTestId("library-list")).toContainText("a.md");
			await expect(page.getByTestId("library-list")).not.toContainText("b.md");

			// Removed upstream while open.
			await page.getByTestId("library-breadcrumbs").getByRole("link", { name: folder }).click();
			await hydrated(page, '[data-testid="library-sync-now"]');
			remote.commit("live", { "README.md": null });
			await page.getByTestId("library-sync-now").click();
			await expect(page.getByTestId("repo-freshness")).toHaveText("Removed from the repo", { timeout: 60_000 });
			await expect(page.getByTestId("library-read-only")).toContainText("Second version.");
			await expect(page.getByTestId("library-list")).not.toContainText("README.md");
			await shot(page, "removed-1440-light");

			// The token is revoked upstream: the pull fails, the files stay.
			remote.setToken("live", "ghp_rotatedAWAY0000");
			await page.getByTestId("library-sync-now").click();
			await expect(status).toContainText("Sync failed · The repo refused the token. Check that it can read this repo.", { timeout: 60_000 });
			await expect(page.getByTestId("library-list").getByTestId("library-folder-row")).toHaveText([/week1/, /week2/]);
			await page.getByTestId("repo-status-details").click();
			await expect(page.getByTestId("repo-status-detail")).toBeVisible();
			expect(await page.content()).not.toContain(LIVE_TOKEN);
			await shot(page, "failed-1440-light");
			await page.getByTestId("library-breadcrumbs").getByRole("link", { name: "Library" }).click();
			await expect(page.getByTestId("library-folder-row").filter({ hasText: folder })).toContainText("Sync failed");

			// Back to a good token: the status line's own Sync now clears the failure.
			remote.setToken("live", LIVE_TOKEN);
			await openFolder(page);
			await page.getByTestId("repo-status-sync").click();
			await expect(status).toHaveText("Synced just now", { timeout: 60_000 });
		});

		test("the time moves on its own: Synced {n} min ago", async ({ page }) => {
			await page.clock.install();
			await openFolder(page);
			await expect(page.getByTestId("repo-status")).toHaveText("Synced just now");
			await page.clock.fastForward("03:00");
			await expect(page.getByTestId("repo-status")).toHaveText("Synced 3 min ago");
			await expect(page.getByTestId("library-folder-row").first()).toBeVisible();
		});

		for (const width of [390, 1440]) {
			test(`the status states fit at ${width}px, light and dark`, async ({ page, request, browser, baseURL }) => {
				test.setTimeout(180_000);
				await page.setViewportSize({ width, height: width < 500 ? 780 : 900 });
				for (const appearance of ["light", "dark"] as const) {
					await studySettings(request, { appearance });
					// Synced N min ago, on a page whose clock runs ahead (the clock is per context).
					const ahead = await browser.newContext({ baseURL, viewport: { width, height: width < 500 ? 780 : 900 } });
					const timed = await ahead.newPage();
					await timed.clock.install();
					await openFolder(timed);
					await timed.clock.fastForward("05:00");
					await expect(timed.getByTestId("repo-status")).toHaveText("Synced 5 min ago");
					await noPageOverflow(timed, `synced ${width} ${appearance}`);
					await shot(timed, `synced-${width}-${appearance}`);
					await ahead.close();
					await openFolder(page);
					// Sync now running.
					remote.delayMs = 900;
					await page.getByTestId("library-sync-now").click();
					await expect(page.getByTestId("library-sync-now")).toHaveText("Syncing…");
					await shot(page, `sync-now-${width}-${appearance}`);
					remote.delayMs = 0;
					await expect(page.getByTestId("library-sync-now")).toHaveText("Sync now", { timeout: 60_000 });
					// A failed pull.
					remote.setToken("live", "ghp_rotatedAWAY0000");
					await page.getByTestId("library-sync-now").click();
					await expect(page.getByTestId("repo-status")).toContainText("Sync failed", { timeout: 60_000 });
					await page.getByTestId("repo-status-details").click();
					await noPageOverflow(page, `failed ${width} ${appearance}`);
					await shot(page, `failed-${width}-${appearance}`);
					remote.setToken("live", LIVE_TOKEN);
					// Removed from the repo, in an open reader.
					const name = `gone-${width}-${appearance}.md`;
					remote.commit("live", { [name]: "# Soon gone\n" });
					await page.getByTestId("repo-status-sync").click();
					await expect(page.getByTestId("repo-status")).toHaveText("Synced just now", { timeout: 60_000 });
					await page.getByRole("button", { name: `Open ${name}` }).click();
					await expect(page.getByTestId("library-read-only")).toContainText("Soon gone");
					remote.commit("live", { [name]: null });
					// On a phone the reader covers the toolbar: Sync now through the route.
					expect((await request.post(`/api/library/links/${linkId}/sync`)).status()).toBe(202);
					await expect(page.getByTestId("repo-freshness")).toHaveText("Removed from the repo", { timeout: 60_000 });
					await shot(page, `removed-${width}-${appearance}`);
					await page.locator("[data-testid=page-back], [data-testid=page-close]").filter({ visible: true }).first().click();
					await expect(page.getByTestId("page-pane")).toBeHidden();
				}
			});
		}
	});
});
