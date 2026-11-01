/** The diagram routes in the page draft controller's shape (feature 022), so a
 *  diagram gets the page's autosave, no-loss rules and states unchanged. */
import type { PageApi } from "@/components/library/page-draft.ts";
import { PAGE_MISSING } from "@/components/library/page-draft.ts";
import type { PageDraftView, PageHead, PageState, PageVersion } from "@/src/core";

export const diagramUrl = (id: string) => `/api/library/diagrams/${encodeURIComponent(id)}`;
export const proposalUrl = (id: string) => `/api/library/diagram-proposals/${encodeURIComponent(id)}`;

/** `onRefused` hears a diagram this app must not open: a newer schema or damage. */
export function fetchDiagramApi(onRefused: (message: string) => void, fetcher: typeof fetch = fetch): PageApi {
	const send = (url: string, method: string, body: unknown) => fetcher(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const conflict = async <T,>(response: Response): Promise<T | { stale: { head: PageHead; draft: PageDraftView | null } } | null> => {
		const body = await response.json() as { code?: string; error?: string; head?: PageHead; draft?: PageDraftView | null };
		if (body.code === "stale" && body.head) return { stale: { head: body.head, draft: body.draft ?? null } };
		if (body.error) onRefused(body.error);
		return null;
	};
	return {
		read: async (id) => {
			const response = await fetcher(diagramUrl(id), { cache: "no-store" });
			if (response.status === 404) return null;
			if (response.status === 409) {
				const body = await response.json() as { error?: string };
				onRefused(body.error ?? "This diagram can't be opened here.");
				throw new Error("refused");
			}
			if (!response.ok) throw new Error(String(response.status));
			return await response.json() as PageState;
		},
		putDraft: async (id, input) => {
			const response = await send(`${diagramUrl(id)}/draft`, "PUT", input);
			if (response.status === 409) return conflict(response);
			if (response.status === 404) return PAGE_MISSING;
			return response.ok ? await response.json() as { rev: number } : null;
		},
		commit: async (id, input) => {
			const response = await send(`${diagramUrl(id)}/versions`, "POST", input);
			if (response.status === 409) return conflict(response);
			if (response.status === 404) return PAGE_MISSING;
			return response.ok ? await response.json() as { version: PageVersion; created: boolean; otherVersion?: number } : null;
		},
		restore: async (id, n) => {
			const response = await send(`${diagramUrl(id)}/restore`, "POST", { n });
			return response.ok ? await response.json() as { version: PageVersion } : null;
		},
	};
}
