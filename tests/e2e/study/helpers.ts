import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page, type Request } from "@playwright/test";
import { seedReviewChats } from "../../../scripts/seed-review.mjs";
import type { GitRemote } from "../../fixtures/git-remote";

// Feature 025, T062: the Study journeys' shared ground. One isolated data dir
// (the config's), the review chats from scripts/seed-review.mjs plus three
// made here, Library pages and cards through the API, and every model
// submission intercepted in the browser (no model runs; bodies recorded).

export const dataDir = () => process.env.LH_E2E_DATA_DIR!;

const fixture = (name: string) => JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/golden-data/chats", name), "utf8")) as ChatRecord;
interface ChatRecord { id: string; title: string; kind?: string; messages: Array<{ id?: string; role: string; content?: unknown; toolName?: string }>; [key: string]: unknown }
interface ToolCall { type: string; id: string; name: string; arguments: Record<string, unknown> }
const calls = (message: ChatRecord["messages"][number]) => (Array.isArray(message.content) ? (message.content as ToolCall[]) : []).filter((part) => part.type === "toolCall");

export const CHATS = {
	/** The seeded teach check (reveal-gated, choices + confidence). */
	check: "review-belief-check",
	/** The seeded active practice problem. */
	practice: "review-practice",
	/** A free-text check (the lesson's explain), made here. */
	text: "e2e-free-text-check",
	/** A practice session between problems (Next problem), made here. */
	pause: "e2e-practice-pause",
	/** A finished lesson with nothing waiting (sends and drafts), made here. */
	plain: "e2e-plain-lesson",
} as const;

function writeChat(record: ChatRecord) {
	const dir = path.join(dataDir(), "chats");
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, `${record.id}.json`), JSON.stringify(record));
}

let seeded = false;
/** Idempotent: the review chats (kept when present) and this suite's own. */
export async function seedStudy() {
	if (seeded) return;
	await seedReviewChats(dataDir());
	const lesson = fixture("chat_mv27rrra_feff23b6.json");
	const practice = fixture("chat_mv293wv5_10656952.json");
	const now = Date.now();
	const stamp = (record: ChatRecord, minutes: number): ChatRecord => ({ ...record, createdAt: new Date(now - 3_600_000).toISOString(), updatedAt: new Date(now - minutes * 60_000).toISOString() });

	// The first explain after the second plan: a text-mode teach check.
	const explain = lesson.messages.findIndex((m, i) => i > 60 && m.role === "assistant" && calls(m).some((c) => c.name === "explain"));
	expect(explain).toBeGreaterThan(0);
	writeChat(stamp({ ...structuredClone(lesson), id: CHATS.text, title: "E2E · Free-text check", messages: structuredClone(lesson.messages.slice(0, explain + 1)) }, 5));

	// Practice after the first problem concluded and the tutor's closing
	// words: the between-problems pause (a turn ending on the tool result
	// would read as interrupted and continue itself).
	const concluded = practice.messages.findIndex((m) => m.role === "toolResult" && m.toolName === "conclude");
	expect(practice.messages[concluded + 1]?.role).toBe("assistant");
	writeChat(stamp({ ...structuredClone(practice), id: CHATS.pause, title: "E2E · Between problems", kind: "practice", messages: structuredClone(practice.messages.slice(0, concluded + 2)) }, 6));

	// The whole lesson with its last assistant text only: nothing pending.
	const last = structuredClone(lesson.messages.findLast((m) => m.role === "assistant" && Array.isArray(m.content) && (m.content as Array<{ type: string }>).some((p) => p.type === "text"))!);
	last.content = [{ type: "text", text: "## Belief as a number\n\nA learner's mastery is never observed directly, so the tutor holds a belief: a single number between 0 and 1.\n\nEach response moves that number by Bayes' rule." }];
	writeChat(stamp({ ...structuredClone(lesson), id: CHATS.plain, title: "E2E · Plain lesson", messages: [{ id: "e2e_user", role: "user", content: "Teach me how belief updates work.", timestamp: now - 9000 } as never, { ...last, id: "e2e_assistant" }] }, 7));
	seeded = true;
}

/** Study settings for a journey: Study mode, light paper, and a key so the
 *  composer is live (submissions never leave the browser: interceptModel). */
