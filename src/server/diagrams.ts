/**
 * The diagram and proposal routes' handlers (feature 022, specs/022-diagrams/plan.md).
 * Routes wrap these in withTenant, and the stores are tenant-scoped, so another
 * tenant's diagram is a plain 404. Nothing here calls a model or writes a ledger.
 */
import {
	blankDiagram, DIAGRAM_FORMS, parseDiagram, serializeDiagram, validateDiagram, type DiagramDoc, type DiagramForm, type DiagramProposal,
} from "../core/diagram.ts";
import { isPageStale, isRefusal, LIBRARY_REFUSALS, LibraryCatalogError, type LibraryRefusal, type PageVersionCause, type PageWriteResult } from "../core/library.ts";
import type { DiagramWrite } from "../core/ports.ts";
import { diagramStore } from "../store/diagrams.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function guarded(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (err) {
		if (!(err instanceof LibraryCatalogError)) throw err;
		console.error("[diagrams]", err.message);
		return json({ error: "Your Library could not be loaded.", code: "catalog" }, 500);
	}
}

const gone = () => json({ error: "That diagram is no longer in your Library." }, 404);
const proposalGone = () => json({ error: "That proposal is no longer here." }, 404);
const versionGone = () => json({ error: "That version doesn't exist." }, 404);
const refused = (r: { refused: string; message: string }) => json({ error: r.message, code: r.refused }, 409);
const invalid = () => json({ error: "That diagram could not be read.", code: "invalid_diagram" }, 400);
const refusalResponse = (r: LibraryRefusal) => json({ error: r.message, code: r.refused, ...(r.name ? { name: r.name } : {}), ...(r.suggestedName ? { suggestedName: r.suggestedName } : {}) }, r.refused === "invalid_name" ? 400 : r.refused === "folder_missing" ? 404 : r.refused === "too_large" ? 413 : 409);

async function body(request: Request): Promise<Record<string, unknown> | null> {
	const parsed = await request.json().catch(() => null) as unknown;
	return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
}

/** Content must be a readable document of this schema, in the stored form. */
function writeInput(raw: Record<string, unknown> | null) {
	if (!raw || !Number.isInteger(raw.base) || !Number.isInteger(raw.rev) || typeof raw.content !== "string") return null;
	const parsed = parseDiagram(raw.content);
	if (!parsed.ok) return { refusal: { refused: parsed.code, message: parsed.message } };
	return { base: raw.base as number, rev: raw.rev as number, content: serializeDiagram(parsed.doc) };
}

function written<T extends object>(result: DiagramWrite<T>, success: (value: T) => Response): Response {
	if (result === "missing") return gone();
	if (result === "too-large") return json({ error: "A diagram can be at most 1 MB.", code: "too_large" }, 413);
	if (isPageStale(result)) return json({ error: "This diagram changed elsewhere.", code: "stale", head: result.head, draft: result.draft }, 409);
	if ("refused" in result) return refused(result as { refused: string; message: string });
	return success(result as T);
}

export function diagramCreateResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const raw = await body(request);
		if (typeof raw?.name !== "string") return refusalResponse(LIBRARY_REFUSALS.invalidName);
		if (!DIAGRAM_FORMS.includes(raw.form as DiagramForm)) return json({ error: "Choose a diagram, a concept map or a whiteboard.", code: "invalid_form" }, 400);
		const folderId = raw.folderId === undefined || raw.folderId === null ? null : typeof raw.folderId === "string" ? raw.folderId : undefined;
		if (folderId === undefined) return refusalResponse(LIBRARY_REFUSALS.folderMissing);
		const made = await diagramStore.create(raw.name, blankDiagram(raw.form as DiagramForm), { author: "learner", folderId });
		return isRefusal(made) ? refusalResponse(made) : json(made, 201);
	});
}

export function diagramReadResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const state = await diagramStore.read(id);
		if (!state) return gone();
		if ("refused" in state) return json({ error: state.message, code: state.refused, item: state.item }, 409);
		return json(state);
	});
}

export function diagramDraftResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const input = writeInput(await body(request));
		if (!input) return invalid();
		if ("refusal" in input) return refused(input.refusal!);
		return written(await diagramStore.saveDraft(id, input), (ok) => json(ok));
	});
}

const CLIENT_CAUSES: readonly PageVersionCause[] = ["save", "autosave-close", "conflict"];

