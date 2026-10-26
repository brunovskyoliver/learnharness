"use client";

import { useSessionState } from "@/components/session-state";
import { useRef, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { PromptSubmit, PromptToolbar } from "@/components/prompt-controls";
import { useEnterSubmits } from "@/components/enter-submits";
import { focusSurfaceInput } from "@/components/input-surface";

/**
 * The practice dock (practice sessions, owner design 2026-10-04): an
 * ACTIVE problem replaces the chat composer — the persistent bottom blob
 * holds the learner's answer. The statement stays in the lesson; the dock
 * contains "Your thinking", a labeled field with ONE Send button
 * (owner round 2, 2026-10-05): Enter sends, Shift+Enter makes a newline.
 * There are no lanes — whether a submission claims an answer is apparent
 * from the thinking itself; the agent reads it. One problem may carry
 * many submissions; each starts a turn.
 *
 * Collapse (scroll-up → slim bar) is owned by the DockOverlay; this
 * component is content only, and the expanded form stays MOUNTED while
 * collapsed (hidden) so a half-written trace survives scrolling.
 *
 * The commitment (modelSolution, decisionPoints, …) rides the tool call's
 * arguments and is NOT rendered here — only the statement is the
 * learner's. Esc dismisses the problem (the layered-Esc chain; the
 * confirm dialog then the silent route) — claimed by the page, not here.
 */

export interface PracticeDockProps {
	/** The active problem's tool-call id (submissions target it). */
	problemCallId: string;
	/** Collapse state, owned by the DockOverlay. */
	expanded: boolean;
	outgoingHeight?: number;
	onExpand: () => void;
	/** text — POST {type:"thinking"} (one lane; the register is read from the text). */
	onSubmit: (text: string) => void;
	/** Compaction is running for this chat (owner round 14): the thinking
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so in the hint row. The server registry is the real gate;
	 *  this is the affordance. */
	compactionRunning?: boolean;
	controls?: ReactNode;
}

export function PracticeDock({ problemCallId, expanded, outgoingHeight, onExpand, onSubmit, compactionRunning = false, controls }: PracticeDockProps) {
	const [thinking, setThinking] = useSessionState(`problem/${problemCallId}/thinking`, "");
	// Ref MIRRORS the field ("nothing gets lost", the question-dock
	// discipline): a submit resuming after `await finishDictation()` reads
	// the tail, never a stale closure.
	const thinkingRef = useRef(thinking);
	thinkingRef.current = thinking;


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
	 * (typing surfaces and buttons excluded) submits the trace. Mounted
	 * while the dock is — collapsed bar included (the trace survives). */
	useEnterSubmits(submit);

	/* ── the collapsed bar ── */
	const bar = (
			<button
				type="button"
				data-testid="practice-dock-bar"
				onClick={onExpand}
				className="relative z-10 flex w-full cursor-pointer items-center gap-2 bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ChevronRightIcon className="size-4 shrink-0 rotate-90" />
				<span className="shrink-0 font-medium">Your thinking</span>
				<span className="min-w-0 flex-1 truncate">{thinking || "Work here, think out loud."}</span>
			</button>
	);
	if (!expanded && !outgoingHeight) return bar;

	/* ── the expanded form ── */
	return (
		<div className="relative flex min-h-0 flex-col">
		{!expanded && bar}
		<div aria-hidden={!expanded} inert={!expanded} className={expanded ? "flex min-h-0 flex-col" : "dock-outgoing pointer-events-none absolute inset-x-0 top-0 flex flex-col"} style={!expanded && outgoingHeight ? { height: outgoingHeight } : undefined}>
		<div data-testid="practice-dock" data-problem={problemCallId} className="flex min-h-0 flex-col">
			{/* The learner's half: Enter SENDS (owner round 2, 2026-10-05);
			    Shift+Enter makes a newline — less to decide about. */}
			<div
				data-testid="practice-thinking-field"
				onClick={focusSurfaceInput}
				className="input-surface shrink-0"
			>
				<div className="px-5 pt-4 text-xs font-medium text-muted-foreground">
					Your thinking
				</div>
				<textarea
					aria-label="Your thinking"
					value={thinking}
					onChange={(e) => {
						thinkingRef.current = e.target.value;
						setThinking(e.target.value);
					}}
					onKeyDown={(e) => {
						// Enter SENDS — the single lane (owner round 2, 2026-10-05);
						// Shift+Enter is the newline, ⌘/Ctrl+Enter the chord too.
						if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							submit();
						}
					}}
					placeholder="Work here, think out loud."
					rows={2}
					className="prompt-input field-sizing-content lh-input max-h-64 min-h-16 w-full resize-none bg-transparent px-5 pt-1 pb-3 outline-none"
				/>
				{compactionRunning && <div role="status" className="px-5 pb-2 text-xs text-muted-foreground">Compacting session…</div>}
				<PromptToolbar controls={controls}>
					<PromptSubmit
						type="button"
						label="Submit thinking"
						data-testid="practice-send"
						disabled={thinking.trim().length === 0 || compactionRunning}
						onClick={() => submit()}
					/>
				</PromptToolbar>
			</div>
		</div>
		</div>
		</div>
	);
}
