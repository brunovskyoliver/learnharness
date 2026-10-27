"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { SessionAccountContext, useSessionStateStore } from "@/components/session-state";
import type { UiStorage } from "@/components/session-state-store";

export interface ReloadDraft {
	kind: "home" | "new";
	text: string;
	mode: "teach" | "practice";
	picks: { id: string; name: string; statement: string }[];
}
export type ReloadOverlay = { kind: "setup" } | { kind: "chains"; selectMode: boolean } | { kind: "graph" };
export interface ReloadRecovery { version: 1; overlay: ReloadOverlay; draft?: ReloadDraft }
type RecoveryStorage = UiStorage & { removeItem(key: string): void };
const captureEvent = "lh:capture-reload-draft";
const consumed = new Map<string, { record?: ReloadRecovery; owners: Set<string> }>();
const route = () => window.location.pathname + window.location.search;
export const reloadRecoveryKey = (account: string, path: string) => `lh:reload-recovery:v1:${encodeURIComponent(account)}:${encodeURIComponent(path)}`;

export function saveReloadRecovery(storage: RecoveryStorage, key: string, recovery: ReloadRecovery): void {
	const body = JSON.stringify(recovery);
	storage.setItem(key, body);
	if (storage.getItem(key) !== body) throw new Error("Draft storage could not be verified.");
}

/** Remove before parsing/using the marker. A second reload must not reopen it. */
export function takeReloadRecovery(storage: RecoveryStorage, key: string): ReloadRecovery | undefined {
	const raw = storage.getItem(key);
	storage.removeItem(key);
	if (!raw) return;
	try {
		const record = JSON.parse(raw) as ReloadRecovery;
		if (record.version !== 1 || !record.overlay || !["setup", "chains", "graph"].includes(record.overlay.kind)) return;
		if (record.overlay.kind === "chains" && typeof record.overlay.selectMode !== "boolean") return;
		const draft = record.draft;
		if (draft && (!["home", "new"].includes(draft.kind) || typeof draft.text !== "string" || !["teach", "practice"].includes(draft.mode)
			|| !Array.isArray(draft.picks) || draft.picks.some((pick) => !pick || [pick.id, pick.name, pick.statement].some((field) => typeof field !== "string")))) return;
		return record;
	} catch { return; }
}

function recovered(account: string, owner: string): ReloadRecovery | undefined {
	const key = reloadRecoveryKey(account, route());
	if (!consumed.has(key)) {
		try { consumed.set(key, { record: takeReloadRecovery(window.sessionStorage, key), owners: new Set() }); }
		catch { consumed.set(key, { owners: new Set() }); }
	}
	const entry = consumed.get(key)!;
	if (entry.owners.has(owner)) return;
	entry.owners.add(owner);
	return entry.record;
}

/** Shared in-memory read lets draft and overlay owners restore the same
 * one-shot record, even when the graph mounts in a later lazy chunk. */
export function useRestoreReloadRecovery(owner: "draft" | "setup" | "chains", restore: (record: ReloadRecovery) => void): void {
	const account = useContext(SessionAccountContext) ?? "signed-out";
	const latest = useRef(restore);
	latest.current = restore;
	useEffect(() => { const record = recovered(account, owner); if (record) latest.current(record); }, [account, owner]);
}

export function useReloadDraft(capture: () => ReloadDraft, restore: (record: ReloadRecovery) => void): void {
	const account = useContext(SessionAccountContext) ?? "signed-out";
	const latest = useRef(capture);
	latest.current = capture;
	useRestoreReloadRecovery("draft", restore);
	useEffect(() => {
		const collect = (event: Event) => {
			const detail = (event as CustomEvent<{ account: string; path: string; draft?: ReloadDraft }>).detail;
			if (detail.account === account && detail.path === route()) detail.draft = latest.current();
		};
		window.addEventListener(captureEvent, collect);
		return () => window.removeEventListener(captureEvent, collect);
	}, [account]);
}

/** Only an explicit click can reload. Failed storage verification leaves the
 * current page, draft and Close action intact. */
export function useReloadRetry(overlay: ReloadOverlay): { reload: () => void; error: string | null } {
	const account = useContext(SessionAccountContext) ?? "signed-out";
	const session = useSessionStateStore();
	const [error, setError] = useState<string | null>(null);
	return { error, reload: () => {
		try {
			const path = route();
			const detail: { account: string; path: string; draft?: ReloadDraft } = { account, path };
			window.dispatchEvent(new CustomEvent(captureEvent, { detail }));
			if ((window.location.pathname === "/" || window.location.pathname === "/chat/new") && !detail.draft) throw new Error("The current draft is not ready to save.");
			if (session && !session.persistForReload()) throw new Error("Session draft storage is unavailable.");
			saveReloadRecovery(window.sessionStorage, reloadRecoveryKey(account, path), { version: 1, overlay, ...(detail.draft ? { draft: detail.draft } : {}) });
			window.location.reload();
		} catch {
			setError(overlay.kind === "graph"
				? "Your draft could not be saved safely. This page has not reloaded. Copy your draft before refreshing."
				: "Your draft could not be saved safely. This page has not reloaded. Close this panel and copy your draft before refreshing.");
		}
	} };
}
