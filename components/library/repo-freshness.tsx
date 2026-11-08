"use client";

import { useCallback, useRef, useState } from "react";
import { useServerEvent } from "@/components/server-events";

export type RepoFreshness = "current" | "updated" | "removed";

/** Whether an open mirrored file changed or left in a pull (feature 026,
 *  ui-contract "Opening a synced file"). The reader records the version it
 *  showed (the content's X-Library-Version); on `library-changed` for its
 *  item a HEAD request tells "Updated from the repo" from "Removed from the
 *  repo". Marks and renames don't move the version, so they say nothing. */
export function useRepoFreshness(itemId: string) {
	const shown = useRef<string | null>(null);
	const [state, setState] = useState<RepoFreshness>("current");
	const record = useCallback((response: Response) => {
		const version = response.headers.get("X-Library-Version");
		if (version) shown.current = version;
	}, []);
	useServerEvent("library-changed", (payload) => {
		if (payload.itemId !== itemId || shown.current === null) return;
		void fetch(`/api/library/items/${itemId}/content`, { method: "HEAD", cache: "no-store" }).then((response) => {
			if (response.status === 404) setState("removed");
			else if (response.ok) {
				const version = response.headers.get("X-Library-Version");
				setState(version && version !== shown.current ? "updated" : "current");
			}
		}).catch(() => {});
	});
	const reset = useCallback(() => setState("current"), []);
	return { freshness: state, record, reset };
}

/** "Updated from the repo" with Reload, or "Removed from the repo" (the view keeps what it showed). */
export function RepoFreshnessLine({ freshness, onReload }: { freshness: RepoFreshness; onReload: () => void }) {
	if (freshness === "current") return null;
	return (
		<p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-faint" data-testid="repo-freshness">
			{freshness === "updated" ? "Updated from the repo" : "Removed from the repo"}
			{freshness === "updated" && <button type="button" className="lh-text-action" onClick={onReload} data-testid="repo-freshness-reload">Reload</button>}
		</p>
	);
}
