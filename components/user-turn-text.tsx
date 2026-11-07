"use client";

/** The learner's sent text. A passage from a PDF shows as a quote with its citation,
 *  not as the marked block the model reads (feature 020). */
import { citationHref, userTextRuns } from "@/src/core";

export function UserTurnText({ text }: { text: string }) {
	return (
		<>
			{userTextRuns(text).map((run, index) => ("text" in run ? <span key={index}>{run.text}</span> : (
				<span key={index} className="block" data-testid="user-passage">
					<span className="block pl-4 italic text-graphite">{run.passage}</span>
					<a href={citationHref(run.citation)} className="ml-4 text-meta text-ink underline decoration-ink/40 underline-offset-[3px] hover:decoration-ink">Sent from page {run.citation.page}</a>
				</span>
			)))}
		</>
	);
}

/** The learner's turn in the transcript (feature 025, research R9): no
 *  bubble and no raised block. His words in Instrument Sans at the note size
 *  in graphite, on the tutor's reading edge; "You" is a faint 12px meta line,
 *  which also names the row. Rendered plain: the model's LaTeX pipeline is
 *  not applied to learner-authored text ($ stays $). */
export function UserTurn({ text, before }: { text: string; before?: React.ReactNode }) {
	return (
		<div data-testid="user-message" className="lh-reading lh-user-turn my-2 font-sans">
			<div className="mb-1 text-xs text-faint">You</div>
			{before}
			<div className="lh-prose whitespace-pre-wrap">
				<UserTurnText text={text} />
			</div>
		</div>
	);
}
