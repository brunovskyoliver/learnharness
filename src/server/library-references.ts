/**
 * Resolve the @ references in one input (feature 009, contracts/references.md).
 * Runs after the gates and compaction and before the input is written, so a
 * refused gate writes nothing. It only reads: no model call happens on behalf
 * of a reference, and a failure on one item never blocks the learner's input.
 */
import { composeInstructions } from "../agent/teacher-agent.ts";
import { parseReferences, type LibraryReference } from "../core/library-refs.ts";
import {
	isTombstone, REFERENCE_INLINE_MAX_BYTES, REFERENCE_MAX_PER_MESSAGE, REFERENCE_MESSAGE_MAX_BYTES,
	type LibraryItem, type LibraryTombstone,
} from "../core/library.ts";
import type { LhMessage } from "../core/native-messages.ts";
import { resolveConversationSpec, resolveRoleSpec } from "../core/settings-resolution.ts";
import { effectiveThresholdTokens, projectedContextTokens } from "./compaction.ts";
import { providerKeyPresent } from "./keys.ts";
import { pdfFacts, pdfOutlineText, textOutline } from "./library-text.ts";
import { catalogContextLimits } from "./model-catalog.ts";
import { effectiveSettings, stores } from "./stores.ts";

const PDF_WAIT_MS = 10_000;
const CHARS_PER_TOKEN = 4;

export interface ResolveOptions {
	/** Tokens left before compaction would fire. */
	roomTokens: number;
	/** Test seams; production reads settings and waits the contract's 10 s. */
	visionReady?: boolean;
	pdfWaitMs?: number;
}

/** A vision model is set and its provider's key is present. */
export function visionAvailable(): boolean {
	const spec = resolveRoleSpec("pdfReader", stores.settingsStore.readSettings());
	return Boolean(spec && providerKeyPresent(spec.provider));
}

/** Room left in a chat before compaction, on the estimate compaction acts on. */
export function roomTokensFor(record: { messages: LhMessage[]; kind?: string; settings?: Parameters<typeof resolveConversationSpec>[0] }): number {
	const settings = effectiveSettings();
	const spec = resolveConversationSpec(record.settings, settings.models.strong);
	const threshold = effectiveThresholdTokens(settings.compaction?.thresholdTokens, spec ? catalogContextLimits().get(`${spec.provider}:${spec.id}`) : undefined);
	const system = Math.ceil(composeInstructions(record.kind === "practice" ? "practice" : "teacher").length / CHARS_PER_TOKEN);
	return Math.max(0, threshold - projectedContextTokens(record.messages, system));
}

function base(item: LibraryItem): Pick<LibraryReference, "itemId" | "name" | "kind" | "size" | "version"> {
	return {
		itemId: item.id,
		name: item.name,
		kind: item.kind,
		size: item.size,
		...(item.headVersion !== undefined ? { version: item.headVersion } : {}),
	};
}

const missing = (entry: LibraryTombstone): LibraryReference => ({ itemId: entry.id, name: entry.name, kind: entry.kind, mode: "missing" });

/** The running budget for one message. Outlines count too, so a later item
 *  doesn't go whole past the message limit. */
interface Budget {
	usedBytes: number;
	roomTokens: number;
}

function fitsOutlineReason(bytes: number, budget: Budget): LibraryReference["reason"] | null {
	if (bytes > REFERENCE_INLINE_MAX_BYTES) return "too-long";
	if (budget.usedBytes + bytes > REFERENCE_MESSAGE_MAX_BYTES) return "message-limit";
	if (bytes / CHARS_PER_TOKEN > budget.roomTokens / 2) return "no-room";
	return null;
}

function spend(budget: Budget, material: string, bytes = Buffer.byteLength(material)): void {
	budget.usedBytes += bytes;
	budget.roomTokens -= material.length / CHARS_PER_TOKEN;
}

