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
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

const RowControlContext = createContext<string | undefined>(undefined);

/** A section heading and grouped controls. */
export function SettingsSection({
	title,
	hint,
	children,
	testid,
}: {
	title: string;
	/** One quiet line under the header — only where it earns its place. */
	hint?: string;
	children: React.ReactNode;
	testid?: string;
}) {
	return (
		<section data-testid={testid} className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">

			<h2 className="mb-5 font-title text-xl font-semibold">{title}</h2>
			{hint && <p className="mb-4 text-sm text-muted-foreground">{hint}</p>}
			<FieldGroup className="gap-5">{children}</FieldGroup>
		</section>
	);
}

/** A labeled sub-group inside a section (owner, 2026-09-20: clear
 *  separation — Models / Tools / Prompts read as three blocks). */
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
		<div data-testid={testid} data-settings-row={rowId} className="mt-3 scroll-mt-4 first:mt-0">
			{label && <h3 className="mb-3 font-title text-lg font-medium">{label}</h3>}
			<FieldGroup className="gap-0 rounded-lg bg-card px-4">{children}</FieldGroup>
		</div>
	);
}

/** One label + one control. Label left (with optional muted hint), control
 *  right — the settings row shape. */
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
		<Field orientation="horizontal" data-testid={testid} aria-labelledby={`${id}-label`} data-disabled={dimmed || undefined} data-settings-row={rowId} className="flex scroll-mt-4 flex-col items-stretch gap-3 rounded-md py-4 @lg/field-group:flex-row @lg/field-group:items-center @lg/field-group:has-[>[data-slot=field-content]]:items-center @lg/field-group:justify-between @lg/field-group:gap-6">
			<FieldContent className="min-w-0 flex-1">
				<FieldTitle id={`${id}-label`} className={cn("text-sm font-normal group-data-[disabled=true]/field:opacity-100", dimmed && "text-muted-foreground")}>{label}</FieldTitle>
				{hint && <FieldDescription className="text-sm">{hint}</FieldDescription>}
			</FieldContent>
			<RowControlContext.Provider value={id}>
				<div className="flex w-full min-w-0 flex-wrap items-center gap-2 @lg/field-group:w-64 @lg/field-group:shrink-0 @lg/field-group:justify-end [&>input]:max-w-full [&>select]:max-w-full">{children}</div>
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
			className={cn(
				"h-9 rounded-md border border-input bg-background px-2.5 font-ui text-sm text-foreground pointer-coarse:h-11",
				disabled && "cursor-not-allowed text-muted-foreground",
			)}
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
			className="h-9 w-full rounded-md border border-input bg-background px-3 font-ui text-sm text-foreground placeholder:text-muted-foreground pointer-coarse:h-11"
		/>
	);
}

/** A failed load or save: plain words, Try again, and the raw detail on demand. */
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
		<div role="alert" data-testid={testid} className={cn("flex flex-col gap-1 rounded-md bg-accent px-3 py-2 text-sm", className)}>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<p className="min-w-0 flex-1 basis-48 text-destructive">{message}</p>
				<span className="flex items-center gap-1">
					{detail && (
						<Button type="button" size="sm" variant="ghost" aria-expanded={open} data-testid={detailsTestid} className="pointer-coarse:min-h-11" onClick={() => setOpen((on) => !on)}>
							{open ? "Hide details" : "Show details"}
						</Button>
					)}
					{onRetry && (
						<Button type="button" size="sm" variant="outline" data-testid={retryTestid} className="pointer-coarse:min-h-11" onClick={onRetry}>
							Try again
						</Button>
					)}
				</span>
			</div>
			{open && detail && <p className="break-words font-mono text-xs text-ink-2">{detail}</p>}
		</div>
	);
}

/** In-place loading rows, shaped like a group; the words stay for readers. */
export function SettingsRowsSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
	return (
		<div role="status" data-testid="settings-skeleton" className="flex flex-col gap-3">
			<span className="sr-only">{label}</span>
			<Skeleton aria-hidden="true" className="h-6 w-32 bg-card motion-reduce:animate-none" />
			<div aria-hidden="true" className="flex flex-col gap-5 rounded-lg bg-card p-4">
				{Array.from({ length: rows }, (_, row) => (
					<div key={row} className="flex items-center justify-between gap-6">
						<Skeleton className="h-4 w-2/5 motion-reduce:animate-none" />
						<Skeleton className="h-9 w-24 motion-reduce:animate-none sm:w-48" />
					</div>
				))}
			</div>
		</div>
	);
}
