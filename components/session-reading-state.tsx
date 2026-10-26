"use client";

import { useLayoutEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { useSessionStateStore } from "./session-state";

interface ReadingAnchor { id: string; offset: number; top: number; bottom: boolean }
function readingAnchor(value: unknown): ReadingAnchor | null {
	if (!value || typeof value !== "object") return null;
	const anchor = value as ReadingAnchor;
	return typeof anchor.id === "string" && Number.isFinite(anchor.offset) && Number.isFinite(anchor.top) && typeof anchor.bottom === "boolean" ? anchor : null;
}

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
		let dirty = false;
		let positions: Array<{ id: string; top: number }> = [];
		const visible = () => main.isConnected && main.clientHeight > 0 && main.getClientRects().length > 0;
		const measure = () => {
			if (!visible()) return;
			const edge = main.getBoundingClientRect().top;
			positions = [...main.querySelectorAll<HTMLElement>("[data-answer-part-id], [id^='message-']")].map((element) => ({ id: element.dataset.answerPartId ?? element.id, top: main.scrollTop + element.getBoundingClientRect().top - edge }));
		};
		const capture = () => {
			if (!ready || restoring || !visible()) return;
			if (dirty) { measure(); dirty = false; }
			let low = 0, high = positions.length;
			while (low < high) {
				const mid = (low + high) >>> 1;
				if (positions[mid]!.top <= main.scrollTop + 16) low = mid + 1; else high = mid;
			}
			const anchor = positions[Math.max(0, low - 1)];
			store.set("reading", { id: anchor?.id ?? "", offset: (anchor?.top ?? 0) - main.scrollTop, top: main.scrollTop, bottom: main.scrollHeight - main.clientHeight - main.scrollTop <= 2 } satisfies ReadingAnchor);
		};
		const restore = () => {
			if (!restoring || !saved || !visible()) return;
			if (window.location.hash) { restoring = false; ready = true; return; }
			current.current.stopScroll();
			const anchor = positions.find((position) => position.id === saved.id);
			const target = saved.bottom ? main.scrollHeight - main.clientHeight : anchor ? anchor.top - saved.offset : saved.top;
			main.scrollTop = Math.max(0, target);
			current.current.state.scrollTop = main.scrollTop;
			ready = true;
			main.dataset.sessionRestored = "true";
		};
		const update = () => {
			if (disposed) return;
			dirty = true;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => { measure(); dirty = false; if (restoring) restore(); });
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
			if (!restoring && visible()) { measure(); capture(); }
			store.flush();
		};
		const beforeNavigation = (event: PointerEvent) => {
			if (!main.parentElement?.contains(event.target as Node)) flush();
		};
		measure();
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
				measure(); restore();
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
