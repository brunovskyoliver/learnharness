"use client";

import type { ComponentProps, ReactNode } from "react";
import { ArrowUpIcon } from "lucide-react";
import { InputGroupAddon } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/** Shared bottom row for chat, new sessions, and learner answers. A setup
 *  action (no key, no models) takes the controls' place. */
export function PromptToolbar({ controls, setup, children }: { controls?: ReactNode; setup?: ReactNode; children: ReactNode }) {
	return (
		<InputGroupAddon align="block-end" className="prompt-toolbar">
			<div data-prompt-controls="" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{setup ?? controls}</div>
			{children}
		</InputGroupAddon>
	);
}

/** The plain-chat send: the one round control. Every other primary action
 *  is a labelled PrimaryAction. */
export function PromptSubmit({
	label = "Send",
	className,
	...props
}: Omit<ComponentProps<"button">, "children"> & { label?: string }) {
	return (
		<button
			type="submit"
			aria-label={label}
			title={label}
			className={cn("prompt-submit", className)}
			{...props}
		>
			<ArrowUpIcon aria-hidden="true" className="size-4" />
			<span className="sr-only">{label}</span>
		</button>
	);
}

/** The labelled primary action: Submit answer, Next problem, Stop. Quiet
 *  renders on the raised surface (Stop), never in the accent. */
export function PrimaryAction({
	quiet = false,
	className,
	children,
	type = "submit",
	...props
}: ComponentProps<"button"> & { quiet?: boolean }) {
	return (
		<button type={type} data-quiet={quiet || undefined} className={cn("prompt-primary", className)} {...props}>
			{children}
		</button>
	);
}

/** Zone 1: whose turn it is and what kind. Collapsed, the strip is the
 *  whole bar (the caller supplies the teaser and the action). */
export function TurnStrip({ kind, children, className }: { kind?: string; children?: ReactNode; className?: string }) {
	return (
		<div data-testid="turn-strip" className={cn("turn-strip", className)}>
			<span className="turn-label">Your turn</span>
			{kind && <span className="turn-kind">{kind}</span>}
			{children}
		</div>
	);
}

/** Zone 3: the inset answer field with its visible label. The focus ring
 *  surrounds this well only. */
export function AnswerWell({ label, htmlFor, children }: { label?: string; htmlFor?: string; children: ReactNode }) {
	return (
		<div data-testid="answer-well" className="answer-well">
			{label && <label htmlFor={htmlFor} className="answer-well-label">{label}</label>}
			{children}
		</div>
	);
}
