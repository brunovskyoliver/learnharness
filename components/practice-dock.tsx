"use client";

import { useSessionState } from "@/components/session-state";
import { useRef } from "react";
import { useEnterSubmits } from "@/components/enter-submits";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { focusSurfaceInput } from "@/components/input-surface";
import { useLibraryMention } from "@/components/library/use-library-mention.ts";
import { ReferenceField } from "@/components/reference-field";

/** The active problem's thread body (feature 025: inside the check's margin
 * thread, components/study/check-thread.tsx): the public statement, one
 * trace field and Skip / Submit. The committed solution stays out of this
 * component; the trace is session state keyed `problem/<id>/thinking`. */

export interface PracticeDockProps {
	/** The active problem's tool-call id (submissions target it). */
	problemCallId: string;
	statement?: string;
	/** The thread is open: Enter from anywhere submits. Closed, Enter opens it. */
	active: boolean;
	onReveal?: () => void;
	/** Skip: opens the existing dismiss confirmation (the Escape path). */
	onSkip?: () => void;
	/** text — POST {type:"thinking"} (one lane; the register is read from the text). */
	onSubmit: (text: string) => void;
	/** Compaction is running for this chat (owner round 14): the thinking
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so. The server registry is the real gate; this is the
	 *  affordance. */
	compactionRunning?: boolean;
}

export function PracticeDock({ problemCallId, statement = "", active, onReveal, onSkip, onSubmit, compactionRunning = false }: PracticeDockProps) {
	const [thinking, setThinking] = useSessionState(`problem/${problemCallId}/thinking`, "");
	// Ref MIRRORS the field ("nothing gets lost", the question-dock
	// discipline): a submit resuming after `await finishDictation()` reads
	// the tail, never a stale closure.
	const thinkingRef = useRef(thinking);
	thinkingRef.current = thinking;
	const mention = useLibraryMention({
		value: thinking,
		onValueChange: (next) => {
			thinkingRef.current = next;
			setThinking(next);
		},
	});

	const submit = () => {
		if (compactionRunning) return;
		const text = thinkingRef.current.trim();
		if (text.length === 0) return;
		thinkingRef.current = "";
		setThinking("");
		onSubmit(text);
	};

	/* ENTER SUBMITS FROM ANYWHERE (owner round 6, 2026-10-05): dictation
	 * means the field is often never focused — the window-level Enter
	 * (typing surfaces and buttons excluded) submits the trace; with the
	 * thread closed it opens it. */
	useEnterSubmits(() => { if (active) submit(); else onReveal?.(); });

	return (
		<div data-testid="practice-dock" data-problem={problemCallId} className="lh-check-form">
			<div data-testid="practice-problem-content" className="lh-check-question lh-check-prompt nb-voice lh-voice select-text">
				<ToolContentResponse>{statement}</ToolContentResponse>
			</div>
			{/* The learner's half: Enter SENDS (owner round 2, 2026-10-05);
			    Shift+Enter makes a newline — less to decide about. */}
			<div className="lh-check-answer">
				<div data-testid="practice-thinking-field" className="nb-reply-line lh-check-field" onClick={focusSurfaceInput}>
					{mention.menu}
					<ReferenceField value={thinking} catalog={mention.catalog} inputRef={mention.ref}>
					<textarea
						{...mention.inputProps}
						ref={mention.ref}
						id={`${problemCallId}-thinking`}
						aria-label="Your thinking"
						placeholder="Work through the problem here"
						value={thinking}
						onChange={(e) => {
							thinkingRef.current = e.target.value;
							setThinking(e.target.value);
						}}
						onKeyDown={(e) => {
							if (mention.onKeyDown(e)) return;
							// Enter SENDS — the single lane (owner round 2, 2026-10-05);
							// Shift+Enter is the newline, ⌘/Ctrl+Enter the chord too.
							if (!e.nativeEvent.isComposing && e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								submit();
							}
						}}
						rows={1}
						className="lh-check-input field-sizing-content lh-input"
					/>
					</ReferenceField>
					{mention.line}
				</div>
				{compactionRunning && <p role="status" className="nb-thread-line">Compacting session…</p>}
				<div className="lh-check-actions">
					{onSkip && (
						<button type="button" data-testid="practice-skip" onClick={onSkip} className="nb-thread-button lh-check-skip">
							Skip
						</button>
					)}
					<button
						type="button"
						aria-label="Submit"
						data-testid="practice-send"
						disabled={thinking.trim().length === 0 || compactionRunning}
						onClick={() => submit()}
						className="nb-pill lh-check-submit"
					>
						Submit
					</button>
				</div>
			</div>
		</div>
	);
}
