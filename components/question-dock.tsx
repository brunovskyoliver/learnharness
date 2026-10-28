"use client";

import { useSessionState } from "@/components/session-state";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Teaser, teaserPlain } from "@/components/teaser";
import { AnswerWell, PrimaryAction, PromptToolbar, TurnStrip } from "@/components/prompt-controls";
import { useEnterSubmits } from "@/components/enter-submits";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import { focusSurfaceInput } from "@/components/input-surface";
import {
	buildAnswer,
	normalizeQuizType,
	CONFIDENCE_LABELS,
	CONFIDENCE_STOPS,
	DEFAULT_CONFIDENCE_INDEX,
	emptyDockSelection,
	normalizeOptions,
	resolveCorrect,
	seededRandom,
	shuffleOptions,
	toolQuestionKind,
	parseAskInput,
	parseQuizInput,
	parseExplainInput,
	repairMathForDisplay,
	questionKindLabel,
	toggleOption,
	toggleOther,
	type AnswerRequest,
	type AskToolInput,
	type DockSelection,
	type ExplainToolInput,
	type QuestionAnswerData,
	type QuestionFormDraft,
	type QuestionData,
	type QuestionMode,
	type QuizToolInput,
	type SelectMode,
	type Phase3,
} from "@/src/core";

/** One mounted answer form. Folding hides only question details and choices;
 * selections, confidence, and the learner's draft keep their owners. */

export interface QuestionDockProps {
	toolName: "quiz" | "probe" | "ask_user_question" | "explain" | "recall";
	toolCallId: string;
	input: QuizToolInput | AskToolInput | ExplainToolInput;
	/** Collapse state, owned by the DockOverlay (it drives the shell's height morph). */
	expanded: boolean;
	outgoingHeight?: number;
	/**
	 * Teach-phase check awaiting its reveal (vision §2, W5): while collapsed,
	 * the bar is the "Check your understanding" invitation instead of the
	 * scroll-collapse strip. Owned by the DockOverlay; false once the learner
	 * has revealed (afterwards the normal collapse machine rules apply).
	 */
	reveal?: boolean;
	onExpand: () => void;
	/** The turn strip's collapse control (owned by the DockOverlay). */
	onCollapse?: () => void;
	onSubmit: (output: QuestionAnswerData) => void;
	/** Restore only this call's unconfirmed submission after recovery. */
	initialDraft?: QuestionFormDraft;
	onSaveDraft?: (draft: QuestionFormDraft) => void;
	/** The keyboard machine (wave B) is armed only while the dock is
	 *  expanded — the collapsed bar keeps its native Enter-to-expand. */
	active?: boolean;
	/** Session phase at the question. Input height follows its content. */
	phase?: Phase3;
	/** Compaction is running for this chat (owner round 14): the answer
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so in the hint row. The server registry is the real gate;
	 *  this is the affordance. */
	compactionRunning?: boolean;
	controls?: ReactNode;
}

