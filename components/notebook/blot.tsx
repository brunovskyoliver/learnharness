"use client";

/**
 * The AI's ink marks (feature 024, visual-reference §9.1, §10): the blot
 * glyph, the margin note's dot (fresh: splat, sheen, drip, then it dries),
 * and what shows while a passage is read: the pencil underline drawn under
 * its lines and the breathing blot just after its end. All motion is CSS
 * (notebook.css), with reduced-motion fallbacks there.
 */
import { useEffect, useState } from "react";
import { blotPath, pencilStrokes, type PassageLine } from "./nb-geometry";

const BLOT = blotPath();

/** Our blot glyph in a 26-unit box centred on 0 (§4 box, our own shape). */
export function BlotGlyph({ className = "nb-ink-dot-blot", size }: { className?: string; size?: number }) {
	return (
		<svg viewBox="-13 -13 26 26" className={className} width={size} height={size} aria-hidden="true" fill="currentColor">
			<path d={BLOT.d} />
			{BLOT.drops.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} />)}
		</svg>
	);
}

/** JS keeps `is-fresh` this long (§10.1). */
const FRESH_MS = 3600;

/** A note's dot. Fresh dots splat in, glint and drip, then dry to .45. */
export function InkDot({ fresh = false, faint = false, className = "", style }: { fresh?: boolean; faint?: boolean; className?: string; style?: React.CSSProperties }) {
	const [wet, setWet] = useState(fresh);
	useEffect(() => {
		if (!fresh) return;
		setWet(true);
		const timer = window.setTimeout(() => setWet(false), FRESH_MS);
		return () => window.clearTimeout(timer);
	}, [fresh]);
	return (
		<span className={`nb-ink-dot${wet ? " nb-fresh" : ""}${faint ? " nb-faint" : ""} ${className}`} style={style} aria-hidden="true" data-testid="nb-ink-dot">
			<BlotGlyph />
			{wet && <span className="nb-ink-sheen" />}
			{wet && <span className="nb-ink-drip" />}
		</span>
	);
}

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
