"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import type { LhViewMessage } from "@/src/core";
import { animateDockScroll } from "@/components/dock-motion";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function textIds(messages: readonly LhViewMessage[]): string[] {
	return messages.flatMap((message) => message.role === "assistant"
		? message.parts.filter((part) => part.type === "text" && part.text?.trim() && part.id).map((part) => part.id!)
		: []);
}

/** Finish at the answer's beginning, while respecting a reader who left the
 * live tail. Temporary tail space lets short answers reach the same position. */
export function TurnReadingPosition({ busy, messages, onReserve }: {
	busy: boolean;
	messages: readonly LhViewMessage[];
	onReserve: (height: number) => void;
}) {
	const context = useStickToBottomContext();
	const current = useRef(context);
	current.current = context;
	const ids = textIds(messages);
	const latestIds = useRef(ids);
	latestIds.current = ids;
	const previousIds = useRef(new Set(ids));
	const turn = useRef<{ active: boolean; before: Set<string> }>({ active: false, before: new Set() });
	const detached = useRef(false);
	const running = useRef(busy);
	running.current = busy;
	const frames = useRef<number[]>([]);
	const motion = useRef<ReturnType<typeof animateDockScroll> | null>(null);
	const pending = useRef(false);

	useEffect(() => {
		const main = current.current.scrollRef.current;
		const root = main?.parentElement;
		if (!main || !root) return;
		let pointerScrolling = false;
		let previousScrollTop = main.scrollTop;
		const cancel = () => {
			detached.current = true;
			pending.current = false;
			for (const frame of frames.current) cancelAnimationFrame(frame);
			frames.current = [];
			motion.current?.cancel();
			motion.current = null;
		};
		const wheel = (event: WheelEvent) => {
			if ((!running.current && !pending.current) || event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
			for (let node = event.target as HTMLElement | null; node && node !== main && node !== root; node = node.parentElement) {
				if (!/auto|scroll/.test(getComputedStyle(node).overflowY) || node.scrollHeight - node.clientHeight < 2) continue;
				if (event.deltaY < 0 ? node.scrollTop > 0 : node.scrollTop < node.scrollHeight - node.clientHeight - 1) return;
			}
			if (event.deltaY < 0 || pending.current) cancel();
		};
		const scroll = () => {
			if (pointerScrolling && main.scrollTop < previousScrollTop && (running.current || pending.current)) cancel();
			previousScrollTop = main.scrollTop;
			if (running.current && main.scrollHeight - main.clientHeight - main.scrollTop < 16) detached.current = false;
		};
		const pointerDown = (event: PointerEvent) => { pointerScrolling = event.target === main; };
		const pointerUp = () => { pointerScrolling = false; };
		const manualNavigation = () => { if (running.current || pending.current) cancel(); };
		const key = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest("textarea, input, [contenteditable]")) return;
			if (["ArrowUp", "PageUp", "Home"].includes(event.key) && (running.current || pending.current)) cancel();
		};
		const touch = () => { if (running.current || pending.current) cancel(); };
		root.addEventListener("wheel", wheel, { capture: true, passive: true });
		main.addEventListener("scroll", scroll, { passive: true });
		main.addEventListener("lh:manual-navigation", manualNavigation);
		root.addEventListener("pointerdown", pointerDown);
		window.addEventListener("pointerup", pointerUp);
		root.addEventListener("touchstart", touch, { passive: true });
		window.addEventListener("keydown", key);
		return () => {
			root.removeEventListener("wheel", wheel, true);
			main.removeEventListener("scroll", scroll);
			main.removeEventListener("lh:manual-navigation", manualNavigation);
			root.removeEventListener("pointerdown", pointerDown);
			window.removeEventListener("pointerup", pointerUp);
			root.removeEventListener("touchstart", touch);
			window.removeEventListener("keydown", key);
			cancel();
		};
	}, []);

	useClientLayoutEffect(() => {
		if (busy && !turn.current.active) {
			for (const frame of frames.current) cancelAnimationFrame(frame);
			frames.current = [];
			motion.current?.cancel();
			motion.current = null;
			pending.current = false;
			turn.current = { active: true, before: previousIds.current };
			detached.current = current.current.state.escapedFromLock && !current.current.state.isAtBottom;
			onReserve(0);
		}
		if (!busy && turn.current.active) {
			const before = turn.current.before;
			turn.current.active = false;
			const main = current.current.scrollRef.current;
			if (main && !detached.current && latestIds.current.some((id) => !before.has(id))) {
				pending.current = true;
				main.dispatchEvent(new Event("lh:read-answer"));
				current.current.stopScroll();
				const findAnswer = () => {
					const id = latestIds.current.find((value) => !before.has(value));
					return [...main.querySelectorAll<HTMLElement>("[data-answer-part-id]")].find((element) => element.dataset.answerPartId === id);
				};
				frames.current.push(requestAnimationFrame(() => {
					if (detached.current) return;
					const answer = findAnswer();
					if (!answer) { pending.current = false; return; }
					const top = main.scrollTop + answer.getBoundingClientRect().top - main.getBoundingClientRect().top - 16;
					const spacer = main.querySelector<HTMLElement>('[data-testid="dock-spacer"]');
					onReserve((spacer?.getBoundingClientRect().height ?? 0) + Math.max(0, top + main.clientHeight - main.scrollHeight));
					frames.current.push(requestAnimationFrame(() => {
						if (detached.current) return;
						const animation = animateDockScroll(main, () => {
							const target = findAnswer();
							return target ? main.scrollTop + target.getBoundingClientRect().top - main.getBoundingClientRect().top - 16 : main.scrollTop;
						}, (top) => { current.current.state.scrollTop = top; }, { cancelOnExternalScroll: true });
						motion.current = animation;
						void animation.finished.then(() => { if (motion.current === animation) { pending.current = false; motion.current = null; } });
					}));
				}));
			}
		}
		previousIds.current = new Set(ids);
	}, [busy, messages, onReserve]);
	return null;
}
