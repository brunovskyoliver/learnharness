/**
 * Notebook mode (feature 024): the note companion's shape, its limits and
 * validation, anchoring a thread to the note's text, reading pace, layout
 * fallback, reply counts and margin side assignment. Pure: no fs, no
 * network. The companion lives apart from the page (one file per page,
 * src/store/notebook.ts); nothing here ever touches the page's text.
 */
import { foldWithMap } from "./document-search.ts";
import { ANCHOR_CONTEXT_CHARS } from "./document-anchors.ts";
import type { NotebookLayout, NotebookPace, NotebookStartMode } from "./settings.ts";
import { validateSketch, type Sketch } from "./notebook-sketch.ts";

// ─── shapes (data-model.md) ──────────────────────────────────────────────────

export const NOTEBOOK_COMPANION_VERSION = 1;

export type NoteMode = NotebookStartMode;
export type ThreadPlacement = "margin" | "inline";
export type ThreadSide = "left" | "right";
export type ThreadStatus = "open" | "resolved" | "dismissed";
export type ThreadOrigin = "read" | "think" | "ask" | "visualize";
export type MessageAuthor = "ai" | "user";
export type MessageState = "streaming" | "failed" | "stopped";

export const THREAD_STATUSES = ["open", "resolved", "dismissed"] as const satisfies readonly ThreadStatus[];
export const THREAD_ORIGINS = ["read", "think", "ask", "visualize"] as const satisfies readonly ThreadOrigin[];
const PLACEMENTS = ["margin", "inline"] as const;
const SIDES = ["left", "right"] as const;
const AUTHORS = ["ai", "user"] as const;
const STATES = ["streaming", "failed", "stopped"] as const;
const MODES = ["thinks", "ask"] as const;

export interface ThreadAnchor {
	quote: string;
	prefix: string;
	suffix: string;
	/** Paragraph index (blank-line separated) the quote sat in: a hint for repeats. */
	block?: number;
}

export interface ThreadMessage {
	id: string;
	author: MessageAuthor;
	/** Markdown subset (inline marks, code, math). */
	text: string;
	sketch?: Sketch;
	/** Who spoke, for the AI's messages. */
	reviewerId?: string;
	at: string;
	/** The run that wrote it. */
	runId?: string;
	/** Absent = complete. */
	state?: MessageState;
}

export interface NotebookThread {
	id: string;
	anchor: ThreadAnchor;
	placement: ThreadPlacement;
	side: ThreadSide;
	status: ThreadStatus;
	origin: ThreadOrigin;
	createdAt: string;
	updatedAt: string;
	/** The first is the AI's question, or his for "ask". */
	messages: ThreadMessage[];
}

export interface NoteChatMessage {
	id: string;
	author: MessageAuthor;
	text: string;
	at: string;
	runId?: string;
	state?: MessageState;
}

export interface NoteCompanion {
	v: typeof NOTEBOOK_COMPANION_VERSION;
	pageId: string;
	/** Absent = the settings' start mode. */
	mode?: NoteMode;
	instruction: string;
	/** Absent or unknown = Plain reader. */
	reviewerId?: string;
	threads: NotebookThread[];
	chat: NoteChatMessage[];
	/** The last text an automatic read saw. */
	readCursor?: { textHash: string; at: string };
}

export type NotebookRunKind = "read" | "think" | "ask" | "reply" | "visualize" | "chat";
export type NotebookRunStatus = "running" | "done" | "failed" | "stopped" | "silent";
export const NOTEBOOK_RUN_KINDS = ["read", "think", "ask", "reply", "visualize", "chat"] as const satisfies readonly NotebookRunKind[];

/** The kinds a client may start (api.md); "ask" is a thread his question opens. */
export const STARTABLE_RUN_KINDS = ["read", "think", "visualize", "reply", "chat"] as const satisfies readonly NotebookRunKind[];

// ─── limits ──────────────────────────────────────────────────────────────────

export const NOTEBOOK_LIMITS = {
	threads: 200,
	messagesPerThread: 200,
	chat: 400,
	/** Per message, in UTF-8 bytes. */
	messageBytes: 20_000,
	instruction: 500,
	quote: 2000,
} as const;

/** Ids the routes accept: page ids, thread ids, message ids, run ids. */
export const NOTEBOOK_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const isNotebookId = (value: unknown): value is string => typeof value === "string" && NOTEBOOK_ID.test(value);

