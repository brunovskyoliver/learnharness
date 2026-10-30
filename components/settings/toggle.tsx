"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The on/off switch — a plain button in the switch role. */
export function Toggle({
	checked,
	disabled,
	onChange,
	label,
	discIcon,
	title,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: (next: boolean) => void;
	/** Accessible name for the switch role. */
	label: string;
	/** Optional icon disc (owner round, 2026-10-07): the figure cards' invert
	 *  toggle renders the half-filled contrast circle AS the disc — the icon
	 *  carries the meaning; plain toggles keep the plain disc. */
	discIcon?: ReactNode;
	/** Optional native tooltip on the switch. */
	title?: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			{...(title ? { title } : {})}
			disabled={disabled}
			data-testid={`toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative h-4.5 w-8 shrink-0 rounded-full border border-input transition-colors before:absolute before:-inset-3 before:content-[''] pointer-coarse:before:-inset-3.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
				// Owner (2026-09-20): on is a gray track with a WHITE disc (a full-white
				// track was too loud); off stays the muted track.
				checked && !disabled ? "bg-muted-foreground" : "bg-muted",
				disabled && "cursor-not-allowed",
			)}
		>
			{discIcon ? (
				// The icon IS the disc: same size, same slide, same state colors —
				// only the knob's face changes (the invert affordance).
				<span
					className={cn(
						"absolute left-0 top-0.5 flex size-3 items-center justify-center rounded-full transition-transform",
						checked ? "translate-x-4" : "translate-x-0.5",
							checked && !disabled ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{discIcon}
				</span>
			) : (
				<span
					className={cn(
						"absolute left-0 top-0.5 size-3 rounded-full transition-transform",
						// 2px inset from each inner edge, both states (owner round: the on
						// disc used to touch the pill's right edge).
						checked ? "translate-x-4" : "translate-x-0.5",
							checked && !disabled ? "bg-foreground" : "bg-muted-foreground",
					)}
				/>
			)}
		</button>
	);
}
