"use client";

import type { ReactNode } from "react";

/** The on/off switch — Notebook's `.nb-switch` (feature 025): a plain button
 *  in the switch role, the rule track off, the ink track on. */
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
	 *  toggle renders the half-filled contrast circle AS the knob — the icon
	 *  carries the meaning; plain toggles keep the plain knob. */
	discIcon?: ReactNode;
	/** Optional native tooltip on the switch. */
	title?: string;
}) {
	const state = checked ? "checked" : "unchecked";
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			{...(title ? { title } : {})}
			disabled={disabled}
			data-state={state}
			data-testid={`toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
			onClick={() => onChange(!checked)}
			className={disabled ? "nb-switch cursor-not-allowed" : "nb-switch"}
		>
			<span className="nb-switch-thumb" data-state={state} data-icon={discIcon ? "" : undefined}>{discIcon}</span>
		</button>
	);
}
