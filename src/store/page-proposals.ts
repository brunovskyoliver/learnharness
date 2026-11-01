/**
 * Held page edits (feature 023). A proposal is one file under
 * library/page-proposals/<pageId>/. Until it is accepted it touches no version and no
 * draft, so a build without this feature just never looks in that folder. Accepting
 * runs under the Library's lock with the same steps an agent revision takes: his draft
 * becomes his version first, then one AI-authored version.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { nanoid } from "nanoid";
import { emit } from "../core/events.ts";
import { PAGE_MAX_BYTES } from "../core/library.ts";
import { mergeProposal, type PageProposal } from "../core/page-proposals.ts";
import type { PageProposalAccept, PageProposalStore } from "../core/ports.ts";
import { versionedInternals as v } from "./library.ts";

const tooLarge = (text: string) => Buffer.byteLength(text, "utf8") > PAGE_MAX_BYTES;

async function proposalFiles(): Promise<string[]> {
	const root = path.dirname(v.pageProposalsDir("x"));
	const pages = await fs.readdir(root).catch(() => [] as string[]);
	const nested = await Promise.all(pages.map(async (page) => (await fs.readdir(path.join(root, page)).catch(() => [] as string[])).map((file) => path.join(root, page, file))));
	return nested.flat().filter((file) => file.endsWith(".json"));
}

const isProposal = (value: PageProposal | null): value is PageProposal => Boolean(value?.id && typeof value.text === "string");

async function allProposals(): Promise<PageProposal[]> {
	const read = await Promise.all((await proposalFiles()).map((file) => v.readJsonFile<PageProposal>(file)));
	return read.filter(isProposal).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const proposalFile = (proposal: Pick<PageProposal, "id" | "pageId">) => path.join(v.pageProposalsDir(proposal.pageId), `${proposal.id}.json`);

async function writeProposal(proposal: PageProposal): Promise<void> {
	const file = proposalFile(proposal);
	await fs.mkdir(path.dirname(file), { recursive: true });
	await v.writeJsonFile(file, proposal);
}

async function findProposal(id: string): Promise<PageProposal | null> {
	if (!/^pgp_[\w-]+$/.test(id)) return null;
	return (await allProposals()).find((proposal) => proposal.id === id) ?? null;
}

/** The event open panes already refresh on: only the list of proposals moved. */
const announce = (proposal: PageProposal) => emit("library-changed", { itemId: proposal.pageId });

async function resolve(proposal: PageProposal, change: Pick<PageProposal, "status"> & Partial<PageProposal>): Promise<PageProposal> {
	const next: PageProposal = { ...proposal, ...change, resolvedAt: new Date().toISOString() };
	await writeProposal(next);
	return next;
}

