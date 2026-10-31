"use client";

import { useLayoutEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { useSessionStateStore } from "./session-state";
import { transcriptAnchorAt } from "./transcript-window";

interface ReadingAnchor { id: string; offset: number; top: number; bottom: boolean }
function readingAnchor(value: unknown): ReadingAnchor | null {
	if (!value || typeof value !== "object") return null;
	const anchor = value as ReadingAnchor;
	return typeof anchor.id === "string" && Number.isFinite(anchor.offset) && Number.isFinite(anchor.top) && typeof anchor.bottom === "boolean" ? anchor : null;
}

const ANCHORS = "[data-answer-part-id], [id^='message-']";

/** One mount owner for scroll arrival. Stable anchors survive reflow and new
 * messages; resize correction ends immediately on a reader's own gesture. */
export function SessionReadingState() {
	const store = useSessionStateStore();
	const context = useStickToBottomContext();
	const current = useRef(context);
	current.current = context;
	useLayoutEffect(() => {
		const main = current.current.scrollRef.current;
		const content = current.current.contentRef.current;
		if (!main || !content || !store) return;
		const saved = readingAnchor(store.get("reading"));
		let restoring = Boolean(saved && !window.location.hash);
		let ready = Boolean(window.location.hash);
		let disposed = false;
		let frame = 0;
		const visible = () => main.isConnected && main.clientHeight > 0 && main.getClientRects().length > 0;
		const capture = () => {
			if (!ready || restoring || !visible()) return;
			const edge = main.getBoundingClientRect().top;
			const anchor = transcriptAnchorAt(main, edge + 16, ANCHORS);
			store.set("reading", { id: anchor ? anchor.dataset.answerPartId ?? anchor.id : "", offset: anchor ? anchor.getBoundingClientRect().top - edge : -main.scrollTop, top: main.scrollTop, bottom: main.scrollHeight - main.clientHeight - main.scrollTop <= 2 } satisfies ReadingAnchor);
		};
		const restore = () => {
			if (!restoring || !saved || !visible()) return;
			if (window.location.hash) { restoring = false; ready = true; return; }
			current.current.stopScroll();
			const anchor = saved.id ? main.querySelector(`[data-answer-part-id="${CSS.escape(saved.id)}"], [id="${CSS.escape(saved.id)}"]`) : null;
			const target = saved.bottom ? main.scrollHeight - main.clientHeight : anchor ? main.scrollTop + anchor.getBoundingClientRect().top - main.getBoundingClientRect().top - saved.offset : saved.top;
			main.scrollTop = Math.max(0, target);
			current.current.state.scrollTop = main.scrollTop;
			ready = true;
			main.dataset.sessionRestored = "true";
		};
		const update = () => {
			if (disposed || !restoring) return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(restore);
		};
		const interrupt = (event?: Event) => {
			if (!restoring) return;
			restoring = false;
			ready = true;
		};
		const key = (event: KeyboardEvent) => {
			if (["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", " "].includes(event.key)) interrupt();
		};
		const scroll = () => {
			if (restoring) return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(capture);
		};
		const flush = () => {
			// Next may hide a cached route through React Activity before cleanup.
			// Hidden/detached scrollers report zero; retain the last visible sample.
			// StrictMode can also reset geometry between restoration and cleanup.
			// Never replace a saved anchor until the reader takes control.
			if (!restoring && visible()) capture();
			store.flush();
		};
		const beforeNavigation = (event: PointerEvent) => {
			if (!main.parentElement?.contains(event.target as Node)) flush();
		};
		if (restoring) restore();
		else if (!window.location.hash) void Promise.resolve(current.current.scrollToBottom({ animation: "instant" })).then(() => { if (!disposed) ready = true; });
		const observer = new ResizeObserver(update);
		observer.observe(content);
		observer.observe(main);
		const mutations = new MutationObserver(update);
		mutations.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "data-state"] });
		// Fonts, saved expanded sections and async diagrams settle after hydration.
		void document.fonts.ready.then(update);
		const settle = setTimeout(() => {
			if (restoring) {
				restore();
				// Keep an anchored reader steady through late fonts/diagrams
				// until their first gesture. Bottom readers resume live follow.
				if (saved?.bottom) restoring = false;
				if (saved?.bottom) void current.current.scrollToBottom({ animation: "instant" });
			}
		}, 2000);
		main.addEventListener("scroll", scroll, { passive: true });
		main.parentElement?.addEventListener("wheel", interrupt, { passive: true });
		main.parentElement?.addEventListener("pointerdown", interrupt);
		main.parentElement?.addEventListener("touchstart", interrupt, { passive: true });
		main.addEventListener("lh:manual-navigation", interrupt);
		window.addEventListener("keydown", key);
		window.addEventListener("hashchange", interrupt);
		document.addEventListener("pointerdown", beforeNavigation, true);
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", flush);
		return () => {
			disposed = true;
			clearTimeout(settle);
			observer.disconnect();
			mutations.disconnect();
			cancelAnimationFrame(frame);
			flush();
			main.removeEventListener("scroll", scroll);
			main.parentElement?.removeEventListener("wheel", interrupt);
			main.parentElement?.removeEventListener("pointerdown", interrupt);
			main.parentElement?.removeEventListener("touchstart", interrupt);
			main.removeEventListener("lh:manual-navigation", interrupt);
			window.removeEventListener("keydown", key);
			window.removeEventListener("hashchange", interrupt);
			document.removeEventListener("pointerdown", beforeNavigation, true);
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", flush);
		};
	}, [store]);
	return null;
}
