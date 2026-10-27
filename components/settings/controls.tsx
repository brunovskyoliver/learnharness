"use client";
/**
 * Thin settings primitives (settings-app wave): the control kit the
 * settings dialog needs. Sections → groups → rows; everything SSRs clean
 * (render tests pin the sections' markup).
 *
 * The dependency graying (owner, 2026-09-20) follows the graph viewer's
 * render-panel convention: the WHOLE row dims (opacity-40, label and
 * control together) and the control itself locks — the row owns the dim.
 */

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldTitle } from "@/components/ui/field";

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

			<h2 className="mb-5 text-xl font-semibold">{title}</h2>
			{hint && <p className="mb-4 text-xs text-muted-foreground">{hint}</p>}
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
}: {
	label: string;
	children: React.ReactNode;
	testid?: string;
}) {
	return (
		<div data-testid={testid} className="mt-3 first:mt-0">
			<h3 className="mb-3 text-base font-semibold">{label}</h3>
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
}: {
	label: string;
	hint?: ReactNode;
	children: React.ReactNode;
	testid?: string;
	/** Dependency graying, graph-view style: the whole row dims when the
	 *  control is inert (parent off, no file yet, …). */
	dimmed?: boolean;
}) {
	const id = useId();
	return (
		<Field orientation="horizontal" data-testid={testid} aria-labelledby={`${id}-label`} data-disabled={dimmed || undefined} className={cn("flex flex-col items-stretch gap-3 py-4 @lg/field-group:flex-row @lg/field-group:items-center @lg/field-group:justify-between @lg/field-group:gap-6", dimmed && "opacity-40")}>
			<FieldContent className="min-w-0 flex-1">
				<FieldTitle id={`${id}-label`} className="text-sm font-normal">{label}</FieldTitle>
				{hint && <FieldDescription className="text-sm">{hint}</FieldDescription>}
			</FieldContent>
			<RowControlContext.Provider value={id}>
				<div className="flex min-w-0 flex-wrap items-center gap-2 @lg/field-group:w-64 @lg/field-group:shrink-0 @lg/field-group:justify-end [&>input]:max-w-full [&>select]:max-w-full">{children}</div>
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
				"h-9 rounded-md border border-border bg-background px-2.5 font-ui text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
				disabled && "cursor-not-allowed",
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
			className="h-9 w-full rounded-md border border-border bg-background px-3 font-ui text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
		/>
	);
}
