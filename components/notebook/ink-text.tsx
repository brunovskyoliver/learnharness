"use client";

/**
 * The AI's words inking in (feature 024, visual-reference §12, Riddled's
 * InkText): each word a span with `ink-word` (.64s, wet sepia to dry ink),
 * staggered by `min(70, 1800 / words)` ms. Only text that arrives while he
 * watches inks in; text already there renders static. Streaming text keeps
 * the words already shown and inks only the new ones, from when they
 * arrive. Paragraphs (blank lines) become blocks.
 */
import { useRef } from "react";
import { inkStepMs } from "./nb-geometry";

/** Words and the spaces after them, so nothing of his spacing is lost. */
export const inkWords = (text: string): string[] => text.match(/\S+\s*|\s+/g) ?? [];

export function InkText({ text, animate }: { text: string; animate: boolean }) {
	// Each word's delay, fixed when it first shows, so a re-render never restarts it.
	const delays = useRef<number[]>([]);
	const step = useRef<number | null>(null);
	const paragraphs = text.split(/\n{2,}/);
	if (!animate) return <>{paragraphs.map((p, i) => <span key={i} className="nb-words">{p}</span>)}</>;
	const total = inkWords(text).length;
	step.current ??= inkStepMs(total);
	const before = delays.current.length;
	for (let at = before; at < total; at++) delays.current.push((at - before) * step.current);
	let index = 0;
	return (
		<>
			{paragraphs.map((p, i) => (
				<span key={i} className="nb-words">
					{inkWords(p).map((word, j) => (
						<span key={j} className="nb-ink-word" style={{ animationDelay: `${Math.round(delays.current[index++] ?? 0)}ms` }}>{word}</span>
					))}
				</span>
			))}
		</>
	);
}
