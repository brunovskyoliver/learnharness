"use client";

/**
 * The faint bottom-right hint (feature 024, ui-contract "Chrome"; owner:
 * the activity view lives here). Idle it shows a shortcut. While Notebook
 * reads or writes it says what is running, its cost and Stop (constitution
 * V: every automatic read is visible, priced and stoppable); a click opens
 * the full list of Notebook runs in a small lifted popover. A refusal (no
 * model, no key) or a failed read says so here, not in a toast.
 */
import { useActivity } from "@/components/activity-dock";
import { CornerHint as PaperCornerHint, costLabel } from "@/components/paper/corner-hint";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { AUTH_PROVIDER_KEYS } from "@/src/core";
import { stopRun } from "./nb-actions";
import { keyLabel, useNotebook, type ReadingStatus } from "./nb-shared";

const PHASE_WORD: Record<"reading" | "writing" | "drawing", string> = { reading: "Reading…", writing: "Writing…", drawing: "Drawing…" };
/** A run's word when only the feed knows it (another note, another kind). */
const KIND_PHASE: Record<string, "reading" | "writing" | "drawing"> = { read: "reading", think: "reading", ask: "reading", reply: "writing", chat: "writing", visualize: "drawing" };
const KIND_ROW: Record<string, string> = { read: "Reading", think: "Thinking", ask: "Thinking", reply: "Replying", visualize: "Drawing", chat: "Chat" };

export { costLabel } from "@/components/paper/corner-hint";

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
	const runs = feed.notebookRuns ?? [];
	const status = nb.reading;

	// What is running: this note's read first (its phase is live), else the newest Notebook run.
	const own = status?.state === "running" ? status : null;
	const other = own ? null : [...runs].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
	const runId = own?.runId ?? other?.id ?? null;
	const phase = own?.phase ?? (other ? KIND_PHASE[other.kind] ?? "reading" : null);
	const cost = runs.find((r) => r.id === runId)?.costUsd ?? null;

	let notice: React.ReactNode = null;
	if (status?.state === "refused") {
		notice = (
			<span data-testid="nb-hint-refused">
				{refusalLine(status)}
				{status.reason === "models" && (
					<>
						{" "}
						<button type="button" className="nb-hint-button nb-hint-link" onClick={() => openSettings("models")}>Open Study’s settings</button>
					</>
				)}
			</span>
		);
	} else if (status?.state === "failed") {
		notice = (
			<span data-testid="nb-hint-failed">
				That didn’t come through.{" "}
				<button type="button" className="nb-hint-button nb-hint-link" onClick={status.retry}>Try again</button>
			</span>
		);
	} else if (nb.plain) {
		// Just my words: say why the notes are gone, while they are.
		notice = <span className="nb-hint-plain" data-testid="nb-hint-plain">Just your words. The notes are hidden, not gone.</span>;
	}

	return (
		<PaperCornerHint
			running={runId && phase ? { word: PHASE_WORD[phase], cost: costLabel(cost), onStop: () => void stopRun(runId) } : null}
			notice={notice}
			state={runId ? "running" : status?.state ?? "idle"}
			idle={`${keyLabel("mod+k", nb.mac)} finds a note`}
			list={<RunRows runs={runs} />}
		/>
	);
}