export const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

/** Words of the plain refusals (api.md: 409 with a plain reason). */
export const NOTEBOOK_LIMIT_TEXT = {
	threads: `This note already has ${NOTEBOOK_LIMITS.threads} notes in its margins.`,
	messages: `This thread already has ${NOTEBOOK_LIMITS.messagesPerThread} messages.`,
	chat: `This note’s chat already has ${NOTEBOOK_LIMITS.chat} messages.`,
	messageBytes: "That message is too long.",
} as const;

export function emptyCompanion(pageId: string): NoteCompanion {
	return { v: NOTEBOOK_COMPANION_VERSION, pageId, instruction: "", threads: [], chat: [] };
}

// ─── validation (store read side and route bodies) ───────────────────────────

const oneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
	typeof value === "string" && (options as readonly string[]).includes(value);
const isIso = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length < 64;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** An anchor from an untrusted body, or null. */
export function parseThreadAnchor(raw: unknown): ThreadAnchor | null {
	if (!isRecord(raw)) return null;
	const { quote, prefix, suffix, block } = raw;
	if (typeof quote !== "string" || !quote.trim() || quote.length > NOTEBOOK_LIMITS.quote) return null;
	if (typeof prefix !== "string" || prefix.length > ANCHOR_CONTEXT_CHARS * 4) return null;
	if (typeof suffix !== "string" || suffix.length > ANCHOR_CONTEXT_CHARS * 4) return null;
	if (block !== undefined && (!Number.isInteger(block) || (block as number) < 0)) return null;
	return { quote, prefix, suffix, ...(block !== undefined ? { block: block as number } : {}) };
}

function parseMessage(raw: unknown): ThreadMessage | null {
	if (!isRecord(raw)) return null;
	if (!isNotebookId(raw.id) || !oneOf(raw.author, AUTHORS) || typeof raw.text !== "string" || !isIso(raw.at)) return null;
	if (raw.state !== undefined && !oneOf(raw.state, STATES)) return null;
	if (raw.runId !== undefined && !isNotebookId(raw.runId)) return null;
	if (raw.reviewerId !== undefined && typeof raw.reviewerId !== "string") return null;
	const message: ThreadMessage = { id: raw.id, author: raw.author, text: raw.text, at: raw.at };
	if (raw.sketch !== undefined) {
		const sketch = validateSketch(raw.sketch);
		if (sketch.ok) message.sketch = sketch.sketch;
	}
	if (typeof raw.reviewerId === "string") message.reviewerId = raw.reviewerId;
	if (typeof raw.runId === "string") message.runId = raw.runId;
	if (raw.state !== undefined) message.state = raw.state as MessageState;
	return message;
}

function parseThread(raw: unknown): NotebookThread | null {
	if (!isRecord(raw)) return null;
	const anchor = parseThreadAnchor(raw.anchor);
	if (!isNotebookId(raw.id) || !anchor) return null;
	if (!oneOf(raw.placement, PLACEMENTS) || !oneOf(raw.side, SIDES) || !oneOf(raw.status, THREAD_STATUSES) || !oneOf(raw.origin, THREAD_ORIGINS)) return null;
	if (!isIso(raw.createdAt) || !isIso(raw.updatedAt) || !Array.isArray(raw.messages)) return null;
	const messages: ThreadMessage[] = [];
	for (const entry of raw.messages) {
		const message = parseMessage(entry);
		if (!message) return null;
		messages.push(message);
	}
	return { id: raw.id, anchor, placement: raw.placement, side: raw.side, status: raw.status, origin: raw.origin, createdAt: raw.createdAt, updatedAt: raw.updatedAt, messages };
}

function parseChatMessage(raw: unknown): NoteChatMessage | null {
	const message = parseMessage(raw);
	if (!message) return null;
	const { sketch: _sketch, reviewerId: _reviewer, ...rest } = message;
	return rest;
}

export type CompanionParse =
	| { ok: true; companion: NoteCompanion }
	| { ok: false; reason: "future-version"; version: number }
	| { ok: false; reason: "damaged"; detail: string };

/** Reads a companion file's parsed JSON. A newer version is refused (never
 *  rewritten); anything malformed is damaged (the store sets it aside). */
