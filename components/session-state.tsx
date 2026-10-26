"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { SessionStateStore } from "./session-state-store";

export function SessionAccountProvider({ account, children }: { account: string | null; children: ReactNode }) {
	return <SessionAccountContext.Provider value={account}>{children}</SessionAccountContext.Provider>;
}

export const SessionAccountContext = createContext<string | null>("local");
const StateContext = createContext<SessionStateStore | null>(null);
const PartContext = createContext("");

export function SessionStateProvider({ chatId, children }: { chatId: string; children: ReactNode }) {
	const account = useContext(SessionAccountContext);
	const store = useMemo(() => new SessionStateStore(account ?? "signed-out", chatId, () => account && typeof window !== "undefined" ? window.localStorage : undefined), [account, chatId]);
	useEffect(() => {
		const flush = () => store.flush();
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", flush);
			flush();
		};
	}, [store]);
	return <StateContext.Provider value={store}>{children}</StateContext.Provider>;
}

/** Identity context adds no DOM and survives insertions elsewhere in a run. */
export function SessionPartState({ id, children }: { id: string; children: ReactNode }) {
	return <PartContext.Provider value={id}>{children}</PartContext.Provider>;
}

export function useSessionStateStore() { return useContext(StateContext); }

export function SessionDetails({ stateKey = "details", children, ...props }: ComponentProps<"details"> & { stateKey?: string }) {
	const [open, setOpen] = useSessionState(stateKey, false);
	return <details {...props} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>{children}</details>;
}

const serverSnapshot = () => undefined;
const noopSubscribe = () => () => {};

/** SSR uses the supplied default; hydration reads this account's saved value.
 * Each field subscribes separately, so typing never invalidates the transcript. */
export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
	const store = useContext(StateContext);
	const part = useContext(PartContext);
	const field = part ? `${part}/${key}` : key;
	const fallback = useRef(initial);
	fallback.current = initial;
	const [local, setLocal] = useState(initial);
	const subscribe = useCallback((listener: () => void) => store?.subscribe(field, listener) ?? noopSubscribe(), [store, field]);
	const snapshot = useCallback(() => store?.get(field), [store, field]);
	const saved = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
	const valid = saved !== undefined && (typeof initial === "object" ? saved !== null && typeof saved === "object" && Array.isArray(saved) === Array.isArray(initial) : typeof saved === typeof initial);
	const value = store ? valid ? saved as T : initial : local;
	const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
		if (!store) { setLocal(next); return; }
		const previous = store.get(field);
		store.set(field, typeof next === "function" ? (next as (value: T) => T)(previous === undefined ? fallback.current : previous as T) : next);
	}, [store, field]);
	return [value, set];
}