export function diagramCommitResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const raw = await body(request);
		const input = writeInput(raw);
		if (!input) return invalid();
		if ("refusal" in input) return refused(input.refusal!);
		const cause = CLIENT_CAUSES.find((c) => c === raw?.cause);
		return written(await diagramStore.commit(id, { ...input, ...(cause ? { cause } : {}) }) as PageWriteResult<{ version: { n: number }; created: boolean }>, (ok) => json(ok, ok.created ? 201 : 200));
	});
}

export function diagramVersionsResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const versions = await diagramStore.versions(id);
		return versions ? json({ versions }) : gone();
	});
}

/** A version whose schema is newer is listed, but its content isn't handed out to edit. */
export function diagramVersionResponse(id: string, n: string): Promise<Response> {
	return guarded(async () => {
		const found = /^\d+$/.test(n) ? await diagramStore.version(id, Number(n)) : null;
		if (!found) return versionGone();
		const parsed = parseDiagram(found.content);
		return parsed.ok ? json(found) : json({ error: parsed.message, code: parsed.code, version: found.version }, 409);
	});
}

export function diagramRestoreResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const raw = await body(request);
		if (!Number.isInteger(raw?.n)) return versionGone();
		const result = await diagramStore.restore(id, raw!.n as number);
		if (result === "missing") return versionGone();
		return "refused" in result ? refused(result) : json(result, 201);
	});
}

// ── Proposals ──

export function diagramProposalsResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const params = new URL(request.url).searchParams;
		const diagramId = params.get("diagram") ?? undefined;
		const proposals = await diagramStore.proposals({ ...(diagramId ? { diagramId } : {}), status: "pending" });
		return json({ proposals: proposals.map(({ doc: _doc, ...row }) => row) });
	});
}

/** A proposal with what it would change right now: the draft if there is one, else
 *  the head. `expected` goes back on Approve, so what was compared is what is changed. */
async function withCurrent(proposal: DiagramProposal) {
	if (!proposal.diagramId) return { proposal, current: null };
	const state = await diagramStore.read(proposal.diagramId);
	if (!state) return { proposal, current: null, targetGone: true };
	if ("refused" in state) return { proposal, current: null, refused: { code: state.refused, message: state.message } };
	return { proposal, current: { content: state.draft?.content ?? state.head.content, expected: { head: state.head.n, rev: state.draft?.rev ?? 0 }, name: state.item.name } };
}

export function diagramProposalResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const proposal = await diagramStore.proposal(id);
		return proposal ? json(await withCurrent(proposal)) : proposalGone();
	});
}

/** Edit first: the proposal's own document changes, and the diagram doesn't. */
export function diagramProposalEditResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const raw = await body(request);
		const parsed = validateDiagram(raw?.doc);
		if (!parsed.ok) return parsed.code === "future_schema" ? refused({ refused: parsed.code, message: parsed.message }) : invalid();
		const result = await diagramStore.editProposal(id, parsed.doc as DiagramDoc);
		if (result === "missing") return proposalGone();
		return result === "resolved" ? json({ error: "That proposal was already decided.", code: "resolved" }, 409) : json({ proposal: result });
	});
}

export function diagramProposalRejectResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const result = await diagramStore.reject(id);
		return result.outcome === "missing" ? proposalGone() : json({ proposal: "proposal" in result ? result.proposal : null });
	});
}

export function diagramProposalApproveResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const raw = await body(request);
		const expected = raw?.expected as { head?: unknown; rev?: unknown } | undefined;
		const proposal = await diagramStore.proposal(id);
		if (!proposal) return proposalGone();
		// An existing diagram can't be changed without saying what was compared.
		if (proposal.diagramId && !(expected && Number.isInteger(expected.head) && Number.isInteger(expected.rev))) return json({ error: "Say which version was compared.", code: "expected_required" }, 400);
		const result = await diagramStore.approve(id, {
			...(expected ? { expected: { head: expected.head as number, rev: expected.rev as number } } : {}),
			...(typeof raw?.name === "string" ? { name: raw.name } : {}),
		});
		switch (result.outcome) {
			case "approved": return json({ proposal: result.proposal, item: result.item, version: result.version, ...(result.savedLearnerVersion ? { savedLearnerVersion: result.savedLearnerVersion } : {}) }, 201);
			case "stale": return json({ error: "This diagram changed after you compared it.", code: "stale", head: result.head }, 409);
			case "resolved": return json({ error: "That proposal was already decided.", code: "resolved", proposal: result.proposal }, 409);
			case "target-gone": return gone();
			case "missing": return proposalGone();
			case "refused": return refused({ refused: result.code, message: result.message });
			case "name-taken": return refusalResponse(result.refusal);
		}
	});
}
