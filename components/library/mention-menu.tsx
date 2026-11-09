"use client";

import { useEffect, useRef, type RefObject } from "react";
import { formatBytes, KIND_LABEL, type LibraryItem } from "@/src/core";
import { createBlankPage, usePagePane } from "./page-pane-api.ts";
import type { MentionStatus } from "./use-library-mention.ts";

/** A row of the list. A mirrored item (feature 026) inserts `mention`, its
 *  Library path, and shows `place`, its folder path, as its meta. */
export type MentionItem = LibraryItem & { mention?: string; place?: string };

/** Creates a blank page and opens it in the pane; sends nothing. */
export type CreateMentionPage = () => ReturnType<typeof createBlankPage>;

export interface MentionMenuProps {
	listId: string;
	status: MentionStatus;
	/** The Library holds something, so an empty list means no match. */
	hasItems: boolean;
	options: MentionItem[];
	activeIndex: number;
	onPick: (item: MentionItem) => void;
	onNewPage: () => void;
	/** The hook's way to create a page: it can't import the pane into the startup graph. */
	createPageRef?: RefObject<CreateMentionPage | null>;
}

const STATUS_ROW = "nb-menu-label";
const OPTION_ROW = "nb-menu-item lh-at-row min-h-11";

/** The status a list with no rows shows, or null when it has rows. */
export function mentionStatusText({ status, hasItems, options }: Pick<MentionMenuProps, "status" | "hasItems" | "options">): string | null {
	if (options.length > 0) return null;
	if (status === "failed") return "Your Library could not be loaded.";
	if (status === "idle" || status === "loading") return "Loading your Library…";
	return hasItems ? "Nothing matched" : "Your Library is empty.";
}

/** Sits in the shell's flow above the field: the shell clips what leaves it,
 *  and this keeps the list inside its width. Focus stays in the textarea. */
export function MentionMenu({ listId, status, hasItems, options, activeIndex, onPick, onNewPage, createPageRef }: MentionMenuProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const pane = usePagePane();
	useEffect(() => {
		if (!createPageRef) return;
		createPageRef.current = async () => {
			const result = await createBlankPage();
			if ("item" in result) pane?.open(result.item);
			return result;
		};
	}, [createPageRef, pane]);
	useEffect(() => {
		listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);
	const message = mentionStatusText({ status, hasItems, options });
	return (
		<div
			ref={listRef}
			id={listId}
			role="listbox"
			aria-label="Your Library"
			data-testid="mention-menu"
			onClick={(event) => event.stopPropagation()}
			className="nb-menu lh-at-menu mx-2 mt-2 select-none overscroll-contain"
		>
			{message && <div role="status" className={STATUS_ROW}>{message}</div>}
			{options.map((item, index) => (
				<div
					key={item.id}
					id={`${listId}-${index}`}
					role="option"
					aria-selected={index === activeIndex}
					data-testid="mention-option"
					// Keeps focus and the caret in the field.
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onPick(item)}
					className={OPTION_ROW}
				>
					<span className="nb-menu-text">
						<span className="nb-menu-name [overflow-wrap:anywhere]">{item.name}</span>
						<span className="nb-menu-description [overflow-wrap:anywhere]">{item.place !== undefined ? item.place : `${KIND_LABEL[item.kind]} · ${formatBytes(item.size)}`}</span>
					</span>
				</div>
			))}
			<div
				id={`${listId}-${options.length}`}
				role="option"
				aria-selected={activeIndex === options.length}
				data-testid="mention-new-page"
				onMouseDown={(event) => event.preventDefault()}
				onClick={onNewPage}
				className={OPTION_ROW}
			>
				<span className="nb-menu-name">New page</span>
			</div>
		</div>
	);
}
