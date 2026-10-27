"use client";

/** Surfaces that mount together (model picker, coverage ring, chat) share
 * one in-flight /api/settings read; the page load used to fire three.
 * Only concurrent reads share: once the response lands, the next read
 * fetches again, so a reader never sees a record older than its call. */
let inFlight: Promise<unknown> | null = null;

export function readSettingsBody<T>(): Promise<T> {
	inFlight ??= fetch("/api/settings")
		.then((res) => {
			if (!res.ok) throw new Error(`settings read failed: ${res.status}`);
			return res.json();
		})
		.finally(() => { inFlight = null; });
	return inFlight as Promise<T>;
}
