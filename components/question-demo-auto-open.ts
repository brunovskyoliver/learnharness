"use client";

import { useEffect, useRef } from "react";
import { usePagePane } from "@/components/workspace/pane-context";

/** A question's automatic demo opens once, unless a page is open (DESIGN.md, Page pane). */
export function useQuestionDemoAutoOpen(toolCallId: string | undefined, demo: { id: string; panel?: number } | null, open: (id: string, panel?: number) => void) {
	const pane = usePagePane();
	const pageIsOpen = !!pane?.item;
	// A child's effect runs before the provider's, so on a client render the saved page isn't
	// known yet, and opening a demo would close it for good.
	const settled = pane ? pane.restored : true;
	const opened = useRef<string | null>(null);
	useEffect(() => {
		if (!settled || !toolCallId || opened.current === toolCallId || !demo) return;
		// A question's automatic open doesn't replace an open page; its "Using" link stays.
		if (pageIsOpen) { opened.current = toolCallId; return; }
		// Backfill runs outside React's effect to avoid flushSync during commit.
		const timer = window.setTimeout(() => { opened.current = toolCallId; open(demo.id, demo.panel); }, 0);
		return () => window.clearTimeout(timer);
	}, [settled, toolCallId, demo?.id]);
}
