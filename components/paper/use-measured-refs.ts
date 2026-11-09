"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Elements by thread id, each watched for size changes (a thread opening,
 * an answer growing); `bump` moves when one changes. The ref callbacks are
 * stable per id, so a re-render never re-observes.
 */
export function useMeasuredRefs(): { elements: Map<string, HTMLDivElement>; refFor: (id: string) => (el: HTMLDivElement | null) => void; bump: number } {
	const [bump, setBump] = useState(0);
	const elements = useRef(new Map<string, HTMLDivElement>()).current;
	const callbacks = useRef(new Map<string, (el: HTMLDivElement | null) => void>()).current;
	const observer = useRef<ResizeObserver | null>(null);
	useEffect(() => () => observer.current?.disconnect(), []);
	const refFor = (id: string) => {
		let fn = callbacks.get(id);
		if (!fn) {
			fn = (el) => {
				if (typeof ResizeObserver !== "undefined") observer.current ??= new ResizeObserver(() => setBump((n) => n + 1));
				const before = elements.get(id);
				if (before && before !== el) observer.current?.unobserve(before);
				if (el) { elements.set(id, el); observer.current?.observe(el); } else { elements.delete(id); callbacks.delete(id); }
			};
			callbacks.set(id, fn);
		}
		return fn;
	};
	return { elements, refFor, bump };
}
