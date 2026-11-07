"use client";

/**
 * "Think about this" and "Visualize" from the selection menu (feature 024,
 * US4): each starts a run on the passage he picked (api.md "Runs") and is
 * followed until its thread lands. While it runs, a think shows the
 * passage's reading marks and a visualize shows "Sketching it…" under the
 * passage's block. A refusal or failure goes to the corner hint with
 * "Try again" (constitution V: no automatic retry).
 */
import { useCallback, useRef, useState } from "react";
import type { ThreadAnchor } from "@/src/core";
import { startPassageRun } from "./nb-actions";
import { useNotebook } from "./nb-shared";

export const SKETCHING_LINE = "Sketching it…";

export interface PassageRun {
	/** Stable while it runs (also the id of its hidden anchor in the editor). */
	key: string;
	kind: "think" | "visualize";
	anchor: ThreadAnchor;
	runId: string;
	/** The thread it wrote; the run's marks stay until the note shows that thread. */
	threadId?: string;
}

export function useSelectionRuns({ pageId, noteText, reload }: { pageId: string; noteText: () => string; reload: () => void }) {
	const { setReading, announce } = useNotebook();
	const [runs, setRuns] = useState<PassageRun[]>([]);
	const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
	const counter = useRef(0);

	const start = useCallback(async function begin(kind: "think" | "visualize", anchor: ThreadAnchor): Promise<void> {
		const outcome = await startPassageRun(pageId, kind, noteText(), anchor);
		if ("ok" in outcome) {
			const key = `nb-run-${++counter.current}`;
			setRuns((prev) => [...prev, { key, kind, anchor, runId: outcome.ok.id }]);
			return;
		}
		if ("refused" in outcome) setReading({ state: "refused", ...outcome.refused });
		else {
			announce("That didn't come through.");
			setReading({ state: "failed", retry: () => { setReading(null); void begin(kind, anchor); } });
		}
	}, [pageId, noteText, setReading, announce]);

	const settle = useCallback((key: string, outcome: { threadId?: string } | "failed" | "gone") => {
		const run = runs.find((r) => r.key === key);
		const landed = typeof outcome === "object" ? outcome.threadId : undefined;
		if (landed) {
			setFresh((prev) => new Set(prev).add(landed));
			setRuns((prev) => prev.map((r) => (r.key === key ? { ...r, threadId: landed } : r)));
		} else setRuns((prev) => prev.filter((r) => r.key !== key));
		if (outcome === "failed" && run) {
			announce("That didn't come through.");
			setReading({ state: "failed", retry: () => { setReading(null); void start(run.kind, run.anchor); } });
		}
		reload();
	}, [runs, announce, setReading, start, reload]);

	/** Runs whose thread the note now shows are over. */
	const shown = useCallback((ids: ReadonlySet<string>) => {
		setRuns((prev) => (prev.some((r) => r.threadId && ids.has(r.threadId)) ? prev.filter((r) => !(r.threadId && ids.has(r.threadId))) : prev));
	}, []);

	return { runs, fresh, start, settle, shown };
}
