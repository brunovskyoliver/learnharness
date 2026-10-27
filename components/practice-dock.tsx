"use client";

import { useSessionState } from "@/components/session-state";
import { useRef, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { PromptSubmit, PromptToolbar } from "@/components/prompt-controls";
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
	/** text — POST {type:"thinking"} (one lane; the register is read from the text). */
	onSubmit: (text: string) => void;
	/** Compaction is running for this chat (owner round 14): the thinking
	 *  POST would block on the server's compaction gate — disable submit
	 *  and say so in the hint row. The server registry is the real gate;
	 *  this is the affordance. */
	compactionRunning?: boolean;
	controls?: ReactNode;
}

export function PracticeDock({ problemCallId, expanded, outgoingHeight, statement = "", onExpand, onSubmit, compactionRunning = false, controls }: PracticeDockProps) {
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

	/* ── the collapsed bar ── */
	const bar = (
			<button
				type="button"
				data-testid="practice-dock-bar"
				aria-expanded={false}
				onClick={onExpand}
				className="relative z-10 flex w-full cursor-pointer items-center gap-2 bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ChevronRightIcon className="size-4 shrink-0 rotate-90" />
				<span className="shrink-0 font-medium">Problem</span>
				<span className="min-w-0 flex-1 truncate">{statement || "Open the active problem"}</span>
			</button>
	);

	/* ── the expanded form ── */
	return (
		<div className="relative flex min-h-0 flex-col">
		{!expanded && bar}
		<div className="flex min-h-0 flex-col">
		<div data-testid="practice-dock" data-problem={problemCallId} className="flex min-h-0 flex-col">
			<div hidden={!expanded && !outgoingHeight} inert={!expanded} data-testid="practice-problem-content" style={!expanded && outgoingHeight ? { height: outgoingHeight, maxHeight: outgoingHeight } : undefined} className={`${!expanded && outgoingHeight ? "dock-outgoing pointer-events-none absolute inset-x-0 top-0" : ""} max-h-[var(--dock-question-max-h,50dvh)] min-h-0 select-text overflow-y-auto overscroll-contain px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}><ToolContentResponse>{statement}</ToolContentResponse></div>
			{/* The learner's half: Enter SENDS (owner round 2, 2026-10-05);
			    Shift+Enter makes a newline — less to decide about. */}
			<div
				data-testid="practice-thinking-field"
				onClick={focusSurfaceInput}
				className="input-surface shrink-0"
			>
				<textarea
					aria-label="Your thinking"
					placeholder="Your thinking"
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
					className="prompt-input field-sizing-content lh-input max-h-64 min-h-9 w-full resize-none bg-transparent px-4 pt-1.5 pb-1 outline-none"
				/>
				{compactionRunning && <div role="status" className="px-4 pb-2 text-xs text-muted-foreground">Compacting session…</div>}
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
