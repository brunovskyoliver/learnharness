/**
 * Diagram versions and proposals (feature 022). A diagram is stored exactly as a
 * page is: library/pages/<id>/ with an append-only versions.jsonl, one content file
 * per version and one draft, written by the same functions. What differs is the
 * reading: the content is schema-versioned JSON, so a newer schema is refused here
 * and never rewritten, and nothing about it reaches the graph.
 *
 * A proposal is one file under library/diagram-proposals/<diagramId or "new">/. It
 * touches no version and no draft until the learner approves it.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nanoid } from "nanoid";
import { emit } from "../core/events.ts";
import {
	parseDiagram, serializeDiagram, type DiagramDoc, type DiagramProposal, type DiagramRefusalCode,
} from "../core/diagram.ts";
import { isRefusal } from "../core/library.ts";
import type { DiagramRead, DiagramStore, PageCreateOptions, ProposalOutcome } from "../core/ports.ts";
import { versionedInternals as v } from "./library.ts";

const NEW_DIAGRAMS = "new";

const load = async (id: string) => v.loadPage(await v.readCatalog(), id, "diagram");

/** The first unreadable thing among head and draft, or null. */
function unreadable(page: { head: { content: string }; draft: { content: string } | null }): { code: DiagramRefusalCode; message: string } | null {
	for (const content of [page.head.content, ...(page.draft ? [page.draft.content] : [])]) {
		const parsed = parseDiagram(content);
		if (!parsed.ok) return { code: parsed.code, message: parsed.message };
	}
	return null;
}

async function read(id: string): Promise<DiagramRead | null> {
	return v.withLock(async () => {
		const page = await load(id);
		if (!page) return null;
		const bad = unreadable(page);
		if (bad) return { refused: bad.code, message: bad.message, item: page.item };
		const { item, head, draft } = page;
		return { item: { ...item, headVersion: head.n }, head, draft: draft ? { base: draft.base, rev: draft.rev, content: draft.content } : null };
	});
}

/** Refused before the write takes the lock: a newer schema only arrives by a downgrade. */
async function refusalOf(id: string) {
	const state = await read(id);
	return state && "refused" in state ? { refused: state.refused, message: state.message } : null;
}

async function proposalFiles(): Promise<string[]> {
	const root = path.dirname(v.proposalsDir("x"));
	const folders = await fs.readdir(root).catch(() => [] as string[]);
	const files = await Promise.all(folders.map(async (folder) => (await fs.readdir(path.join(root, folder)).catch(() => [] as string[]))
		.filter((name) => name.endsWith(".json")).map((name) => path.join(root, folder, name))));
	return files.flat();
}

const isProposal = (value: DiagramProposal | null): value is DiagramProposal => Boolean(value?.id && value.doc);

