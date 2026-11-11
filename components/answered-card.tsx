"use client";

import { SessionDetails, useSessionState } from "@/components/session-state";
import { teaserText } from "@/components/question-dock";

import { useState } from "react";
import { useArrival, wasPosedCheck } from "@/components/paper/motion-arrival";
import { ChevronDownIcon, ChevronRight } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { ConfidenceRail } from "@/components/confidence-rail";
import { GlyphMark } from "@/components/ui/glyph-mark";
import { ThinkingBlock } from "@/components/thinking-block";
import { cn } from "@/lib/utils";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { WolframCheckedLabel } from "@/components/artifacts/math-check-card";
import { ReferencesCard } from "@/components/library/references-card";
import { copySource, ReferenceText } from "@/components/reference-text";
import type { LibraryReference, QuestionAnswerData } from "@/src/core";
import { answerForPresentation, parseAskInput, parseQuizInput } from "@/src/core";

/**
 * Static rendering of an answered question (tool part in `output-available`).
 *
 * Quiz answers are GRADED: ✓/✗ marks, the correct answers, and the
 * explanation. Ask answers are NOT graded — a plain record of what was said.
 * (The v1 bug this pins: ask answers must never get quiz grading UI.)
 * Explain answers are graded by the MODEL in its next reply, not by the
 * client — the card reveals his answer, the committed correct answer, and
 * the explanation, with NO verdict chips (owner ruling 2026-09-27).
 */
const NO_REFERENCES: LibraryReference[] = [];

/**
 * Feature 028, row 18: a pencil stroke under a correct grade. It draws once,
 * when the grade arrives for a check posed in this page load (the learner
 * just answered it); settled history shows it finished.
 */
function GradePencil({ toolCallId }: { toolCallId: string }) {
	const { arriving } = useArrival(`grade:${toolCallId}`, wasPosedCheck(toolCallId));
	return (
		<svg className="lh-grade-pencil" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" data-testid="grade-pencil" data-drawing={arriving ? "" : undefined}>
			<path d="M1 4 C 28 2.4, 62 5.2, 99 3.2" pathLength={1} vectorEffect="non-scaling-stroke" className={cn("nb-pencil-stroke", !arriving && "lh-pencil-still")} strokeWidth={1.3} />
		</svg>
	);
}