export function QuestionDock({
	toolName,
	toolCallId,
	input,
	expanded,
	outgoingHeight,
	reveal = false,
	onExpand,
	onCollapse,
	onSubmit,
	initialDraft,
	onSaveDraft,
	phase = "probe",
	compactionRunning = false,
	controls,
}: QuestionDockProps) {
	// The probe-phase names (owner, 2026-10-09) canonicalize onto their
	// teach twins for every dock concern — parse dispatch, labels, kinds:
	// the probe quiz ("probe") is quiz-shaped, the probe free-recall
	// ("recall") is explain-shaped. Old records keep the teach names.
	const canonical =
		toolName === "probe" ? "quiz" : toolName === "recall" ? "explain" : toolName;
	// Parse, don't cast (src/core/tool-parts.ts): the model authored this
	// input, and only the schema the tool declared vouches for its shape.
	// The dock mounts on input-available parts (already validated at the
	// bridge), so this is pure defense in depth — but it is STRUCTURAL now:
	// anything that slips through renders the quiet fallback, never a
	// crash on `.map` over model-authored bytes.
	const parsed =
		canonical === "quiz" ? parseQuizInput(input) : canonical === "explain" ? parseExplainInput(input) : parseAskInput(input);
	if (!parsed) {
		return (
			<div data-testid="malformed-question" className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
				This question arrived malformed — the transcript keeps the retry.
			</div>
		);
	}
	return (
		<div className="relative flex min-h-0 flex-col">
			{!expanded && (
				<QuestionDockBar
					toolName={canonical}
					question={parsed.question}
					onExpand={onExpand}
					variant={reveal ? "reveal" : "collapsed"}
					label={questionKindLabel(toolName, (parsed as { type?: unknown }).type)}
				/>
			)}
			<QuestionDockForm
				toolName={toolName}
				toolCallId={toolCallId}
				input={parsed}
				phase={phase}
				active={expanded}
				outgoingHeight={outgoingHeight}
				onReveal={onExpand}
				onCollapse={onCollapse}
				onSubmit={onSubmit}
				initialDraft={initialDraft}
				onSaveDraft={onSaveDraft}
				compactionRunning={compactionRunning}
				controls={controls}
			/>
		</div>
	);
}

export { Teaser } from "@/components/teaser";

/** A plain-text teaser of a question for the collapsed bar: repair math
 *  debris for display, then unwrap math and flatten common LaTeX. */
export function teaserText(q: string): string {
	return teaserPlain(repairMathForDisplay(q));
}

/** The collapsed strip. Two species (W5): "collapsed" is the scroll minimization
 *  (kind chip + one-liner + Answer ↓); "reveal" is the teach-check invitation —
 *  a distinct, more inviting affordance, because it asks the learner to start
 *  something, not to resume something. */
export function QuestionDockBar({
	toolName,
	question,
	onExpand,
	variant = "collapsed",
	label,
}: {
	toolName: "quiz" | "ask_user_question" | "explain";
	question: string;
	onExpand: () => void;
	variant?: "collapsed" | "reveal";
	/** The kind chip's text: the shared turn-kind label (src/core/waiting.ts),
	 *  so the strip, this bar and Home's waiting list agree. */
	label?: string;
}) {
	const kind = label ?? questionKindLabel(toolName);
	// Both species share the turn strip (feature 001): the reveal invites
	// ("Check your understanding"), the scroll fold resumes. The whole row
	// is the button; the trailing "Answer" is its visible label.
	return (
		<button
			type="button"
			data-testid={variant === "reveal" ? "teach-check-reveal" : "question-dock-bar"}
			aria-expanded={false}
			onClick={onExpand}
			className="dock-variant relative z-10 turn-strip min-h-[52px] w-full bg-card text-left transition-colors hover:bg-accent"
		>
			<span className="turn-label">Your turn</span>
			<span className="min-w-0 flex-1 truncate text-base text-ink-2">
				{variant === "reveal" ? <span className="font-medium text-foreground">Check your understanding · </span> : <span className="font-medium text-foreground">{kind} · </span>}
				<Teaser text={teaserText(question)} />
			</span>
			<span className="prompt-primary shrink-0" data-quiet="">Answer</span>
		</button>
	);
}