export function parseCompanion(raw: unknown, pageId: string): CompanionParse {
	if (!isRecord(raw)) return { ok: false, reason: "damaged", detail: "not an object" };
	if (typeof raw.v === "number" && Number.isInteger(raw.v) && raw.v > NOTEBOOK_COMPANION_VERSION) return { ok: false, reason: "future-version", version: raw.v };
	if (raw.v !== NOTEBOOK_COMPANION_VERSION) return { ok: false, reason: "damaged", detail: "unknown version" };
	if (raw.pageId !== pageId) return { ok: false, reason: "damaged", detail: "page id mismatch" };
	if (typeof raw.instruction !== "string" || !Array.isArray(raw.threads) || !Array.isArray(raw.chat)) return { ok: false, reason: "damaged", detail: "missing fields" };
	const companion: NoteCompanion = emptyCompanion(pageId);
	companion.instruction = raw.instruction.slice(0, NOTEBOOK_LIMITS.instruction);
	if (raw.mode !== undefined) {
		if (!oneOf(raw.mode, MODES)) return { ok: false, reason: "damaged", detail: "bad mode" };
		companion.mode = raw.mode;
	}
	if (raw.reviewerId !== undefined) {
		if (typeof raw.reviewerId !== "string") return { ok: false, reason: "damaged", detail: "bad reviewer" };
		companion.reviewerId = raw.reviewerId;
	}
	for (const entry of raw.threads) {
		const thread = parseThread(entry);
		if (!thread) return { ok: false, reason: "damaged", detail: "bad thread" };
		companion.threads.push(thread);
	}
	for (const entry of raw.chat) {
		const message = parseChatMessage(entry);
		if (!message) return { ok: false, reason: "damaged", detail: "bad chat message" };
		companion.chat.push(message);
	}
	if (raw.readCursor !== undefined) {
		const cursor = raw.readCursor;
		if (!isRecord(cursor) || typeof cursor.textHash !== "string" || !isIso(cursor.at)) return { ok: false, reason: "damaged", detail: "bad read cursor" };
		companion.readCursor = { textHash: cursor.textHash, at: cursor.at };
	}
	return { ok: true, companion };
}

export interface CompanionPatch {
	mode?: NoteMode | null;
	/** The mode a note takes when it has none yet ("New notes start in", stamped on a note's first open in Notebook); a mode already there stays. */
	stampMode?: NoteMode;
	instruction?: string;
	reviewerId?: string | null;
}

/** PATCH /api/notebook/:pageId's body, or the reason it is refused (400).
 *  null clears mode (back to the start mode) or reviewer (back to Plain reader). */
export function parseCompanionPatch(raw: unknown): { ok: true; patch: CompanionPatch } | { ok: false; error: string } {
	if (!isRecord(raw)) return { ok: false, error: "The body must be an object." };
	const patch: CompanionPatch = {};
	if (raw.mode !== undefined) {
		if (raw.mode !== null && !oneOf(raw.mode, MODES)) return { ok: false, error: 'mode must be "thinks", "ask" or null.' };
		patch.mode = raw.mode as NoteMode | null;
	}
	if (raw.stampMode !== undefined) {
		if (!oneOf(raw.stampMode, MODES)) return { ok: false, error: 'stampMode must be "thinks" or "ask".' };
		patch.stampMode = raw.stampMode as NoteMode;
	}
	if (raw.instruction !== undefined) {
		if (typeof raw.instruction !== "string" || raw.instruction.length > NOTEBOOK_LIMITS.instruction) return { ok: false, error: `instruction must be a string of at most ${NOTEBOOK_LIMITS.instruction} characters.` };
		patch.instruction = raw.instruction;
	}
	if (raw.reviewerId !== undefined) {
		if (raw.reviewerId !== null && (typeof raw.reviewerId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(raw.reviewerId))) return { ok: false, error: "reviewerId must be a reviewer id or null." };
		patch.reviewerId = raw.reviewerId as string | null;
	}
	if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to change." };
	return { ok: true, patch };
}

export function applyCompanionPatch(companion: NoteCompanion, patch: CompanionPatch): NoteCompanion {
	const next: NoteCompanion = { ...companion };
	if (patch.mode !== undefined) {
		if (patch.mode === null) delete next.mode;
		else next.mode = patch.mode;
	}
	if (patch.stampMode !== undefined && next.mode === undefined) next.mode = patch.stampMode;
	if (patch.instruction !== undefined) next.instruction = patch.instruction;
	if (patch.reviewerId !== undefined) {
		if (patch.reviewerId === null) delete next.reviewerId;
		else next.reviewerId = patch.reviewerId;
	}
	return next;
}

