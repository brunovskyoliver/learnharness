"use client";

/**
 * A thread's ink dot (feature 024, visual-reference §10.1; lifted for both
 * modes in feature 025): fresh dots splat in, glint and drip, then dry.
 * Motion and its reduced-motion fallback are in app/paper.css.
 */
import { useEffect, useState } from "react";
import { BlotGlyph } from "./blot";

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

