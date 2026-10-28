"use client";

import { Check, ChevronRight } from "lucide-react";
import { SessionDetails } from "@/components/session-state";
import type { ArtifactPartProps, LhViewPart, MathCheckDetails } from "@/src/core";

/**
 * The math check row (feature 007): a quiet, collapsed one-liner in the
 * tool-card register — the verdict in words — expandable to the checked
 * expressions, any counterexample and Wolfram's reply. What the learner
 * may see is decided in the view (part.mathCheck): a check for a question
 * not yet answered renders nothing; a grading check during an active
 * problem shows its verdict but not the expressions (they contain the
 * committed answer). Only an agreed check says "Checked with Wolfram".
 */

const OUTCOMES = new Set(["agreed", "disagreed", "undecided"]);

function detailsOf(output: unknown): MathCheckDetails | null {
	const d = output as MathCheckDetails | null | undefined;
	return d && typeof d === "object" && OUTCOMES.has(d.outcome) ? d : null;
}

function expressionOf(input: unknown): { lhs: string; rhs: string; assumptions?: string } | null {
	const i = (input ?? {}) as Record<string, unknown>;
	if (typeof i.lhs !== "string" || typeof i.rhs !== "string") return null;
	return { lhs: i.lhs, rhs: i.rhs, assumptions: typeof i.assumptions === "string" && i.assumptions.trim() ? i.assumptions : undefined };
}

function headline(failed: boolean, d: MathCheckDetails | null): string {
	if (failed) return "Wolfram check failed";
	if (!d) return "Wolfram check not finished";
	if (d.outcome === "agreed") return "Checked with Wolfram · equal";
	if (d.outcome === "disagreed") return "Wolfram · not equal";
	return "Wolfram · couldn't decide";
}

function Row({ label, children, mono = true }: { label: string; children: React.ReactNode; mono?: boolean }) {
	return (
		<div>
			<div className="mb-1 font-medium text-muted-foreground">{label}</div>
			<div className={mono ? "whitespace-pre-wrap break-all font-mono text-xs leading-relaxed" : ""}>{children}</div>
		</div>
	);
}

/** A math check that failed for a reason the learner should see (Wolfram
 *  unavailable, unreadable expressions): its own row, not the generic
 *  "Retrying…" line — nothing retries it. Invalid input (and the per-turn
 *  limit) is the model's to fix and keeps the retry line. */
export function isShownMathCheckFailure(part: { type: string; state?: string; errorText?: unknown }): boolean {
	return part.type === "tool-math_check" && part.state === "output-error" && !String(part.errorText ?? "").startsWith("Invalid tool input");
}

/** The reveal label on answered questions and concluded problems. */
export function WolframCheckedLabel() {
	return (
		<p data-testid="wolfram-checked" className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
			<Check className="size-3.5 shrink-0" aria-hidden="true" />
			Checked with Wolfram
		</p>
	);
}

export function MathCheckCard({ part }: ArtifactPartProps) {
	const p = part as LhViewPart;
	const visibility = p.mathCheck ?? { hidden: false, expressionsHidden: false };
	if (visibility.hidden) return null;
	const failed = p.state === "output-error";
	const d = failed ? null : detailsOf(p.output);
	const expr = expressionOf(p.input);
	const agreed = d?.outcome === "agreed";
	return (
		<SessionDetails stateKey={`tool/${p.toolCallId}`}
			data-testid="math-check-card"
			data-outcome={failed ? "failed" : d?.outcome ?? "unfinished"}
			className="group my-1 w-full max-w-2xl select-none"
		>
			<summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
				{agreed && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
				<span className={`font-medium ${failed ? "text-destructive" : ""}`}>{headline(failed, d)}</span>
				<ChevronRight className="size-3 shrink-0 opacity-50 transition-transform group-open:rotate-90" aria-hidden="true" />
			</summary>
			<div className="mt-2 space-y-2 rounded-xl border bg-card p-3 text-sm">
				{visibility.expressionsHidden ? (
					<p className="text-muted-foreground">Expressions shown after the problem is concluded.</p>
				) : (
					expr && (
						<>
							<Row label="Checked">{`${expr.lhs} = ${expr.rhs}`}</Row>
							{expr.assumptions && <Row label="Assuming">{expr.assumptions}</Row>}
						</>
					)
				)}
				{!visibility.expressionsHidden && d?.counterexample && <Row label="Counterexample">{d.counterexample}</Row>}
				{!visibility.expressionsHidden && d?.reduced && <Row label="Reduced to">{d.reduced}</Row>}
				{d?.reason && <Row label="Reason" mono={false}>{d.reason}</Row>}
				{failed && typeof p.errorText === "string" && (
					<Row label="Error">
						<span className="text-destructive">{p.errorText}</span>
					</Row>
				)}
				{!visibility.expressionsHidden && d?.raw && (
					<Row label="Wolfram's reply">
						<span className="block max-h-64 overflow-auto">{d.raw}</span>
					</Row>
				)}
				{d && typeof d.ms === "number" && <p className="text-muted-foreground">Took {(d.ms / 1000).toFixed(1)} s</p>}
			</div>
		</SessionDetails>
	);
}
