import type { ReactNode } from "react";

export interface PrimaryActionProps {
	/** Verb label: "Submit answer", "Submit", "Next problem", "Stop". */
	children: ReactNode;
	/** Raised-2 surface instead of the amber fill (Stop, the strip's Answer). */
	quiet?: boolean;
	/** "stop" leads with a square; "next" trails an arrow. */
	icon?: "stop" | "next";
	disabled?: boolean;
	onClick?: () => void;
}

export interface SendButtonProps {
	/** Accessible name. Default "Send". */
	label?: string;
	disabled?: boolean;
	onClick?: () => void;
}

export interface TurnStripProps {
	/** "Lesson check", "Question", "Prediction", "Explain", "Recall", "Problem". */
	kind: string;
	/** One-line plain-text teaser. Present = the collapsed strip. */
	teaser?: string;
	/** Collapsed strip action label. Default "Answer"; "Solve" for problems. */
	actionLabel?: string;
	onAction?: () => void;
	/** Expanded strip collapse control. */
	onCollapse?: () => void;
}

export interface ChoiceRowProps {
	children: ReactNode;
	selected?: boolean;
	/** Checkbox mark for multi-select questions. */
	multi?: boolean;
	onSelect?: () => void;
}

export interface ConfidenceProps {
	/** Index into Guessing, Unsure, Fairly sure, Certain. Default 1. */
	value?: number;
	dontKnow?: boolean;
	onChange?: (index: number) => void;
	onDontKnow?: () => void;
}

export interface AnswerFieldProps {
	/** Visible label ("Your thinking", "Your answer"). Omit for chat and pass placeholder. */
	label?: string;
	/** Chat only: says what the field is for. Never repeats a label. */
	placeholder?: string;
	id?: string;
	rows?: number;
	defaultValue?: string;
}

export interface PromptToolbarProps {
	/** Model, thinking and usage controls. */
	controls?: ReactNode;
	/** Replaces controls when no key or models exist. */
	setup?: ReactNode;
	/** Short keyboard hint before the action, e.g. "↵". */
	hint?: string;
	/** Exactly one primary action. */
	children: ReactNode;
}

export interface UserTurnProps {
	children: ReactNode;
}

export declare const PrimaryAction: (props: PrimaryActionProps) => JSX.Element;
export declare const SendButton: (props: SendButtonProps) => JSX.Element;
export declare const TurnStrip: (props: TurnStripProps) => JSX.Element;
export declare const ChoiceRow: (props: ChoiceRowProps) => JSX.Element;
export declare const Confidence: (props: ConfidenceProps) => JSX.Element;
export declare const AnswerField: (props: AnswerFieldProps) => JSX.Element;
export declare const PromptToolbar: (props: PromptToolbarProps) => JSX.Element;
export declare const UserTurn: (props: UserTurnProps) => JSX.Element;
