"use client";

/**
 * Feature 028: in-app navigations that carry their transition type
 * (contract §4, research R1). `lh-route` for links and pushes between
 * pages, `lh-mode` for Notebook ⇄ Study, `lh-route` + `lh-tab` for a
 * workspace tab. The pending kind tells the next content region how to
 * arrive (components/paper/route-content.tsx). Browser back/forward carries
 * no type (MotionArrival marks it `history`).
 */

import { setPendingArrival } from "@/components/paper/motion-arrival";
import type { NavigationKind } from "@/src/core";

export type PushKind = Exclude<NavigationKind, "history">;

const TYPES: Record<PushKind, string[]> = {
	route: ["lh-route"],
	mode: ["lh-mode"],
	tab: ["lh-route", "lh-tab"],
};

/** The `transitionTypes` for a `<Link>` or `router.push` of this kind (a fresh array each call). */
export function transitionTypesFor(kind: PushKind): string[] {
	return [...TYPES[kind]];
}

/** The router surface navigateTo needs (`useRouter()` satisfies it). */
export interface PushRouter {
	push(href: string, options?: { scroll?: boolean; transitionTypes?: string[] }): void;
}

/** Pushes `href` with the kind's transition types, marking the arrival the new content reads. */
export function navigateTo(router: PushRouter, href: string, kind: PushKind = "route", options: { scroll?: boolean } = {}) {
	setPendingArrival(kind);
	router.push(href, { ...options, transitionTypes: transitionTypesFor(kind) });
}

/** For `<Link onNavigate>`: marks the arrival of a typed link before it navigates. */
export function markLinkArrival(kind: PushKind = "route") {
	setPendingArrival(kind);
}
