"use client";

import { copySource, ReferenceText } from "@/components/reference-text";
import type { LibraryReference } from "@/src/core";
import { useArrival, useArrivedMessage } from "@/components/paper/motion-arrival";

/** The learner's sent text. His references are chips (feature 027, R6): a
 *  passage from a page or a PDF is carried by its chip, not shown again as a
 *  quote, and a PDF passage's page is the chip's "· p. {n}". */
export function UserTurnText({ text, references = [], messageId = "" }: { text: string; references?: readonly LibraryReference[]; messageId?: string }) {
	return <ReferenceText text={text} references={references} messageId={messageId} />;
}

/** The learner's turn in the transcript (feature 025, research R9): no
 *  bubble and no raised block. His words in Instrument Sans at the note size
 *  in graphite, on the tutor's reading edge; "You" is a faint 12px meta line,
 *  which also names the row. Rendered plain: the model's LaTeX pipeline is
 *  not applied to learner-authored text ($ stays $). */
export function UserTurn({ text, before, references = [], messageId = "", arrivalId }: {
	text: string; before?: React.ReactNode; references?: readonly LibraryReference[]; messageId?: string;
	/** Its record id when it sits at the transcript's end: a turn he just sent settles in (feature 028, row 17). */
	arrivalId?: string;
}) {
	// Settled history never animates; a turn sent while the lesson is open settles once.
	const sent = useArrivedMessage(arrivalId);
	const { arrivalProps } = useArrival(`turn:${arrivalId}`, sent);
	return (
		<div data-testid="user-message" className="lh-reading lh-user-turn my-2 font-sans" {...arrivalProps}>
			<div className="mb-1 text-xs text-faint">You</div>
			{before}
			<div className="lh-prose whitespace-pre-wrap" onCopy={copySource}>
				<UserTurnText text={text} references={references} messageId={messageId} />
			</div>
		</div>
	);
}
