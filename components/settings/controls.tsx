"use client";
/**
 * Thin settings primitives (settings-app wave): the control kit the
 * settings dialog needs. Sections → groups → rows; everything SSRs clean
 * (render tests pin the sections' markup).
 *
 * Unavailable rows (owner, 2026-10-30, replacing the 2026-09-20 ruling):
 * label and hint use the muted ink token and the control locks. No opacity,
 * which would break 4.5:1 and derive text color from an opacity modifier.
 */

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SettingsTitle } from "@/components/paper/settings-shell";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

const RowControlContext = createContext<string | undefined>(undefined);

/** A page of the settings modal: its title (the dialog's title), an optional
 *  quiet line, the failure line pinned under the title, and its groups. */
export function SettingsSection({
	title,
	hint,
	alert,
	children,
	testid,
}: {
	title: string;
	/** One quiet line under the header — only where it earns its place. */
	hint?: string;
	/** A failed save, pinned at the top of the page while it scrolls. */
	alert?: ReactNode;
	children: React.ReactNode;
	testid?: string;
}) {
	return (
		<section data-testid={testid} className="nb-set-study">
			<SettingsTitle>{title}</SettingsTitle>
			{hint && <p className="nb-set-page-hint">{hint}</p>}
			{alert}
			<FieldGroup className="nb-set-groups">{children}</FieldGroup>
		</section>
	);
}

/** A labeled sub-group inside a section (owner, 2026-09-20: clear
 *  separation — Models / Tools / Prompts read as three blocks). In the
 *  modal's language: the label as a settings label, the rows in one card
 *  with the rule edge (feature 025). */
export function SettingsGroup({
	label,
	children,
	testid,
	rowId,
}: {
	/** Omitted for a section's single group, whose title is the section's. */
	label?: string;
	children: React.ReactNode;
	testid?: string;
	/** A search and deep-link target for a group with no rows of its own. */
	rowId?: string;
}) {
	return (
		<div data-testid={testid} data-settings-row={rowId} className="nb-set-group">
			{label && <h3 className="nb-set-label">{label}</h3>}
			<FieldGroup className="nb-set-rows">{children}</FieldGroup>
		</div>
	);
}

/** One label + one control. Label left (with optional quiet hint), control
 *  right; below the card's 32rem the control stacks under the label. */
export function SettingsRow({
	label,
	hint,
	children,
	testid,
	dimmed,
	rowId,
}: {
	label: string;
	hint?: ReactNode;
	children: React.ReactNode;
	testid?: string;
	/** The control is unavailable (parent off, no file yet, …): muted ink on
	 *  label and hint, control locked by its owner. */
	dimmed?: boolean;
	/** The `data-settings-row` search and deep-link target. */
	rowId?: string;
}) {
	const id = useId();
	return (
		<Field orientation="horizontal" data-testid={testid} aria-labelledby={`${id}-label`} data-disabled={dimmed || undefined} data-settings-row={rowId} className="nb-set-row">
			<FieldContent className="nb-set-row-text">
				<FieldTitle id={`${id}-label`} className={cn("nb-set-row-label", dimmed && "text-faint")}>{label}</FieldTitle>
				{hint && <FieldDescription className="nb-set-row-hint">{hint}</FieldDescription>}
			</FieldContent>
			<RowControlContext.Provider value={id}>
				<div className="nb-set-row-control">{children}</div>
			</RowControlContext.Provider>
		</Field>
	);
}

export { Toggle } from "./toggle";

/** A thin select — native element, options as given. */
export function ThinSelect({
	value,
	onChange,
	children,
	ariaLabel,
	testid,
	disabled,
}: {
	value: string;
	onChange: (next: string) => void;
	children: React.ReactNode;
	ariaLabel: string;
	testid?: string;
	disabled?: boolean;
}) {
	const id = useContext(RowControlContext);
	return (
		<select
			id={id}
			value={value}
			aria-label={ariaLabel}
			data-testid={testid}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			className="nb-set-select"
		>
			{children}
		</select>
	);
}

/** A thin hex/text input committing on blur + Enter (settings pace, not
 *  typing pace — every commit is a section PUT). */
export function CommitInput({
	value,
	placeholder,
	onCommit,
	ariaLabel,
	testid,
	type = "text",
}: {
	/** "" = unset (the factory default). Mirrors the STORED record —
	 *  after a clamped/normalized commit this flows back and the field
	 *  snaps to the stored truth (owner repro: a negative size kept
	 *  displaying "-5" while 12 was stored). */
	value: string;
	placeholder?: string;
	onCommit: (next: string) => void;
	ariaLabel: string;
	testid?: string;
	type?: "text" | "number";
}) {
	// The draft exists only while editing; a blur shows the record's value
	// again — commit-on-blur/Enter (owner ruling), the field honest about
	// what landed.
	const id = useContext(RowControlContext);
	const [draft, setDraft] = useState(value);
	const [editing, setEditing] = useState(false);
	return (
		<input
			id={id}
			type={type}
			value={editing ? draft : value}
			placeholder={placeholder}
			aria-label={ariaLabel}
			data-testid={testid}
			onChange={(e) => {
				setEditing(true);
				setDraft(e.target.value);
			}}
			onBlur={() => {
				if (!editing) return;
				setEditing(false);
				const next = draft.trim();
				if (next !== value) onCommit(next);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
				if (e.key === "Escape") {
					setEditing(false);
					e.currentTarget.blur();
				}
			}}
			className="nb-set-input"
		/>
	);
}

/** A failed load or save: plain words in ink, Show details for the raw
 *  reason and Try again, as text buttons (ui-contract "Errors"). */
export function SettingsFailure({
	message,
	detail,
	onRetry,
	testid,
	retryTestid,
	detailsTestid,
	className,
}: {
	message: string;
	detail?: string;
	onRetry?: () => void;
	testid?: string;
	retryTestid?: string;
	detailsTestid?: string;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div role="alert" data-testid={testid} className={cn("nb-set-failure", className)}>
			<p className="nb-set-failure-line">{message}</p>
			<span className="nb-set-failure-actions">
				{detail && (
					<button type="button" aria-expanded={open} data-testid={detailsTestid} className="nb-set-text-button" onClick={() => setOpen((on) => !on)}>
						{open ? "Hide details" : "Show details"}
					</button>
				)}
				{onRetry && (
					<button type="button" data-testid={retryTestid} className="nb-set-text-button nb-set-text-button-ink" onClick={onRetry}>
						Try again
					</button>
				)}
			</span>
			{open && detail && <p className="nb-set-failure-detail">{detail}</p>}
		</div>
	);
}

/** In-place loading rows, shaped like a group (shelf bars, no pulse under reduced motion); the words stay for readers. */
export function SettingsRowsSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
	return (
		<div role="status" data-testid="settings-skeleton" className="nb-set-skeleton">
			<span className="sr-only">{label}</span>
			<div aria-hidden="true" className="nb-set-rows">
				{Array.from({ length: rows }, (_, row) => (
					<div key={row} className="nb-set-row">
						<Skeleton className="h-4 w-2/5 motion-reduce:animate-none" />
						<Skeleton className="h-8 w-24 motion-reduce:animate-none sm:w-48" />
					</div>
				))}
			</div>
		</div>
	);
}
