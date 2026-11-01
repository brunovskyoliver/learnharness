/**
 * The held page edit routes' handlers (feature 023). Routes wrap these in withTenant
 * and the store is tenant-scoped, so another tenant's proposal is a plain 404.
 * Nothing here calls a model, and only accept writes to the page.
 */
import { LibraryCatalogError } from "../core/library.ts";
import type { PageProposal } from "../core/page-proposals.ts";
import { pageProposalStore } from "../store/page-proposals.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function guarded(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (err) {
		if (!(err instanceof LibraryCatalogError)) throw err;
		console.error("[page-proposals]", err.message);
		return json({ error: "Your Library could not be loaded.", code: "catalog" }, 500);
	}
}

const gone = () => json({ error: "That proposal is no longer here." }, 404);
const resolved = (proposal: PageProposal) => json({ error: "That proposal was already decided.", code: "resolved", proposal: withoutTexts(proposal) }, 409);
const withoutTexts = ({ baseText: _base, text: _text, ...row }: PageProposal) => row;

async function body(request: Request): Promise<Record<string, unknown> | null> {
	const parsed = await request.json().catch(() => null) as unknown;
	return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

export function pageProposalsResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const pageId = new URL(request.url).searchParams.get("page") ?? undefined;
		const proposals = await pageProposalStore.proposals({ ...(pageId ? { pageId } : {}), status: "pending" });
		return json({ proposals: proposals.map(withoutTexts) });
	});
}

export function pageProposalResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const review = await pageProposalStore.review(id);
		return review ? json(review) : gone();
	});
}

/** Edit first: changes the proposal's text, and the page stays as it is. */
export function pageProposalEditResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const raw = await body(request);
		if (typeof raw?.text !== "string") return json({ error: "That text could not be read.", code: "invalid_text" }, 400);
		const result = await pageProposalStore.edit(id, raw.text);
		if (result === "missing") return gone();
		if (result === "resolved") return json({ error: "That proposal was already decided.", code: "resolved" }, 409);
		if (result === "too-large") return json({ error: "That text is over the page limit.", code: "too_large" }, 413);
		return json({ proposal: withoutTexts(result) });
	});
}

export function pageProposalRejectResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const result = await pageProposalStore.reject(id);
		if (result.outcome === "missing") return gone();
		return result.outcome === "resolved" ? resolved(result.proposal) : json({ proposal: withoutTexts(result.proposal) });
	});
}

export function pageProposalAcceptResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const expected = (await body(request))?.expected as { head?: unknown; rev?: unknown } | undefined;
		// A page can't change without saying what was compared.
		if (!expected || !Number.isInteger(expected.head) || !Number.isInteger(expected.rev)) return json({ error: "Say which version was compared.", code: "expected_required" }, 400);
		const result = await pageProposalStore.accept(id, { head: expected.head as number, rev: expected.rev as number });
		switch (result.outcome) {
			case "accepted": return json({ proposal: withoutTexts(result.proposal), item: result.item, version: result.version, ...(result.savedLearnerVersion ? { savedLearnerVersion: result.savedLearnerVersion } : {}) }, 201);
			case "moved": return json({ error: "This page has a newer version than the one the tutor changed, so this can't be accepted. Your page and the proposal are both kept.", code: "moved", head: result.head }, 409);
			case "overlap": return json({ error: "You changed the same text since, so this can't be accepted. Your page and the proposal are both kept.", code: "overlap", head: result.head }, 409);
			case "compared-stale": return json({ error: "This page changed after you compared it.", code: "stale", head: result.head }, 409);
			case "too-large": return json({ error: "The result would be over the page limit.", code: "too_large" }, 413);
			case "resolved": return resolved(result.proposal);
			case "target-gone": return json({ error: "That page is no longer in your Library.", code: "target_gone" }, 404);
			case "missing": return gone();
		}
	});
}