async function resolveText(item: LibraryItem, budget: Budget): Promise<LibraryReference> {
	// A document's size is known, so a long one needn't be read to say so, but
	// its outline does read it. Reading once serves both.
	const text = await stores.libraryStore.readText(item);
	const reason = fitsOutlineReason(Buffer.byteLength(text), budget);
	const material = reason ? textOutline(item, text) : text;
	spend(budget, material);
	return { ...base(item), mode: reason ? "outline" : "inline", ...(reason ? { reason } : {}), material };
}

async function resolvePdf(item: LibraryItem, budget: Budget, waitMs: number): Promise<LibraryReference> {
	const facts = await pdfFacts(item, waitMs);
	if (facts === "not-ready") return { ...base(item), mode: "outline", reason: "not-ready" };
	if (facts === "failed") return { ...base(item), mode: "unreadable", reason: "no-text" };
	if (facts.meanTextLength === 0) return { ...base(item), mode: "unreadable", reason: "no-text", pages: facts.pageCount };
	const reason = facts.text === undefined ? "too-long" : fitsOutlineReason(facts.textBytes, budget);
	const material = reason ? pdfOutlineText(facts) : facts.text!;
	spend(budget, material);
	return { ...base(item), mode: reason ? "outline" : "inline", ...(reason ? { reason } : {}), material };
}

async function resolveOne(item: LibraryItem, budget: Budget, options: ResolveOptions): Promise<LibraryReference> {
	switch (item.kind) {
		case "image":
			return options.visionReady ?? visionAvailable()
				? { ...base(item), mode: "image" }
				: { ...base(item), mode: "unreadable", reason: "no-vision" };
		case "other":
			return { ...base(item), mode: "unreadable", reason: "unsupported" };
		case "pdf":
			return resolvePdf(item, budget, options.pdfWaitMs ?? PDF_WAIT_MS);
		default:
			return resolveText(item, budget);
	}
}

/** The references in the input's texts, first-seen across all of them. */
export async function resolveReferences(texts: string | readonly string[], options: ResolveOptions): Promise<LibraryReference[]> {
	const list = typeof texts === "string" ? [texts] : texts;
	if (!list.some((text) => text.includes("@"))) return [];
	let catalog: (LibraryItem | LibraryTombstone)[];
	try {
		catalog = await stores.libraryStore.catalog();
	} catch (err) {
		// With no catalog no token can be told from plain text. The input is
		// still saved; the Library itself says it could not be loaded.
		console.error("[library] references skipped:", err instanceof Error ? err.message : err);
		return [];
	}
	const seen = new Map<string, LibraryItem | LibraryTombstone>();
	for (const text of list) for (const entry of parseReferences(text, catalog)) if (!seen.has(entry.id)) seen.set(entry.id, entry);
	const budget: Budget = { usedBytes: 0, roomTokens: options.roomTokens };
	const out: LibraryReference[] = [];
	let position = 0;
	for (const entry of seen.values()) {
		position++;
		if (position > REFERENCE_MAX_PER_MESSAGE) {
			out.push({ itemId: entry.id, name: entry.name, kind: entry.kind, ...(isTombstone(entry) ? {} : { size: entry.size }), mode: "missing", reason: "over-count" });
		} else if (isTombstone(entry)) {
			out.push(missing(entry));
		} else {
			try {
				out.push(await resolveOne(entry, budget, options));
			} catch (err) {
				console.error(`[library] reference ${entry.id} could not be read:`, err instanceof Error ? err.message : err);
				out.push({ ...base(entry), mode: "unreadable", reason: "no-text" });
			}
		}
	}
	return out;
}

/** A steer's references. Resolved before steerLiveChat, so a 409 persists nothing. */
export function resolveSteerReferences(record: Parameters<typeof roomTokensFor>[0], text: string): Promise<LibraryReference[]> {
	return text.includes("@") ? resolveReferences(text, { roomTokens: roomTokensFor(record) }) : Promise.resolve([]);
}
