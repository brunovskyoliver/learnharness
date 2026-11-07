"use client";

/**
 * Export this note (feature 024, US7; ui-contract "Export dialog",
 * visual-reference §20): the shared paper export dialog
 * (components/paper/export-dialog.tsx, lifted in feature 025), with
 * Notebook's announcement and its "Untitled" name.
 */
import type { RefObject } from "react";
import { PaperExportDialog } from "@/components/paper/export-dialog";
import { isUntitledName, useNotebook } from "./nb-shared";

export function ExportDialog({ open, onOpenChange, pageId, noteName, beforeExport, returnFocus }: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pageId: string;
	noteName: string;
	/** Hands the note's latest words to the server. */
	beforeExport: () => Promise<void>;
	/** Focus goes here on close when nothing else had it before. */
	returnFocus: RefObject<HTMLElement | null>;
}) {
	const nb = useNotebook();
	return (
		<PaperExportDialog
			open={open}
			onOpenChange={onOpenChange}
			pageId={pageId}
			shownName={isUntitledName(noteName) ? "Untitled" : noteName}
			beforeExport={beforeExport}
			returnFocus={returnFocus}
			onExported={(filename) => nb.announce(`Exported “${filename}”.`)}
		/>
	);
}
