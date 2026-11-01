"use client";

import { MessageResponse } from "@/components/ai-elements/message";

/** A card side: Markdown and math, as in a lesson, at reading size. */
export function CardText({ text, className }: { text: string; className?: string }) {
	return <div className={`min-w-0 text-lg leading-[27px] [overflow-wrap:anywhere] ${className ?? ""}`}><MessageResponse>{text}</MessageResponse></div>;
}
