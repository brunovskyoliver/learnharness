"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { useWorkspace } from "./workspace-context";

const SessionPane = dynamic(() => import("./context-pane").then((m) => m.SessionContextPane), { ssr: false });
const LibraryPane = dynamic(() => import("./context-pane").then((m) => m.LibraryContextPane), { ssr: false });

/** The pane's last occupant: only when asked for and nothing else holds the
 *  column. A page or demo always wins, and loads nothing until then. */
function useContextVisible() {
	const workspace = useWorkspace();
	return Boolean(workspace?.contextOpen && !workspace.occupied);
}

export function SessionContextSlot(props: ComponentProps<typeof SessionPane>) {
	return useContextVisible() ? <SessionPane {...props} /> : null;
}

export function LibraryContextSlot(props: ComponentProps<typeof LibraryPane>) {
	return useContextVisible() ? <LibraryPane {...props} /> : null;
}
