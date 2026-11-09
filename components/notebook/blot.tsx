"use client";

/**
 * The AI's ink marks (feature 024, visual-reference §9.1, §10): the blot
 * glyph, the margin note's dot (fresh: splat, sheen, drip, then it dries),
 * and what shows while a passage is read: the pencil underline drawn under
 * its lines and the breathing blot just after its end. All motion is CSS
 * (notebook.css), with reduced-motion fallbacks there.
 */
import { BlotGlyph } from "../paper/blot";
import { pencilStrokes, type PassageLine } from "./nb-geometry";

/** The blot glyph: lifted to components/paper/blot.tsx (feature 025). */
export { BlotGlyph };

/** The dot: lifted to components/paper/ink-dot.tsx (feature 025). */
export { InkDot } from "../paper/ink-dot";

/**
 * The passage being read: the pencil underline (one stroke per line, or a
 * side bracket for four lines or more) and the blot breathing 10px after
 * the passage's last line. `leaving` fades both out (§9.1: 500ms).
 */
export function ReadingMarks({ lines, leaving = false }: { lines: readonly PassageLine[]; leaving?: boolean }) {
	if (lines.length === 0) return null;
	const { strokes, side } = pencilStrokes(lines);
	const last = lines.at(-1)!;
	return (
		<div className={`nb-reading${leaving ? " nb-leaving" : ""}`} data-testid="nb-reading" aria-hidden="true">
			<svg className="nb-pencil" data-pencil={side ? "side" : "under"} data-testid="nb-pencil">
				{strokes.map((s, i) => (
					<g key={i} style={{ "--draw": `${s.draw}s`, "--delay": `${s.delay}s` } as React.CSSProperties}>
						<path d={s.d} pathLength={1} className="nb-pencil-stroke" strokeWidth={s.width} />
						<path d={s.d} pathLength={1} className="nb-pencil-stroke nb-pencil-grain" strokeWidth={0.7} transform="translate(0.4 0.7)" />
					</g>
				))}
			</svg>
			<span className="nb-reading-mark" data-testid="nb-reading-mark" style={{ left: last.x2 + 10, top: (last.top + last.bottom) / 2 }}>
				<BlotGlyph className="nb-reading-blot" size={11} />
			</span>
		</div>
	);
}
