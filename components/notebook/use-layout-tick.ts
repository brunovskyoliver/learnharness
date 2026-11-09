"use client";

/**
 * One counter that moves (at most once per frame) whenever Notebook's
 * margin may need to be measured again: the text changed, the AI marks
 * changed, the column or editor resized, the window resized, fonts loaded.
 */
import { useEffect, useState } from "react";
import type { NoteBridge } from "./nb-plugins";

export function useLayoutTick(bridge: NoteBridge, column: HTMLElement | null): number {
	const [tick, setTick] = useState(0);
	useEffect(() => {
		let frame = 0;
		const bump = () => {
			if (frame) return;
			frame = window.requestAnimationFrame(() => {
				frame = 0;
				setTick((n) => n + 1);
			});
		};
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(bump);
		if (column) observer?.observe(column);
		let observed: Element | null = null;
		const follow = () => {
			const dom = bridge.view?.dom ?? null;
			if (dom === observed) return;
			if (observed) observer?.unobserve(observed);
			observed = dom;
			if (dom) observer?.observe(dom);
		};
		follow();
		const off = bridge.subscribe((event) => {
			if (event === "composition-start" || event === "composition-end" || event === "edit") return;
			if (event === "view") follow();
			bump();
		});
		window.addEventListener("resize", bump);
		void document.fonts?.ready.then(bump);
		bump();
		return () => {
			off();
			observer?.disconnect();
			window.removeEventListener("resize", bump);
			if (frame) window.cancelAnimationFrame(frame);
		};
	}, [bridge, column]);
	return tick;
}
