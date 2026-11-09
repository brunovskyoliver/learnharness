"use client";

/**
 * The faint bottom-right hint both modes share (feature 024 ui-contract
 * "Chrome", feature 025 R13): idle it shows a shortcut; while something
 * runs it says what, its cost and Stop (constitution V: every automatic run
 * is visible, priced and stoppable); a click on the running line opens the
 * full list in a small lifted popover. A mode may put its own line in place
 * of the idle one (a refusal, a failed read, Just my words).
 *
 * The popover (Radix Popover) loads on the first click of the running line
 * and stays mounted after, so the hint costs no startup JS (feature 025, T065).
 */
import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { formatUsd } from "@/components/usage-format";
import { useSurfaceRoot } from "./surface-root";

const CornerHintPopover = lazy(() => import("./corner-hint-popover").then((m) => ({ default: m.CornerHintPopover })));

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
	const [armed, setArmed] = useState(false);
	const anchor = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	let body: ReactNode;
	if (running) {
		body = (
			<span className="nb-hint-running" data-testid="nb-hint-running">
				<button
					ref={trigger}
					type="button"
					className="nb-hint-button"
					data-testid="nb-hint-activity"
					aria-haspopup="dialog"
					aria-expanded={listOpen}
					onClick={() => { setArmed(true); setListOpen((open) => !open); }}
				>
					<span>{running.word}</span>
					<span aria-hidden="true"> · </span>
					<span data-testid="nb-hint-cost">{running.cost}</span>
				</button>
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
		<>
			<div ref={anchor} className="nb-corner-hint" data-testid="nb-corner-hint" data-state={state}>{body}</div>
			{armed && (
				<Suspense fallback={null}>
					<CornerHintPopover anchor={anchor} trigger={trigger} open={listOpen} onOpenChange={setListOpen} container={container}>
						{list}
					</CornerHintPopover>
				</Suspense>
			)}
		</>
	);
}
