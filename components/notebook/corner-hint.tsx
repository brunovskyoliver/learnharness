"use client";

/**
 * The faint bottom-right hint (feature 024, ui-contract "Chrome"; owner:
 * the activity view lives here). Idle it shows a shortcut. While Notebook
 * reads or writes it says what is running, its cost and Stop (constitution
 * V: every automatic read is visible, priced and stoppable); a click opens
 * the full list of Notebook runs in a small lifted popover. A refusal (no
 * model, no key) or a failed read says so here, not in a toast.
 */
import { Popover } from "radix-ui";
import { useState } from "react";
import { useActivity } from "@/components/activity-dock";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { formatUsd } from "@/components/usage-format";
import { AUTH_PROVIDER_KEYS } from "@/src/core";
import { stopRun } from "./nb-actions";
import { keyLabel, useNotebook, type ReadingStatus } from "./nb-shared";

const PHASE_WORD: Record<"reading" | "writing" | "drawing", string> = { reading: "Reading…", writing: "Writing…", drawing: "Drawing…" };
/** A run's word when only the feed knows it (another note, another kind). */
const KIND_PHASE: Record<string, "reading" | "writing" | "drawing"> = { read: "reading", think: "reading", ask: "reading", reply: "writing", chat: "writing", visualize: "drawing" };
const KIND_ROW: Record<string, string> = { read: "Reading", think: "Thinking", ask: "Thinking", reply: "Replying", visualize: "Drawing", chat: "Chat" };

export const costLabel = (cost: number | null | undefined): string => (cost === null || cost === undefined ? "cost not known" : formatUsd(cost));

export function refusalLine(status: Extract<NonNullable<ReadingStatus>, { state: "refused" }>): string {
	if (status.reason === "models") return "No model set up.";
	const label = AUTH_PROVIDER_KEYS.find((p) => p.id === status.provider)?.label ?? status.provider ?? "provider";
	return `Your ${label} key is missing`;
}

type FeedRun = NonNullable<ReturnType<typeof useActivity>["feed"]["notebookRuns"]>[number];

function RunRows({ runs }: { runs: readonly FeedRun[] }) {
	if (runs.length === 0) return <p className="nb-activity-empty" data-testid="nb-activity-empty">Nothing running.</p>;
	return (
		<ul className="nb-activity-list">
			{runs.map((run) => (
				<li key={run.id} className="nb-activity-row" data-testid="nb-activity-row">
					<span>{`${KIND_ROW[run.kind] ?? "Running"} · ${run.pageName} · ${costLabel(run.costUsd)}`}</span>
					<span aria-hidden="true"> · </span>
					<button type="button" className="nb-hint-button" onClick={() => void stopRun(run.id)} aria-label={`Stop: ${KIND_ROW[run.kind] ?? "Running"} · ${run.pageName}`}>Stop</button>
				</li>
			))}
		</ul>
	);
}

export function CornerHint() {
	const nb = useNotebook();
	const { feed } = useActivity();
	const { open: openSettings } = useSettingsDialog();
	const [listOpen, setListOpen] = useState(false);
	const runs = feed.notebookRuns ?? [];
	const status = nb.reading;

	// What is running: this note's read first (its phase is live), else the newest Notebook run.
	const own = status?.state === "running" ? status : null;
	const other = own ? null : [...runs].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
	const runId = own?.runId ?? other?.id ?? null;
	const phase = own?.phase ?? (other ? KIND_PHASE[other.kind] ?? "reading" : null);
	const cost = runs.find((r) => r.id === runId)?.costUsd ?? null;

	let body: React.ReactNode;
	if (runId && phase) {
		body = (
			<span className="nb-hint-running" data-testid="nb-hint-running">
				<Popover.Trigger asChild>
					<button type="button" className="nb-hint-button" data-testid="nb-hint-activity" aria-haspopup="dialog">
						<span>{PHASE_WORD[phase]}</span>
						<span aria-hidden="true"> · </span>
						<span data-testid="nb-hint-cost">{costLabel(cost)}</span>
					</button>
				</Popover.Trigger>
				<span aria-hidden="true"> · </span>
				<button type="button" className="nb-hint-button" data-testid="nb-hint-stop" onClick={() => void stopRun(runId)}>Stop</button>
			</span>
		);
	} else if (status?.state === "refused") {
		body = (
			<span data-testid="nb-hint-refused">
				{refusalLine(status)}
				{status.reason === "models" && (
					<>
						{" "}
						<button type="button" className="nb-hint-button nb-hint-link" onClick={() => openSettings("models")}>Open Study&apos;s settings</button>
					</>
				)}
			</span>
		);
	} else if (status?.state === "failed") {
		body = (
			<span data-testid="nb-hint-failed">
				That didn&apos;t come through.{" "}
				<button type="button" className="nb-hint-button nb-hint-link" onClick={status.retry}>Try again</button>
			</span>
		);
	} else if (nb.plain) {
		// Just my words: say why the notes are gone, while they are.
		body = <span className="nb-hint-plain" data-testid="nb-hint-plain">Just your words. The notes are hidden, not gone.</span>;
	} else {
		body = <span className="nb-hint-idle">{`${keyLabel("mod+k", nb.mac)} finds a note`}</span>;
	}

	return (
		<Popover.Root open={listOpen} onOpenChange={setListOpen}>
			<Popover.Anchor asChild>
				<div className="nb-corner-hint" data-testid="nb-corner-hint" data-state={runId ? "running" : status?.state ?? "idle"}>{body}</div>
			</Popover.Anchor>
			<Popover.Portal container={nb.root ?? undefined}>
				<Popover.Content className="nb-activity" side="top" align="end" sideOffset={8} data-testid="nb-activity">
					<RunRows runs={runs} />
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}
