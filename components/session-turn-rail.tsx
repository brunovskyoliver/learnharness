"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { sessionTurnEntries, type LhMessage, type LhViewMessage, type TurnUsage, type SessionTurnEntry } from "@/src/core";
import { animateDockScroll } from "@/components/dock-motion";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function keepMarkerInView(button: HTMLButtonElement | null) {
	const track = button?.closest<HTMLElement>(".session-turn-markers");
	if (!button || !track) return;
	const marker = button.getBoundingClientRect();
	const bounds = track.getBoundingClientRect();
	if (marker.top < bounds.top) track.scrollTop -= bounds.top - marker.top;
	else if (marker.bottom > bounds.bottom) track.scrollTop += marker.bottom - bounds.bottom;
}

/** A gutter navigator, outside the transcript's scroll flow. Only rendered
 * answer text becomes a destination; reasoning and tools stay out of previews. */
export function SessionTurnRail({ messages, nativeMessages, turns, onReserve }: {
	messages: readonly LhViewMessage[];
	nativeMessages: readonly LhMessage[];
	turns: readonly TurnUsage[];
	onReserve: (height: number) => void;
}) {
	const context = useStickToBottomContext();
	const current = useRef(context);
	current.current = context;
	const entries = useMemo(() => sessionTurnEntries(messages, nativeMessages, turns), [messages, nativeMessages, turns]);
	const [visible, setVisible] = useState("");
	const [focused, setFocused] = useState<string | null>(null);
	const nav = useRef<HTMLElement>(null);
	const frames = useRef<number[]>([]);
	const motion = useRef<ReturnType<typeof animateDockScroll> | null>(null);

	useEffect(() => {
		const main = current.current.scrollRef.current;
		const root = main?.parentElement;
		if (!main || !root) return;
		const cancel = () => {
			for (const frame of frames.current) cancelAnimationFrame(frame);
			frames.current = [];
			motion.current?.cancel();
			motion.current = null;
		};
		const wheel = (event: WheelEvent) => { if (event.deltaY && !event.ctrlKey) cancel(); };
		const key = (event: KeyboardEvent) => {
			if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", "Escape", " "].includes(event.key)) cancel();
		};
		root.addEventListener("wheel", wheel, { passive: true });
		root.addEventListener("pointerdown", cancel);
		root.addEventListener("touchstart", cancel, { passive: true });
		main.addEventListener("lh:manual-navigation", cancel);
		main.addEventListener("lh:read-answer", cancel);
		window.addEventListener("keydown", key);
		return () => {
			root.removeEventListener("wheel", wheel);
			root.removeEventListener("pointerdown", cancel);
			root.removeEventListener("touchstart", cancel);
			main.removeEventListener("lh:manual-navigation", cancel);
			main.removeEventListener("lh:read-answer", cancel);
			window.removeEventListener("keydown", key);
			cancel();
		};
	}, []);

	useEffect(() => {
		const main = current.current.scrollRef.current;
		const content = main?.firstElementChild;
		if (!main || !content) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			const anchors = new Map([...main.querySelectorAll<HTMLElement>("[data-answer-part-id]")].map((element) => [element.dataset.answerPartId, element]));
			const edge = main.getBoundingClientRect().top + 32;
			let selected = entries[0]?.id ?? "";
			for (const entry of entries) {
				const anchor = anchors.get(entry.partId);
				if (anchor && anchor.getBoundingClientRect().top <= edge) selected = entry.id;
			}
			setVisible(selected);
		};
		const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
		const observer = new ResizeObserver(schedule);
		observer.observe(content);
		main.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		schedule();
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			main.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, [entries]);

	useEffect(() => {
		const track = nav.current?.querySelector<HTMLElement>(".session-turn-markers");
		if (!track) return;
		const ensure = () => { if (!focused) keepMarkerInView(nav.current?.querySelector<HTMLButtonElement>('[aria-current="step"]') ?? null); };
		const observer = new ResizeObserver(ensure);
		observer.observe(track);
		ensure();
		return () => observer.disconnect();
	}, [visible, focused]);

	const jump = (entry: SessionTurnEntry) => {
		const main = current.current.scrollRef.current;
		if (!main) return;
		main.dispatchEvent(new Event("lh:manual-navigation"));
		current.current.stopScroll();
		const target = () => [...main.querySelectorAll<HTMLElement>("[data-answer-part-id]")].find((element) => element.dataset.answerPartId === entry.partId);
		frames.current.push(requestAnimationFrame(() => {
			const answer = target();
			if (!answer) return;
			const top = main.scrollTop + answer.getBoundingClientRect().top - main.getBoundingClientRect().top - 16;
			const spacer = main.querySelector<HTMLElement>('[data-testid="dock-spacer"]');
			onReserve((spacer?.getBoundingClientRect().height ?? 0) + Math.max(0, top + main.clientHeight - main.scrollHeight));
			frames.current.push(requestAnimationFrame(() => {
				const animation = animateDockScroll(main, () => {
					const answer = target();
					return answer ? main.scrollTop + answer.getBoundingClientRect().top - main.getBoundingClientRect().top - 16 : main.scrollTop;
				}, (top) => { current.current.state.scrollTop = top; }, { cancelOnExternalScroll: true });
				motion.current = animation;
				void animation.finished.then(() => { if (motion.current === animation) motion.current = null; });
			}));
		}));
	};

	if (!entries.length) return null;
	return (
		<nav ref={nav} data-testid="session-turn-rail" aria-label="Turn navigation" className="session-turn-rail" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null); }} onKeyDown={(event) => {
			const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
			const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
			const next = event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : event.key === "ArrowUp" ? Math.max(index - 1, 0) : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
			if (next >= 0) { event.preventDefault(); buttons[next]?.focus({ preventScroll: true }); keepMarkerInView(buttons[next] ?? null); }
		}}>
			<TooltipProvider delayDuration={0}>
				<div className="session-turn-markers">
					{entries.map((entry, index) => (
						<Tooltip key={entry.id}>
							<TooltipTrigger asChild>
								<Button variant="ghost" size="icon-sm" data-turn-part-id={entry.partId} aria-label={`Jump to turn ${index + 1}`} aria-current={visible === entry.id ? "step" : undefined} tabIndex={(focused ?? visible) === entry.id ? 0 : -1} onFocus={() => setFocused(entry.id)} onClick={() => jump(entry)} className="session-turn-marker">
									<span aria-hidden />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right" align="center" sideOffset={16} className="session-turn-preview">
								{entry.prompt && <p className="truncate text-foreground">{entry.prompt}</p>}
								<p className="line-clamp-3 text-muted-foreground">{entry.answer}</p>
							</TooltipContent>
						</Tooltip>
					))}
				</div>
			</TooltipProvider>
		</nav>
	);
}
