"use client";

import { useMemo } from "react";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { ReferenceLink } from "@/components/reference-chip";
import { useReferenceCatalog, type ItemStatus } from "@/components/reference-catalog";
import { goneSuffix, libraryHref, referenceLabel, type LibraryReference } from "@/src/core";

const LINK = "text-ink underline decoration-ink/40 underline-offset-[3px] hover:decoration-ink pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center";

/** Where a row's name opens (feature 027, Q3): like a chip, in the Library's
 *  full view, or the Trash entry that holds it. Null: plain ink text. */
function rowHref(reference: LibraryReference, status: ItemStatus | undefined): string | null {
	if (reference.mode === "missing") return null;
	if (status?.state === "trashed") return `/library?view=trash${status.trashEntryId ? `&entry=${encodeURIComponent(status.trashEntryId)}` : ""}`;
	if (status?.state === "deleted" || status?.state === "removed") return null;
	return libraryHref({ itemId: reference.itemId });
}

/** `status` is what the item is now (components/reference-catalog.ts); until
 *  it is known the row reads as sent. `deleted` forces the gone state. */
export function ReferenceRow({ reference, deleted = false, status, messageId }: { reference: LibraryReference; deleted?: boolean; status?: ItemStatus; messageId?: string }) {
	const { open } = useSettingsDialog();
	const { prefix, suffix } = referenceLabel(reference);
	// Not in the live list any more: the trash, deleted for good, or removed from its repo.
	const gone = deleted || (reference.mode !== "missing" && (status?.state === "trashed" || status?.state === "deleted" || status?.state === "removed"));
	const href = deleted ? null : rowHref(reference, status);
	return (
		<li data-testid="reference-row" className="text-meta text-faint [overflow-wrap:anywhere]">
			{prefix}
			{href ? (
				<ReferenceLink href={href} chipId={messageId ? `${messageId}:row-${reference.itemId}` : undefined} label={status?.state === "trashed" ? `Open ${reference.name} in the trash` : `Open ${reference.name}`} className={LINK}>{reference.name}</ReferenceLink>
			) : (
				<span className="text-ink">{reference.name}</span>
			)}
			{suffix}
			{gone && goneSuffix(reference)}
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

/** One quiet, always visible row per reference, on the reading edge. The
 *  items' states come from one shared, short-lived read of the Library
 *  (components/reference-catalog.ts); the label stays as sent if it fails. */
export function ReferencesCard({ references, messageId }: { references: readonly LibraryReference[]; messageId?: string }) {
	const queries = useMemo(() => references.map((reference) => (reference.fromRepo ? { itemId: reference.itemId, fromRepo: true } : { itemId: reference.itemId })), [references]);
	const { statuses } = useReferenceCatalog(queries);
	if (references.length === 0) return null;
	return (
		<ul data-testid="references-card" className="my-1 flex flex-col gap-0.5 font-sans">
			{references.map((reference) => (
				<ReferenceRow key={reference.itemId} reference={reference} status={statuses?.get(reference.itemId)} messageId={messageId} />
			))}
		</ul>
	);
}
