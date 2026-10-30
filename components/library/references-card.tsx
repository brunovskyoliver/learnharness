"use client";

import { useEffect, useState } from "react";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { NO_LONGER_IN_LIBRARY, referenceLabel, type LibraryReference } from "@/src/core";

/** Live ids, fetched only once a transcript has references and shared across
 *  its rows. Short-lived, so a deletion shows up on the next view. */
const LIVE_IDS_TTL_MS = 30_000;
let liveIds: { at: number; ids: Promise<Set<string> | null> } | null = null;
function currentLibraryIds(): Promise<Set<string> | null> {
	if (!liveIds || Date.now() - liveIds.at > LIVE_IDS_TTL_MS) {
		liveIds = {
			at: Date.now(),
			ids: fetch("/api/library", { cache: "no-store" })
				.then((response) => (response.ok ? response.json() : null))
				.then((body: { items: { id: string }[] } | null) => (body ? new Set(body.items.map((item) => item.id)) : null))
				// The label stays as sent if this fails.
				.catch(() => null),
		};
	}
	return liveIds.ids;
}

const opensInTab = (ref: LibraryReference) => ref.mode !== "missing" && ref.kind !== "page";

export function ReferenceRow({ reference, deleted = false }: { reference: LibraryReference; deleted?: boolean }) {
	const { open } = useSettingsDialog();
	const { prefix, suffix } = referenceLabel(reference);
	const linked = opensInTab(reference) && !deleted;
	return (
		<li data-testid="reference-row" className="text-sm text-ink-2 [overflow-wrap:anywhere]">
			{prefix}
			{linked ? (
				<a
					href={`/api/library/items/${encodeURIComponent(reference.itemId)}/content`}
					target="_blank"
					rel="noreferrer"
					aria-label={`Open ${reference.name}`}
					className="text-foreground underline decoration-foreground/40 underline-offset-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
				>{reference.name}</a>
			) : (
				<span className="text-foreground">{reference.name}</span>
			)}
			{suffix}
			{deleted && NO_LONGER_IN_LIBRARY}
			{reference.reason === "no-vision" && (
				<>
					{" · "}
					<button
						type="button"
						onClick={(event) => open("agent", undefined, event.currentTarget)}
						className="text-foreground underline decoration-foreground/40 underline-offset-2 pointer-coarse:min-h-11"
					>Settings → Agent</button>
				</>
			)}
		</li>
	);
}

/** One quiet, always visible row per reference, on the reading edge. */
export function ReferencesCard({ references }: { references: readonly LibraryReference[] }) {
	const [ids, setIds] = useState<Set<string> | null>(null);
	const hasReferences = references.length > 0;
	useEffect(() => {
		if (!hasReferences) return;
		let live = true;
		void currentLibraryIds().then((current) => { if (live) setIds(current); });
		return () => { live = false; };
	}, [hasReferences]);
	if (references.length === 0) return null;
	return (
		<ul data-testid="references-card" className="my-1 flex flex-col gap-0.5 font-ui">
			{references.map((reference) => (
				<ReferenceRow
					key={reference.itemId}
					reference={reference}
					deleted={ids !== null && reference.mode !== "missing" && !ids.has(reference.itemId)}
				/>
			))}
		</ul>
	);
}
