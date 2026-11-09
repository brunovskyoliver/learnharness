"use client";

/**
 * Feature 028: a page's content region (contract §4, research R1-R2,
 * data-model "Arrival kind") and the page's exit. On a typed navigation
 * React captures the leaving page and lifts it (`lh-lift`, `RouteExit`); the
 * arriving content is never captured, so it is live from its first frame
 * and arrives through the arrival CSS keyed on `data-lh-arrive`
 * (app/paper.css). The chrome stays out of the captured image
 * (app/paper.css), so it holds still.
 *
 * The kind is read once per mount and removed when the arrival ends, so a
 * re-render or a re-show of a cached route never replays it (FR-009).
 * During hydration it is the server's "cold": the html signature attribute
 * turns that into the signature in CSS, from first paint.
 */

import * as React from "react";
import { useEffect, useState, useSyncExternalStore, type AnimationEvent, type ComponentProps, type ReactNode } from "react";
import { pendingArrival, signaturePlaying } from "@/components/paper/motion-arrival";
import { arrivalKind, type ArrivalKind } from "@/src/core";

/**
 * React's <ViewTransition>: Next's compiled React exports it; plain `react`
 * (the unit tests' renderer) does not, and a named import would fail to link
 * there, so it is read off the namespace with a pass-through fallback.
 */
type ViewTransitionProps = React.ComponentProps<typeof React.ViewTransition>;
const ViewTransition: (props: ViewTransitionProps) => ReactNode =
	(React as { ViewTransition?: (props: ViewTransitionProps) => ReactNode }).ViewTransition ?? (({ children }) => children as ReactNode);

/** The keyframes an arrival plays (app/paper.css); other animations inside (loops, carets) never hold it. */
const ARRIVAL_ANIMATIONS = new Set(["nb-ink-in", "nb-unfold", "lh-fade"]);
/** The longest arrival (signature ink + cap) with margin; past it the attribute goes regardless. */
const ARRIVAL_MAX_MS = 1000;

const noSubscribe = () => () => {};
/** True on the server and while hydrating; false for a mount made on the client. */
const useHydrating = () => useSyncExternalStore(noSubscribe, () => false, () => true);

export interface RouteContentProps extends ComponentProps<"div"> {
	/** The rows keep their reading-order stagger on a route arrival (Home, the Library; gate 2 item 6). */
	stagger?: "rows" | "library";
	/** The box itself never moves, only its marked parts ink in (a lesson, whose region holds the chrome). */
	still?: boolean;
}

const EXIT = { "lh-route": "lh-lift", "lh-mode": "lh-lift", default: "none" };

/**
 * The page's exit: wrap a page's whole output in it (app/(app)/…/page.tsx).
 * React fires an exit only for a <ViewTransition> with no DOM element above
 * it inside the removed tree, so it must sit at the top of the page, not
 * around a region deeper down (where it never fired, found in phase 5).
 * Never in a layout: layouts persist, so exit never fires there.
 */
export function RouteExit({ children }: { children: ReactNode }) {
	return <ViewTransition exit={EXIT} enter="none" update="none" share="none" default="none">{children}</ViewTransition>;
}

export function RouteContent({ children, onAnimationEnd, stagger, still, ...rest }: RouteContentProps) {
	const hydrating = useHydrating();
	const [kind, setKind] = useState<ArrivalKind | null>(() => (hydrating ? "cold" : arrivalKind(pendingArrival(), signaturePlaying())));
	useEffect(() => {
		if (!kind) return;
		const timer = window.setTimeout(() => setKind(null), ARRIVAL_MAX_MS);
		return () => window.clearTimeout(timer);
	}, [kind]);
	const ended = (event: AnimationEvent<HTMLDivElement>) => {
		onAnimationEnd?.(event);
		const running = event.currentTarget.getAnimations({ subtree: true }).some((a) => ARRIVAL_ANIMATIONS.has((a as CSSAnimation).animationName) && a.playState !== "finished");
		if (!running) setKind(null);
	};
	return (
		<div {...rest} data-lh-arrive={kind ?? undefined} data-lh-stagger={stagger} data-lh-still={still ? "" : undefined} onAnimationEnd={kind ? ended : onAnimationEnd}>
			{children}
		</div>
	);
}
