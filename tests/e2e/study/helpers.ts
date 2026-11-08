import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page, type Request } from "@playwright/test";
import { seedReviewChats } from "../../../scripts/seed-review.mjs";

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
