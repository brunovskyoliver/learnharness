"use client";

import { Component, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { StickToBottomContext } from "use-stick-to-bottom";
import { messageAnchorId, messageIdFromHash, type LhViewMessage } from "@/src/core";
import { useSessionStateStore } from "@/components/session-state";
import { FULL_TRANSCRIPT_EVENT, unitOffsets, unitOfAnchor, windowStart } from "@/components/transcript-window";

function whenIdle(run: () => void): () => void {
	if (typeof window.requestIdleCallback === "function") {
		const id = window.requestIdleCallback(run, { timeout: 400 });
		return () => window.cancelIdleCallback(id);
	}
	const id = window.setTimeout(run, 16);
	return () => window.clearTimeout(id);
}

/** The deferred-prefix state of a transcript (components/transcript-window.ts).
 * SSR and hydration render the same tail; idle chunks then mount the rest. */
export function useTranscriptWindow(messages: readonly LhViewMessage[]) {
	const store = useSessionStateStore();
	const offsets = useMemo(() => unitOffsets(messages), [messages]);
	const [from, setFrom] = useState(() => windowStart(messages, offsets[messages.length]!));
	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	// Arrival above the tail (a #message- link, or a saved reading position
	// mid-session): mount from a budget above that anchor before paint, so
	// the reading-state restore and the hash jump find their element. An
	// anchor no longer in the view renders the whole session.
	useLayoutEffect(() => {
		const view = messagesRef.current;
		const hashId = messageIdFromHash(window.location.hash);
		const saved = store?.get("reading") as { id?: unknown; bottom?: unknown } | undefined;
		const anchor = hashId
			? messageAnchorId(hashId)
			: saved?.bottom === false && typeof saved.id === "string" && saved.id ? saved.id : null;
		if (!anchor) return;
		const unit = unitOfAnchor(view, anchor);
		setFrom((current) => Math.min(current, unit < 0 ? 0 : windowStart(view, unit)));
	}, [store]);

	// Find and the turn rail need every message: render it all, synchronously.
	useEffect(() => {
		const full = () => flushSync(() => setFrom(0));
		window.addEventListener(FULL_TRANSCRIPT_EVENT, full);
		return () => window.removeEventListener(FULL_TRANSCRIPT_EVENT, full);
	}, []);

	const extend = useCallback(() => {
		startTransition(() => setFrom((current) => windowStart(messagesRef.current, current)));
	}, []);

	// Backfill: one chunk per idle period until the session is whole.
	useEffect(() => {
		if (from <= 0) return;
		return whenIdle(extend);
	}, [from, extend]);

	return { from, offsets, extend };
}

/** Sits above the first rendered message; scrolling near it mounts the next
 * chunk now instead of at the next idle period. Keyed by the window start,
 * so every chunk re-observes. */
export function TranscriptBackfillSentinel({ contextRef, onNear }: {
	contextRef: RefObject<StickToBottomContext | null>;
	onNear: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const node = ref.current;
		const root = contextRef.current?.scrollRef.current ?? null;
		if (!node || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) onNear();
		}, { root, rootMargin: "2000px 0px 0px 0px" });
		observer.observe(node);
		return () => observer.disconnect();
	}, [contextRef, onNear]);
	return <div ref={ref} aria-hidden data-testid="transcript-backfill" className="h-px w-full shrink-0" />;
}

/** Keeps the reader's place when older messages mount above: the scroll
 * position moves by exactly the height that was inserted. A class for
 * getSnapshotBeforeUpdate — the one hook that reads layout right before
 * React mutates the DOM. Writes through use-stick-to-bottom's scrollTop
 * setter so the library does not take the jump for a gesture. */
export class TranscriptScrollKeeper extends Component<{
	from: number;
	contextRef: RefObject<StickToBottomContext | null>;
	children: ReactNode;
}> {
	getSnapshotBeforeUpdate(previous: Readonly<{ from: number }>): { height: number; top: number; bottom: boolean } | null {
		if (previous.from <= this.props.from) return null;
		const context = this.props.contextRef.current;
		const element = context?.scrollRef.current;
		return context && element ? { height: element.scrollHeight, top: element.scrollTop, bottom: context.isAtBottom } : null;
	}

	componentDidUpdate(_previous: unknown, _state: unknown, snapshot: { height: number; top: number; bottom: boolean } | null): void {
		const context = this.props.contextRef.current;
		const element = context?.scrollRef.current;
		if (!snapshot || !context || !element) return;
		const inserted = element.scrollHeight - snapshot.height;
		if (inserted <= 0) return;
		// A reader following the bottom lands on it outright; the library's
		// smooth resize would otherwise creep after every chunk.
		context.state.scrollTop = snapshot.bottom ? element.scrollHeight - element.clientHeight : snapshot.top + inserted;
	}

	render() {
		return this.props.children;
	}
}

/** Server HTML opens at the bottom (or wherever the reader was): this runs
 * while the page is still parsing, before first paint, instead of jumping
 * once hydration mounts the reading-state owner. It first sizes the dock
 * spacer from the real dock (the server only has an estimate), so the
 * measured reserve does not move the transcript after hydration. A hash
 * link or a saved mid-session position is left to that owner. Rendered
 * only for server HTML and its hydration (the server snapshot); a client
 * navigation never creates it, since React would not run it anyway. */
const noSubscribe = () => () => {};
export function TranscriptArrivalScript({ storageKey, gradientHeight, flowDock = false }: { storageKey: string | undefined; gradientHeight: number; flowDock?: boolean }) {
	const fromServer = useSyncExternalStore(noSubscribe, () => false, () => true);
	if (!fromServer) return null;
	const script = `(function(){try{var c=document.querySelector('[data-testid="lesson-content"]');if(!c)return;var d=document.querySelector('[data-dock-block]'),p=document.querySelector('[data-testid="dock-spacer"]');if(d&&p&&${!flowDock}){var h=d.getBoundingClientRect().height+${gradientHeight};if(h>parseFloat(p.style.height||"0"))p.style.height=h+"px"}if(location.hash)return;var k=${JSON.stringify(storageKey ?? "")};var r=k&&localStorage.getItem(k);var v=r&&JSON.parse(r);var s=v&&v.values&&v.values.reading;if(s&&s.bottom===false)return;for(var e=c.parentElement;e;e=e.parentElement){var o=getComputedStyle(e).overflowY;if(o==="auto"||o==="scroll"){e.scrollTop=e.scrollHeight;return}}}catch(_){}})()`;
	return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
