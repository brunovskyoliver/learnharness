/** A repo link as the client sees it (feature 026, contracts/api.md): the
 *  token only as its mask, the address without credentials. */
import type { RepoLink, RepoLinkView } from "../core/repo-link.ts";
import { libraryStore } from "../store/library.ts";
import { repoTokens } from "../store/repo-tokens.ts";

export const repoLinkView = (link: RepoLink): RepoLinkView => ({
	id: link.id,
	folderId: link.folderId,
	display: link.display,
	url: link.url,
	branch: link.branch,
	branchGiven: link.branchGiven,
	tokenMask: repoTokens.mask(link.id),
	sync: link.sync,
});

export const repoLinkViews = async (): Promise<RepoLinkView[]> => (await libraryStore.repoLinks()).map(repoLinkView);
