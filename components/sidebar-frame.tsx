"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const WIDTH_KEY = "lh:sidebar-width";
const DEFAULT_WIDTH = 256;
import MobileSidebar from "./mobile-sidebar";

/** Desktop navigation keeps a 208px floor and leaves 640px for the lesson. */
export function clampSidebarWidth(width: number, viewport: number): number {
	return Math.round(Math.max(208, Math.min(width, viewport - 640)));
}

/** Resize state lives here so pointer moves do not rerender the session list. */
export function SidebarFrame({ bootstrap = false, open, overlay, onClose, hasMenu, children }: { bootstrap?: boolean; open: boolean; overlay: boolean; onClose: () => void; hasMenu: boolean; children: ReactNode }) {
	const [preferredWidth, setPreferredWidth] = useState(DEFAULT_WIDTH);
	const [viewport, setViewport] = useState<number | null>(null);
	const [dragging, setDragging] = useState(false);
	const stopDrag = useRef<(() => void) | null>(null);
	const width = viewport === null ? preferredWidth : clampSidebarWidth(preferredWidth, viewport);

	useEffect(() => {
		const stored = Number(localStorage.getItem(WIDTH_KEY));
		if (Number.isFinite(stored) && stored > 0) setPreferredWidth(stored);
		const resize = () => setViewport(window.innerWidth);
		resize();
		window.addEventListener("resize", resize);
		return () => {
			stopDrag.current?.();
			window.removeEventListener("resize", resize);
		};
	}, []);

	useEffect(() => {
		if (!open || overlay) stopDrag.current?.();
	}, [open, overlay]);

	const reset = () => {
		setPreferredWidth(DEFAULT_WIDTH);
		localStorage.removeItem(WIDTH_KEY);
	};

	const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || stopDrag.current) return;
		const rail = event.currentTarget;
		const pointerId = event.pointerId;
		const startX = event.clientX;
		const startWidth = width;
		let nextWidth = width;
		rail.setPointerCapture(pointerId);
		setDragging(true);
		const move = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return;
			const next = clampSidebarWidth(startWidth + e.clientX - startX, window.innerWidth);
			if (next === nextWidth) return;
			nextWidth = next;
			setPreferredWidth(nextWidth);
		};
		const finish = () => {
			stopDrag.current = null;
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", end);
			window.removeEventListener("pointercancel", end);
			window.removeEventListener("blur", finish);
			rail.removeEventListener("lostpointercapture", end);
			if (rail.hasPointerCapture(pointerId)) rail.releasePointerCapture(pointerId);
			setDragging(false);
			if (nextWidth !== startWidth) localStorage.setItem(WIDTH_KEY, String(nextWidth));
			else setPreferredWidth(preferredWidth);
		};
		const end = (e: PointerEvent) => { if (e.pointerId === pointerId) finish(); };
		stopDrag.current = finish;
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", end);
		window.addEventListener("pointercancel", end);
		window.addEventListener("blur", finish);
		rail.addEventListener("lostpointercapture", end);
	};

	const frame = (
		<aside
			data-sidebar-bootstrap={bootstrap || undefined}
			className={cn("relative shrink-0 overflow-hidden duration-200", !dragging && "sidebar-motion", overlay && "h-full")}
			style={{
				width: open ? overlay ? "100%" : width : 0,
				maxWidth: overlay ? undefined : "max(208px, calc(100vw - 640px))",
				// duration-200 alone still transitions all properties by default.
				transitionProperty: dragging ? "none" : undefined,
				"--lh-sidebar-width": `${width}px`,
			} as CSSProperties}
			aria-hidden={!open}
		>
			{children}
			{open && !overlay && (
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize sidebar"
					aria-valuemin={208}
					aria-valuemax={Math.max(208, (viewport ?? 896) - 640)}
					aria-valuenow={width}
					tabIndex={0}
					onPointerDown={startResize}
					onDoubleClick={reset}
					onKeyDownCapture={(event) => {
						// Claim before document-level lesson handlers.
						if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); reset(); return; }
						const next = event.key === "ArrowLeft" ? width - 16
							: event.key === "ArrowRight" ? width + 16
							: event.key === "Home" ? 208
							: event.key === "End" ? window.innerWidth - 640 : null;
						if (next === null) return;
						event.preventDefault();
						event.stopPropagation();
						const clamped = clampSidebarWidth(next, window.innerWidth);
						setPreferredWidth(clamped);
						localStorage.setItem(WIDTH_KEY, String(clamped));
					}}
					className={cn(
						"lh-no-drag absolute inset-y-0 right-0 z-10 w-3 touch-none select-none cursor-col-resize outline-none after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:transition-colors hover:after:bg-ring focus-visible:after:bg-ring",
						dragging && "after:bg-ring",
					)}
				/>
			)}
		</aside>
	);
	return overlay ? open ? (
		<MobileSidebar width={preferredWidth} onClose={onClose} hasMenu={hasMenu}>{frame}</MobileSidebar>
	) : null : frame;
}
