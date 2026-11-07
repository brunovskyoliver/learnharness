"use client";

/**
 * The muted row above the title (feature 024, visual-reference §5,
 * ui-contract "Chrome"): reviewer picker, Instructions, the note's mode,
 * Export, and the chat button at the row's end. Sticky under the top of
 * the page. Menus are Radix DropdownMenu, portalled into `.nb-root` so
 * they keep Notebook's tokens.
 */
import { CheckIcon, ChevronDownIcon, LightbulbIcon, MessageCircleIcon, MessageSquareTextIcon, PenLineIcon, ShareIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { Ref } from "react";
import type { NoteMode } from "@/src/core";
import type { NotebookReviewerView } from "./nb-shared";

export const MODE_LABEL: Record<NoteMode, string> = { thinks: "Thinks with you", ask: "When you ask" };
export const MODE_DESCRIPTION: Record<NoteMode, string> = {
	thinks: "Reads along and speaks up when a line deserves a second look.",
	ask: "Stays quiet until you select something or open the chat.",
};
export const PLAIN_READER = "plain";

/** The reviewer a note reads with: its own, else Plain reader, else the first. */
export function currentReviewer(reviewers: readonly NotebookReviewerView[], reviewerId: string | undefined): NotebookReviewerView | null {
	return reviewers.find((r) => r.id === reviewerId) ?? reviewers.find((r) => r.id === PLAIN_READER) ?? reviewers[0] ?? null;
}

const firstLine = (text: string) => text.split("\n")[0]?.trim() ?? "";

export interface ToolbarRowProps {
	reviewers: readonly NotebookReviewerView[];
	reviewerId: string | undefined;
	mode: NoteMode;
	/** The instruction line is showing (an instruction is set, or he is writing one): the row's button hides. */
	hasInstruction: boolean;
	container: HTMLElement | null;
	instructionsRef?: Ref<HTMLButtonElement>;
	chatRef?: Ref<HTMLButtonElement>;
	/** The note chat is open. */
	chatOpen?: boolean;
	onReviewer: (id: string) => void;
	/** "Edit reviewers…": the Reviewers page. */
	onEditReviewers: () => void;
	onMode: (mode: NoteMode) => void;
	onInstructions: () => void;
	onExport: () => void;
	onChat: () => void;
}

/** A 12px ink dot for the reviewer picker (our own glyph, not Riddled's blot). */
function ReviewerDot() {
	return (
		<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="nb-reviewer-dot">
			<circle cx="6" cy="6" r="4.6" fill="currentColor" />
		</svg>
	);
}

export function ToolbarRow({ reviewers, reviewerId, mode, hasInstruction, container, instructionsRef, chatRef, chatOpen = false, onReviewer, onEditReviewers, onMode, onInstructions, onExport, onChat }: ToolbarRowProps) {
	const reviewer = currentReviewer(reviewers, reviewerId);
	return (
		<div className="nb-toolbar" role="toolbar" aria-label="Note" data-testid="nb-toolbar">
			<DropdownMenu.Root modal={false}>
				<DropdownMenu.Trigger asChild>
					<button type="button" className="nb-tool nb-tool-reviewer" data-testid="nb-reviewer-picker" aria-label={`Reviewer: ${reviewer?.name ?? "Plain reader"}`}>
						<ReviewerDot />
						<span>{reviewer?.name ?? "Plain reader"}</span>
						<ChevronDownIcon className="nb-chevron" aria-hidden="true" />
					</button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal container={container ?? undefined}>
					<DropdownMenu.Content className="nb-menu" align="start" sideOffset={8} data-testid="nb-reviewer-menu">
						<DropdownMenu.Label className="nb-menu-label">Reviewers</DropdownMenu.Label>
						<DropdownMenu.RadioGroup value={reviewer?.id ?? ""} onValueChange={onReviewer}>
							{reviewers.map((r) => (
								<DropdownMenu.RadioItem key={r.id} value={r.id} className="nb-menu-item" data-testid="nb-reviewer-option">
									<span className="nb-menu-check"><DropdownMenu.ItemIndicator><CheckIcon aria-hidden="true" /></DropdownMenu.ItemIndicator></span>
									<span className="nb-menu-text">
										<span className="nb-menu-name">{r.name}</span>
										{firstLine(r.instructions) && <span className="nb-menu-description">{firstLine(r.instructions)}</span>}
									</span>
								</DropdownMenu.RadioItem>
							))}
						</DropdownMenu.RadioGroup>
						<DropdownMenu.Separator className="nb-menu-separator" />
						<DropdownMenu.Item className="nb-menu-item nb-menu-plain" data-testid="nb-edit-reviewers" onSelect={onEditReviewers}>
							Edit reviewers…
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			{!hasInstruction && (
				<button ref={instructionsRef} type="button" className="nb-tool nb-tool-instructions" data-testid="nb-instructions" onClick={onInstructions}>
					<PenLineIcon className="nb-tool-icon" aria-hidden="true" />
					<span>Instructions</span>
				</button>
			)}

			<DropdownMenu.Root modal={false}>
				<DropdownMenu.Trigger asChild>
					<button type="button" className="nb-tool nb-tool-mode" data-mode={mode} data-testid="nb-mode-picker" aria-label={`Mode: ${MODE_LABEL[mode]}`}>
						{mode === "thinks" ? <LightbulbIcon className="nb-tool-icon nb-bulb-lit" aria-hidden="true" /> : <MessageCircleIcon className="nb-tool-icon" aria-hidden="true" />}
						<span>{MODE_LABEL[mode]}</span>
						<ChevronDownIcon className="nb-chevron" aria-hidden="true" />
					</button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal container={container ?? undefined}>
					<DropdownMenu.Content className="nb-menu nb-menu-wide" align="start" sideOffset={8} data-testid="nb-mode-menu">
						<DropdownMenu.RadioGroup value={mode} onValueChange={(value) => onMode(value as NoteMode)}>
							{(["thinks", "ask"] as const).map((m) => (
								<DropdownMenu.RadioItem key={m} value={m} className="nb-menu-item" data-testid="nb-mode-option">
									<span className="nb-menu-check"><DropdownMenu.ItemIndicator><CheckIcon aria-hidden="true" /></DropdownMenu.ItemIndicator></span>
									<span className="nb-menu-text">
										<span className="nb-menu-name">{MODE_LABEL[m]}</span>
										<span className="nb-menu-description">{MODE_DESCRIPTION[m]}</span>
									</span>
								</DropdownMenu.RadioItem>
							))}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			<button type="button" className="nb-tool nb-tool-export" data-testid="nb-export" onClick={onExport}>
				<ShareIcon className="nb-tool-icon" aria-hidden="true" />
				<span>Export</span>
			</button>

			<button ref={chatRef} type="button" className="nb-tool nb-tool-chat" data-testid="nb-chat" aria-label="Ask about this note" title="Ask about this note" aria-haspopup="dialog" aria-expanded={chatOpen} onClick={onChat}>
				<MessageSquareTextIcon className="nb-tool-icon" aria-hidden="true" />
			</button>
		</div>
	);
}
