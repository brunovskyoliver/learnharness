"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Present one iframe inline, beside a question, or in the browser's modal
 * top layer. Never reparent its DOM node or replace its srcDoc. */
export function useDemoPresentation(dialog: RefObject<HTMLDialogElement | null>, frame: RefObject<HTMLIFrameElement | null>, workspace: boolean, focused: boolean, focusOrigin: RefObject<{ left: number; top: number; width: number; height: number } | null>, focusInvoker: RefObject<HTMLElement | null>) {
	const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
	const inlineBounds = useRef<DOMRect | null>(null);
	useLayoutEffect(() => { if (!focused && dialog.current) inlineBounds.current = dialog.current.getBoundingClientRect(); });
	useLayoutEffect(() => {
		if (!workspace || focused) return;
		const slot = document.querySelector<HTMLElement>("[data-demo-slot]");
		if (!slot) return;
		const measure = () => {
			const r = slot.getBoundingClientRect();
			setBounds({ left: r.left, top: r.top, width: r.width, height: r.height });
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(slot);
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
	}, [workspace, focused]);

	useLayoutEffect(() => {
		const el = dialog.current;
		if (!el || !focused) return;
		const origin = focusOrigin.current ?? inlineBounds.current ?? el.getBoundingClientRect();
		const invoker = focusInvoker.current;
		const lesson = document.querySelector<HTMLElement>('[data-testid="lesson-content"]');
		let scroller = lesson?.parentElement ?? null;
		while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
		scroller?.dispatchEvent(new Event("lh:demo-focus"));
		const top = scroller?.scrollTop;
		el.close();
		el.showModal();
		if (!matchMedia("(prefers-reduced-motion: reduce)").matches && origin.width) {
			el.animate([{ transform: `translate(${origin.left}px, ${origin.top}px) scale(${origin.width / innerWidth}, ${origin.height / innerHeight})`, transformOrigin: "top left", opacity: .8 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
		}
		return () => {
			el.close();
			el.show();
			const restore = () => { if (scroller?.isConnected && top !== undefined) scroller.scrollTop = top; };
			restore();
			requestAnimationFrame(() => requestAnimationFrame(restore));
			requestAnimationFrame(() => {
				const active = document.activeElement;
				if (active !== document.body && active !== invoker && active && !el.contains(active)) return;
				const target = invoker?.isConnected ? invoker : document.querySelector<HTMLElement>('[data-demo-actions] [aria-label="Expand demo"]');
				target?.focus({ preventScroll: true });
			});
			frame.current?.contentWindow?.postMessage({ type: "lh-demo-focus", panel: null }, "*");
		};
	}, [dialog, frame, focused, focusOrigin, focusInvoker]);
	return workspace && !focused ? bounds : null;
}