export function AnsweredCard({ answer: savedAnswer, input, checked = false, chipScope = "", toolCallId = "" }: { answer: QuestionAnswerData; input?: unknown; checked?: boolean; /** Focus keys for its chips (feature 027). */ chipScope?: string; /** Its question's call, for the grade's one pencil stroke (feature 028). */ toolCallId?: string }) {
	const answer = answerForPresentation(savedAnswer, input);
	const references = (savedAnswer as { references?: LibraryReference[] }).references ?? NO_REFERENCES;
	const [whyOpen, setWhyOpen] = useSessionState("why", false); // the tucked explanation (predictions, owner 2026-10-03)
	const kindLabel = answer.tool === "probe"
		? "Question"
		: answer.tool === "recall"
			? "Recall"
			: answer.kind === "quiz"
				? answer.questionType === "predict" ? "Prediction" : "Check"
				: answer.kind === "explain" ? "Explain" : "Question";
	if (answer.dismissed) {
		// A skipped question is one quiet line: nothing to unfold (owner, 2026-11-11).
		return (
			<div className="lh-reading lh-quiet-line my-1" data-testid="answered-card" data-dismissed="" data-check-anchor-id={toolCallId || undefined}>
				<span className="font-medium">{kindLabel}</span>
				<span className="min-w-0 truncate">{teaserText(answer.questionText)} — skipped</span>
			</div>
		);
	}

	const isQuiz = answer.kind === "quiz";
	const isExplain = answer.kind === "explain";
	const selectedIdx = new Set(answer.answers.map((a) => a.index));
	const correctIdx = new Set(answer.correctIndices ?? []);
	// The question's own context rides the ORIGINAL CALL, not the answer
	// snapshot (owner, 2026-10-12): the details line — and, for ask
	// questions, option descriptions — re-render from the persisted
	// arguments, so every existing transcript shows them too. The lean
	// snapshot (what the model sees, compactAnswerForModel) is untouched;
	// any parse failure or absent input renders exactly the older card.
	const askInput = answer.kind === "ask" ? parseAskInput(input) : undefined;
	const parsedDetails = askInput?.details ?? (answer.kind === "quiz" ? parseQuizInput(input)?.details : undefined);
	const descByIndex = new Map((askInput?.options ?? []).map((o, i) => [i + 1, o.description]));

	return (
		<SessionDetails stateKey={`answered/${toolCallId}`} className="group lh-reading my-1" data-testid="answered-card" data-check-anchor-id={toolCallId || undefined}>
			{/* Answered questions fold into one quiet row (owner, 2026-11-11):
			    kind, the verdict for graded checks, the question and his answer;
			    the full record opens on the shelf panel below. */}
			<summary className="lh-quiet-summary" data-testid="answered-summary">
				<span className="shrink-0 font-medium">{kindLabel}</span>
				{isQuiz && <Verdict answer={answer} toolCallId={toolCallId} />}
				<span className="min-w-0 truncate">
					<ToolContentResponse className="lh-row-inline">{leadIn(answer.questionText)}</ToolContentResponse>
					{summaryAnswer(answer) && <span className="text-graphite"> — <ToolContentResponse className="lh-row-inline">{summaryAnswer(answer)}</ToolContentResponse></span>}
				</span>
				<ChevronRight className="lh-quiet-chevron" aria-hidden="true" />
			</summary>
			<div className="lh-quiet-panel">
		{/* The reading channel (owner round, 2026-10-05): thoughts captured
		    while reading come before the question, so they lead the record. */}
		{answer.readingThinking && (
			<ThinkingBlock testId="reading-thinking-block" label="Your thinking" text={answer.readingThinking} defaultOpen />
		)}
		{/* [&>*:last-child]:mb-0 (owner round, 2026-10-07): on ask cards the
		    thinking row is the last child — its my-3 stacked with the card's
		    p-4 into a 28px void below (12px above); the card's own padding is
		    the bottom rhythm when a row ends the card. */}
		<div className="text-ink [&>*:last-child]:mb-0" data-testid="answered-record">
			<div className="mb-3 font-medium">
				<ToolContentResponse>{answer.questionText}</ToolContentResponse>
			</div>
			{parsedDetails && (
				// The details line, same paint as the pending dock (owner,
				// 2026-10-12): full markdown, LaTeX included.
				<div className="mb-3 text-sm text-faint">
					<ToolContentResponse>{parsedDetails}</ToolContentResponse>
				</div>
			)}

			{((answer.options?.length ?? 0) > 0 || answer.other) && (
				<div className="flex flex-col gap-1.5 text-sm">
					{answer.options?.map((opt) => {
						const sel = selectedIdx.has(opt.index);
						const key = isQuiz && correctIdx.has(opt.index);
						return (
							<div
								key={opt.index}
								className={cn(
									"flex items-center gap-2 rounded-lg border px-3 py-1.5",
									sel && key && "border-green/60 bg-green/10",
									// The wrong pick is marked, not shouted: the KEY below carries
									// the weight (polish pass 2026-10-26).
									sel && !key && isQuiz && "border-red/40",
									sel && !isQuiz && "border-ink bg-shelf",
									!sel && key && "border-green/60",
								)}
							>
								{isQuiz && (
									// Zapf-Dingbats-derived SVG outlines — the exact LaTeX \ding{51}/
									// \ding{55} hand-drawn shapes (owner, round 6); see ui/glyph-mark.
									<span
										aria-hidden
										data-mark={sel && key ? "check" : sel && !key ? "x" : !sel && key ? "check" : undefined}
										className={cn(
											// Fixed gutter (polish pass 2026-10-26): every row reserves the
											// mark's width, so option text aligns whether or not a mark shows.
											"flex w-3.5 shrink-0 items-center",
											sel && key && "text-green",
											sel && !key && "text-red",
											!sel && key && "text-green",
										)}
									>
										{/* Owner round 8: a touch smaller than the text (size-4→size-3.5,
											   ≈14px vs the 16px row) while centered. */}
										{(key || sel) && <GlyphMark kind={key ? "check" : "x"} className="lh-mark-in size-3.5" />}
									</span>
								)}
								<span className={cn(!sel && !key && "text-faint")}>
									<ToolContentResponse>{opt.label}</ToolContentResponse>
									{descByIndex.get(opt.index) && (
										// Ask-option subtext (owner, 2026-10-12): same markdown path
										// as the pending dock — LaTeX included. Quiz options carry
										// none (owner ruling 2026-09-26); the map stays empty for them.
										<ToolContentResponse className="lh-prose block text-sm text-faint">
											{descByIndex.get(opt.index)}
										</ToolContentResponse>
									)}
								</span>
							</div>
						);
					})}
					{/* The learner's own typed option is an OPTION — same container,
					    same selected styling as its siblings, not a loose quote
					    floating outside the list. Quotes keep the learner's words. */}
					{answer.other && (
						<div
							data-testid="answered-other"
							className="flex items-center gap-2 rounded-lg border border-ink bg-shelf px-3 py-1.5"
						>
							<span>“{answer.other}”</span>
						</div>
					)}
				</div>
			)}

			{answer.text && <div className="lh-prose mt-2 whitespace-pre-wrap" onCopy={copySource}>“<ReferenceText text={answer.text} references={references} messageId={chipScope} />”</div>}

			{/* The confidence record (owner round 6): the slider's rail, disc
			    removed — the missing handle itself says "this is a record, not a
			    control". Same paint, same ticks, same ramp, same % read-out as the
			    live dock. Quiz answers only, and only when a confidence exists:
			    "I don't know" sent none (its slider was grayed out), explain and
			    ask never had one, and records from before the feature carry no
			    field — nothing to show, nothing rendered. */}
			{isQuiz && answer.confidence != null && (
				<div className="mt-3 flex items-center gap-3" data-testid="answered-confidence">
					{/* Labeled like the dock (polish pass 2026-10-26): unlabeled, the
					    rail + % read as a progress meter. */}
					<span className="shrink-0 text-sm font-medium text-faint">Confidence</span>
					<ConfidenceRail value={answer.confidence} className="min-w-0 flex-1" />
					<span className="w-9 shrink-0 text-right font-mono text-sm tabular-nums text-faint">
						{answer.confidence}%
					</span>
				</div>
			)}
			{answer.dontKnow && isQuiz && (
				<div className="mt-2 text-sm text-faint">Answered “I don't know”.</div>
			)}

			{(answer.thinking ?? answer.note) && (
				/* The SAME unified row (owner round, 2026-10-05): the quiz answer's
				    thinking is the identical collapsible ThinkingBlock — one
				    geometry, but NO band on the card (owner round five, 2026-10-07:
				    the accent lift read too light); rail only, heights identical. */
				<ThinkingBlock
					testId="your-thinking"
					label="Your thinking"
					text={answer.thinking ?? answer.note ?? ""}
					inCard
				/>
			)}

			{/* px-3→removed: card p-4 + box px-3 double-inset sat the "Why" label deeper
			    than the option box edges (owner, round 3). Sides flush with everything
			    else; py-2 stays for vertical air. */}
			{isQuiz && answer.explanation && (
				/* The TUCKED explanation — ALL questions (owner, 2026-10-07): the
				   verdict shows, the explanation sits collapsed behind the Why
				   toggle — viewable, never center stage. Identical to the
				   prediction pattern it generalizes (owner, 2026-10-03). */
				<div className="mt-2" data-testid="tucked-explanation">
					{/* A disclosure row in the THINKING register (polish pass
					    2026-10-26): chevron + small caps, not a stray caption. */}
					<button
						type="button"
						aria-expanded={whyOpen}
						onClick={(e) => {
							setWhyOpen((v) => !v);
							blurAfterPointerClick(e);
						}}
						className="flex items-center gap-2 py-1 font-sans text-sm font-medium text-faint transition-colors hover:text-ink"
					>
						Why
						<ChevronDownIcon className={cn("size-4 shrink-0 transition-transform", whyOpen ? "rotate-180" : "rotate-0")} />
					</button>
					{whyOpen && (
						<div className="mt-1 rounded-lg py-1 text-sm text-faint">
							{/* Keep the first paragraph beside the label, not every paragraph:
							   later paragraphs must retain their recovered document structure. */}
							<ToolContentResponse className="inline [&>p:first-child]:inline [&>p:first-child]:m-0">{answer.explanation}</ToolContentResponse>
						</div>
					)}
				</div>
			)}

			{/* The explain reveal (owner ruling 2026-09-27): the committed answer
			    — one field, reasoning included — shown on submit; no verdict,
			    the model's next reply IS the grading. */}
			{isExplain && answer.committed && (
				<div className="mt-3 rounded-lg bg-shelf py-2 text-sm text-faint">
					<span className="font-medium text-ink">The answer: </span>
					<ToolContentResponse className="inline [&>p:first-child]:inline [&>p:first-child]:m-0">{answer.committed}</ToolContentResponse>
				</div>
			)}
			{/* Feature 009: what his answer attached. The server wrote this field. */}
			<ReferencesCard references={references} messageId={chipScope} />
			{/* Feature 007: the answer was checked with Wolfram before it was posed. */}
			{checked && <WolframCheckedLabel />}
		</div>
			</div>
		</SessionDetails>
	);
}

