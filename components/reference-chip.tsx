"use client";

/**
 * A reference to a Library item drawn as a chip (feature 027,
 * contracts/ui-contract.md §1): kind icon, name, faint hint. A link for the
 * states that open something, plain faint text for an item deleted for good or
 * removed from its repo. Presentation only: `data-source` carries the exact
 * characters it stands for, for copy. Navigation is added by the story that
 * needs it (US1); this renders the address as a plain link.
 */
import { FileCodeIcon, FileIcon, FileTextIcon, FileTypeIcon, ImageIcon, NetworkIcon, NotebookTextIcon, SheetIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NO_LONGER_IN_LIBRARY, REMOVED_FROM_REPO, type ChipTarget, type LibraryKind } from "@/src/core";

/** Approved by the owner at gate 2 (ui-contract §1). */
export const KIND_ICON: Record<LibraryKind, LucideIcon> = {
	page: NotebookTextIcon,
	markdown: FileTextIcon,
	text: FileTextIcon,
	code: FileCodeIcon,
	csv: SheetIcon,
	pdf: FileTypeIcon,
	image: ImageIcon,
	diagram: NetworkIcon,
	other: FileIcon,
};

export interface ReferenceChipProps {
	target: ChipTarget;
	/** `{messageId}:{key}`, for focus return. */
	chipId?: string;
	/** The exact underlying text this chip stands for. */
	source: string;
	className?: string;
}

export function ReferenceChip({ target, chipId, source, className }: ReferenceChipProps) {
	const Icon = KIND_ICON[target.kind];
	const common = {
		"data-testid": "ref-chip",
		"data-state": target.state,
		"data-kind": target.kind,
		"data-ref-chip": chipId,
		"data-source": source,
		className: cn("lh-ref-chip", className),
	};
	const icon = <Icon className="lh-ref-chip-icon" aria-hidden="true" focusable="false" />;
	if (target.href === null) {
		const suffix = target.state === "removed" ? REMOVED_FROM_REPO : NO_LONGER_IN_LIBRARY;
		return (
			<span {...common}>
				{icon}
				{target.name}
				{target.folderHint && <>{" "}<span className="lh-ref-chip-folder">{target.folderHint}</span></>}
				{suffix}
			</span>
		);
	}
	return (
		<a {...common} href={target.href} aria-label={target.label} aria-description={target.description}>
			{icon}
			{target.name}
			{target.folderHint && <>{" "}<span className="lh-ref-chip-folder">{target.folderHint}</span></>}
			{target.hint && <>{" "}<span className="lh-ref-chip-hint" data-testid="ref-chip-hint">{target.hint}</span></>}
		</a>
	);
}
