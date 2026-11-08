"use client";


import { useSessionState } from "@/components/session-state";
import { useEffect, useMemo, useRef, useState } from "react";
import { teaserPlain } from "@/components/teaser";
import { focusSurfaceInput } from "@/components/input-surface";
import { useLibraryMention } from "@/components/library/use-library-mention.ts";
import { ReferenceField } from "@/components/reference-field";
import { chatUsesNativeTraversal, mlResultKeepsNativeEnter, useEnterSubmits } from "@/components/enter-submits";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
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

/** One mounted answer form (feature 025: the body of the check's margin
 * thread, components/study/check-thread.tsx). Closing the thread hides the
 * form; selections, confidence and the learner's draft keep their owners
 * (session state keyed `question/<id>/…`). */

export type QuestionToolName = "quiz" | "probe" | "ask_user_question" | "explain" | "recall";

export interface QuestionDockProps {
	toolName: QuestionToolName;
	toolCallId: string;
	input: QuizToolInput | AskToolInput | ExplainToolInput;
	/** The thread is open: the keyboard machine may arm (only while focus is
	 *  inside it) and Enter from anywhere submits. Closed, Enter opens it. */
	active: boolean;
	/** Opens the thread (Enter while it is closed). */
	onReveal?: () => void;
	onSubmit: (output: QuestionAnswerData) => void;
	/** Restore only this call's unconfirmed submission after recovery. */
	initialDraft?: QuestionFormDraft;
	onSaveDraft?: (draft: QuestionFormDraft) => void;
	/** Session phase at the question. */
	phase?: Phase3;
	/** Compaction is running for this chat (owner round 14): the answer
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so. The server registry is the real gate; this is the
	 *  affordance. */
	compactionRunning?: boolean;
}

/** The probe-phase names (owner, 2026-10-09) canonicalize onto their teach
 *  twins: the probe quiz ("probe") is quiz-shaped, the probe free-recall
 *  ("recall") explain-shaped. Old records keep the teach names. */
export function canonicalQuestionTool(toolName: QuestionToolName): "quiz" | "ask_user_question" | "explain" {
	return toolName === "probe" ? "quiz" : toolName === "recall" ? "explain" : toolName;
}

/** Parse, don't cast (src/core/tool-parts.ts): the model authored this
 *  input, and only the schema the tool declared vouches for its shape. */
export function parseQuestionInput(toolName: QuestionToolName, input: unknown): QuizToolInput | AskToolInput | ExplainToolInput | null {
	const canonical = canonicalQuestionTool(toolName);
	return (canonical === "quiz" ? parseQuizInput(input) : canonical === "explain" ? parseExplainInput(input) : parseAskInput(input)) ?? null;
}

/** The parsed form, or the quiet fallback for a malformed question (never a crash). */
export function QuestionDock(props: QuestionDockProps) {
	const parsed = parseQuestionInput(props.toolName, props.input);
	if (!parsed) {
		return (
			<div data-testid="malformed-question" className="text-sm text-faint">
				This question arrived malformed — the transcript keeps the retry.
			</div>
		);
	}
	return <QuestionDockForm {...props} input={parsed} />;
}

/** A plain-text teaser of a question for the collapsed bar: repair math
 *  debris for display, then unwrap math and flatten common LaTeX. */
export function teaserText(q: string): string {
	return teaserPlain(repairMathForDisplay(q));
}

