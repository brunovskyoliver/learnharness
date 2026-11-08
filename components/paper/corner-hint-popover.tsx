"use client";

/**
 * The corner hint's list of runs (components/paper/corner-hint.tsx): a Radix
 * Popover anchored on the hint. Split out so it loads on the first click of
 * the running line, not in either mode's startup JS (feature 025, T065).
 */
import { Popover } from "radix-ui";
import type { ReactNode, RefObject } from "react";

export function CornerHintPopover({ anchor, trigger, open, onOpenChange, container, children }: {
	anchor: RefObject<HTMLDivElement | null>;
	/** The running line's button: a press on it toggles, it is not "outside"; focus returns to it. */
	trigger: RefObject<HTMLButtonElement | null>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	container: HTMLElement | null | undefined;
	children: ReactNode;
}) {
	return (
		<Popover.Root open={open} onOpenChange={onOpenChange}>
			<Popover.Anchor virtualRef={anchor as RefObject<HTMLDivElement>} />
			<Popover.Portal container={container ?? undefined}>
				<Popover.Content
					className="nb-activity"
					side="top"
					align="end"
					sideOffset={8}
					data-testid="nb-activity"
					onInteractOutside={(event) => { if (trigger.current?.contains(event.target as Node)) event.preventDefault(); }}
					onCloseAutoFocus={(event) => { if (trigger.current?.isConnected) { event.preventDefault(); trigger.current.focus(); } }}
				>
					{children}
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
