"use client";

import { useSessionState } from "@/components/session-state";
import { useRef, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { AnswerWell, PrimaryAction, PromptToolbar, TurnStrip } from "@/components/prompt-controls";
import { Teaser, teaserText } from "@/components/question-dock";
import { useEnterSubmits } from "@/components/enter-submits";
import { focusSurfaceInput } from "@/components/input-surface";
import { ToolContentResponse } from "@/components/ai-elements/message";

/** One mounted trace input beneath an expandable public problem statement.
 * The committed solution stays out of this component. */

export interface PracticeDockProps {
	/** The active problem's tool-call id (submissions target it). */
	problemCallId: string;
	/** Collapse state, owned by the DockOverlay. */
	expanded: boolean;
	outgoingHeight?: number;
	statement?: string;
	onExpand: () => void;
	/** The turn strip's collapse control (owned by the DockOverlay). */
	onCollapse?: () => void;
	/** Skip: opens the existing dismiss confirmation (the Escape path). */
	onSkip?: () => void;
	/** text — POST {type:"thinking"} (one lane; the register is read from the text). */
	onSubmit: (text: string) => void;
	/** Compaction is running for this chat (owner round 14): the thinking
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so in the hint row. The server registry is the real gate;
	 *  this is the affordance. */
	compactionRunning?: boolean;
	controls?: ReactNode;
}

export function PracticeDock({ problemCallId, expanded, outgoingHeight, statement = "", onExpand, onCollapse, onSkip, onSubmit, compactionRunning = false, controls }: PracticeDockProps) {
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
	useEnterSubmits(() => { if (expanded) submit(); else onExpand(); });

	/* ── the collapsed bar: the turn strip alone ── */
	const bar = (
			<button
				type="button"
				data-testid="practice-dock-bar"
				aria-expanded={false}
				onClick={onExpand}
				className="relative z-10 turn-strip min-h-[52px] w-full cursor-pointer bg-card text-left transition-colors hover:bg-accent"
			>
				<span className="turn-label">Your turn</span>
				<span className="min-w-0 flex-1 truncate text-base text-ink-2">
					<span className="font-medium text-foreground">Problem · </span>
					{statement ? <Teaser text={teaserText(statement)} /> : "Open the active problem"}
				</span>
				<span className="prompt-primary shrink-0" data-quiet="">Solve</span>
			</button>
	);

	/* ── the expanded form ── */
	return (
		<div className="relative flex min-h-0 flex-col">
		{!expanded && bar}
		<div className="flex min-h-0 flex-col">
		<div data-testid="practice-dock" data-problem={problemCallId} className="flex min-h-0 flex-col">
			{expanded && (
				<TurnStrip kind="Problem">
					<span className="flex-1" />
					{onCollapse && (
						<button type="button" aria-label="Collapse problem" onClick={onCollapse} className="ui-icon-button size-9">
							<ChevronDownIcon aria-hidden="true" className="ui-icon" />
						</button>
					)}
				</TurnStrip>
			)}
			<div hidden={!expanded && !outgoingHeight} inert={!expanded} data-testid="practice-problem-content" style={!expanded && outgoingHeight ? { height: outgoingHeight, maxHeight: outgoingHeight } : undefined} className={`${!expanded && outgoingHeight ? "dock-outgoing pointer-events-none absolute inset-x-0 top-0" : ""} max-h-[var(--dock-question-max-h,50dvh)] min-h-0 select-text overflow-y-auto overscroll-contain px-4 pb-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}><ToolContentResponse>{statement}</ToolContentResponse></div>
			{/* The learner's half: Enter SENDS (owner round 2, 2026-10-05);
			    Shift+Enter makes a newline — less to decide about. */}
			<div
				data-testid="practice-thinking-field"
				onClick={focusSurfaceInput}
				className="input-surface shrink-0"
			>
				<AnswerWell>
				<textarea
					id={`${problemCallId}-thinking`}
					aria-label="Your thinking"
					placeholder="Work through the problem here"
					value={thinking}
					onChange={(e) => {
						thinkingRef.current = e.target.value;
						setThinking(e.target.value);
					}}
					onKeyDown={(e) => {
						// Enter SENDS — the single lane (owner round 2, 2026-10-05);
						// Shift+Enter is the newline, ⌘/Ctrl+Enter the chord too.
						if (!e.nativeEvent.isComposing && e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							submit();
						}
					}}
					rows={1}
					className="prompt-input field-sizing-content lh-input max-h-64 min-h-10 w-full resize-none bg-transparent px-4 pt-3 pb-2.5 outline-none"
				/>
				</AnswerWell>
				{compactionRunning && <div role="status" className="px-4 pt-2 text-sm text-muted-foreground">Compacting session…</div>}
				<PromptToolbar controls={controls}>
					{onSkip && (
						<button type="button" data-testid="practice-skip" onClick={onSkip} className="prompt-secondary">
							Skip
						</button>
					)}
					<PrimaryAction
						type="button"
						aria-label="Submit"
						data-testid="practice-send"
						disabled={thinking.trim().length === 0 || compactionRunning}
						onClick={() => submit()}
					>
						Submit
					</PrimaryAction>
				</PromptToolbar>
			</div>
		</div>
		</div>
		</div>
	);
}
