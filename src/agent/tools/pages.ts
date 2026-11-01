import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { isRefusal, isTombstone, PAGE_MAX_BYTES } from "../../core/library.ts";
import { applyPageEdits } from "../../core/page-edits.ts";
import type { LibraryStore, PageProposalStore } from "../../core/ports.ts";
import { serverExecute } from "../tool-execute.ts";
import { findLibraryEntry } from "./library.ts";
import { fitsOneRead } from "./read.ts";

/**
 * The page tools (feature 009, contracts/agent-tools.md). They return sentences
 * the model can act on and do not throw. `details` is what the transcript row
 * reads. Nothing here decides about the learner's text: the store's revision
 * commits his draft before anything can refuse.
 */

export interface PageToolContext {
	store: LibraryStore;
	chatId: string;
	/** Why a page can't be written now: a waiting question or an active problem. */
	blocked: () => string | null;
	/** Held edits (feature 023): when `turnHolds` says so, or the page already has an
	 *  edit waiting, page_revise stores a proposal and leaves the page alone. */
	held?: { proposals: PageProposalStore; turnHolds: () => boolean };
}

export const PAGE_BLOCKED_QUESTION = "Pages can't be written while a question is waiting for his answer.";
export const PAGE_BLOCKED_PROBLEM = "Pages can't be written while a problem is active.";
/** Whole content would drop text the agent never saw (owner, 2026-10-31). */
/** Model-facing, seen by the owner in docs/workspace-decisions.md. */
export const pageEditHeld = (name: string) => `Held for his review: nothing on ${name} changed. It waits for him to accept, reject or edit it first, so say it is waiting for him and never call it done.`;
export const pageTooLongForContent = (name: string) => `${name} is longer than one read. Revise it with edits, so text you did not read is not replaced.`;

/** The row's data: success, a stale base, or a failure with its sentence. */
export type PageToolDetails =
	| { outcome: "created" | "revised"; itemId: string; name: string; version: number; savedLearnerVersion?: number }
	| { outcome: "proposed"; proposalId: string; itemId: string; name: string; target: "page" }
	| { outcome: "stale"; reason: string; itemId?: string; savedLearnerVersion?: number }
	| { outcome: "failed"; reason: string };

const failed = (reason: string) => ({ text: reason, details: { outcome: "failed", reason } satisfies PageToolDetails });

const createInput = Type.Object({
	name: Type.String({ minLength: 1, description: "The page's name in the Library." }),
	content: Type.String({ description: "The page as Markdown with math." }),
});

const reviseInput = Type.Object({
	item: Type.String({ minLength: 1, description: "The page's id or exact name." }),
	baseVersion: Type.Integer({ minimum: 1, description: "The version you read, from library_read's first line." }),
	content: Type.Optional(Type.String({ description: "The whole new text. Pass this or edits, not both." })),
	edits: Type.Optional(Type.Array(Type.Object({
		find: Type.String({ minLength: 1, description: "Exact text that occurs exactly once." }),
		replace: Type.String({ description: "What replaces it." }),
	}), { minItems: 1, description: "Exact replacements. Pass this or content, not both." })),
});