/** The expanded question: label, question, options, and the unified bottom row. */
function QuestionDockForm({
	toolName,
	toolCallId,
	input,
	active,
	outgoingHeight,
	onReveal,
	onSubmit,
	initialDraft,
	onSaveDraft,
	compactionRunning = false,
	controls,
	onCollapse,
}: Omit<QuestionDockProps, "expanded" | "onExpand" | "reveal"> & { onReveal?: () => void }) {
	const kind = toolQuestionKind(toolName);

	// Canonical QuestionData, built once per question. Quiz options are
	// deterministically shuffled (seeded by toolCallId) so position never leaks
	// correctness AND server/client render the same order (hydration-safe);
	// the display order is snapshotted into the answer record at submit time.
	const qd = useMemo<QuestionData>(() => {
		const quizInput = kind === "quiz" ? (input as QuizToolInput) : null;
		const askInput = kind === "ask" ? (input as AskToolInput) : null;
		const explainInput = kind === "explain" ? (input as ExplainToolInput) : null;
		const multi = input instanceof Object && "multiSelect" in input ? input.multiSelect === true : false;
		const mode: QuestionMode =
			kind === "quiz"
				? multi
					? "multi-select"
					: "single-select"
				: askInput?.options?.length
					? multi
						? "multi-select"
						: "single-select"
						: "text";
		const options = normalizeOptions(
			(quizInput?.options ?? askInput?.options ?? []) as { label: string; value?: string }[],
		);
		const ordered = kind === "quiz" && options.length > 0 ? shuffleOptions(options, seededRandom(toolCallId)) : options;
		const q: QuestionData = {
			id: toolCallId,
			kind,
			// The role (owner 2026-10-03): predict questions gate by it in the
			// view (never collapsed) and the answered card tucks the explanation.
			questionType: kind === "quiz" ? normalizeQuizType((input as { type?: unknown }).type) : undefined,
			question: input.question,
			context: input.details,
			mode,
			options: ordered,
			createdAt: new Date().toISOString(),
		};
		if (quizInput) {
			const resolved = resolveCorrect(quizInput.correctAnswer, ordered);
			if (resolved.error) console.error("[quiz] correctAnswer did not resolve:", resolved.error);
			q.correctIndices = resolved.indices;
			q.explanation = quizInput.explanation;
		}
		if (explainInput) {
			// The commitment rides the question data (never sent to the
			// client before answering) and snapshots into the answer at submit.
			// One field, reasoning included — no separate explanation
			// (owner ruling 2026-09-27).
			q.committedAnswer = explainInput.correctAnswer;
		}
		return q;
	}, [toolCallId, kind, input]);

	// The selection state machine lives in question-core (pure, tested):
	// single-select displaces, multi-select coexists — picking the ask
	// "Other…" row in a multi-select must never clear already-picked
	// options, and picking an option must never clear a typed custom answer.
	const initialSelection = initialDraft?.selection ?? emptyDockSelection();
	const [selection, setSelection] = useSessionState(`question/${toolCallId}/selection`, { ...initialSelection, selected: [...initialSelection.selected] });
	const sel: DockSelection = { ...selection, selected: new Set(Array.isArray(selection.selected) ? selection.selected : []) };
	const setSel = (next: DockSelection | ((previous: DockSelection) => DockSelection)) => setSelection((previous) => {
		const value = typeof next === "function" ? next({ ...previous, selected: new Set(previous.selected) }) : next;
		return { ...value, selected: [...value.selected] };
	});
	// The learner's transfer channel — thinking, never "a note".
	const [thinking, setThinking] = useSessionState(`question/${toolCallId}/thinking`, initialDraft?.thinking ?? "");
	const [other, setOther] = useSessionState(`question/${toolCallId}/other`, initialDraft?.other ?? "");
	const [text, setText] = useSessionState(`question/${toolCallId}/text`, initialDraft?.text ?? "");
	// Refs mirror the two fields; submit reads these.
	const thinkingTextRef = useRef(initialDraft?.thinking ?? "");
	const answerTextRef = useRef(text);
	thinkingTextRef.current = thinking;
	answerTextRef.current = text;
	// Confidence (owner, 2026-10-01): an index into CONFIDENCE_STOPS,
	// resting at 50 — a real coin flip by definition, untouched or
	// deliberate (the same number, the same meaning). The dock unmounts
	// between questions, so each question starts fresh at 50.
	const [confIdx, setConfIdx] = useSessionState(`question/${toolCallId}/confidence`, initialDraft?.confidenceIndex ?? DEFAULT_CONFIDENCE_INDEX);
	const selectMode: SelectMode = qd.mode === "multi-select" ? "multi-select" : "single-select";

	const toggle = (idx: number) => setSel(toggleOption(selectMode, sel, idx));

	const canSubmit =
		qd.mode === "text"
			? text.trim().length > 0
			: sel.dontKnow || (sel.otherSelected && other.trim().length > 0) || sel.selected.size > 0;

	const submit = () => {
		if (!canSubmit || compactionRunning) return;
		const req: AnswerRequest = {
			dontKnow: sel.dontKnow,
			values: [...sel.selected].map((i) => qd.options[i]!.value),
			other: sel.otherSelected ? other : undefined,
			text: qd.mode === "text" ? answerTextRef.current : undefined,
			thinking: qd.mode !== "text" ? thinkingTextRef.current.trim() || undefined : undefined,
			// Always sent on quiz answers (owner: 50 must mean 50, never
			// "untouched"); buildAnswer drops it on "I don't know".
			confidence: kind === "quiz" ? CONFIDENCE_STOPS[confIdx] : undefined,
		};
		// Snapshot before optimistic submission unmounts the form.
		onSaveDraft?.({
			selection: { ...sel, selected: new Set(sel.selected) },
			thinking: thinkingTextRef.current,
			other,
			text: answerTextRef.current,
			confidenceIndex: confIdx,
		});
		onSubmit(buildAnswer(qd, req, toolName));
	};

	/* ENTER SUBMITS FROM ANYWHERE (owner round 6, 2026-10-05): the same
	 * law as the practice dock — dictated answers rarely focus the field. */
	useEnterSubmits(() => { if (active) submit(); else onReveal?.(); });

	// Selecting Other never clears the thinking field — two channels, the
	// answer and the reasoning behind it, side by side.
	const selectOther = () => setSel(toggleOther(selectMode, sel));

	/* ── The keyboard machine (shortcut wave B, owner rounds 2026-09-17) ──
	   ↑/↓ walk EVERY answerable row in order — options first, then the
	   quiz's "I don't know" or the ask's "Other…" (whichever exists) —
	   CLAMPED at the ends, no wrap (owner: faster to navigate when the
	   walk stops at the last row). Space acts on the walked row exactly
	   like a click (multi toggles, single displaces; Other also focuses
	   its input for typing), Enter submits once an answer exists.
	   Tab toggles FOCUS between the thinking field and the answer rows
	   (owner round 3) — nothing else; Shift+Tab is NOT ours (the global
	   thinking-level cycle owns it). Two guards keep native behavior
	   intact: keys from a TYPING SURFACE keep their meaning (arrows move
	   the caret, space types), and modifier combos are never ours
	   (Alt+arrows cycle sessions — they must not ALSO walk the rows).
	   The listener is document-level and lives only while the dock is
	   expanded — collapsed, the bar's native Enter expands it. */
	const [kbdIdx, setKbdIdx] = useState<number | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const otherInputRef = useRef<HTMLInputElement>(null);
	const thinkingRef = useRef<HTMLTextAreaElement>(null);
	// One row past the options is the trailing row: quiz → don't-know,
	// ask → Other (a question never has both). Text mode (ask/explain)
	// has no rows — the composer IS the answer surface.
	const optionCount = qd.mode === "text" ? 0 : qd.options.length;
	const rowCount = qd.mode === "text" ? 0 : optionCount + 1;

	const kbdAct = (idx: number) => {
		if (idx < optionCount) toggle(idx);
		else if (kind === "quiz")
			setSel((prev) => ({ ...prev, selected: new Set(), otherSelected: false, dontKnow: !prev.dontKnow }));
		else {
			// Space on the ask's Other row (owner refinement round,
			// 2026-09-24): SELECTING it focuses the input for typing, but
			// the Space that DESELECTS an already-selected Other must never
			// drop the user back into the typing field — the core's
			// toggleOther has no single-select off-path (it displaces), so
			// the off-path lives here: clear the pick, keep the typed text,
			// focus stays where it is. Re-selecting is the way back into
			// the field.
			if (sel.otherSelected) setSel((prev) => ({ ...prev, otherSelected: false, dontKnow: false }));
			else {
				otherInputRef.current?.focus();
				selectOther();
			}
		}
	};

	// Focus the walked row's focusable element — the Other row is a div,
	// so its inline input is the focus target there.
	const focusRow = (idx: number) => {
		const row = rootRef.current?.querySelector(`[data-kbdrow="${idx}"]`) as HTMLElement | null;
		if (!row) return;
		const el = (row.querySelector("input") as HTMLElement | null) ?? row;
		el.focus();
	};

	useEffect(() => {
		if (!active || rowCount === 0) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (e.isComposing || e.defaultPrevented || t?.closest?.("[role=dialog], [data-lh-menu]")) return;
			// A TYPING field is where keys mean text (owner round 4): the
			// thinking/answer fields, search boxes, renames — never a range
			// input, whose focus after a click or drag must not kill the
			// arrow cycling. Everywhere else the arrows act.
			const typing =
				!!t &&
				((t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range") ||
					t.tagName === "TEXTAREA" ||
					t.isContentEditable);
			// Alt/Cmd/Ctrl combos are never ours (Alt+arrows cycle sessions
			// globally — they must not ALSO walk the question rows).
			const modded = e.altKey || e.metaKey || e.ctrlKey;
			// Plain Tab toggles focus: rows → thinking. The confidence
			// slider takes NO focus at all (owner, UI round 2026-10-01) —
			// global ←/→ own its keyboard, so it never joins the chain.
			// Shift+Tab falls through (the global thinking-level cycle owns
			// it), so the shift check matters.
			if (e.key === "Tab" && !e.shiftKey && !modded) {
				e.preventDefault();
				e.stopPropagation();
				if (t?.closest?.("[data-kbdrow]")) thinkingRef.current?.focus();
				else {
					const idx = kbdIdx ?? 0;
					setKbdIdx(idx);
					focusRow(idx);
				}
				return;
			}
			// Keys from a typing surface keep their meaning (arrows move
			// the caret, space types).
			if (typing || modded) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				const next = Math.min((kbdIdx ?? -1) + 1, rowCount - 1);
				setKbdIdx(next);
				// Focus follows the walk while the user is IN the rows (Tab
				// put them there) so focused and walked never diverge.
				if (t?.closest?.("[data-kbdrow]")) focusRow(next);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				const next = Math.max((kbdIdx ?? rowCount) - 1, 0);
				setKbdIdx(next);
				if (t?.closest?.("[data-kbdrow]")) focusRow(next);
			} else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				// Global confidence cycling (owner, UI round 2026-10-01): the
				// SAME pattern as ↑/↓ over the rows — works wherever focus
				// sits, no click-in, no focus ring. Dead on "I don't know"
				// (the slider grays out and nothing is sent).
				if (kind !== "quiz" || sel.dontKnow) return;
				e.preventDefault();
				setConfIdx((i) =>
					Math.min(
						CONFIDENCE_STOPS.length - 1,
						Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)),
					),
				);
			} else if (e.key === " ") {
				if (kbdIdx === null) return; // plain Space keeps scrolling the page
				e.preventDefault();
				kbdAct(kbdIdx);
			} else if (!e.isComposing && e.key === "Enter") {
				if (kbdIdx === null || !canSubmit) return;
				e.preventDefault();
				submit();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	});

	// Overflow fade: only while the scrolling body hides content.
	const [overflowBelow, setOverflowBelow] = useState(false);
	useEffect(() => {
		const el = rootRef.current;
		if (!el || !active) return;
		const measure = () => setOverflowBelow(el.scrollHeight - el.clientHeight - el.scrollTop > 8);
		measure();
		el.addEventListener("scroll", measure, { passive: true });
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
		observer?.observe(el);
		return () => {
			el.removeEventListener("scroll", measure);
			observer?.disconnect();
		};
	}, [active]);

	// Keep the walked row visible (the question area scrolls internally).
	useEffect(() => {
		if (kbdIdx === null) return;
		rootRef.current
			?.querySelector(`[data-kbdrow="${kbdIdx}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [kbdIdx]);

	const questionContent = <div ref={rootRef} data-testid="lesson-question" hidden={!active && !outgoingHeight} inert={!active} style={!active && outgoingHeight ? { height: outgoingHeight, maxHeight: outgoingHeight } : undefined} className={`${!active && outgoingHeight ? "dock-outgoing pointer-events-none absolute inset-x-0 top-0" : ""} select-text max-h-[var(--dock-question-max-h,50dvh)] min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
			<div data-session-find-root="" className="min-h-0 select-text px-4 pt-0.5">
				{qd.mode === "multi-select" && <div className="mb-1 text-sm font-medium text-ink-2">Select all that apply</div>}
				<div className="mb-3">
					<ToolContentResponse>{qd.question}</ToolContentResponse>
				</div>
				{qd.context && (
					<div className="mb-3 text-base text-muted-foreground [--lh-prose-size:15px]">
						<ToolContentResponse>{qd.context}</ToolContentResponse>
					</div>
				)}

				{qd.mode !== "text" && (
					<div className="flex flex-col gap-1.5 pb-3 [--lh-prose-size:15px]" role={qd.mode === "multi-select" ? "group" : "radiogroup"}>
						{qd.options.map((opt, i) => {
							const isSel = sel.selected.has(i);
							return (
								<button
									key={opt.value}
									type="button"
									role={qd.mode === "multi-select" ? "checkbox" : "radio"}
									aria-checked={isSel}
									data-kbdrow={i}
									onClick={() => toggle(i)}
									className={cn(
										"flex min-h-11 items-start gap-3 rounded-sm border px-3.5 py-2.5 text-left text-base leading-[22px] outline-none transition-colors",
										isSel ? "border-primary bg-primary/10 text-foreground" : "border-input text-ink-2 hover:bg-accent hover:text-foreground",
										i === kbdIdx && !isSel && "bg-accent text-foreground",
									)}
								>
									<span
										className={cn(
											"mt-[3px] flex size-4 shrink-0 items-center justify-center border-[1.5px]",
											qd.mode === "multi-select" ? "rounded-[4px]" : "rounded-full",
											isSel ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground",
										)}
									>
										{isSel && (
											<span className={cn(qd.mode === "multi-select" ? "text-base leading-none" : "size-1.5 rounded-full bg-current")}>
												{qd.mode === "multi-select" ? "✓" : ""}
											</span>
										)}
									</span>
									<span>
										<ToolContentResponse>{opt.label}</ToolContentResponse>
										{kind !== "quiz" && opt.description && (
											// Option subtext renders in Source Sans 3 (owner's mockup);
											// the "I don't know" copy stays JetBrains Mono. QUIZ options render
											// NO description (owner ruling 2026-09-26): the model used them to
											// telegraph correctness — the schema dropped the field and old
											// records must not leak either. Same MessageResponse path as the
											// label (owner, 2026-10-12): descriptions are full markdown —
											// LaTeX included — not plain text.
											<ToolContentResponse className="lh-prose block text-sm text-muted-foreground">
												{opt.description}
											</ToolContentResponse>
										)}
									</span>
								</button>
							);
						})}

						{kind === "ask" && (
							<div
								role={qd.mode === "multi-select" ? "checkbox" : "radio"}
								aria-checked={sel.otherSelected}
								data-testid="other-option"
								data-kbdrow={optionCount}
								onClick={selectOther}
								className={cn(
									"flex min-h-11 items-start gap-3 rounded-sm border px-3.5 py-2.5 text-left text-base leading-[22px] outline-none transition-colors",
									sel.otherSelected ? "border-primary bg-primary/10" : "border-input hover:bg-accent",
									kbdIdx === optionCount && !sel.otherSelected && "bg-accent",
								)}
							>
								<span
									className={cn(
										"mt-[3px] flex size-4 shrink-0 items-center justify-center border-[1.5px]",
										qd.mode === "multi-select" ? "rounded-[4px]" : "rounded-full",
										sel.otherSelected
											? "border-primary bg-primary text-primary-foreground"
											: "border-muted-foreground",
									)}
								>
									{sel.otherSelected && (
										<span className={cn(qd.mode === "multi-select" ? "text-base leading-none" : "size-1.5 rounded-full bg-current")}>
											{qd.mode === "multi-select" ? "✓" : ""}
										</span>
									)}
								</span>
								<input
									ref={otherInputRef}
									value={other}
									onChange={(e) => {
										setOther(e.target.value);
										// Typing selects the row — displacing in
										// single-select, alongside the siblings in multi.
										setSel((prev) => (prev.otherSelected ? prev : toggleOther(selectMode, prev)));
									}}
									onKeyDown={(e) => {
										// Esc escapes the typing (owner refinement round,
										// 2026-09-24): focus leaves the input, the row STAYS
										// selected — deselection is the next Space's job, acting
										// on the row — and the arrow walk resumes from this
										// row (kbdIdx pins it). stopPropagation keeps the
										// window chain from reading this Esc as abort-turn.
										if (e.key === "Escape") {
											e.preventDefault();
											e.stopPropagation();
											e.currentTarget.blur();
											setKbdIdx(optionCount);
										}
											// Enter submits directly (owner, keyboard round 2026-10-06):
											// the custom answer is a single-line input — no newline
											// to protect, and typing has already selected the row, so
											// the payload is ready. Every Enter (shift or not — nothing
											// else could ever happen in a one-line field) rides the
											// same submit seam as the button.
											if (!e.nativeEvent.isComposing && e.key === "Enter") {
												e.preventDefault();
												submit();
											}
									}}
									placeholder="Type your own answer…"
									className="lh-input w-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
									onClick={(e) => e.stopPropagation()}
								/>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Confidence (ui-v2): four named segments, each saving a raw
				probability (CONFIDENCE_STOPS). Global ←/→ steps through them
				(the dock machine above). "I don't know" greys them out and no
				value is sent. */}
			{kind === "quiz" && (
				<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-4">
					<span
						id={`${toolCallId}-confidence`}
						className={cn("shrink-0 text-sm font-medium", sel.dontKnow ? "text-muted-foreground" : "text-ink-2")}
					>
						Confidence
					</span>
					<div
						role="radiogroup"
						aria-labelledby={`${toolCallId}-confidence`}
						aria-label="Confidence that your selected answer is correct"
						data-testid="confidence-segments"
						className={cn(
							"grid min-w-0 flex-[1_1_320px] grid-cols-2 gap-0.5 rounded-[8px] bg-background p-[3px] sm:grid-cols-4",
							sel.dontKnow && "pointer-events-none opacity-40",
						)}
					>
						{CONFIDENCE_LABELS.map((label, i) => (
							<button
								key={label}
								type="button"
								role="radio"
								aria-checked={!sel.dontKnow && confIdx === i}
								disabled={sel.dontKnow}
								title={`${CONFIDENCE_STOPS[i]}% sure. Adjust with ←/→.`}
								onClick={() => setConfIdx(i)}
								className={cn(
									"min-h-9 whitespace-normal rounded-sm px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
									!sel.dontKnow && confIdx === i
										? "bg-accent font-semibold text-foreground"
										: "font-medium text-ink-2 hover:bg-accent hover:text-foreground",
								)}
							>
								{label}
							</button>
						))}
					</div>
					{/* The deliberate non-answer: a text button, still the last
					    keyboard row after the options (↑/↓ walk unchanged). */}
					<button
						type="button"
						onClick={() =>
							setSel((prev) => ({ ...prev, selected: new Set(), otherSelected: false, dontKnow: !prev.dontKnow }))
						}
						data-kbdrow={optionCount}
						aria-pressed={sel.dontKnow}
						className={cn(
							"min-h-9 shrink-0 rounded-sm px-2 text-sm font-medium underline decoration-[rgb(255_252_240/25%)] underline-offset-[3px] outline-none transition-colors pointer-coarse:min-h-11",
							sel.dontKnow ? "bg-primary/10 text-primary decoration-current" : "text-ink-2 hover:text-foreground",
							kbdIdx === optionCount && !sel.dontKnow && "bg-accent text-foreground",
						)}
					>
						I don't know
					</button>
				</div>
			)}

	</div>;
	return (
		<div data-testid="question-dock" className="flex min-h-0 flex-col">
			{active && (
				<TurnStrip kind={questionKindLabel(toolName, (input as { type?: unknown }).type)}>
					<span className="flex-1" />
					{onCollapse && (
						<button type="button" aria-label="Collapse question" onClick={onCollapse} className="ui-icon-button size-9">
							<ChevronDownIcon aria-hidden="true" className="ui-icon" />
						</button>
					)}
				</TurnStrip>
			)}
			{questionContent}
			{active && overflowBelow && (
				<div aria-hidden="true" className="pointer-events-none relative -mt-10 h-10 bg-linear-to-b from-transparent to-card" />
			)}

			{/* The learner's half of the dock — a composer TWIN: a labeled, bordered
			    field with Submit docked inside, exactly like the chat composer's
			    send. Select modes get "Your thinking" (Enter makes a newline — it
			    is for dumping, soon dictated; the button submits); text mode
			    keeps "Your answer" with Enter-to-submit. */}
			<form
				className="input-surface shrink-0"
				onClick={focusSurfaceInput}
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<div
					data-testid={qd.mode === "text" ? "answer-field" : "thinking-field"}
					// Text and controls sit directly on the prompt shell.
					className="flex flex-col"
				>
					<AnswerWell label={qd.mode === "text" ? "Your answer" : "Your thinking"} htmlFor={`${toolCallId}-answer`}>
					{qd.mode === "text" ? (
						<textarea
							id={`${toolCallId}-answer`}
							aria-label="Your answer"
							value={text}
							onChange={(e) => {
								answerTextRef.current = e.target.value;
								setText(e.target.value);
							}}
							onKeyDown={(e) => {
								// Chat convention: Enter submits, Shift+Enter is a newline;
								// ⌘/Ctrl+Enter also submits (universal across the app).
								if (!e.nativeEvent.isComposing && e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
									e.preventDefault();
									submit();
								}
							}}
							rows={1}
							className="prompt-input field-sizing-content lh-input max-h-48 min-h-10 w-full resize-none bg-transparent px-4 pt-1 pb-2.5 outline-none"
						/>
					) : (
						<textarea
							ref={thinkingRef}
							id={`${toolCallId}-answer`}
							aria-label="Your thinking"
							value={thinking}
							onChange={(e) => {
								thinkingTextRef.current = e.target.value;
								setThinking(e.target.value);
							}}
							onKeyDown={(e) => {
								// THE STANDARD CHORD (owner round 5, 2026-10-05): Enter
								// submits, Shift+Enter is a newline, ⌘/Ctrl+Enter works
								// too — identical to the practice dock and the composer.
								if (!e.nativeEvent.isComposing && e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									submit();
								}
							}}
							rows={1}
							className="prompt-input field-sizing-content lh-input max-h-48 min-h-10 w-full resize-none bg-transparent px-4 pt-1 pb-2.5 outline-none"
						/>
					)}
					</AnswerWell>
					{compactionRunning && <div role="status" className="px-4 pt-2 text-sm text-muted-foreground">Compacting session…</div>}
					<PromptToolbar controls={controls}>
						<span aria-hidden="true" className="prompt-hint max-sm:hidden">↵</span>
						<PrimaryAction aria-label="Submit answer" disabled={!canSubmit || compactionRunning}>
							Submit answer
						</PrimaryAction>
					</PromptToolbar>
				</div>
			</form>
		</div>
	);
}
