"use client";

import { createContext, createElement, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";

/** What a live context hands down: a store whose identity never changes. */
interface LiveStore<T> {
	get: () => T;
	/** The first render's value: what the server rendered, for hydration. */
	server: () => T;
	subscribe: (listener: () => void) => () => void;
	publish: (next: T) => void;
}

function createStore<T>(initial: T): LiveStore<T> {
	let current = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => current,
		server: () => initial,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
		publish: (next) => {
			if (Object.is(next, current)) return;
			current = next;
			for (const listener of [...listeners]) listener();
		},
	};
}

const noSubscribe = () => () => {};

/**
 * A context for shell providers that sit above the page's Suspense boundary in
 * the root layout (feature 024, T033). React client-renders a boundary that is
 * still waiting to hydrate whenever a context value above it changes, which
 * threw away the streamed transcript on cold loads. Here the context value is
 * a store that never changes identity; consumers subscribe to the value with
 * useSyncExternalStore, so only mounted consumers re-render, in the same
 * commit as today. A consumer that hydrates later starts from the value the
 * server rendered and then catches up, with no hydration mismatch.
 */
export function createLiveContext<T>(fallback: T) {
	const Context = createContext<LiveStore<T> | null>(null);
	const getFallback = () => fallback;

	function LiveProvider({ value, children }: { value: T; children?: ReactNode }) {
		const [store] = useState(() => createStore(value));
		// Before paint: consumers re-render in the same frame as the provider.
		useLayoutEffect(() => { store.publish(value); }, [store, value]);
		return createElement(Context.Provider, { value: store }, children);
	}

	function useLiveValue(): T {
		const store = useContext(Context);
		return useSyncExternalStore(store ? store.subscribe : noSubscribe, store ? store.get : getFallback, store ? store.server : getFallback);
	}

	return { Provider: LiveProvider, useValue: useLiveValue };
}