export async function studySettings(request: APIRequestContext, notebook: Record<string, unknown> = {}) {
	await putSection(request, "general", { interface: "study" });
	await putSection(request, "notebook", { appearance: "light", textSize: "default", lettering: "serif", ink: "ink", ...notebook });
	const key = await request.put("/api/keys/OPENROUTER_API_KEY", { data: { value: "sk-or-e2e-never-used-0000" } });
	expect(key.ok()).toBeTruthy();
}

/** Back to the state Notebook's journeys expect: no key. */
export async function clearStudyKey(request: APIRequestContext) {
	await request.delete("/api/keys/OPENROUTER_API_KEY");
}

export async function settingsRecord(request: APIRequestContext): Promise<Record<string, Record<string, unknown>>> {
	const read = await request.get("/api/settings");
	return ((await read.json()) as { settings?: Record<string, Record<string, unknown>> | null }).settings ?? {};
}

export async function putSection(request: APIRequestContext, section: string, patch: Record<string, unknown>) {
	const record = await settingsRecord(request);
	const response = await request.put(`/api/settings/${section}`, { data: { ...(record[section] ?? {}), ...patch } });
	expect(response.ok(), `PUT /api/settings/${section}`).toBeTruthy();
}

export async function createPage(request: APIRequestContext, name: string, content: string): Promise<{ id: string; name: string }> {
	const response = await request.post("/api/library/pages", { data: { name, content } });
	expect(response.ok()).toBeTruthy();
	return ((await response.json()) as { item: { id: string; name: string } }).item;
}

export interface Submission { path: string; body: Record<string, unknown> }

/** Every model-bound POST (a turn, an answer, a problem's thinking, Next, a
 *  dismissal) is answered here with a refusal and recorded; nothing reaches
 *  the server's turn engine. */
export async function interceptModel(page: Page): Promise<Submission[]> {
	const seen: Submission[] = [];
	const record = (request: Request) => {
		const url = new URL(request.url());
		seen.push({ path: url.pathname, body: JSON.parse(request.postData() ?? "{}") as Record<string, unknown> });
	};
	await page.route(/\/api\/chat$/, async (route) => {
		if (route.request().method() !== "POST") return route.continue();
		record(route.request());
		await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "No model in the e2e journeys" }) });
	});
	await page.route(/\/api\/chats\/[^/]+\/(dismiss|steer)$/, async (route) => {
		if (route.request().method() !== "POST") return route.continue();
		record(route.request());
		await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
	});
	return seen;
}

/** The chat view on screen (streaming SSR can hold a hidden copy of a segment for a moment). */
export const chatView = (page: Page, id: string) => page.locator(`[data-chat-id="${id}"]`).filter({ visible: true });

/** A Study chat, hydrated (its field takes input). */
export async function openChat(page: Page, id: string, query = "") {
	await page.goto(`/chat/${id}${query}`);
	await expect(chatView(page, id)).toBeVisible({ timeout: 90_000 });
	await hydrated(page, '[aria-label="Open sidebar"]');
}

/** React has attached its handlers to the first visible match. */
export async function hydrated(page: Page, selector: string) {
	await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].some((el) => el.getClientRects().length > 0 && Object.keys(el).some((k) => k.startsWith("__reactProps"))), selector, { timeout: 90_000 });
}

export const visible = (page: Page, selector: string) => page.locator(selector).filter({ visible: true }).first();

/** Opens the overlay sidebar by its ☰. */
export async function openSidebar(page: Page) {
	await visible(page, '[aria-label="Open sidebar"]').click();
	await expect(page.getByTestId("nb-sidebar")).toBeVisible();
}

/** The resolved value of a paper token on <html>. */
export const token = (page: Page, name: string) => page.evaluate((n) => {
	const probe = document.createElement("span");
	probe.style.color = `var(${n})`;
	document.body.append(probe);
	const color = getComputedStyle(probe).color;
	probe.remove();
	return color;
}, name);

export async function noPageOverflow(page: Page, label: string) {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow, `${label}: page overflow`).toBeLessThanOrEqual(0);
}

