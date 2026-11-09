"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { LibraryItem } from "@/src/core";

/** A destructive confirm in a dialog: the red pill. */
export const DESTRUCTIVE_BUTTON = "nb-pill lh-pill-danger";

/** The dialog's pure body, exported for SSR tests (portals render nothing there). */
export function DeleteItemBody({ item, busy, failure, onClose, onConfirm }: {
	item: Pick<LibraryItem, "name" | "kind">;
	busy: boolean;
	failure: string | null;
	onClose: () => void;
	onConfirm: () => void;
}) {
	return (
		<>
			<DialogTitle className="[overflow-wrap:anywhere]">Move {item.name} to the trash?</DialogTitle>
			<DialogDescription>{item.kind === "page" || item.kind === "diagram" ? "You can restore it, with its whole version history, from Trash." : "You can restore it from Trash."}</DialogDescription>
			{failure && <p role="alert" className="text-sm text-red">{failure}</p>}
			<div className="mt-2 flex items-center justify-end gap-5">
				<button type="button" className="lh-text-action" disabled={busy} onClick={onClose} data-testid="library-delete-cancel">Cancel</button>
				<button type="button" className={DESTRUCTIVE_BUTTON} disabled={busy} onClick={onConfirm} data-testid="library-delete-confirm">
					{busy ? "Moving…" : failure ? "Try again" : "Move to the trash"}
				</button>
			</div>
		</>
	);
}

/** Confirms a delete, naming the item. Radix traps focus and closes on Escape. */
export function DeleteItemDialog({ item, onClose, onDeleted, returnFocus }: {
	item: LibraryItem | null;
	onClose: () => void;
	onDeleted: () => void;
	/** Pointer clicks don't leave focus on the opener, so Radix can't restore it. */
	returnFocus: () => void;
}) {
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	useEffect(() => {
		setBusy(false);
		setFailure(null);
	}, [item]);

	const confirm = async () => {
		if (!item) return;
		setBusy(true);
		setFailure(null);
		try {
			const response = await fetch("/api/library/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
			// Already gone is what the learner asked for.
			if (response.ok || response.status === 404) return onDeleted();
			const body = await response.json().catch(() => ({})) as { error?: string };
			setFailure(body.error ?? `${item.name} could not be moved to the trash.`);
		} catch {
			setFailure(`${item.name} could not be moved to the trash. Check your connection and try again.`);
		}
		setBusy(false);
	};

	return (
		<Dialog open={item !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
			<DialogContent
				showCloseButton={false}
				aria-describedby={undefined}
				data-testid="library-delete-dialog"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					returnFocus();
				}}
				className="gap-3 sm:max-w-md"
			>
				{item && <DeleteItemBody item={item} busy={busy} failure={failure} onClose={onClose} onConfirm={() => void confirm()} />}
			</DialogContent>
		</Dialog>
	);
}
