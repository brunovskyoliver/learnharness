"use client";

import { useId, useState } from "react";
import { ChevronDownIcon, MessagesSquareIcon } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";

export interface FollowupContextData {
	sourceChatId: string;
	sourceTitle: string;
	goal: string;
	context: string;
}

/** Teacher-provided context is session scaffolding, separate from learner
 * messages. The source link and disclosure remain independent controls. */
export function FollowupContextCard({ data }: { data: FollowupContextData }) {
	const [open, setOpen] = useState(false);
	const bodyId = useId();
	return (
		<div data-testid="followup-context-card" className="my-2 min-w-0 max-w-full">
			<div className="flex min-w-0 select-none items-center gap-2 rounded-full bg-card px-3 py-1.5 font-ui text-xs text-muted-foreground">
				<MessagesSquareIcon aria-hidden className="size-4 shrink-0" />
				<a
					data-testid="followup-source-link"
					href={`/chat/${encodeURIComponent(data.sourceChatId)}`}
					target="_blank"
					rel="noopener noreferrer"
					title={data.sourceTitle}
					className="min-w-0 flex-1 truncate rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				>
					{data.sourceTitle}
				</a>
				<button
					type="button"
					data-testid="followup-context-toggle"
					aria-label={open ? "Collapse follow-up context" : "Expand follow-up context"}
					aria-expanded={open}
					aria-controls={bodyId}
					onClick={() => setOpen((value) => !value)}
					className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				>
					<ChevronDownIcon aria-hidden className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
				</button>
			</div>
			{open && (
				<div id={bodyId} data-testid="followup-context-body" className="mt-2 min-w-0 space-y-4 rounded-xl border border-border/70 bg-card p-4">
					<div>
						<div className="mb-1 font-ui text-xs text-muted-foreground">Goal</div>
						<MessageResponse>{data.goal}</MessageResponse>
					</div>
					<div>
						<div className="mb-1 font-ui text-xs text-muted-foreground">Context from the previous lesson</div>
						<MessageResponse>{data.context}</MessageResponse>
					</div>
				</div>
			)}
		</div>
	);
}
