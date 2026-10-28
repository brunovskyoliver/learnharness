"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A view-level overlay host (feature 002): Home's graph is a section of the
 * page, but the chain table still covers the whole Home content area (owner
 * 2026-10-28). Home provides its host element; overlays rendered through
 * InOverlayHost portal there. Without a host — or while the graph is itself
 * expanded to full screen — they render in place as before.
 */
export const OverlayHostContext = createContext<HTMLElement | null>(null);

export function InOverlayHost({ children, inPlace = false }: { children: ReactNode; inPlace?: boolean }) {
	const host = useContext(OverlayHostContext);
	return host && !inPlace ? createPortal(children, host) : children;
}