/** The graded verdict in the folded row: the colour carries it, the word says it. */
function Verdict({ answer, toolCallId }: { answer: ReturnType<typeof answerForPresentation>; toolCallId: string }) {
	if (answer.dontKnow) return <span className="shrink-0">didn't know</span>;
	if (answer.correct) return <span className="relative shrink-0 text-green" data-testid="answered-verdict">correct<GradePencil toolCallId={toolCallId} /></span>;
	return <span className="shrink-0 text-red" data-testid="answered-verdict">incorrect</span>;
}

/** The question's words before its first display equation or paragraph
 *  break: the folded row is one line, and a display equation is not. */
function leadIn(question: string): string {
	const cut = question.search(/\$\$|\\\[|\n\s*\n/);
	return cut > 0 ? `${question.slice(0, cut).trim()} …` : question;
}

/** His answer, flattened to one line for the folded row. */
function summaryAnswer(answer: ReturnType<typeof answerForPresentation>): string {
	if (answer.dontKnow) return "";
	const picked = (answer.options ?? []).filter((o) => answer.answers.some((a) => a.index === o.index)).map((o) => leadIn(o.label));
	if (answer.other) picked.push(`“${teaserText(answer.other)}”`);
	if (picked.length) return picked.join(", ");
	return answer.text ? `“${teaserText(answer.text)}”` : "";
}
