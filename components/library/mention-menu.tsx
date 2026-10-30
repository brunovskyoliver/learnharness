"use client";

import { useEffect, useRef } from "react";
import { formatBytes, KIND_LABEL, type LibraryItem } from "@/src/core";
import { cn } from "@/lib/utils";
import type { MentionStatus } from "./use-library-mention.ts";

export interface MentionMenuProps {
	listId: string;
	status: MentionStatus;
	/** The Library holds something, so an empty list means no match. */
	hasItems: boolean;
	options: LibraryItem[];
	activeIndex: number;
	onPick: (item: LibraryItem) => void;
}

const STATUS_ROW = "px-3 py-2 text-base text-ink-2";

/** The status a list with no rows shows, or null when it has rows. */
export function mentionStatusText({ status, hasItems, options }: Pick<MentionMenuProps, "status" | "hasItems" | "options">): string | null {
	if (options.length > 0) return null;
	if (status === "failed") return "Your Library could not be loaded.";
	if (status === "idle" || status === "loading") return "Loading your Library…";
	return hasItems ? "Nothing matched" : "Your Library is empty.";
}

/** Sits in the shell's flow above the field: the shell clips what leaves it,
 *  and this keeps the list inside its width. Focus stays in the textarea. */
export function MentionMenu({ listId, status, hasItems, options, activeIndex, onPick }: MentionMenuProps) {
	const listRef = useRef<HTMLDivElement>(null);
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
			className="mx-2 mt-2 max-h-[min(16.5rem,40dvh)] select-none overflow-y-auto overscroll-contain rounded-[10px] bg-accent"
		>
			{message ? (
				<div role="status" className={STATUS_ROW}>{message}</div>
			) : options.map((item, index) => (
				<div
					key={item.id}
					id={`${listId}-${index}`}
					role="option"
					aria-selected={index === activeIndex}
					data-testid="mention-option"
					// Keeps focus and the caret in the field.
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onPick(item)}
					className={cn(
						"flex min-h-11 cursor-pointer flex-col justify-center rounded-[10px] px-3 py-1.5 outline-offset-[-1px]",
						index === activeIndex && "bg-background outline-1 outline-ring outline-solid",
					)}
				>
					<span className="text-base text-foreground [overflow-wrap:anywhere]">{item.name}</span>
					<span className="text-sm text-muted-foreground">{KIND_LABEL[item.kind]} · {formatBytes(item.size)}</span>
				</div>
			))}
		</div>
	);
}
