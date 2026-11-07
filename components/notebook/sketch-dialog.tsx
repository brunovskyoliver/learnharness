"use client";

/**
 * "See it larger" (feature 024, US4; visual-reference §16.2): the sketch in
 * a dialog over a black/30 backdrop, a paper card min(92vw, 760px) with the
 * lift and a rule ring, radius 16px, and a round close button. It shares
 * the inline sketch's step, so stepping here moves both. Escape or a click
 * on the backdrop closes it; the focus goes back to "See it larger".
 */
import { Dialog } from "radix-ui";
import { XIcon } from "lucide-react";
import type { RefObject } from "react";
import type { Sketch as SketchData } from "@/src/core";
import { useNotebook } from "./nb-shared";
import { DrawingPicture, SketchHead, Stepper, type SketchPlayer } from "./sketch";

export function SketchDialog({ open, onOpenChange, sketch, player, label, returnFocus }: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sketch: SketchData;
	player: SketchPlayer;
	/** Every caption, for the drawing's name. */
	label: string;
	returnFocus: RefObject<HTMLElement | null>;
}) {
	const nb = useNotebook();
	const current = sketch.steps[player.step];
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal container={nb.root ?? undefined}>
				<Dialog.Overlay className="nb-sketch-backdrop" data-testid="nb-sketch-backdrop">
					<Dialog.Content
						className="nb-sketch-card"
						data-testid="nb-sketch-dialog"
						aria-describedby={undefined}
						onCloseAutoFocus={(event) => {
							event.preventDefault();
							returnFocus.current?.focus();
						}}
					>
						<Dialog.Title className="nb-sr-only">{sketch.title}</Dialog.Title>
						<Dialog.Close className="nb-sketch-close" aria-label="Close">
							<XIcon aria-hidden="true" size={16} strokeWidth={1.6} />
						</Dialog.Close>
						<figure className="nb-sketch-figure nb-sketch-figure-large" aria-label={label}>
							<SketchHead sketch={sketch} />
							<DrawingPicture key={player.round} sketch={sketch} step={player.step} liveStart={false} large />
							{current?.note && <p className="nb-sketch-note nb-voice">{current.note}</p>}
						</figure>
						<div className="nb-sketch-row">
							<p className="nb-sketch-caption nb-voice" aria-live="polite">{current?.caption}</p>
							<Stepper player={player} />
						</div>
					</Dialog.Content>
				</Dialog.Overlay>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