async function allProposals(): Promise<DiagramProposal[]> {
	const read = await Promise.all((await proposalFiles()).map((file) => v.readJsonFile<DiagramProposal>(file)));
	return read.filter(isProposal).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const proposalFile = (proposal: Pick<DiagramProposal, "id" | "diagramId">) => path.join(v.proposalsDir(proposal.diagramId ?? NEW_DIAGRAMS), `${proposal.id}.json`);

async function findProposal(id: string): Promise<DiagramProposal | null> {
	if (!/^prp_[\w-]+$/.test(id)) return null;
	return (await allProposals()).find((proposal) => proposal.id === id) ?? null;
}

async function writeProposal(proposal: DiagramProposal): Promise<void> {
	const file = proposalFile(proposal);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await v.writeJsonFile(file, proposal);
}

/** The event listeners already refresh on: nothing changed but the list of proposals. */
const announce = (proposal: DiagramProposal) => emit("library-changed", { itemId: proposal.diagramId ?? proposal.id });

async function resolve(proposal: DiagramProposal, change: Pick<DiagramProposal, "status"> & Partial<DiagramProposal>): Promise<DiagramProposal> {
	const next: DiagramProposal = { ...proposal, ...change, resolvedAt: new Date().toISOString() };
	await writeProposal(next);
	return next;
}

async function approveExisting(proposal: DiagramProposal, options: { expected?: { head: number; rev: number } }): Promise<ProposalOutcome> {
	return v.withLock(async () => {
		const catalog = await v.readCatalog();
		const page = await v.loadPage(catalog, proposal.diagramId!, "diagram");
		if (!page) return { outcome: "target-gone" };
		// A crash after the version and before the proposal's status: the log already has it.
		const already = page.versions.find((version) => version.proposalId === proposal.id);
		if (already) return { outcome: "approved", proposal: await resolve(proposal, { status: "approved", version: already.n, resultId: page.item.id }), item: page.item, version: already };
		const bad = unreadable(page);
		if (bad) return { outcome: "refused", code: bad.code, message: bad.message };
		const { head, draft } = page;
		if (options.expected && (options.expected.head !== head.n || options.expected.rev !== (draft?.rev ?? 0))) return { outcome: "stale", head: head.n };
		let { item, versions } = page;
		let savedLearnerVersion: number | undefined;
		if (draft && draft.content !== head.content) {
			const saved = await v.appendVersion(catalog, item, versions, draft.content, { author: "learner", base: draft.base, cause: "before-agent" });
			item = saved.item;
			versions = [...versions, saved.version];
			savedLearnerVersion = saved.version.n;
			v.changed(item.id, saved.version);
		}
		if (draft) await v.clearDraft(item.id);
		const written = await v.appendVersion(catalog, item, versions, serializeDiagram(proposal.doc), {
			author: "agent",
			base: versions.at(-1)!.n,
			cause: "proposal-approved",
			proposalId: proposal.id,
			...(proposal.chatId ? { chatId: proposal.chatId } : {}),
			...(proposal.edited ? { editedByLearner: true } : {}),
		});
		v.changed(item.id, written.version);
		const done = await resolve(proposal, { status: "approved", version: written.version.n, resultId: item.id });
		return { outcome: "approved", proposal: done, item: written.item, version: written.version, ...(savedLearnerVersion ? { savedLearnerVersion } : {}) };
	});
}

async function approveNew(proposal: DiagramProposal, options: { name?: string }): Promise<ProposalOutcome> {
	const made = await v.createVersioned("diagram", options.name ?? proposal.name, serializeDiagram(proposal.doc), {
		author: "agent",
		cause: "proposal-approved",
		proposalId: proposal.id,
		...(proposal.edited ? { editedByLearner: true } : {}),
		...(proposal.chatId ? { chatId: proposal.chatId } : {}),
		// The same call again finds the diagram this proposal made.
		toolCallId: proposal.id,
	});
	if (isRefusal(made)) return { outcome: "name-taken", refusal: made };
	const done = await resolve(proposal, { status: "approved", version: made.head.n, resultId: made.item.id, name: made.item.name });
	return { outcome: "approved", proposal: done, item: made.item, version: { n: made.head.n, author: "agent", at: made.head.at, bytes: made.item.size, base: 0, cause: "proposal-approved", proposalId: proposal.id } };
}

export const diagramStore: DiagramStore = {
	create: (name, doc: DiagramDoc, options: PageCreateOptions) => v.createVersioned("diagram", name, serializeDiagram(doc), options),
	read,
	saveDraft: async (id, input) => (await refusalOf(id)) ?? v.savePageDraft(id, input, "diagram"),
	commit: async (id, input) => (await refusalOf(id)) ?? v.commitPageVersion(id, input, "diagram"),
	versions: (id) => v.withLock(async () => {
		const page = await load(id);
		return page ? [...page.versions].reverse() : null;
	}),
	version: (id, n) => v.withLock(async () => {
		const page = await load(id);
		const version = page?.versions.find((other) => other.n === n);
		return version ? { version, content: await v.readVersionText(id, n) } : null;
	}),
	restore: async (id, n) => {
		const kept = await diagramStore.version(id, n);
		if (!kept) return "missing";
		const parsed = parseDiagram(kept.content);
		if (!parsed.ok) return { refused: parsed.code, message: parsed.message };
		return (await refusalOf(id)) ?? v.restorePageVersion(id, n, "diagram");
	},
	propose: (input) => v.withLock(async () => {
		if (input.toolCallId) {
			const repeat = (await allProposals()).find((proposal) => proposal.toolCallId === input.toolCallId);
			if (repeat) return repeat;
		}
		if (input.diagramId && !await load(input.diagramId)) return "missing";
		const proposal: DiagramProposal = {
			id: `prp_${nanoid()}`,
			diagramId: input.diagramId,
			name: input.name,
			summary: input.summary,
			baseVersion: input.baseVersion,
			doc: input.doc,
			status: "pending",
			createdAt: new Date().toISOString(),
			...(input.chatId ? { chatId: input.chatId } : {}),
			...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
		};
		await writeProposal(proposal);
		announce(proposal);
		return proposal;
	}),
	proposals: (filter = {}) => v.withLock(async () => (await allProposals()).filter((proposal) =>
		(filter.diagramId === undefined || proposal.diagramId === filter.diagramId) && (filter.status === undefined || proposal.status === filter.status))),
	proposal: (id) => v.withLock(() => findProposal(id)),
	editProposal: (id, doc) => v.withLock(async () => {
		const proposal = await findProposal(id);
		if (!proposal) return "missing";
		if (proposal.status !== "pending") return "resolved";
		const next: DiagramProposal = { ...proposal, doc, edited: true };
		await writeProposal(next);
		return next;
	}),
	reject: (id) => v.withLock(async (): Promise<ProposalOutcome> => {
		const proposal = await findProposal(id);
		if (!proposal) return { outcome: "missing" };
		if (proposal.status !== "pending") return { outcome: "resolved", proposal };
		const done = await resolve(proposal, { status: "rejected" });
		announce(done);
		return { outcome: "resolved", proposal: done };
	}),
	approve: async (id, options) => {
		const proposal = await diagramStore.proposal(id);
		if (!proposal) return { outcome: "missing" };
		if (proposal.status !== "pending") return { outcome: "resolved", proposal };
		return proposal.diagramId ? approveExisting(proposal, options) : approveNew(proposal, options);
	},
	unlinkChat: (chatId) => v.withLock(async () => {
		for (const proposal of await allProposals()) {
			if (proposal.chatId !== chatId) continue;
			const { chatId: _gone, ...rest } = proposal;
			await writeProposal(rest);
		}
	}),
};
