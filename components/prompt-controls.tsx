"use client";

import type { ComponentProps, ReactNode } from "react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { InputGroupAddon } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/** Shared bottom row for chat, new sessions, and learner answers. */
export function PromptToolbar({ controls, children }: { controls?: ReactNode; children: ReactNode }) {
	return (
		<InputGroupAddon align="block-end" className="prompt-toolbar">
			<div data-prompt-controls="" className="min-w-0 flex-1">{controls}</div>
			{children}
		</InputGroupAddon>
	);
}

export function PromptSubmit({
	label = "Send",
	stopping = false,
	className,
	...props
}: Omit<ComponentProps<"button">, "children"> & { label?: string; stopping?: boolean }) {
	return (
		<button
			type="submit"
			aria-label={label}
			title={label}
			data-stopping={stopping || undefined}
			className={cn("prompt-submit min-h-11 min-w-11", className)}
			{...props}
		>
			{stopping ? <SquareIcon aria-hidden="true" className="size-3" /> : <ArrowUpIcon aria-hidden="true" className="size-4" />}
			<span className="sr-only">{label}</span>
		</button>
	);
}