export async function chord(page: Page, ...keys: string[]) {
	for (const key of keys) await page.keyboard.down(key);
	for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

// ─── feature 027: reference chips (T003, quickstart.md "Prerequisites") ──────

/** A PDF with one line of text per page (the papers fixture's builder). */
export function textPdf(pageTexts: string[]): Buffer {
	const objects: string[] = [];
	const pageIds = pageTexts.map((_, i) => 3 + i * 2);
	const fontId = 3 + pageTexts.length * 2;
	objects[1] = "<</Type/Catalog/Pages 2 0 R>>";
	objects[2] = `<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(" ")}]/Count ${pageTexts.length}>>`;
	pageTexts.forEach((text, i) => {
		const pageId = pageIds[i]!;
		const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/([()\\])/g, "\\$1")}) Tj ET`;
		objects[pageId] = `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${pageId + 1} 0 R/Resources<</Font<</F1 ${fontId} 0 R>>>>>>`;
		objects[pageId + 1] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;
	});
	objects[fontId] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>";
	let pdf = "%PDF-1.4\n";
	const offsets: number[] = [];
	for (let id = 1; id < objects.length; id++) {
		offsets[id] = pdf.length;
		pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
	}
	const xref = pdf.length;
	pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
	for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
	pdf += `trailer\n<</Size ${objects.length}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(pdf, "latin1");
}

/** A 1x1 PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

interface SeededItem { id: string; name: string; kind: string; size: number }

export interface ReferenceLesson {
	chatId: string;
	items: Record<"note" | "note2" | "pdf" | "markdown" | "text" | "code" | "csv" | "image" | "diagram" | "other" | "trashed" | "gone", SeededItem>;
	trashEntryId: string;
	/** Present when a fixture remote was given. */
	mirrored?: { folder: string; live: SeededItem; removed: SeededItem; livePath: string; removedPath: string };
	/** Message ids in the transcript, by what they hold. */
	messages: Record<"whole" | "quote" | "pdfPassage" | "kinds" | "code" | "tutor" | "mirror", string>;
	/** What the PDF's pages say, for landing checks. */
	pdfPages: string[];
}

export const REFERENCE_CHAT = "e2e-reference-chips";

async function upload(request: APIRequestContext, name: string, bytes: Buffer): Promise<SeededItem> {
	const response = await request.post(`/api/library/upload?name=${encodeURIComponent(name)}`, { data: bytes, headers: { "content-type": "application/octet-stream" } });
	expect(response.status(), `upload ${name}`).toBe(201);
	return ((await response.json()) as { item: SeededItem }).item;
}

async function page3(request: APIRequestContext, name: string, content: string): Promise<SeededItem> {
	let response = await request.post("/api/library/pages", { data: { name, content } });
	if (response.status() === 409) {
		// Another journey made a page by that name in the shared data dir: step it aside.
		const listed = (await (await request.get("/api/library")).json()) as { items: SeededItem[] };
		const taken = listed.items.find((item) => item.name === name);
		if (taken) expect((await request.patch(`/api/library/items/${taken.id}`, { data: { name: `${name} (moved aside ${Date.now().toString(36)})` } })).ok(), `rename ${name}`).toBeTruthy();
		response = await request.post("/api/library/pages", { data: { name, content } });
	}
	expect(response.ok(), `page ${name}`).toBeTruthy();
	return ((await response.json()) as { item: SeededItem }).item;
}

async function trash(request: APIRequestContext, itemId: string): Promise<string> {
	const response = await request.post("/api/library/trash", { data: { itemId } });
	expect(response.ok(), `trash ${itemId}`).toBeTruthy();
	return ((await response.json()) as { entry: { id: string } }).entry.id;
}

/** An item of kind "other" can't be uploaded (no accepted extension), so it is
 *  written into the catalog, as an older app or an import leaves one. */
function writeOtherItem(name: string, bytes: Buffer): SeededItem {
	const file = path.join(dataDir(), "library", "catalog.json");
	const catalog = JSON.parse(readFileSync(file, "utf8")) as { items: unknown[] };
	const now = new Date().toISOString();
	const item = { id: `lib_e2eother${Date.now().toString(36)}`, name, kind: "other", size: bytes.length, createdAt: now, updatedAt: now, origin: { type: "upload" } };
	mkdirSync(path.join(dataDir(), "files"), { recursive: true });
	writeFileSync(path.join(dataDir(), "files", name), bytes);
	catalog.items.push(item);
	const temp = `${file}.e2e.tmp`;
	writeFileSync(temp, JSON.stringify(catalog, null, "\t"));
	renameSync(temp, file);
	return item;
}

