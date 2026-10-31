"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { LibraryItem } from "@/src/core";

export const DESTRUCTIVE_BUTTON = "border border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive";

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
			<DialogTitle className="text-base font-semibold [overflow-wrap:anywhere]">Delete {item.name}?</DialogTitle>
			{item.kind === "page" && <DialogDescription className="text-sm text-muted-foreground">Its whole version history goes too.</DialogDescription>}
			{failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" className="pointer-coarse:h-11" disabled={busy} onClick={onClose} data-testid="library-delete-cancel">Cancel</Button>
				<Button type="button" variant="ghost" className={`${DESTRUCTIVE_BUTTON} pointer-coarse:h-11`} disabled={busy} onClick={onConfirm} data-testid="library-delete-confirm">
					{busy ? "Deleting…" : failure ? "Try again" : "Delete"}
				</Button>
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
			const response = await fetch(`/api/library/items/${item.id}`, { method: "DELETE" });
			// Already gone is what the learner asked for.
			if (response.ok || response.status === 404) return onDeleted();
			const body = await response.json().catch(() => ({})) as { error?: string };
			setFailure(body.error ?? `${item.name} could not be deleted.`);
		} catch {
			setFailure(`${item.name} could not be deleted. Check your connection and try again.`);
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
				className="gap-3 rounded-[10px] border-0 bg-card sm:max-w-md"
			>
				{item && <DeleteItemBody item={item} busy={busy} failure={failure} onClose={onClose} onConfirm={() => void confirm()} />}
			</DialogContent>
		</Dialog>
	);
}
