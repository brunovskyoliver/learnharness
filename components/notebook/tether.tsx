"use client";

/**
 * The line from a margin note to its passage (feature 024,
 * visual-reference §11). Drawn through a mask whose stroke runs out along
 * the path (`tether-draw`): the tie first, then the spine. A fresh note's
 * tether draws once at full strength and stays; a note under the pointer
 * gets the faint variant, which is the spine alone (frame margin-notes: the
 * hovered note shows a faint run down the gutter and no tie out of its
 * dot); a faint tether with no spine keeps its tie, its only stroke. The
 * mask element stays mounted, so the draw never replays on re-render.
 */
import { useId } from "react";
import { tetherPaths, type Side } from "./nb-geometry";

export interface TetherProps {
	side: Side;
	columnWidth: number;
	/** The note's first-line centre and the passage line's centre, column coordinates. */
	noteY: number;
	passageY: number;
	faint: boolean;
	threadId: string;
}

export function Tether({ side, columnWidth, noteY, passageY, faint, threadId }: TetherProps) {
	const id = useId().replace(/[^A-Za-z0-9_-]/g, "");
	const { tie, spine } = tetherPaths({ side, columnWidth, noteY, passageY });
	const box = { x: -2000, y: -2000, width: 6000, height: 100000 };
	const showTie = !faint || !spine;
	return (
		<g className={faint ? "nb-tether-faint" : undefined} data-thread={threadId} data-testid="nb-tether">
			{showTie && (
				<>
					<mask id={`${id}-tie`} maskUnits="userSpaceOnUse" {...box}>
						<path d={tie} pathLength={1} className="nb-tether-reveal nb-tether-reveal-tie" />
					</mask>
					<path d={tie} className="nb-tether-tie" mask={`url(#${id}-tie)`} />
				</>
			)}
			{spine && (
				<>
					<mask id={`${id}-spine`} maskUnits="userSpaceOnUse" {...box}>
						<path d={spine} pathLength={1} className="nb-tether-reveal nb-tether-reveal-spine" />
					</mask>
					<path d={spine} className="nb-tether-spine" mask={`url(#${id}-spine)`} />
				</>
			)}
		</g>
	);
}
