"use client";

/**
 * Following one Notebook run (feature 024, api.md "Runs"): an EventSource
 * on /api/notebook/runs/:runId/stream. Buffered events arrive first, so a
 * late subscriber misses nothing. Closing (unmount, another run) only
 * detaches: the run keeps going on the server; Stop is the abort route.
 */
import { useEffect, useRef } from "react";

export type RunPhase = "reading" | "writing" | "drawing";

export interface RunStreamHandlers {
	phase?: (data: { phase: RunPhase; anchor?: string }) => void;
	delta?: (data: { messageId: string; text: string }) => void;
	done?: (data: { status: "done" | "silent"; threadId?: string; messageId?: string }) => void;
	failed?: (data: { error: string; detail?: string }) => void;
	stopped?: () => void;
	/** The stream broke or the run is gone (404): treat the run as over; the companion has the truth. */
	lost?: () => void;
}

const TERMINAL = ["done", "failed", "stopped"] as const;

/** Opens the stream for `runId` (null: nothing) and closes it on change or unmount. */
export function useRunStream(runId: string | null, handlers: RunStreamHandlers): void {
	const ref = useRef(handlers);
	ref.current = handlers;
	useEffect(() => {
		if (!runId) return;
		const source = new EventSource(`/api/notebook/runs/${encodeURIComponent(runId)}/stream`);
		let ended = false;
		const parse = (event: MessageEvent): unknown => {
			try { return JSON.parse(String(event.data)); } catch { return {}; }
		};
		const on = (name: string, fn: (data: unknown) => void) => source.addEventListener(name, (event) => fn(parse(event as MessageEvent)));
		on("phase", (data) => ref.current.phase?.(data as { phase: RunPhase; anchor?: string }));
		on("delta", (data) => ref.current.delta?.(data as { messageId: string; text: string }));
		for (const name of TERMINAL) {
			on(name, (data) => {
				ended = true;
				source.close();
				if (name === "done") ref.current.done?.(data as { status: "done" | "silent"; threadId?: string; messageId?: string });
				else if (name === "failed") ref.current.failed?.(data as { error: string; detail?: string });
				else ref.current.stopped?.();
			});
		}
		// The server closes after a terminal event; EventSource would reconnect, so any error ends it here.
		source.onerror = () => {
			if (ended) return;
			ended = true;
			source.close();
			ref.current.lost?.();
		};
		return () => { ended = true; source.close(); };
	}, [runId]);
}
