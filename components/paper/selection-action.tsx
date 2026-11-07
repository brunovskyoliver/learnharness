"use client";

/** One action in the selection card's list (feature 024 §15, lifted in feature 025):
 *  its label in the voice, an optional hint on the right. Apart from the card's
 *  rows so the PDF reader's bubble takes it without TipTap. */
export function SelectionAction({ label, hint, onRun, testId, keyShortcuts }: { label: string; hint?: string; onRun: () => void; testId: string; keyShortcuts?: string }) {
	return (
		<button
			type="button"
			className="nb-sel-action"
			data-testid={testId}
			onMouseDown={(event) => event.preventDefault()}
			aria-keyshortcuts={keyShortcuts}
			onClick={onRun}
		>
			<span className="nb-sel-label nb-voice">{label}</span>
			{hint && <span className="nb-sel-hint" aria-hidden="true">{hint}</span>}
		</button>
	);
}
