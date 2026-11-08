/**
 * The repo-link routes' logic (feature 026, contracts/api.md): list,
 * create, "Sync now", token replace/remove and unlink. Every refusal is
 * decided before any fetch; the first pull runs in the request. No response
 * carries a token or an address with credentials.
 */
import { inMirror, LIBRARY_REFUSALS, liveFolderId, nameKey, REPO_REFUSALS, suggestName, uploadName, type LibraryFolder } from "../core/library.ts";
import { isBranchName, parseRepoAddress, REPO_MAX_BYTES, REPO_MAX_FILES, REPO_MAX_LINKS, type PendingLinkView } from "../core/repo-link.ts";
import { libraryStore } from "../store/library.ts";
import { libraryGuarded, libraryRefusal } from "./library.ts";
import { hostedAddressAllowed, loopbackTestMode } from "./repo-git.ts";
import { repoLinkView, repoLinkViews } from "./repo-link-views.ts";
import { repoTokens } from "../store/repo-tokens.ts";
import { linkRepo, pendingLinks, pullLink, unlinkLink } from "./repo-sync.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const LIMITS = { maxLinks: REPO_MAX_LINKS, maxFiles: REPO_MAX_FILES, maxBytes: REPO_MAX_BYTES };

export function repoLinksListResponse(): Promise<Response> {
	return libraryGuarded(async () => {
		const pending: PendingLinkView[] = pendingLinks();
		return json({ links: await repoLinkViews(), pending, limits: LIMITS });
	});
}

const optionalText = (value: unknown): string | undefined | null => {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") return null;
	return value.trim() || undefined;
};

/** The "mirrors a repo" refusal names the linked folder the parent sits in. */
function parentInMirror(parentId: string, folders: readonly LibraryFolder[]): string {
	let current = folders.find((f) => f.id === parentId);
	while (current && current.mirror?.path !== "") current = folders.find((f) => f.id === current!.parentId);
	return (current ?? folders.find((f) => f.id === parentId))!.name;
}

/** POST /api/library/links: validate, then the first pull. */
export function repoLinkCreateResponse(request: Request): Promise<Response> {
	return libraryGuarded(async () => {
		const body = await request.json().catch(() => null) as Record<string, unknown> | null;
		if (!body || typeof body !== "object" || Array.isArray(body)) return libraryRefusal(LIBRARY_REFUSALS.invalidAddress);
		const address = parseRepoAddress(typeof body.url === "string" ? body.url : "", { allowLoopbackHttp: loopbackTestMode() });
		if ("refused" in address) return libraryRefusal(address);
		const branch = optionalText(body.branch);
		if (branch === null || (branch !== undefined && !isBranchName(branch))) return libraryRefusal(LIBRARY_REFUSALS.invalidBranch);
		const token = optionalText(body.token);
		if (token === null) return json({ error: "That token can't be used.", code: "invalid_token" }, 400);
		const folderName = uploadName(typeof body.folderName === "string" ? body.folderName : "");
		if (!folderName) return libraryRefusal(LIBRARY_REFUSALS.invalidName);
		const parentId = body.parentId === null || body.parentId === undefined ? null : typeof body.parentId === "string" && body.parentId ? body.parentId : undefined;
		if (parentId === undefined) return libraryRefusal(LIBRARY_REFUSALS.folderMissing, 400);
		const requestId = typeof body.requestId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.requestId) ? body.requestId : null;
		if (!requestId) return json({ error: "The request needs an id.", code: "invalid_request" }, 400);

		const folders = await libraryStore.folders();
		// The 10-link limit and a second link of the same address and branch, before any fetch (FR-001, SC-010).
		const links = await libraryStore.repoLinks();
		if (links.length + pendingLinks().length >= REPO_MAX_LINKS) return libraryRefusal(LIBRARY_REFUSALS.limitLinks);
		const twin = links.find((l) => l.repoKey.slice(0, l.repoKey.lastIndexOf("#")) === address.repoBase && (branch ? l.branch === branch : !l.branchGiven));
		if (twin) return libraryRefusal(REPO_REFUSALS.alreadyLinked(twin.display, twin.branch, folders.find((f) => f.id === twin.folderId)?.name ?? twin.display));
		if (parentId && !folders.some((f) => f.id === parentId)) return libraryRefusal(LIBRARY_REFUSALS.folderMissing);
		if (parentId && inMirror(parentId, folders)) return libraryRefusal(REPO_REFUSALS.repoFolder(parentInMirror(parentId, folders)));
		const taken = new Set(folders.filter((f) => liveFolderId(f.parentId, folders) === parentId).map((f) => nameKey(f.name)));
		if (taken.has(nameKey(folderName))) {
			return libraryRefusal({ refused: "name_taken", message: `${folderName} is already a folder here.`, name: folderName, suggestedName: suggestName(folderName, (c) => taken.has(nameKey(c))) });
		}
		if (!await hostedAddressAllowed(address.url)) return libraryRefusal(LIBRARY_REFUSALS.addressBlocked);

		const outcome = await linkRepo({ requestId, url: address.url, display: address.display, repoBase: address.repoBase, ...(token ? { token } : {}), ...(branch ? { branch } : {}), folderName, parentId });
		if (outcome.ok) return json({ link: repoLinkView(outcome.link), folder: outcome.folder }, 201);
		if ("refusal" in outcome) return libraryRefusal(outcome.refusal);
		return json({ error: outcome.failure.message, code: "sync_failed", refused: "sync_failed", failure: outcome.failure }, 422);
	});
}

/** POST /api/library/links/:id/sync ("Sync now"): 202 once the link reads
 *  syncing; a pull already running is joined, not repeated (FR-015). */
export function repoLinkSyncResponse(id: string): Promise<Response> {
	return libraryGuarded(async () => {
		const link = await pullLink(id).started;
		if (!link) return json({ error: "That repo link is no longer in your Library.", code: "link_missing" }, 404);
		return json({ link: repoLinkView(link) }, 202);
	});
}

const linkMissing = () => json({ error: "That repo link is no longer in your Library.", code: "link_missing" }, 404);

/** PATCH /api/library/links/:id: `{ token }` replaces the token (the next pull
 *  uses it), `{ token: null }` removes it. Only the mask ever comes back. */
export function repoLinkPatchResponse(request: Request, id: string): Promise<Response> {
	return libraryGuarded(async () => {
		const body = await request.json().catch(() => null) as Record<string, unknown> | null;
		const raw = body && typeof body === "object" && !Array.isArray(body) && "token" in body ? body.token : undefined;
		const token = typeof raw === "string" ? raw.trim() : raw;
		if (token !== null && (typeof token !== "string" || !token || /\s/.test(token))) return json({ error: "That token can't be used.", code: "invalid_token" }, 400);
		if (!(await libraryStore.repoLinks()).some((l) => l.id === id)) return linkMissing();
		if (token === null) repoTokens.delete(id);
		else repoTokens.set(id, token);
		const link = await libraryStore.setLinkToken(id, token !== null);
		if (!link) {
			// Unlinked meanwhile: nothing of it may stay.
			repoTokens.delete(id);
			return linkMissing();
		}
		return json({ link: repoLinkView(link) });
	});
}

/** DELETE /api/library/links/:id: unlink, after the client's confirm. */
export function repoLinkDeleteResponse(id: string): Promise<Response> {
	return libraryGuarded(async () => ((await unlinkLink(id)) ? json({ ok: true }) : linkMissing()));
}
