"use client";

/**
 * The faint bottom-right hint both modes share (feature 024 ui-contract
 * "Chrome", feature 025 R13): idle it shows a shortcut; while something
 * runs it says what, its cost and Stop (constitution V: every automatic run
 * is visible, priced and stoppable); a click on the running line opens the
 * full list in a small lifted popover. A mode may put its own line in place
 * of the idle one (a refusal, a failed read, Just my words).
 */
import { Popover } from "radix-ui";
import { useState, type ReactNode } from "react";
import { formatUsd } from "@/components/usage-format";
import { useSurfaceRoot } from "./surface-root";

export const costLabel = (cost: number | null | undefined): string => (cost === null || cost === undefined ? "cost not known" : formatUsd(cost));

export interface CornerHintRunning {
	/** What runs ("Reading…", "Researcher", "3 running"). */
	word: string;
	/** Its cost, already worded ("$0.01", "cost not known"). */
	cost: string;
	/** Stops it; absent when the line covers several runs (each row in the list has its own Stop). */
	onStop?: () => void;
	stopLabel?: string;
}

export function CornerHint({ running, notice, state, idle, list }: {
	running: CornerHintRunning | null;
	/** A mode's own line in place of the idle one. */
	notice?: ReactNode;
	/** data-state: "running", the notice's name, or "idle". */
	state: string;
	idle: string;
	/** The popover's contents: every run, each with its Stop. */
	list: ReactNode;
}) {
	const container = useSurfaceRoot();
	const [listOpen, setListOpen] = useState(false);
	let body: ReactNode;
	if (running) {
		body = (
			<span className="nb-hint-running" data-testid="nb-hint-running">
				<Popover.Trigger asChild>
					<button type="button" className="nb-hint-button" data-testid="nb-hint-activity" aria-haspopup="dialog">
						<span>{running.word}</span>
						<span aria-hidden="true"> · </span>
						<span data-testid="nb-hint-cost">{running.cost}</span>
					</button>
				</Popover.Trigger>
				{running.onStop && (
					<>
						<span aria-hidden="true"> · </span>
						<button type="button" className="nb-hint-button" data-testid="nb-hint-stop" aria-label={running.stopLabel} onClick={running.onStop}>Stop</button>
					</>
				)}
			</span>
		);
	} else {
		body = notice ?? <span className="nb-hint-idle">{idle}</span>;
	}
	return (
		<Popover.Root open={listOpen} onOpenChange={setListOpen}>
			<Popover.Anchor asChild>
				<div className="nb-corner-hint" data-testid="nb-corner-hint" data-state={state}>{body}</div>
			</Popover.Anchor>
			<Popover.Portal container={container}>
				<Popover.Content className="nb-activity" side="top" align="end" sideOffset={8} data-testid="nb-activity">
					{list}
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
