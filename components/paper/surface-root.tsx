"use client";

/**
 * Where a shared surface's menus, popovers and dialogs portal to (feature
 * 025, R5). Since the paper tokens live on html.lh-paper, document.body is
 * styled and is the default; Notebook provides its `.nb-root`, so its
 * pieces keep the root's attributes (and 024's selectors) around them.
 */
import { createContext, useContext } from "react";

export const SurfaceRootContext = createContext<HTMLElement | null>(null);

/** The portal container, or undefined for document.body (Radix's default). */
export function useSurfaceRoot(): HTMLElement | undefined {
	return useContext(SurfaceRootContext) ?? undefined;
}
