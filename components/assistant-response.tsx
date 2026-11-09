"use client";

import { memo, useRef, type HTMLAttributes } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { CopyCorner } from "@/components/md-blocks";
import { copySource } from "@/components/reference-text";
import { TutorChipsProvider, tutorComponents, useTutorChips } from "@/components/tutor-chips";
import { cn } from "@/lib/utils";

/** Keep response copying scoped to the prose source, outside rendered math,
 * code controls, reasoning, and tool cards. Reserve the action's space so
 * hovering never moves the lesson. The tutor's words are in the voice
 * (feature 025, research R9: `.nb-voice` + `.lh-voice`) and ink in while
 * they stream. Library links and resolving `@name`s are chips (feature 027,
 * US3); `chipScope` (`{messageId}:t{part}`) keys them for the return point. */
export const AssistantResponse = memo(function AssistantResponse({
	source,
	streaming = false,
	className,
	chipScope,
	...props
}: HTMLAttributes<HTMLDivElement> & { source: string; streaming?: boolean; chipScope?: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const chips = useTutorChips(source, ref, chipScope);
	return (
		<div ref={ref} className={cn("group/response lh-bleed lh-reading", className)} onCopy={chips.ready ? copySource : undefined} {...props}>
			<TutorChipsProvider value={chips.value}>
				<MessageResponse className={cn("nb-voice lh-voice", chips.ready && "lh-refs-ready")} streaming={streaming} inkIn prepare={chips.prepare} components={tutorComponents}>{source}</MessageResponse>
			</TutorChipsProvider>
			{source.trim() && (
				<div
					data-testid="response-actions"
					className="pointer-events-none mt-2 flex h-6 select-none items-center opacity-0 transition-opacity duration-100 group-hover/response:pointer-events-auto group-hover/response:opacity-100 group-focus-within/response:pointer-events-auto group-focus-within/response:opacity-100 motion-reduce:transition-none"
				>
					<CopyCorner label="Copy response" getText={() => source} visible />
				</div>
			)}
		</div>
	);
});
