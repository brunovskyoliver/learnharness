"use client";

import { useEffect, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";

/** Read-only rendering for History only: the app's Markdown and math, and bold
 *  demo titles link through DemoPanelContext as in chat, plain outside a chat.
 *  Holds for 200 ms so walking the list doesn't render every version. */
export function PagePreview({ content }: { content: string }) {
	const [shown, setShown] = useState(content);
	useEffect(() => {
		const timer = window.setTimeout(() => setShown(content), 200);
		return () => window.clearTimeout(timer);
	}, [content]);
	return <div data-testid="page-preview" className="min-w-0"><MessageResponse>{shown}</MessageResponse></div>;
}