export function pageTools(ctx: PageToolContext): Record<string, AgentTool<any>> {
	return {
		page_create: {
			name: "page_create",
			label: "page_create",
			description: "Create a Markdown and math page in the learner's Library. Use when he asks for one or when material is worth keeping. A row in the chat opens it.",
			parameters: createInput,
			executionMode: "sequential",
			execute: serverExecute("page_create", createInput, async ({ name, content }, { toolCallId }) => {
				try {
					const blocked = ctx.blocked();
					if (blocked) return failed(blocked);
					const result = await ctx.store.createPage(name, content, { author: "agent", chatId: ctx.chatId, toolCallId });
					if (isRefusal(result)) {
						return failed(result.refused === "name_taken" ? `${result.message} ${result.suggestedName} is free.` : result.message);
					}
					const output = { itemId: result.item.id, name: result.item.name, version: result.head.n };
					return { text: JSON.stringify(output), details: { outcome: "created", ...output } satisfies PageToolDetails };
				} catch (err) {
					return failed(`The page could not be created: ${err instanceof Error ? err.message : String(err)}`);
				}
			}),
		},
		page_revise: {
			name: "page_revise",
			label: "page_revise",
			description: "Propose a revision of a page. It is held for the learner's review and not applied until they accept it. Read the page first and pass the version you read. If the learner edited since, the call refuses and you read again.",
			parameters: reviseInput,
			executionMode: "sequential",
			execute: serverExecute("page_revise", reviseInput, async (input, { toolCallId }) => {
				try {
					const blocked = ctx.blocked();
					if (blocked) return failed(blocked);
					if ((input.content === undefined) === (input.edits === undefined)) return failed("Pass content or edits, exactly one of them.");
					const entry = findLibraryEntry(await ctx.store.catalog(), input.item);
					if (!entry) return failed(`Nothing in the Library is called ${input.item}. Use library_list to see what is there.`);
					if (isTombstone(entry)) return failed("That item was deleted from the Library.");
					if (entry.kind === "diagram") return failed(`${entry.name} is a diagram. Use diagram_propose, which he reviews first.`);
					if (entry.kind !== "page") return failed(`${entry.name} is a document, and only pages can be revised.`);
					const apply = (head: string) => {
						if (input.edits !== undefined) return applyPageEdits(head, input.edits);
						return fitsOneRead(head) ? input.content! : { refused: pageTooLongForContent(entry.name) };
					};
					const held = ctx.held;
					if (held && (held.turnHolds() || (await held.proposals.proposals({ pageId: entry.id, status: "pending" })).length > 0)) {
						const proposed = await held.proposals.propose({ pageId: entry.id, baseVersion: input.baseVersion, chatId: ctx.chatId, toolCallId, apply });
						switch (proposed.outcome) {
							case "missing": return failed("That item was deleted from the Library.");
							case "stale": {
								const reason = `The page is at version ${proposed.head}. Read it and redo your edit.`;
								return { text: reason, details: { outcome: "stale", reason, itemId: entry.id } satisfies PageToolDetails };
							}
							case "refused": return failed(proposed.reason);
							case "too-large": return failed(`That text is over the page limit of ${PAGE_MAX_BYTES} bytes.`);
							case "proposed": return {
								text: pageEditHeld(entry.name),
								details: { outcome: "proposed", proposalId: proposed.proposal.id, itemId: entry.id, name: entry.name, target: "page" } satisfies PageToolDetails,
							};
						}
					}
					const result = await ctx.store.revisePageAsAgent(entry.id, { baseVersion: input.baseVersion, chatId: ctx.chatId, toolCallId, apply });
					switch (result.outcome) {
						case "missing":
							return failed("That item was deleted from the Library.");
						case "stale": {
							const reason = `The page is at version ${result.head} (the learner's edits were saved). Read it and redo your edit.`;
							return { text: reason, details: { outcome: "stale", reason, itemId: entry.id, ...(result.savedLearnerVersion ? { savedLearnerVersion: result.savedLearnerVersion } : {}) } satisfies PageToolDetails };
						}
						case "refused":
							return failed(result.reason);
						case "too-large":
							return failed(`That text is over the page limit of ${PAGE_MAX_BYTES} bytes.`);
						case "revised": {
							const output = {
								itemId: result.item.id,
								name: result.item.name,
								version: result.version.n,
								...(result.savedLearnerVersion ? { savedLearnerVersion: result.savedLearnerVersion } : {}),
							};
							return { text: JSON.stringify(output), details: { outcome: "revised", ...output } satisfies PageToolDetails };
						}
					}
				} catch (err) {
					return failed(`The page could not be revised: ${err instanceof Error ? err.message : String(err)}`);
				}
			}),
		},
	};
}