/** A message's text from an untrusted body: the refusal says which limit. */
export function messageTextProblem(text: unknown): { status: 400 | 409; error: string } | null {
	if (typeof text !== "string" || !text.trim()) return { status: 400, error: "Write something first." };
	if (utf8Bytes(text) > NOTEBOOK_LIMITS.messageBytes) return { status: 409, error: NOTEBOOK_LIMIT_TEXT.messageBytes };
	return null;
}

// ─── anchoring (research R5) ─────────────────────────────────────────────────

export type AnchorResolution =
	| { start: number; end: number; how: "exact" | "context" | "fuzzy" }
	| { detached: true };

/** Paragraph index (blank-line separated) of an offset. */
export function blockIndexAt(text: string, offset: number): number {
	let block = 0;
	const re = /\n[ \t]*\n+/g;
	for (let match = re.exec(text); match && match.index < offset; match = re.exec(text)) {
		if (match.index + match[0].length <= offset) block++;
	}
	return block;
}

/** An anchor for a span of the note's text, with context and its paragraph. */
export function anchorForSpan(text: string, start: number, end: number): ThreadAnchor {
	return {
		quote: text.slice(start, end),
		prefix: text.slice(Math.max(0, start - ANCHOR_CONTEXT_CHARS), start),
		suffix: text.slice(end, end + ANCHOR_CONTEXT_CHARS),
		block: blockIndexAt(text, start),
	};
}

const FUZZY_THRESHOLD = 0.6;

/** Where a thread's passage is now: the exact quote (context and paragraph
 *  choose between repeats; case, accents and spacing don't matter), else
 *  the text still between its prefix and suffix, else the closest run of
 *  words, else detached. Detached is derived, never stored. */
export function resolveAnchor(text: string, anchor: ThreadAnchor): AnchorResolution {
	const exact = exactMatch(text, anchor);
	if (exact) return { ...exact, how: "exact" };
	const between = contextMatch(text, anchor);
	if (between) return { ...between, how: "context" };
	const fuzzy = fuzzyMatch(text, anchor);
	if (fuzzy) return { ...fuzzy, how: "fuzzy" };
	return { detached: true };
}

function exactMatch(text: string, anchor: ThreadAnchor): { start: number; end: number } | null {
	const folded = foldWithMap(text, false);
	const quote = foldWithMap(anchor.quote, false).text;
	if (!quote) return null;
	const prefix = foldWithMap(anchor.prefix, false).text;
	const suffix = foldWithMap(anchor.suffix, false).text;
	let best: { at: number; score: number; distance: number } | null = null;
	for (let at = folded.text.indexOf(quote); at !== -1; at = folded.text.indexOf(quote, at + 1)) {
		let score = 0;
		if (prefix && folded.text.slice(Math.max(0, at - prefix.length), at) === prefix) score++;
		if (suffix && folded.text.slice(at + quote.length, at + quote.length + suffix.length) === suffix) score++;
		const distance = anchor.block === undefined ? 0 : Math.abs(blockIndexAt(text, folded.map[at]!) - anchor.block);
		if (!best || score > best.score || (score === best.score && distance < best.distance)) best = { at, score, distance };
	}
	if (!best) return null;
	return { start: folded.map[best.at]!, end: folded.map[best.at + quote.length - 1]! + 1 };
}

function contextMatch(text: string, anchor: ThreadAnchor): { start: number; end: number } | null {
	if (anchor.prefix.trim().length < 8 || anchor.suffix.trim().length < 8) return null;
	const limit = Math.max(anchor.quote.length * 2, anchor.quote.length + 80);
	for (let at = text.indexOf(anchor.prefix); at !== -1; at = text.indexOf(anchor.prefix, at + 1)) {
		const start = at + anchor.prefix.length;
		const end = text.indexOf(anchor.suffix, start);
		if (end === -1) continue;
		if (end - start > limit) continue;
		// Leading and trailing spaces are not the passage.
		let s = start, e = end;
		while (s < e && /\s/.test(text[s]!)) s++;
		while (e > s && /\s/.test(text[e - 1]!)) e--;
		if (e > s) return { start: s, end: e };
	}
	return null;
}

interface Word { text: string; start: number; end: number }

