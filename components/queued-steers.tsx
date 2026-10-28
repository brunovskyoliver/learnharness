import { XIcon } from "lucide-react";

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
 *
 * Feature 002: each row has a × that withdraws the steer before delivery
 * (DELETE /api/chats/[id]/steer/[steerId]) — no confirmation, no undo. A
 * steer the agent already had comes back as "Already sent" until its card
 * lands; a failed removal comes back as "Could not remove" (× retries).
 */
export interface QueuedSteerLine {
	id: string;
	text: string;
	/** "Already sent" or "Could not remove" after a removal attempt. */
	note?: string;
}

/** The pure body (SSR-pinnable): one right-aligned row per queued steer. */
export function QueuedSteersBody({ steers, onRemove }: { steers: QueuedSteerLine[]; onRemove?: (id: string) => void }) {
	if (steers.length === 0) return null;
	return (
		<div className="flex flex-col items-end gap-1 pb-1.5" data-testid="queued-steers">
			{steers.map((s) => {
				const sent = s.note === "Already sent";
				return (
					<span
						key={s.id}
						title={s.text}
						data-testid="queued-steer"
						className="flex max-w-[85%] items-center gap-2 rounded-sm bg-card py-0.5 pl-2.5 pr-0.5 text-sm text-ink-2"
					>
						<span className="shrink-0 text-muted-foreground">Queued</span>
						<span className="min-w-0 truncate py-1">{s.text}</span>
						{s.note && <span role="status" className={sent ? "shrink-0 pr-2 text-muted-foreground" : "shrink-0 text-destructive"}>{s.note}</span>}
						{onRemove && !sent && (
							<button
								type="button"
								onClick={() => onRemove(s.id)}
								aria-label={`Remove queued message: ${s.text}`}
								data-testid="queued-steer-remove"
								className="flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11"
							>
								<XIcon aria-hidden="true" className="size-3.5" />
							</button>
						)}
					</span>
				);
			})}
		</div>
	);
}
