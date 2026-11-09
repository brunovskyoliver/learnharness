"use client";

/**
 * Feature 028, row 24: a status line's words change in place. The new words
 * settle (200ms) while the old ones lift (120ms) in the same grid cell, so
 * the swap never stacks two lines. The old words are a pseudo-element with
 * empty alternative text: never in the text content or the accessibility
 * tree, so the live region announces the new words only.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
/** The settle (200ms) and the lift (120ms), with margin. */
const SWAP_MS = 260;

export function StatusSwap({ swapKey, text, appear = false, children }: {
	/** What the line says, as a state: a change of it is a swap (the minute in "Synced 3 min ago" is not). */
	swapKey: string;
	/** The words as plain text, for the lift when they go. */
	text: string;
	/** Settle on mount too (a notice that appears is a change of the line). */
	appear?: boolean;
	children: ReactNode;
}) {
	const last = useRef<{ key: string; text: string } | null>(null);
	const [swap, setSwap] = useState<{ was: string | null } | null>(null);
	useIsoLayoutEffect(() => {
		const before = last.current;
		last.current = { key: swapKey, text };
		if (before ? before.key !== swapKey : appear) setSwap({ was: before?.text ?? null });
	}, [swapKey]);
	useIsoLayoutEffect(() => { if (last.current) last.current.text = text; }, [text]);
	useEffect(() => {
		if (!swap) return;
		const timer = window.setTimeout(() => setSwap(null), SWAP_MS);
		return () => window.clearTimeout(timer);
	}, [swap]);
	return (
		<span className="lh-status" data-was={swap?.was || undefined}>
			<span key={swapKey} className="lh-status-now" data-lh-status={swap ? "" : undefined}>{children}</span>
		</span>
	);
}