export const pageProposalStore: PageProposalStore = {
	propose: (input) => v.withLock(async () => {
		if (input.toolCallId) {
			const repeat = (await allProposals()).find((proposal) => proposal.toolCallId === input.toolCallId);
			if (repeat) return { outcome: "proposed", proposal: repeat };
		}
		const page = await v.loadPage(await v.readCatalog(), input.pageId);
		if (!page) return { outcome: "missing" };
		// The draft is his and stays where it is: only a read of an old head refuses.
		if (input.baseVersion !== page.head.n) return { outcome: "stale", head: page.head.n };
		const text = input.apply(page.head.content);
		if (typeof text !== "string") return { outcome: "refused", reason: text.refused };
		if (text === page.head.content) return { outcome: "refused", reason: "That text is what the page already says, so there is nothing to propose." };
		if (tooLarge(text)) return { outcome: "too-large" };
		const proposal: PageProposal = {
			id: `pgp_${nanoid()}`,
			pageId: input.pageId,
			name: page.item.name,
			baseVersion: page.head.n,
			baseText: page.head.content,
			text,
			status: "pending",
			createdAt: new Date().toISOString(),
			...(input.chatId ? { chatId: input.chatId } : {}),
			...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
		};
		await writeProposal(proposal);
		announce(proposal);
		return { outcome: "proposed", proposal };
	}),
	proposals: (filter = {}) => v.withLock(async () => (await allProposals()).filter((proposal) =>
		(filter.pageId === undefined || proposal.pageId === filter.pageId) && (filter.status === undefined || proposal.status === filter.status))),
	proposal: (id) => v.withLock(() => findProposal(id)),
	review: (id) => v.withLock(async () => {
		const proposal = await findProposal(id);
		if (!proposal) return null;
		const page = await v.loadPage(await v.readCatalog(), proposal.pageId);
		if (!page) return { proposal, current: null };
		const text = page.draft?.content ?? page.head.content;
		const moved = page.head.n !== proposal.baseVersion;
		return {
			proposal,
			current: {
				text,
				name: page.item.name,
				expected: { head: page.head.n, rev: page.draft?.rev ?? 0 },
				merged: moved ? null : mergeProposal(proposal.baseText, proposal.text, text),
				moved,
			},
		};
	}),
	edit: (id, text) => v.withLock(async () => {
		const proposal = await findProposal(id);
		if (!proposal) return "missing";
		if (proposal.status !== "pending") return "resolved";
		if (tooLarge(text)) return "too-large";
		const next: PageProposal = { ...proposal, text, edited: true };
		await writeProposal(next);
		return next;
	}),
	reject: (id) => v.withLock(async () => {
		const proposal = await findProposal(id);
		if (!proposal) return { outcome: "missing" };
		if (proposal.status !== "pending") return { outcome: "resolved", proposal };
		const done = await resolve(proposal, { status: "rejected" });
		announce(done);
		return { outcome: "rejected", proposal: done };
	}),
	accept: (id, expected) => v.withLock(async (): Promise<PageProposalAccept> => {
		const proposal = await findProposal(id);
		if (!proposal) return { outcome: "missing" };
		if (proposal.status !== "pending") return { outcome: "resolved", proposal };
		const catalog = await v.readCatalog();
		const page = await v.loadPage(catalog, proposal.pageId);
		if (!page) return { outcome: "target-gone" };
		// A crash after the version and before the proposal's status: the log already has it.
		const already = page.versions.find((version) => version.proposalId === proposal.id);
		if (already) return { outcome: "accepted", proposal: await resolve(proposal, { status: "accepted", version: already.n }), item: page.item, version: already };
		const { head, draft } = page;
		// Refusals change nothing: page, draft and proposal all stay as they are.
		if (head.n !== proposal.baseVersion) return { outcome: "moved", head: head.n };
		if (expected.head !== head.n || expected.rev !== (draft?.rev ?? 0)) return { outcome: "compared-stale", head: head.n };
		const current = draft?.content ?? head.content;
		const merged = mergeProposal(proposal.baseText, proposal.text, current);
		if (merged === null) return { outcome: "overlap", head: head.n };
		if (tooLarge(merged)) return { outcome: "too-large" };
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
		const written = await v.appendVersion(catalog, item, versions, merged, {
			author: "agent",
			base: versions.at(-1)!.n,
			cause: "proposal-approved",
			proposalId: proposal.id,
			...(proposal.chatId ? { chatId: proposal.chatId } : {}),
			...(proposal.edited ? { editedByLearner: true } : {}),
		});
		v.changed(item.id, written.version);
		const done = await resolve(proposal, { status: "accepted", version: written.version.n });
		announce(done);
		return { outcome: "accepted", proposal: done, item: written.item, version: written.version, ...(savedLearnerVersion ? { savedLearnerVersion } : {}) };
	}),
	unlinkChat: (chatId) => v.withLock(async () => {
		for (const proposal of await allProposals()) {
			if (proposal.chatId !== chatId) continue;
			const { chatId: _gone, ...rest } = proposal;
			await writeProposal(rest);
		}
	}),
};