type Ref = { itemId: string; name: string; kind: string; size?: number; mode: string; reason?: string; fromRepo?: true };
const used = (item: SeededItem, extra: Partial<Ref> = {}): Ref => ({ itemId: item.id, name: item.name, kind: item.kind, size: item.size, mode: "inline", ...extra });

/** The reference-chips lesson: the nine kinds, a prefix name, a trashed item, a
 *  tombstone, and a transcript holding every sent form, a tutor citation and a
 *  tutor `@name`. With `remote`, also a mirrored item and one removed upstream
 *  (feature 026), linked as "Lecture notes" at the top level. Idempotent per run. */
let referenceLesson: ReferenceLesson | null = null;
export async function seedReferenceLesson(request: APIRequestContext, options: { remote?: GitRemote } = {}): Promise<ReferenceLesson> {
	// A failed test restarts the worker; the lesson stays seeded in the data dir.
	const saved = path.join(dataDir(), "e2e-reference-lesson.json");
	if (!referenceLesson) try { referenceLesson = JSON.parse(readFileSync(saved, "utf8")) as ReferenceLesson; } catch { /* not seeded yet */ }
	if (referenceLesson && (referenceLesson.mirrored || !options.remote)) return referenceLesson;
	await seedStudy();
	const stamp = Date.now().toString(36);
	const pdfPages = [1, 2, 3, 4, 5, 6].map((n) => n === 3 ? "Page 3: the cited words sit here." : n === 4 ? "Page 4: the passage he sent sits here." : `Page ${n}: plain text.`);
	const note = await page3(request, "Untitled note", "First paragraph about waves.\n\nSecond paragraph, the one he quoted.\n\nThird paragraph closes it.");
	const items: ReferenceLesson["items"] = {
		note,
		note2: await page3(request, "Untitled note 2", "The prefix case."),
		pdf: await upload(request, "Notes.pdf", textPdf(pdfPages)),
		markdown: await upload(request, "Reading.md", Buffer.from("# Reading\n\nA Markdown file.\n")),
		text: await upload(request, "Log.txt", Buffer.from("A plain text file.\n")),
		code: await upload(request, "script.py", Buffer.from("print('code')\n")),
		csv: await upload(request, "table.csv", Buffer.from("a,b\n1,2\n")),
		image: await upload(request, "figure.png", PNG),
		diagram: await (async () => {
			const response = await request.post("/api/library/diagrams", { data: { name: "Wave map", form: "diagram", folderId: null } });
			expect(response.ok(), "diagram").toBeTruthy();
			return ((await response.json()) as { item: SeededItem }).item;
		})(),
		other: writeOtherItem(`archive-${stamp}.xyz`, Buffer.from("not readable")),
		trashed: await page3(request, "Trashed note", "In the trash."),
		gone: await page3(request, "Gone note", "Deleted for good."),
	};
	const trashEntryId = await trash(request, items.trashed.id);
	const goneEntry = await trash(request, items.gone.id);
	expect((await request.delete(`/api/library/trash/${goneEntry}`)).ok(), "delete for good").toBeTruthy();

	let mirrored: ReferenceLesson["mirrored"];
	if (options.remote) {
		const folder = `Lecture notes ${stamp}`;
		options.remote.createRepo(`chips-${stamp}`, { "week1/notes.md": "# Week 1\n\nWaves carry energy.\n", "week2/notes.md": "# Week 2\n\nInterference.\n" });
		const created = await request.post("/api/library/links", { data: { url: options.remote.url(`chips-${stamp}`), folderName: folder, parentId: null, requestId: `req_chips${stamp}` } });
		expect(created.status(), "link").toBe(201);
		const { folder: linked, link } = (await created.json()) as { folder: { id: string }; link: { id: string } };
		type Listed = { items: (SeededItem & { folderId?: string })[]; folders: { id: string; name: string; parentId: string | null }[] };
		const list = async () => (await (await request.get("/api/library")).json()) as Listed;
		const find = (listed: Listed, week: string) => {
			const dir = listed.folders.find((f) => f.name === week && f.parentId === linked.id);
			return dir && listed.items.find((i) => i.name === "notes.md" && i.folderId === dir.id);
		};
		await expect.poll(async () => Boolean(find(await list(), "week2")), { timeout: 60_000 }).toBe(true);
		const listed = await list();
		const live = find(listed, "week1")!;
		const removed = find(listed, "week2")!;
		options.remote.commit(`chips-${stamp}`, { "week2/notes.md": null });
		expect((await request.post(`/api/library/links/${link.id}/sync`)).status()).toBe(202);
		await expect.poll(async () => Boolean(find(await list(), "week2")), { timeout: 60_000 }).toBe(false);
		mirrored = { folder, live, removed, livePath: `${folder}/week1/notes.md`, removedPath: `${folder}/week2/notes.md` };
	}

	const now = Date.now();
	const lesson = fixture("chat_mv27rrra_feff23b6.json");
	const template = structuredClone(lesson.messages.findLast((m) => m.role === "assistant" && Array.isArray(m.content))!);
	const user = (id: string, content: string, references: Ref[], at: number) => ({ id, role: "user", content, timestamp: now - at, references });
	const tutor = (id: string, text: string) => ({ ...structuredClone(template), id, content: [{ type: "text", text }] });
	const quote = "> Second paragraph, the one he quoted.";
	const passage = `<library_passage item="${items.pdf.id}" page="4">\nPage 4: the passage he sent sits here.\n</library_passage>`;
	const kinds = (["note", "pdf", "markdown", "text", "code", "csv", "image", "diagram", "other"] as const);
	const messages: ReferenceLesson["messages"] = { whole: "e2e_ref_whole", quote: "e2e_ref_quote", pdfPassage: "e2e_ref_pdf", kinds: "e2e_ref_kinds", code: "e2e_ref_code", tutor: "e2e_ref_tutor", mirror: "e2e_ref_mirror" };
	const record = [
		user(messages.whole, `What does @${note.name} say? Also @${items.note2.name}, @${items.trashed.name} and @${items.gone.name}.`, [used(note), used(items.note2), used(items.trashed), { ...used(items.gone), mode: "missing" }], 9000),
		tutor("e2e_ref_whole_reply", "It describes waves."),
		user(messages.quote, `About this part of @${note.name}:\n\n${quote}\n\nWhy?`, [used(note)], 8000),
		tutor("e2e_ref_quote_reply", "Because of interference."),
		user(messages.pdfPassage, `Explain this part of @${items.pdf.name}, page 4:\n\n${passage}`, [used(items.pdf)], 7000),
		tutor("e2e_ref_pdf_reply", "It is about the passage."),
		user(messages.kinds, `All of them: ${kinds.map((k) => `@${items[k].name}`).join(" ")}`, kinds.map((k) => used(items[k], k === "image" ? { mode: "image" } : k === "other" ? { mode: "unreadable", reason: "unsupported" } : {})), 6000),
		tutor("e2e_ref_kinds_reply", "Noted."),
		user(messages.code, `In code: \`@${items.pdf.name}\` and\n\n\`\`\`\n@${items.pdf.name}\n\`\`\``, [], 5000),
		tutor(messages.tutor, `See [${items.pdf.name}, p. 3](/library?item=${encodeURIComponent(items.pdf.id)}&page=3&quote=${encodeURIComponent("the cited words sit here.")}) and @${note.name}. In code it stays: \`@${items.pdf.name}\`.`),
		...(mirrored ? [
			user(messages.mirror, `Compare @${mirrored.livePath} with @${mirrored.removedPath}`, [used(mirrored.live, { fromRepo: true }), used(mirrored.removed, { fromRepo: true })], 3000),
			tutor("e2e_ref_mirror_reply", "One of them left the repo."),
		] : []),
	];
	writeChat({ ...structuredClone(lesson), id: REFERENCE_CHAT, title: "E2E · Reference chips", createdAt: new Date(now - 3_600_000).toISOString(), updatedAt: new Date(now - 60_000).toISOString(), messages: record as never });
	referenceLesson = { chatId: REFERENCE_CHAT, items, trashEntryId, mirrored, messages, pdfPages };
	writeFileSync(saved, JSON.stringify(referenceLesson));
	return referenceLesson;
}
