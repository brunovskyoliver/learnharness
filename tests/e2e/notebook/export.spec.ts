import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Feature 024, US7 (T039): Just my words, Copy this note, and the Export
// dialog with real downloads. Threads are seeded straight into the test
// server's companion files.

const CONTENT = "Entropy always rises in a closed system.\n\nSo a cup of tea cools down.\n\nThe last line.\n";
const AI_NOTE = "Closed to what, exactly?";
const INLINE_NOTE = "Picture the heat leaving the cup.";
const AT = "2026-11-06T10:00:00.000Z";
const SKETCH = {
	title: "Heat flows", subtitle: "Hot to cold.", w: 200, h: 100,
	items: [{ step: 0, kind: "rect", x: 10, y: 10, w: 60, h: 40 }, { step: 1, kind: "arrow", x1: 80, y1: 30, x2: 150, y2: 30 }],
	steps: [{ caption: "A hot cup." }, { caption: "Heat leaves it." }],
};
const THREADS = [
	{
		id: "thr_m", anchor: { quote: "closed system", prefix: "", suffix: "" }, placement: "margin", side: "right", status: "open", origin: "read", createdAt: AT, updatedAt: AT,
		messages: [{ id: "msg_m", author: "ai", text: AI_NOTE, at: AT, reviewerId: "examiner" }],
	},
	{
		id: "thr_i", anchor: { quote: "a cup of tea cools down", prefix: "", suffix: "" }, placement: "inline", side: "right", status: "open", origin: "visualize", createdAt: AT, updatedAt: AT,
		messages: [{ id: "msg_i", author: "ai", text: INLINE_NOTE, at: AT, sketch: SKETCH }],
	},
];

async function putSection(request: APIRequestContext, section: "general" | "notebook", patch: Record<string, unknown>) {
	const read = await request.get("/api/settings");
	const record = ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok()).toBeTruthy();
}

async function seededNote(page: Page, request: APIRequestContext, name: string): Promise<{ id: string; name: string }> {
	const full = `${name} ${Date.now()}`;
	const response = await request.post("/api/library/pages", { data: { name: full, content: CONTENT } });
	expect(response.ok()).toBeTruthy();
	const id = ((await response.json()) as { item: { id: string } }).item.id;
	const dir = path.join(process.env.LH_E2E_DATA_DIR!, "library", "notebook");
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ v: 1, pageId: id, instruction: "", reviewerId: "examiner", threads: THREADS, chat: [] }));
	await page.goto(`/notebook/${id}`);
	await expect(page.getByTestId("nb-editor")).toBeVisible({ timeout: 60_000 });
	return { id, name: full };
}

/** The entries of a zip by its central directory, inflated. */
function unzip(bytes: Buffer): Map<string, string> {
	const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	const count = bytes.readUInt16LE(end + 10);
	let at = bytes.readUInt32LE(end + 16);
	const out = new Map<string, string>();
	for (let i = 0; i < count; i++) {
		const method = bytes.readUInt16LE(at + 10);
		const size = bytes.readUInt32LE(at + 20);
		const nameLength = bytes.readUInt16LE(at + 28);
		const local = bytes.readUInt32LE(at + 42);
		const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
		const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
		const raw = bytes.subarray(start, start + size);
		out.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString("latin1"));
		at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
	}
	return out;
}

