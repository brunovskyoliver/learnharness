"use client";

/** The learner's sent text. A passage from a PDF shows as a quote with its citation,
 *  not as the marked block the model reads (feature 020). */
import { citationHref, userTextRuns } from "@/src/core";

export function UserTurnText({ text }: { text: string }) {
	return (
		<>
			{userTextRuns(text).map((run, index) => ("text" in run ? <span key={index}>{run.text}</span> : (
				<span key={index} className="block" data-testid="user-passage">
					<span className="block rounded-md bg-paper px-2 py-1 text-graphite">{run.passage}</span>
					<a href={citationHref(run.citation)} className="text-sm underline decoration-ink/40 underline-offset-2">Sent from page {run.citation.page}</a>
				</span>
			)))}
		</>
	);
}
