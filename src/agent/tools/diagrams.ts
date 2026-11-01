import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { buildProposalDoc, DIAGRAM_FORMS, DIAGRAM_SUMMARY_MAX, parseDiagram, type DiagramDoc, type DiagramForm } from "../../core/diagram.ts";
import { isTombstone, uploadName } from "../../core/library.ts";
import type { DiagramStore, LibraryStore } from "../../core/ports.ts";
import { serverExecute } from "../tool-execute.ts";
import { findLibraryEntry } from "./library.ts";

/**
 * diagram_propose (feature 022). It only ever stores a proposal apart from the
 * diagram. The learner sees the comparison and decides; nothing changes until he
 * approves, and only that makes a version. Like the page tools it returns sentences
 * and does not throw, and it refuses while a question or a problem is waiting.
 */

export interface DiagramToolContext {
	store: LibraryStore;
	diagrams: DiagramStore;
	chatId: string;
	blocked: () => string | null;
}

export const DIAGRAM_BLOCKED_QUESTION = "Diagrams can't be proposed while a question is waiting for his answer.";
export const DIAGRAM_BLOCKED_PROBLEM = "Diagrams can't be proposed while a problem is active.";

export type DiagramToolDetails =
	| { outcome: "proposed"; proposalId: string; itemId: string | null; name: string }
	| { outcome: "stale"; reason: string; itemId?: string }
	| { outcome: "failed"; reason: string };

const failed = (reason: string) => ({ text: reason, details: { outcome: "failed", reason } satisfies DiagramToolDetails });

const proposeInput = Type.Object({
	item: Type.Optional(Type.String({ minLength: 1, description: "The diagram's id or exact name, to change it. Leave out to propose a new one." })),
	baseVersion: Type.Optional(Type.Integer({ minimum: 1, description: "With item: the version you read, from library_read's first line." })),
	name: Type.Optional(Type.String({ minLength: 1, description: "A new diagram's name. Required without item." })),
	form: Type.Optional(Type.Union(DIAGRAM_FORMS.map((form) => Type.Literal(form)), { description: "A new diagram's form." })),
	summary: Type.String({ minLength: 1, maxLength: DIAGRAM_SUMMARY_MAX, description: "One or two plain sentences for him: what this changes and why." }),
	nodes: Type.Array(Type.Object({
		id: Type.Optional(Type.String({ description: "An existing node's id, to keep it. Leave out for a new node." })),
		text: Type.String({ minLength: 1, description: "The node's plain-text label." }),
		type: Type.Optional(Type.Union([Type.Literal("box"), Type.Literal("sticky")])),
		links: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Names of notes in his Library this node links to." })),
	}), { minItems: 1, description: "The whole wanted set of nodes. An existing node you leave out is removed. Freehand strokes stay." }),
	edges: Type.Array(Type.Object({
		from: Type.String({ minLength: 1, description: "A node's id or exact text." }),
		to: Type.String({ minLength: 1, description: "A node's id or exact text." }),
		label: Type.Optional(Type.String({ description: "The relation, in plain text." })),
	}), { description: "The whole wanted set of edges." }),
});

export function diagramTools(ctx: DiagramToolContext): Record<string, AgentTool<any>> {
	return {
		diagram_propose: {
			name: "diagram_propose",
			label: "diagram_propose",
			description: "Propose a new diagram, concept map or whiteboard, or a change to one. Stores a proposal only: he reviews it and nothing changes until he approves. Use only when he asks.",
			parameters: proposeInput,
			executionMode: "sequential",
			execute: serverExecute("diagram_propose", proposeInput, async (input, { toolCallId }) => {
				try {
					const blocked = ctx.blocked();
					if (blocked) return failed(blocked);
					let diagramId: string | null = null;
					let name = input.name ? uploadName(input.name) : null;
					let base: DiagramDoc | null = null;
					let baseVersion: number | null = null;
					if (input.item !== undefined) {
						const entry = findLibraryEntry(await ctx.store.catalog(), input.item);
						if (!entry) return failed(`Nothing in the Library is called ${input.item}. Use library_list to see what is there.`);
						if (isTombstone(entry)) return failed("That item was deleted from the Library.");
						if (entry.kind !== "diagram") return failed(`${entry.name} is not a diagram.`);
						if (input.baseVersion === undefined) return failed("Read the diagram with library_read and pass the version you read as baseVersion.");
						const state = await ctx.diagrams.read(entry.id);
						if (!state) return failed("That item was deleted from the Library.");
						if ("refused" in state) return failed(state.message);
						if (state.head.n !== input.baseVersion) {
							const reason = `The diagram is at version ${state.head.n}. Read it and redo your proposal.`;
							return { text: reason, details: { outcome: "stale", reason, itemId: entry.id } satisfies DiagramToolDetails };
						}
						const parsed = parseDiagram(state.head.content);
						if (!parsed.ok) return failed(parsed.message);
						diagramId = entry.id;
						name = entry.name;
						base = parsed.doc;
						baseVersion = state.head.n;
					} else if (!name) {
						return failed("A new diagram needs a name that can be used in the Library.");
					}
					const built = buildProposalDoc(base, { ...(input.form ? { form: input.form as DiagramForm } : {}), nodes: input.nodes, edges: input.edges });
					if ("error" in built) return failed(built.error);
					const proposal = await ctx.diagrams.propose({ diagramId, name: name!, summary: input.summary, baseVersion, doc: built.doc, chatId: ctx.chatId, toolCallId });
					if (proposal === "missing") return failed("That item was deleted from the Library.");
					const output = { proposalId: proposal.id, itemId: proposal.diagramId, name: proposal.name };
					return { text: `${JSON.stringify(output)}\nThis is a proposal. Nothing has changed: he decides whether to approve it.`, details: { outcome: "proposed", ...output } satisfies DiagramToolDetails };
				} catch (err) {
					return failed(`The proposal could not be stored: ${err instanceof Error ? err.message : String(err)}`);
				}
			}),
		},
	};
}
