"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { useDemoPanel } from "@/components/artifacts/demo-panel-context";

const WIDTH_KEY = "lh-demo-panel-width";
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;
/** The transcript keeps at least this much of the session area. */
const MIN_TRANSCRIPT = 420;
const STEP = 16;

function clampWidth(width: number, area: number): number {
	const max = Math.max(MIN_WIDTH, area - MIN_TRANSCRIPT);
	return Math.round(Math.min(Math.max(width, MIN_WIDTH), max));
}

/** The session's demo beside the lesson: a resizable column right of the
 *  transcript on wide screens, a sheet over the top half on narrow ones (the
 *  composer stays reachable below it). The transcript iframe is positioned over the slot without remounting. */
export function DemoPanel() {
	const panel = useDemoPanel();
	const rootRef = useRef<HTMLElement>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		const saved = Number(window.localStorage.getItem(WIDTH_KEY));
		if (Number.isFinite(saved) && saved > 0) setWidth(saved);
	}, []);

	if (!panel || panel.openId === null) return null;
	const demo = panel.demos.find((d) => d.id === panel.openId);
	if (!demo) return null;

	const area = () => rootRef.current?.parentElement?.clientWidth ?? window.innerWidth;
	const commit = (next: number) => {
		const value = clampWidth(next, area());
		setWidth(value);
		window.localStorage.setItem(WIDTH_KEY, String(value));
	};

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		e.preventDefault();
		const handle = e.currentTarget;
		const pointer = e.pointerId;
		const right = rootRef.current?.getBoundingClientRect().right ?? window.innerWidth;
		handle.setPointerCapture(pointer);
		setDragging(true);
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== pointer) return;
			setWidth(clampWidth(right - ev.clientX, area()));
		};
		const end = (ev: PointerEvent) => {
			if (ev.pointerId !== pointer) return;
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", end);
			handle.removeEventListener("pointercancel", end);
			setDragging(false);
			commit(right - ev.clientX);
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", end);
		handle.addEventListener("pointercancel", end);
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "ArrowLeft") commit(width + STEP);
		else if (e.key === "ArrowRight") commit(width - STEP);
		else return;
		e.preventDefault();
		e.stopPropagation();
	};

	return (
		<aside
			ref={rootRef}
			aria-label="Demo"
			data-testid="demo-panel"
			style={{ "--lh-demo-w": `${clampWidth(width, typeof window === "undefined" ? 1440 : area())}px` } as React.CSSProperties}
			className="demo-workspace relative flex min-h-0 shrink-0 flex-col bg-background md:h-full md:w-[var(--lh-demo-w)]"
		>
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize demo panel"
				aria-valuenow={width}
				tabIndex={0}
				onPointerDown={onPointerDown}
				onKeyDown={onKeyDown}
				onDoubleClick={() => commit(DEFAULT_WIDTH)}
				className={`absolute -left-1.5 top-0 z-10 hidden h-full w-3 cursor-col-resize outline-none md:block ${dragging ? "bg-accent" : "hover:bg-accent focus-visible:bg-accent"}`}
			/>
			<div className="flex h-13 shrink-0 items-center gap-3 px-3">
				{panel.demos.length > 1 ? (
					<select
						aria-label="Demo"
						value={demo.id}
						onChange={(e) => panel.open(e.target.value)}
						className="min-w-0 flex-1 truncate rounded-md bg-transparent py-1 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
						data-testid="demo-panel-select"
					>
						{panel.demos.map((d) => (
							<option key={d.id} value={d.id}>
								{d.title}
							</option>
						))}
					</select>
				) : (
					<span className="min-w-0 flex-1 truncate text-sm font-medium">{demo.title}</span>
				)}
				<div data-demo-actions="" className="flex shrink-0 items-center" />
				<button
					type="button"
					aria-label="Close demo panel"
					onClick={panel.close}
					data-testid="demo-panel-close"
					className="ui-icon-button text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<XIcon className="ui-icon" />
				</button>
			</div>
			<div className={`min-h-0 flex-1 overflow-hidden p-3 ${dragging ? "pointer-events-none" : ""}`}>
				<div data-demo-slot="" className="h-full min-h-0" />
			</div>
		</aside>
	);
}