function wordsOf(text: string): Word[] {
	const out: Word[] = [];
	const re = /[\p{L}\p{N}]+/gu;
	for (let match = re.exec(text); match; match = re.exec(text)) {
		out.push({ text: foldWithMap(match[0], false).text, start: match.index, end: match.index + match[0].length });
	}
	return out;
}

function fuzzyMatch(text: string, anchor: ThreadAnchor): { start: number; end: number } | null {
	const quoteWords = wordsOf(anchor.quote).map((w) => w.text);
	if (quoteWords.length < 3) return null;
	const words = wordsOf(text);
	const n = quoteWords.length;
	if (words.length === 0) return null;
	const want = new Map<string, number>();
	for (const w of quoteWords) want.set(w, (want.get(w) ?? 0) + 1);
	let best: { i: number; len: number; score: number } | null = null;
	for (const len of [n, n - 1, n + 1]) {
		if (len < 1 || len > words.length) continue;
		const have = new Map<string, number>();
		let hits = 0;
		const add = (w: string, delta: number) => {
			const before = have.get(w) ?? 0;
			const after = before + delta;
			have.set(w, after);
			const cap = want.get(w) ?? 0;
			hits += Math.min(after, cap) - Math.min(before, cap);
		};
		for (let i = 0; i < len; i++) add(words[i]!.text, 1);
		for (let i = 0; ; i++) {
			const score = hits / Math.max(n, len);
			if (!best || score > best.score) best = { i, len, score };
			if (i + len >= words.length) break;
			add(words[i]!.text, -1);
			add(words[i + len]!.text, 1);
		}
	}
	if (!best || best.score < FUZZY_THRESHOLD) return null;
	return { start: words[best.i]!.start, end: words[best.i + best.len - 1]!.end };
}

/** True when the quote occurs verbatim in the text the model was given
 *  (research R5: anything else is treated as silent). */
export const quoteOccurs = (text: string, quote: string): boolean => quote.trim().length > 0 && text.includes(quote);

// ─── pace, layout, counts, sides ─────────────────────────────────────────────

/** The pause before an automatic read (ui-contract.md "Paces"). */
export const PACE_DELAY_MS: Readonly<Record<NotebookPace, number>> = { regular: 1600, slow: 3200 };
export const paceDelay = (pace: NotebookPace): number => PACE_DELAY_MS[pace];

/** Below this width every layout is Marks only, opening inline (spec FR-025). */
export const NOTEBOOK_PHONE_WIDTH = 768;
export const effectiveLayout = (layout: NotebookLayout, width: number): NotebookLayout => (width < NOTEBOOK_PHONE_WIDTH ? "marks" : layout);

/** "{n} replies" counts the messages after the first. */
export const replyCount = (thread: Pick<NotebookThread, "messages">): number => Math.max(0, thread.messages.length - 1);
export function replyCountLabel(count: number): string | null {
	if (count <= 0) return null;
	return count === 1 ? "1 reply" : `${count} replies`;
}

/** The threads the page shows: open ones. Resolved still count in exports. */
export const visibleThreads = (companion: Pick<NoteCompanion, "threads">): NotebookThread[] => companion.threads.filter((t) => t.status === "open");

/** A new margin thread's side, chosen once at creation: all right in Right
 *  margin (and Marks only, which has no sides); with Both margins, opposite
 *  to the nearest open margin thread above it, so neighbours alternate. The
 *  first goes right. */
export function assignSide(threads: readonly NotebookThread[], layout: NotebookLayout, block: number | undefined): ThreadSide {
	if (layout !== "both") return "right";
	const at = block ?? Number.MAX_SAFE_INTEGER;
	let nearest: NotebookThread | null = null;
	for (const thread of threads) {
		if (thread.status !== "open" || thread.placement !== "margin") continue;
		const b = thread.anchor.block ?? 0;
		if (b > at) continue;
		if (!nearest || b > (nearest.anchor.block ?? 0) || (b === (nearest.anchor.block ?? 0) && thread.createdAt >= nearest.createdAt)) nearest = thread;
	}
	if (!nearest) return "right";
	return nearest.side === "right" ? "left" : "right";
}

/** A short, stable hash of the note's text (FNV-1a, 32-bit, hex): the read
 *  cursor's "unchanged since the last read". */
export function textHash(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The first words of a passage or message, for names and announcements. */
export function firstWords(text: string, max = 6): string {
	const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
	return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")}…`;
}
