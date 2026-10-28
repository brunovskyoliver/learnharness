/** A plain-text teaser: unwrap math, flatten common LaTeX, drop emphasis.
 *  Math-free on purpose (no KaTeX): Home renders it in its startup bundle,
 *  so the display-only math repair runs where the text is produced — the
 *  dock's teaserText (question-dock.tsx) and the waiting projection. */
export function teaserPlain(q: string): string {
	return q
		.replace(/\\\(([\s\S]*?)\\\)/g, "$1") // \(...\) inline math
		.replace(/\\\[([\s\S]*?)\\\]/g, "$1") // \[...\] display math
		.replace(/\$\$?([^$]*)\$\$?/g, "$1") // standard $...$/$$...$$ math
		.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
		.replace(/\\([a-zA-Z]+)/g, "$1")
		.replace(/[{}]/g, "")
		.replace(/(\*\*|__)(.+?)\1/g, "$2") // bold
		.replace(/(^|\W)[*_](\S.*?)[*_](?=\W|$)/g, "$1$2") // italic
		.replace(/\s+/g, " ")
		.trim();
}

/** The teaser as inline nodes: `code` spans render as inline code instead
 *  of raw backticks (ui-v2); everything else is plain text. */
export function Teaser({ text }: { text: string }) {
	return text.split(/(`[^`]+`)/g).map((part, i) =>
		part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
			<code key={i} className="rounded bg-muted px-[0.3em] font-mono text-[0.9em]">
				{part.slice(1, -1)}
			</code>
		) : (
			part
		),
	);
}
