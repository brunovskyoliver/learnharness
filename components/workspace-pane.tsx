"use client";

import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

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

/** The column beside the lesson that a demo or a page sits in: resize handle and
 *  saved width. The width is shared, so swapping contents never moves the edge. */
export function WorkspacePane({ label, resizeLabel, testId, className, rootRef, onKeyDownCapture, onKeyDown, children }: {
	label: string;
	resizeLabel: string;
	testId: string;
	className: string;
	rootRef?: Ref<HTMLElement>;
	onKeyDownCapture?: React.KeyboardEventHandler<HTMLElement>;
	onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
	children: (dragging: boolean) => ReactNode;
}) {
	const own = useRef<HTMLElement | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		const saved = Number(window.localStorage.getItem(WIDTH_KEY));
		if (Number.isFinite(saved) && saved > 0) setWidth(saved);
	}, []);

	const area = () => own.current?.parentElement?.clientWidth ?? window.innerWidth;
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
		const right = own.current?.getBoundingClientRect().right ?? window.innerWidth;
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

	const onHandleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "ArrowLeft") commit(width + STEP);
		else if (e.key === "ArrowRight") commit(width - STEP);
		else return;
		e.preventDefault();
		e.stopPropagation();
	};

	return (
		<aside
			ref={(node) => {
				own.current = node;
				if (typeof rootRef === "function") rootRef(node);
				else if (rootRef) rootRef.current = node;
			}}
			aria-label={label}
			data-testid={testId}
			onKeyDownCapture={onKeyDownCapture}
			onKeyDown={onKeyDown}
			style={{ "--lh-demo-w": `${clampWidth(width, typeof window === "undefined" ? 1440 : area())}px` } as React.CSSProperties}
			className={cn("relative flex min-h-0 shrink-0 flex-col bg-background md:h-full md:w-[var(--lh-demo-w)]", className)}
		>
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label={resizeLabel}
				aria-valuenow={width}
				tabIndex={0}
				onPointerDown={onPointerDown}
				onKeyDown={onHandleKeyDown}
				onDoubleClick={() => commit(DEFAULT_WIDTH)}
				className={`absolute -left-1.5 top-0 z-10 hidden h-full w-3 cursor-col-resize outline-none md:block ${dragging ? "bg-accent" : "hover:bg-accent focus-visible:bg-accent"}`}
			/>
			{children(dragging)}
		</aside>
	);
}
