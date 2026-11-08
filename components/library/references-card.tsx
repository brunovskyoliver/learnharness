"use client";

import { useEffect, useState } from "react";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { opensInPane, usePagePane } from "@/components/library/page-pane-context";
import { liveLibrary } from "@/components/reference-catalog";
import { goneSuffix, referenceLabel, type LibraryReference } from "@/src/core";

/** Live ids, fetched only once a transcript has references and shared across
 *  its rows. Short-lived (components/reference-catalog.ts holds the TTL), so a
 *  deletion shows up on the next view. The label stays as sent if this fails. */
const currentLibraryIds = (): Promise<Set<string> | null> =>
	liveLibrary().then((list) => (list ? new Set(list.byId.keys()) : null));

const LINK = "text-ink underline decoration-ink/40 underline-offset-[3px] hover:decoration-ink pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center";

export function ReferenceRow({ reference, deleted = false }: { reference: LibraryReference; deleted?: boolean }) {
	const { open } = useSettingsDialog();
	const { prefix, suffix } = referenceLabel(reference);
	const pane = usePagePane();
	const available = reference.mode !== "missing" && !deleted;
	const inPane = available && !!pane && opensInPane(reference.kind);
	const inTab = available && !inPane && reference.kind !== "page";
	return (
		<li data-testid="reference-row" className="text-meta text-faint [overflow-wrap:anywhere]">
			{prefix}
			{inPane ? (
				<button type="button" aria-label={`Open ${reference.name}`} className={LINK} onClick={() => pane.open({ id: reference.itemId, name: reference.name, kind: reference.kind, size: reference.size ?? 0 })}>{reference.name}</button>
			) : inTab ? (
				<a
					href={`/api/library/items/${encodeURIComponent(reference.itemId)}/content`}
					target="_blank"
					rel="noreferrer"
					aria-label={`Open ${reference.name}`}
					className={LINK}
				>{reference.name}</a>
			) : (
				<span className="text-ink">{reference.name}</span>
			)}
			{suffix}
			{deleted && goneSuffix(reference)}
			{reference.reason === "no-vision" && (
				<>
					{" · "}
					<button
						type="button"
						onClick={(event) => open("agent", undefined, event.currentTarget)}
						className="text-ink underline decoration-ink/40 underline-offset-2 pointer-coarse:min-h-11"
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
		<ul data-testid="references-card" className="my-1 flex flex-col gap-0.5 font-sans">
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
