"use client";

/**
 * The AI's words inking in (feature 024, visual-reference §12, Riddled's
 * InkText): each word a span with `ink-word` (.64s, wet sepia to dry ink),
 * staggered by `min(70, 1800 / words)` ms. Only text that arrives while he
 * watches inks in; text already there renders static. Streaming text keeps
 * the words already shown and inks only the new ones, from when they
 * arrive. Paragraphs (blank lines) become blocks.
 *
 * The text is the Markdown subset of data-model.md (inline marks, code,
 * math): `**bold**`, `*italic*`, `` `code` ``, `$math$` and `$$display$$`
 * render as such (KaTeX, as the editor's math). A formula or a code span
 * inks in as one word. Anything else stays the literal text.
 */
import katex from "katex";
import { useRef, type ReactNode } from "react";
import { inkStepMs } from "./nb-geometry";

/** Words and the spaces after them, so nothing of his spacing is lost. */
export const inkWords = (text: string): string[] => text.match(/\S+\s*|\s+/g) ?? [];

/** One unit that inks in: a word with its marks, a formula, or a code span. */
export type InkToken =
	| { kind: "word"; text: string; strong: boolean; em: boolean }
	| { kind: "math"; tex: string; display: boolean; after: string }
	| { kind: "code"; text: string; after: string };

// $$…$$, $…$ (no space just inside, not followed by a digit, so "$5 and $10" stays text), `code`, ** and *.
const INLINE = /\$\$([^$]+?)\$\$(\s*)|\$(?!\s)([^$\n]*?[^\s$\\])\$(?!\d)(\s*)|`([^`\n]+)`(\s*)|(\*\*|\*)/g;

/** The paragraph's tokens; unmatched markers stay literal text. */
export function inkTokens(paragraph: string): InkToken[] {
	const out: InkToken[] = [];
	// Which emphasis markers close later in the paragraph, so a lone "*" stays text.
	const closes = (marker: string, from: number) => paragraph.indexOf(marker, from) >= 0;
	let strong = false, em = false, at = 0;
	const words = (text: string) => { for (const w of inkWords(text)) out.push({ kind: "word", text: w, strong, em }); };
	for (const match of paragraph.matchAll(INLINE)) {
		const index = match.index;
		const [whole, display, displayAfter, inline, inlineAfter, code, codeAfter, marker] = match;
		if (marker !== undefined) {
			const open = marker === "**" ? strong : em;
			if (!open && !closes(marker, index + marker.length)) continue;
			words(paragraph.slice(at, index));
			if (marker === "**") strong = !strong; else em = !em;
		} else {
			words(paragraph.slice(at, index));
			if (code !== undefined) out.push({ kind: "code", text: code, after: codeAfter ?? "" });
			else out.push({ kind: "math", tex: (display ?? inline)!.trim(), display: display !== undefined, after: (display !== undefined ? displayAfter : inlineAfter) ?? "" });
		}
		at = index + whole.length;
	}
	words(paragraph.slice(at));
	return out;
}

// HTML for the eye and MathML for screen readers (katex.min.css hides the MathML), as Study's rehype-katex.
const mathHtml = (tex: string, display: boolean) => katex.renderToString(tex, { throwOnError: false, displayMode: display, output: "htmlAndMathml" });

function tokenNode(token: InkToken): ReactNode {
	if (token.kind === "math") {
		// katex.renderToString is the library's own trusted output (as the editor's math view).
		return <><span className={token.display ? "nb-math nb-math-display" : "nb-math"} dangerouslySetInnerHTML={{ __html: mathHtml(token.tex, token.display) }} />{token.after}</>;
	}
	if (token.kind === "code") return <><code className="nb-code">{token.text}</code>{token.after}</>;
	let node: ReactNode = token.text;
	if (token.em) node = <em>{node}</em>;
	if (token.strong) node = <strong>{node}</strong>;
	return node;
}

export function InkText({ text, animate }: { text: string; animate: boolean }) {
	// Each word's delay, fixed when it first shows, so a re-render never restarts it.
	const delays = useRef<number[]>([]);
	const step = useRef<number | null>(null);
	const paragraphs = text.split(/\n{2,}/).map(inkTokens);
	if (!animate) return <>{paragraphs.map((tokens, i) => <span key={i} className="nb-words">{tokens.map((t, j) => <InkPiece key={j} token={t} />)}</span>)}</>;
	const total = paragraphs.reduce((n, tokens) => n + tokens.length, 0);
	step.current ??= inkStepMs(total);
	const before = delays.current.length;
	for (let at = before; at < total; at++) delays.current.push((at - before) * step.current);
	let index = 0;
	return (
		<>
			{paragraphs.map((tokens, i) => (
				<span key={i} className="nb-words">
					{tokens.map((token, j) => (
						<span key={j} className="nb-ink-word" style={{ animationDelay: `${Math.round(delays.current[index++] ?? 0)}ms` }}>{tokenNode(token)}</span>
					))}
				</span>
			))}
		</>
	);
}

function InkPiece({ token }: { token: InkToken }) {
	return <>{tokenNode(token)}</>;
}
