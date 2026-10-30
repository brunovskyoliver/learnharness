"use client";

import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { SessionAccountContext } from "@/components/session-state";
import { browserBackupStore, fetchPageApi, PageDraftController } from "./page-draft.ts";

/** A tab's hold on one page. The logic lives in page-draft.ts; this adds the
 *  browser: events, unload, and the version made on leaving. `flush` lets the
 *  editor hand over its last keystrokes before any of those. */
export function usePageDraft(id: string) {
	const account = useContext(SessionAccountContext) ?? "signed-out";
	const [loadFailed, setLoadFailed] = useState(false);
	const flush = useRef<() => void>(() => {});
	const controller = useMemo(() => new PageDraftController({
		id,
		api: fetchPageApi(),
		backup: browserBackupStore(account, id, window.localStorage, window.sessionStorage),
		onLoadFailed: () => setLoadFailed(true),
	}), [account, id]);
	const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

	useEffect(() => {
		controller.reopened();
		if (!controller.state.loaded) void controller.load();
		const onHide = () => {
			flush.current();
			controller.pageHide();
		};
		window.addEventListener("pagehide", onHide);
		return () => {
			window.removeEventListener("pagehide", onHide);
			flush.current();
			void controller.close();
		};
	}, [controller]);

	useServerEvent("library-changed", (event) => {
		if (event.itemId !== id) return;
		flush.current();
		void controller.remoteChanged(event.author, event.version);
	});
	useServerResync(() => {
		flush.current();
		void controller.remoteChanged();
	});

	return { controller, state, loadFailed, flush };
}
