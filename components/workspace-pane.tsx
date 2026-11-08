"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/workspace/workspace-context";

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

/** Set by the Library's full view (feature 027, R9): the pane fills the
 *  content column instead of sitting beside it, and its header's ✕ becomes
 *  "← Library". */
export interface PaneFull { onLibrary: () => void }
export const PaneFullContext = createContext<PaneFull | null>(null);
export const usePaneFull = () => useContext(PaneFullContext);

/** The column beside the lesson that a demo or a page sits in: a paper panel
 *  with the grain (feature 025, R11), its edge the rule hairline that is also
 *  the resize handle (arrows by keyboard, double-click resets), and the saved
 *  width. The width is shared, so swapping contents never moves the edge. */
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
	const workspace = useWorkspace();
	const full = usePaneFull() !== null;
	// Collapse keeps everything mounted: a page's editor, a demo's live iframe.
	const collapsed = !full && Boolean(workspace?.paneCollapsed) && testId !== "context-pane";
	const own = useRef<HTMLElement | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		if (full) return;
		const saved = Number(window.localStorage.getItem(WIDTH_KEY));
		if (Number.isFinite(saved) && saved > 0) setWidth(saved);
	}, [full]);

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

	if (full) {
		// The full view: no resize edge, no saved width, the column's width.
		return (
			<section
				ref={(node) => {
					own.current = node;
					if (typeof rootRef === "function") rootRef(node);
					else if (rootRef) rootRef.current = node;
				}}
				aria-label={label}
				data-testid={testId}
				data-pane-full=""
				onKeyDownCapture={onKeyDownCapture}
				onKeyDown={onKeyDown}
				className={cn("lh-pane-full relative flex min-h-0 w-full flex-1 flex-col", className)}
			>
				<div className="lh-pane-inner flex min-h-0 w-full flex-1 flex-col">{children(false)}</div>
			</section>
		);
	}

	return (
		<aside
			ref={(node) => {
				own.current = node;
				if (typeof rootRef === "function") rootRef(node);
				else if (rootRef) rootRef.current = node;
			}}
			aria-label={label}
			data-testid={testId}
			data-workspace-pane=""
			data-pane-collapsed={collapsed || undefined}
			onKeyDownCapture={onKeyDownCapture}
			onKeyDown={onKeyDown}
			style={{ "--lh-demo-w": `${clampWidth(width, typeof window === "undefined" ? 1440 : area())}px` } as React.CSSProperties}
			className={cn("lh-paper-panel relative flex min-h-0 shrink-0 flex-col md:h-full md:w-[var(--lh-demo-w)]", className)}
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
				data-dragging={dragging || undefined}
				className="lh-pane-divider absolute -left-1.5 top-0 z-10 hidden h-full w-3 cursor-col-resize outline-none md:block"
			/>
			{/* Its width is the pane's own even while collapsed, so a demo keeps its size off screen. */}
			<div className="lh-pane-inner flex min-h-0 w-full flex-1 flex-col">{children(dragging)}</div>
		</aside>
	);
}
