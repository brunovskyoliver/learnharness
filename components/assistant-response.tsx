"use client";

import { memo, type HTMLAttributes } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { CopyCorner } from "@/components/md-blocks";
import { cn } from "@/lib/utils";

/** Keep response copying scoped to the prose source, outside rendered math,
 * code controls, reasoning, and tool cards. Reserve the action's space so
 * hovering never moves the lesson. */
export const AssistantResponse = memo(function AssistantResponse({
	source,
	streaming = false,
	className,
	...props
}: HTMLAttributes<HTMLDivElement> & { source: string; streaming?: boolean }) {
	return (
		<div className={cn("group/response", className)} {...props}>
			<MessageResponse streaming={streaming}>{source}</MessageResponse>
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
