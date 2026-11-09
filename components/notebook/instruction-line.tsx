"use client";

/**
 * The note's instruction line (feature 024, US5; ui-contract "Chrome";
 * visual-reference §6): between the toolbar row and the title, a faint
 * pencil + "Instructions" label, then his instruction in the AI's
 * lettering, wrapping under itself. It is an autosizing textarea styled as
 * text, edited in place: Enter or leaving it saves (PATCH the companion's
 * `instruction`), Escape puts back what was saved. While it is empty the
 * line is hidden and the toolbar row's "Instructions" button opens it.
 * Reads wait while it has the focus (`data-nb-hold-reads`).
 */
import { PenLineIcon } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { NOTEBOOK_LIMITS } from "@/src/core";

export const INSTRUCTION_PLACEHOLDER = "How should this note be read? Only hints, say, or argue with everything.";

export interface InstructionHandle {
	/** Shows the line (if it was hidden) and puts the caret at its end. */
	open: () => void;
}

/** One line: line breaks typed or pasted become spaces. */
export const oneLine = (text: string): string => text.replace(/[\r\n]+/g, " ");

export const InstructionLine = forwardRef<InstructionHandle, {
	/** The saved instruction. */
	value: string;
	onSave: (instruction: string) => void;
	/** Enter: the instruction is saved and the title takes the caret. */
	onEnter: () => void;
	/** The line hid again (left empty): the toolbar's button takes the focus back. */
	onClosed: () => void;
	/** Whether the line shows (the toolbar row's button shows otherwise). */
	onShown: (shown: boolean) => void;
	readOnly?: boolean;
}>(function InstructionLine({ value, onSave, onEnter, onClosed, onShown, readOnly = false }, ref) {
	const [text, setText] = useState(value);
	const [editing, setEditing] = useState(false);
	const [focusTick, setFocusTick] = useState(0);
	const field = useRef<HTMLTextAreaElement>(null);
	const focused = useRef(false);

	// A change from elsewhere (another window) shows while he isn't in the field.
	useEffect(() => { if (!focused.current) setText(value); }, [value]);

	const fit = useCallback(() => {
		const el = field.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, []);
	useLayoutEffect(fit, [text, editing, fit]);
	useEffect(() => {
		window.addEventListener("resize", fit);
		return () => window.removeEventListener("resize", fit);
	}, [fit]);

	useImperativeHandle(ref, () => ({
		open: () => {
			setEditing(true);
			setFocusTick((n) => n + 1);
		},
	}), []);
	useEffect(() => {
		const el = field.current;
		if (!focusTick || !el) return;
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
	}, [focusTick]);

	const commit = () => {
		const wanted = text.trim();
		if (wanted !== text) setText(wanted);
		if (wanted !== value) onSave(wanted);
		return wanted;
	};

	const shown = Boolean(value || text || editing);
	useEffect(() => { onShown(shown); }, [shown, onShown]);
	if (!shown) return null;
	return (
		<div className="nb-instruction" data-nb-hold-reads="" data-testid="nb-instruction">
			<label className="nb-instruction-label" htmlFor="nb-instruction-field">
				<PenLineIcon className="nb-tool-icon" aria-hidden="true" />
				<span>Instructions</span>
			</label>
			<textarea
				ref={field}
				id="nb-instruction-field"
				className="nb-instruction-text nb-voice"
				rows={1}
				value={text}
				placeholder={INSTRUCTION_PLACEHOLDER}
				maxLength={NOTEBOOK_LIMITS.instruction}
				spellCheck
				readOnly={readOnly}
				data-testid="nb-instruction-field"
				onFocus={() => { focused.current = true; setEditing(true); }}
				onChange={(event) => setText(oneLine(event.currentTarget.value))}
				onKeyDown={(event) => {
					if (event.nativeEvent.isComposing) return;
					if (event.key === "Enter") {
						event.preventDefault();
						commit();
						onEnter();
					} else if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						setText(value);
						if (!value) {
							focused.current = false;
							setEditing(false);
							onClosed();
						}
					}
				}}
				onBlur={() => {
					focused.current = false;
					const kept = commit();
					if (!kept) setEditing(false);
				}}
			/>
		</div>
	);
});
