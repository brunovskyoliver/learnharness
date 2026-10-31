"use client";

import { snippetRuns, type DocSnippet } from "@/src/core";

/** A hit's text with the match marked: text nodes and <mark> only, so nothing in
 *  a document can become markup here. */
export function DocSnippetText({ snippet, className }: { snippet: DocSnippet; className?: string }) {
	return (
		<span className={className} data-testid="doc-snippet">
			{snippet.before && "… "}
			{snippetRuns(snippet).map((run, index) => (run.match ? <mark key={index} className="lh-doc-mark">{run.text}</mark> : <span key={index}>{run.text}</span>))}
			{snippet.after && " …"}
		</span>
	);
}

/** Where a hit lands, in words. */
export function docHitPlace(jump: { page?: number; line?: number } | null): string | null {
	if (jump?.page !== undefined) return `Page ${jump.page}`;
	if (jump?.line !== undefined) return `Line ${jump.line}`;
	return null;
}