async function download(page: Page, format: "pdf" | "docx" | "md", includeAi: boolean): Promise<{ name: string; bytes: Buffer }> {
	await page.getByTestId("nb-export").click();
	const dialog = page.getByTestId("nb-export-dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByTestId(`nb-export-format-${format}`).click();
	const toggle = dialog.getByTestId("nb-export-include");
	if ((await toggle.getAttribute("aria-checked")) !== String(includeAi)) await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", String(includeAi));
	const waiting = page.waitForEvent("download");
	await dialog.getByTestId("nb-export-run").click();
	const file = await waiting;
	const where = await file.path();
	await expect(dialog).toBeHidden();
	return { name: file.suggestedFilename(), bytes: readFileSync(where) };
}

test.describe("Notebook: Just my words and export", () => {
	test.beforeEach(async ({ request, page }) => {
		await putSection(request, "general", { interface: "notebook" });
		await putSection(request, "notebook", { appearance: "light", startMode: "thinks", pace: "regular", layout: "both" });
		await page.setViewportSize({ width: 1440, height: 962 });
	});

	test("Just my words hides every AI layer, pauses reading, and survives a reload", async ({ page, request }) => {
		await seededNote(page, request, "Plain");
		const marginNote = page.getByTestId("nb-margin-note");
		await expect(marginNote).toHaveCount(1, { timeout: 30_000 });
		await expect(page.getByTestId("nb-inline-reply")).toHaveCount(1);
		await expect(page.getByTestId("nb-sketch")).toHaveCount(1);
		await expect(page.locator(".nb-anchor")).toHaveCount(2);

		await page.getByTestId("nb-editor").getByText("The last line.").click();
		await page.keyboard.press("Control+Shift+H");
		const root = page.getByTestId("notebook-root");
		await expect(root).toHaveAttribute("data-plain", "");
		await expect(page.getByTestId("nb-live")).toHaveText("Just your words. The notes are hidden, not gone.");
		await expect(page.getByTestId("nb-hint-plain")).toHaveText("Just your words. The notes are hidden, not gone.");
		for (const id of ["nb-margin-note", "nb-inline-reply", "nb-sketch", "nb-tether", "nb-ink-dot"]) await expect(page.getByTestId(id)).toHaveCount(0);
		await expect(page.locator(".nb-anchor, .nb-mark, .nb-reading, .nb-sketching")).toHaveCount(0);
		// His words are untouched.
		await expect(page.getByTestId("nb-editor")).toContainText("Entropy always rises in a closed system.");

		// No automatic read while the notes are hidden (nothing would be seen).
		await page.keyboard.press("End");
		await page.keyboard.type(" More words.");
		await page.waitForTimeout(2600);
		const feed = (await (await request.get("/api/activity")).json()) as { notebookRuns?: unknown[] };
		expect(feed.notebookRuns ?? []).toHaveLength(0);
		await expect(page.getByTestId("nb-hint-running")).toHaveCount(0);

		await page.reload();
		await expect(page.getByTestId("nb-editor").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
		await expect(page.getByTestId("notebook-root").filter({ visible: true })).toHaveAttribute("data-plain", "");
		await page.waitForTimeout(800);
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(0);
		await expect(page.locator(".nb-anchor")).toHaveCount(0);
		expect(await page.evaluate(() => localStorage.getItem("lh.nb.justMyWords"))).toBe("on");

		await page.keyboard.press("Control+Shift+H");
		await expect(page.getByTestId("notebook-root").filter({ visible: true })).not.toHaveAttribute("data-plain", "");
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(1);
		await expect(page.getByTestId("nb-inline-reply")).toHaveCount(1);
		await expect(page.getByTestId("nb-live")).toHaveText("The notes are back.");
	});

	test("Copy this note gives the Markdown with the notes under their paragraphs, or just his words", async ({ page, request }) => {
		await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
		await seededNote(page, request, "Copy");
		await expect(page.getByTestId("nb-margin-note")).toHaveCount(1, { timeout: 30_000 });
		await page.keyboard.press("Control+Shift+C");
		await expect(page.getByTestId("nb-live")).toHaveText("Copied.");
		const withNotes = await page.evaluate(() => navigator.clipboard.readText());
		expect(withNotes).toContain(`Entropy always rises in a closed system.\n\n> **Examiner:** ${AI_NOTE}\n\nSo a cup of tea cools down.\n\n> ${INLINE_NOTE}\n>\n> *Drawing: Heat flows*`);

		await page.keyboard.press("Control+Shift+H");
		await page.keyboard.press("Control+Shift+C");
		await expect(page.getByTestId("nb-live")).toHaveText("Copied.");
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CONTENT);
		await page.keyboard.press("Control+Shift+H");
	});

	test("the export dialog opens from the toolbar and Mod+Shift+E, remembers its choices, and closes back to where he was", async ({ page, request }) => {
		const { name } = await seededNote(page, request, "Dialog");
		await page.getByTestId("nb-export").click();
		const dialog = page.getByTestId("nb-export-dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("heading")).toHaveText(`Export “${name}”`);
		await expect(dialog.getByRole("radio")).toHaveText(["PDFTo read, print or send.", "WordTo keep editing in Word, Pages or Google Docs.", "MarkdownPlain text for anywhere."]);
		await expect(dialog.getByTestId("nb-export-format-pdf")).toHaveAttribute("aria-checked", "true");
		await expect(dialog.getByTestId("nb-export-include")).toHaveAttribute("aria-checked", "true");
		await expect(dialog.getByText("Each one sits under the paragraph it's about, drawings too.")).toBeVisible();
		await expect(dialog.getByTestId("nb-export-run")).toHaveText("Export PDF");
		// Selected card: a 1.5px ink ring, no fill.
		expect(await dialog.getByTestId("nb-export-format-pdf").evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/1\.5px/);
		expect(await dialog.getByTestId("nb-export-format-pdf").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
		await dialog.getByTestId("nb-export-format-docx").click();
		await expect(dialog.getByTestId("nb-export-run")).toHaveText("Export Word");
		await dialog.getByTestId("nb-export-include").click();
		await dialog.getByTestId("nb-export-cancel").click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId("nb-export")).toBeFocused();

		await page.getByTestId("nb-editor").getByText("The last line.").click();
		await page.keyboard.press("Control+Shift+E");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByTestId("nb-export-format-docx")).toHaveAttribute("aria-checked", "true");
		await expect(dialog.getByTestId("nb-export-include")).toHaveAttribute("aria-checked", "false");
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId("nb-editor")).toBeFocused();
	});

	test("downloads Markdown, Word and PDF with the notes and without", async ({ page, request }) => {
		const { id, name } = await seededNote(page, request, "Files");
		const safe = name.replace(/:/g, " ");

		const mdWith = await download(page, "md", true);
		expect(mdWith.name).toBe(`${safe}.md`);
		const md = mdWith.bytes.toString("utf8");
		expect(md.startsWith(`# ${name}\n\nEntropy always rises in a closed system.\n\n> **Examiner:** ${AI_NOTE}`)).toBeTruthy();
		expect(md).toContain("> 1. A hot cup.");
		const mdWithout = (await download(page, "md", false)).bytes.toString("utf8");
		expect(mdWithout).toBe(`# ${name}\n\n${CONTENT}`);

		const docWith = await download(page, "docx", true);
		expect(docWith.name).toBe(`${safe}.docx`);
		const parts = unzip(docWith.bytes);
		expect(parts.get("word/document.xml")).toContain(AI_NOTE);
		expect(parts.get("word/document.xml")).toContain('w:val="AINote"');
		expect(parts.has("word/media/image1.png")).toBeTruthy();
		const docWithout = unzip((await download(page, "docx", false)).bytes);
		expect(docWithout.get("word/document.xml")).not.toContain(AI_NOTE);
		expect(docWithout.get("word/document.xml")).toContain("So a cup of tea cools down.");

		// PDF needs a browser on the server; without one the route says so (503) and the test says it skipped.
		const probe = await request.post(`/api/notebook/${id}/export`, { data: { format: "pdf", includeAi: false } });
		test.skip(probe.status() === 503, `no browser on the e2e server: ${await probe.text()}`);
		const pdfWith = await download(page, "pdf", true);
		expect(pdfWith.name).toBe(`${safe}.pdf`);
		expect(pdfWith.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
		const pdfWithout = await download(page, "pdf", false);
		expect(pdfWithout.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
		// The notes (and the drawing) make the file bigger.
		expect(pdfWith.bytes.length).toBeGreaterThan(pdfWithout.bytes.length);
	});

	test("a failed export says so in place with the details one click away", async ({ page, request }) => {
		await seededNote(page, request, "Fails");
		await page.route("**/export", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The PDF could not be made.", detail: "printer on fire" }) }));
		await page.getByTestId("nb-export").click();
		const dialog = page.getByTestId("nb-export-dialog");
		await dialog.getByTestId("nb-export-run").click();
		await expect(dialog.getByTestId("nb-export-problem")).toContainText("The export didn't work.");
		await dialog.getByRole("button", { name: "Show details" }).click();
		await expect(dialog.getByTestId("nb-export-detail")).toHaveText("The PDF could not be made. printer on fire");
		await expect(dialog).toBeVisible();
	});
});
