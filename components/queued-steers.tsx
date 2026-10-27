/**
 * THE QUEUED-STEER INDICATOR (owner spec 2026-10-03, restyled in feature
 * 001): steers sent but not yet drained render as quiet rows ABOVE the
 * composer shell, right-aligned and truncated.
 *
 * A line dies the moment its card lands in the transcript: the drain's
 * verbatim message events upsert the real user card by the client-minted
 * id, and visibleQueuedSteers (session-core, pure) filters the queue
 * against the message ids. A steer parked server-side (stranded behind a
 * question) keeps its line — an honest "waiting for the next run".
 */
export interface QueuedSteerLine {
	id: string;
	text: string;
}

/** The pure body (SSR-pinnable): one right-aligned row per queued steer
 *  (feature 001). Rows carry no remove control: a steer is handed to the
 *  live agent the moment it posts, and no cancel route exists. */
export function QueuedSteersBody({ steers }: { steers: QueuedSteerLine[] }) {
	if (steers.length === 0) return null;
	return (
		<div className="flex flex-col items-end gap-1 pb-1.5" data-testid="queued-steers">
			{steers.map((s) => (
				<span
					key={s.id}
					title={s.text}
					className="flex max-w-[80%] items-center gap-2 rounded-sm bg-card px-2.5 py-1.5 text-sm text-ink-2"
				>
					<span className="shrink-0 text-muted-foreground">Queued</span>
					<span className="min-w-0 truncate">{s.text}</span>
				</span>
			))}
		</div>
	);
}
