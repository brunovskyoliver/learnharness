"use client";

import type { ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";
import { PromptSubmit, PromptToolbar } from "@/components/prompt-controls";
import { focusSurfaceInput } from "@/components/input-surface";

/**
 * Composer content and toolbar. The persistent shell belongs to the caller
 * so chat can morph into a question without remounting it.
 */
/** What one Enter press does, in precedence order: stop a busy stream,
 *  otherwise send the message, otherwise — practice sessions only — fire
 *  the next-problem signal while the between-problems pause is live
 *  (owner round 16: Enter on an EMPTY composer is the go-ahead; typing
 *  anything makes Enter a send again). Pure so the static-render harness
 *  can pin the decision (key events can't be simulated in
 *  renderToStaticMarkup). */
export function enterAction(state: {
	busy: boolean;
	canSend: boolean;
	/** The between-problems pause is live: practice session, nothing
	 *  active, no turn/compaction in flight (the caller's fold). */
	nextProblem?: boolean;
}): "stop" | "send" | "next" | "none" {
	// Composer steering (owner arc 2026-10-03): while a turn runs, typed
	// text makes Enter a STEER (the queue-and-redirect send); Enter with
	// an empty composer stays the stop shortcut. The button itself keeps
	// the square — Stop stays one click away at all times.
	if (state.busy) return state.canSend ? "send" : "stop";
	if (state.canSend) return "send";
	if (state.nextProblem) return "next";
	return "none";
}

export function Composer({
	busy,
	value,
	onChange,
	onSend,
	onStop,
	canSend,
	autoFocus,
	inputRef,
	onEscape,
	placeholder = "Message",
	nextProblem = false,
	onNext,
	controls,
	sendLabel = "Send",
}: {
	busy: boolean;
	value: string;
	onChange: (v: string) => void;
	onSend: () => void;
	onStop: () => void;
	canSend: boolean;
	autoFocus?: boolean;
	/** The page's handle to the textarea — the dictation-end focus (owner,
	 *  2026-10-01): a run ending hands the cursor to the bare composer. */
	inputRef?: React.RefObject<HTMLTextAreaElement | null>;
	/** Escape while a dictation runs stops it (STT wave, 2026-09-17). No-op
	 *  when absent — Esc otherwise means nothing in the composer. */
	onEscape?: () => void;
	/** One-line placeholder, also the field's accessible name. */
	placeholder?: string;
	/** The practice pause is live (owner round 16): Enter on the empty
	 *  composer fires the next-problem signal instead of doing nothing —
	 *  the keyboard-first move-on. */
	nextProblem?: boolean;
	/** The signal's dispatcher (send({type:"next"})) — the chip and the
	 *  empty-Enter share it. */
	onNext?: () => void;
	controls?: ReactNode;
	sendLabel?: string;
}) {
	const act = () => {
		const action = enterAction({ busy, canSend, nextProblem });
		if (action === "stop") onStop();
		else if (action === "send") onSend();
		else if (action === "next") onNext?.();
	};
	return (
		<form
			data-testid="composer"
			className="input-surface flex min-h-0 flex-col"
			onClick={focusSurfaceInput}
			onSubmit={(e) => {
				e.preventDefault();
				act();
			}}
		>
			<InputGroup className="h-auto flex-col border-0 bg-transparent shadow-none ring-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0">
			<InputGroupTextarea
				ref={inputRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					// Esc ends dictation before anything else Esc might someday mean
					// here (the dictate decisions: click-again or Esc to stop).
					// stopPropagation claims the Esc (keyboard wave A): the
					// window-level chain must not also abort a turn under us.
					if (e.key === "Escape" && onEscape) {
						e.preventDefault();
						e.stopPropagation();
						onEscape();
						return;
					}
					// Chat convention: Enter sends, Shift+Enter is a newline.
					// ⌘/Ctrl+Enter also sends — the universal submit shortcut
					// across every input in the app (thinking field, answers).
					if (!e.nativeEvent.isComposing && e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
						e.preventDefault();
						act();
					}
				}}
				aria-label={placeholder}
				placeholder={placeholder}
				autoFocus={autoFocus}
				rows={1}
				className="prompt-input field-sizing-content lh-input max-h-48 min-h-11 w-full resize-none bg-transparent px-4 pt-3 pb-1 outline-none"
			/>
			<PromptToolbar controls={controls}>
				{nextProblem && !busy && !canSend ? (
					<button
						type="submit"
						data-testid="next-problem-button"
						aria-label="Next problem"
						className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-3 font-ui text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
					>
						Next problem
						<ArrowRightIcon className="size-4" />
					</button>
				) : (
					<PromptSubmit
						label={busy && !canSend ? "Stop" : sendLabel}
						stopping={busy && !canSend}
						disabled={!busy && !canSend}
					/>
				)}
			</PromptToolbar>
			</InputGroup>
		</form>
	);
}