/** The open question: question, options, confidence, the reply-line field and Submit answer. */
export function QuestionDockForm({
	toolName,
	toolCallId,
	input,
	active,
	onReveal,
	onSubmit,
	initialDraft,
	onSaveDraft,
	compactionRunning = false,
}: QuestionDockProps) {
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
	const formRef = useRef<HTMLDivElement>(null);
	const otherInputRef = useRef<HTMLInputElement>(null);
	const thinkingRef = useRef<HTMLTextAreaElement>(null);
	const answerMention = useLibraryMention({
		value: text,
		onValueChange: (next) => {
			answerTextRef.current = next;
			setText(next);
		},
	});
	const thinkingMention = useLibraryMention({
		value: thinking,
		onValueChange: (next) => {
			thinkingTextRef.current = next;
			setThinking(next);
		},
		inputRef: thinkingRef,
	});
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
		const row = formRef.current?.querySelector(`[data-kbdrow="${idx}"]`) as HTMLElement | null;
		if (!row) return;
		const el = (row.querySelector("input") as HTMLElement | null) ?? row;
		el.focus();
	};

	useEffect(() => {
		if (!active || rowCount === 0) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			// Armed only while focus is inside the open thread (feature 025, R8):
			// the question sits beside the lesson now, and the lesson keeps its keys.
			if (!formRef.current?.contains(document.activeElement)) return;
			if ((e.key === "Tab" && chatUsesNativeTraversal(document)) || (e.key === "Enter" && t && mlResultKeepsNativeEnter(t))) return;
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

	// Keep the walked row visible (the question area scrolls internally).
	useEffect(() => {
		if (kbdIdx === null) return;
		formRef.current
			?.querySelector(`[data-kbdrow="${kbdIdx}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [kbdIdx]);

	const indicator = (checked: boolean) => (
		<span aria-hidden="true" className={cn("lh-check-mark", qd.mode === "multi-select" ? "rounded-xs" : "rounded-full")} data-checked={checked || undefined}>
			{checked && qd.mode === "multi-select" ? "✓" : null}
		</span>
	);

	return (
		<div ref={formRef} data-testid="question-dock" className="lh-check-form">
			{/* The question in the voice; details, choices in the learner's sans.
			    A long question scrolls inside its own area (half the screen at most). */}
			<div ref={rootRef} data-testid="lesson-question" className="lh-check-question select-text">
				<div data-session-find-root="" className="min-h-0 select-text">
					{qd.mode === "multi-select" && <div className="lh-check-hint">Select all that apply</div>}
					<div className="lh-check-prompt nb-voice lh-voice">
						<ToolContentResponse>{qd.question}</ToolContentResponse>
					</div>
					{qd.context && (
						<div className="lh-check-details">
							<ToolContentResponse>{qd.context}</ToolContentResponse>
						</div>
					)}

					{qd.mode !== "text" && (
						<div className="lh-check-options" role={qd.mode === "multi-select" ? "group" : "radiogroup"}>
							{qd.options.map((opt, i) => {
								const isSel = sel.selected.has(i);
								return (
									<button
										key={opt.value}
										type="button"
										role={qd.mode === "multi-select" ? "checkbox" : "radio"}
										aria-checked={isSel}
										data-kbdrow={i}
										data-state={isSel ? "checked" : "unchecked"}
										data-walked={i === kbdIdx || undefined}
										onClick={() => toggle(i)}
										onFocus={() => setKbdIdx(i)}
										className="nb-option-card lh-check-option"
									>
										{indicator(isSel)}
										<span className="min-w-0 flex-1">
											<ToolContentResponse>{opt.label}</ToolContentResponse>
											{kind !== "quiz" && opt.description && (
												// QUIZ options render NO description (owner ruling
												// 2026-09-26): the model used them to telegraph
												// correctness. Ask descriptions are full markdown,
												// LaTeX included (owner, 2026-10-12).
												<ToolContentResponse className="lh-prose lh-check-option-description block">
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
									data-state={sel.otherSelected ? "checked" : "unchecked"}
									data-walked={kbdIdx === optionCount || undefined}
									onClick={selectOther}
									className="nb-option-card lh-check-option"
								>
									{indicator(sel.otherSelected)}
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
											// selected, and the arrow walk resumes from this row.
											// stopPropagation keeps the window chain from reading
											// this Esc as abort-turn.
											if (e.key === "Escape") {
												e.preventDefault();
												e.stopPropagation();
												e.currentTarget.blur();
												setKbdIdx(optionCount);
											}
											// Enter submits directly (owner, keyboard round
											// 2026-10-06): a one-line field, the payload is ready.
											if (!e.nativeEvent.isComposing && e.key === "Enter") {
												e.preventDefault();
												submit();
											}
										}}
										placeholder="Type your own answer…"
										className="lh-input w-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
										onClick={(e) => e.stopPropagation()}
									/>
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Confidence (ui-v2): four named stops, each saving a raw probability
			    (CONFIDENCE_STOPS); ←/→ step through them while focus is in the
			    thread. "I don't know" greys them out and no value is sent. */}
			{kind === "quiz" && (
				<div className="lh-check-confidence">
					<span id={`${toolCallId}-confidence`} className="lh-check-confidence-label" data-off={sel.dontKnow || undefined}>
						Confidence
					</span>
					<div
						role="radiogroup"
						aria-labelledby={`${toolCallId}-confidence`}
						aria-label="Confidence that your selected answer is correct"
						data-testid="confidence-segments"
						data-off={sel.dontKnow || undefined}
						className="lh-check-confidence-stops"
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
								className="lh-check-stop"
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
						data-walked={kbdIdx === optionCount || undefined}
						onFocus={() => setKbdIdx(optionCount)}
						className="lh-check-dont-know"
					>
						I don't know
					</button>
				</div>
			)}

			{/* The learner's half: the reply-line field (select modes get the
			    optional reasoning, text mode the answer), then Submit answer.
			    The placeholder names each (no separate label, owner 2026-10-28). */}
			<form
				className="lh-check-answer"
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<div data-testid={qd.mode === "text" ? "answer-field" : "thinking-field"} className="nb-reply-line lh-check-field" onClick={focusSurfaceInput}>
					{qd.mode === "text" ? answerMention.menu : thinkingMention.menu}
					{qd.mode === "text" ? (
						<ReferenceField key="answer" value={text} catalog={answerMention.catalog} inputRef={answerMention.ref}>
						<textarea
							{...answerMention.inputProps}
							ref={answerMention.ref}
							id={`${toolCallId}-answer`}
							aria-label="Your answer"
							placeholder="Type your answer"
							value={text}
							onChange={(e) => {
								answerTextRef.current = e.target.value;
								setText(e.target.value);
							}}
							onKeyDown={(e) => {
								if (answerMention.onKeyDown(e)) return;
								// Enter submits, Shift+Enter is a newline; ⌘/Ctrl+Enter also submits.
								if (!e.nativeEvent.isComposing && e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
									e.preventDefault();
									submit();
								}
							}}
							rows={1}
							className="lh-check-input field-sizing-content lh-input"
						/>
						</ReferenceField>
					) : (
						<ReferenceField key="thinking" value={thinking} catalog={thinkingMention.catalog} inputRef={thinkingMention.ref}>
						<textarea
							{...thinkingMention.inputProps}
							ref={thinkingMention.ref}
							id={`${toolCallId}-answer`}
							aria-label="Your thinking"
							placeholder="Explain your reasoning, or leave blank to submit your choice"
							value={thinking}
							onChange={(e) => {
								thinkingTextRef.current = e.target.value;
								setThinking(e.target.value);
							}}
							onKeyDown={(e) => {
								if (thinkingMention.onKeyDown(e)) return;
								// THE STANDARD CHORD (owner round 5, 2026-10-05): Enter
								// submits, Shift+Enter is a newline, ⌘/Ctrl+Enter works too.
								if (!e.nativeEvent.isComposing && e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									submit();
								}
							}}
							rows={1}
							className="lh-check-input field-sizing-content lh-input"
						/>
						</ReferenceField>
					)}
					{qd.mode === "text" ? answerMention.line : thinkingMention.line}
				</div>
				{compactionRunning && <p role="status" className="nb-thread-line">Compacting session…</p>}
				<div className="lh-check-actions">
					<button type="submit" aria-label="Submit answer" className="nb-pill lh-check-submit" disabled={!canSubmit || compactionRunning}>
						Submit answer
					</button>
				</div>
			</form>
		</div>
	);
}
