"use client";

/**
 * A reference to a Library item drawn as a chip (feature 027,
 * contracts/ui-contract.md §1): kind icon, name, faint hint. A link for the
 * states that open something, plain faint text for an item deleted for good or
 * removed from its repo. Presentation only: `data-source` carries the exact
 * characters it stands for, for copy.
 *
 * Navigation (US1, research R9): a plain primary click inside a lesson saves
 * the return point and pushes the Library address; Ctrl/Cmd/Shift-click and
 * middle-click are the browser's (FR-018). Opening a chip starts no model call
 * and changes no draft, pane or lesson state (FR-017).
 */
import { createContext, useContext, useMemo, type MouseEvent, type ReactNode } from "react";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { KIND_ICON } from "@/components/reference-icons";
import { cn } from "@/lib/utils";
import { NO_LONGER_IN_LIBRARY, REMOVED_FROM_REPO, UNTITLED_SESSION, type ChipTarget } from "@/src/core";
import { markNextEntry, newNonce, saveReturnPoint } from "@/components/reference-return";

/** The lesson a chip sits in. Without one (render tests, other routes) a
 *  click is the browser's own: the address opens with no pill. */
export interface ReferenceOrigin {
	chatId: string;
	title: string | null;
	navigate: (href: string) => void;
}

const ReferenceOriginContext = createContext<ReferenceOrigin | null>(null);

/** Wraps a lesson's transcript. Navigates through the app shell's router;
 *  outside the shell (render tests) a click is the browser's own. */
export function ReferenceOriginProvider({ chatId, title, children }: { chatId: string; title: string | null; children: ReactNode }) {
	const push = useWorkspace()?.push;
	const value = useMemo(() => (push ? { chatId, title, navigate: push } : null), [chatId, title, push]);
	return <ReferenceOriginContext.Provider value={value}>{children}</ReferenceOriginContext.Provider>;
}

/** The click handler both a chip and a reference row's name use. */
function useOpenReference(href: string | null, chipId: string | undefined, own = true) {
	const origin = useContext(ReferenceOriginContext);
	return (event: MouseEvent<HTMLAnchorElement>) => {
		if (!href || !origin || event.defaultPrevented) return;
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		const at = chipId?.lastIndexOf(":") ?? -1;
		if (chipId && at > 0) {
			const pushed = newNonce();
			saveReturnPoint({ chatId: origin.chatId, title: origin.title?.trim() || UNTITLED_SESSION, messageId: chipId.slice(0, at), chipKey: chipId.slice(at + 1), pushed });
			markNextEntry(pushed, own);
		}
		origin.navigate(href);
	};
}

/** Approved by the owner at gate 2 (ui-contract §1). */
export { KIND_ICON };

export interface ReferenceChipProps {
	target: ChipTarget;
	/** `{messageId}:{key}`, for focus return. */
	chipId?: string;
	/** The exact underlying text this chip stands for. */
	source: string;
	className?: string;
	/** A tutor's citation rather than his own passage: the reader then reports
	 *  whether the quote was found as a citation. */
	citation?: boolean;
}

export function ReferenceChip({ target, chipId, source, className, citation = false }: ReferenceChipProps) {
	const open = useOpenReference(target.href, chipId, !citation);
	const Icon = KIND_ICON[target.kind];
	const common = {
		"data-testid": "ref-chip",
		"data-state": target.state,
		"data-kind": target.kind,
		"data-ref-chip": chipId,
		"data-source": source,
		className: cn("lh-ref-chip", className),
	};
	// One line, never broken inside the name: past the column's width the name
	// ends in an ellipsis, and its title (and the accessible name) keeps it whole.
	const icon = <Icon className="lh-ref-chip-icon" aria-hidden="true" focusable="false" />;
	const name = <span className="lh-ref-chip-name" title={target.name}>{target.name}</span>;
	const folder = target.folderHint && <span className="lh-ref-chip-folder">{` ${target.folderHint}`}</span>;
	if (target.href === null) {
		const suffix = target.state === "removed" ? REMOVED_FROM_REPO : NO_LONGER_IN_LIBRARY;
		return (
			<span {...common}>
				{icon}
				{name}
				{folder}
				<span className="lh-ref-chip-suffix">{suffix}</span>
			</span>
		);
	}
	return (
		<a {...common} href={target.href} onClick={open} aria-label={target.label} aria-description={target.description}>
			{icon}
			{name}
			{folder}
			{target.hint && <span className="lh-ref-chip-hint" data-testid="ref-chip-hint">{` ${target.hint}`}</span>}
		</a>
	);
}

/** A reference row's item name (Q3, research R10): opens like a chip. */
export function ReferenceLink({ href, chipId, className, label, children }: { href: string; chipId?: string; className?: string; label?: string; children: ReactNode }) {
	const open = useOpenReference(href, chipId);
	return <a href={href} onClick={open} data-ref-chip={chipId} aria-label={label} className={className}>{children}</a>;
}
