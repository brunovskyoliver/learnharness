"use client";

/**
 * The shared Appearance (feature 025, research R1, R2, R15): theme, text
 * size, lettering and AI ink for both modes. The server layout renders
 * them on <html class="lh-paper"> (data-theme, data-ink, data-text-size,
 * data-lettering) from the stored `notebook` section; this provider keeps
 * the attributes in step with every change after, resolves "system" through
 * matchMedia, cross-fades a theme change (view transition, not under
 * reduced motion) and hands the window chrome its colours in Electron.
 *
 * Every write of the `notebook` settings section goes through this one
 * queue (each write reads the stored section and puts it back changed), so
 * no write undoes another; Notebook's own preferences and reviewers use it
 * too.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { writeSettingsKey } from "@/components/interface-switch";
import { DEFAULT_SHARED_APPEARANCE, resolveSharedAppearance, sharedAppearanceAttributes, type SharedAppearance } from "@/src/core";

export type ResolvedTheme = "light" | "dark" | "system";

/** The stored `notebook` keys behind each shared field. */
const STORED_KEY = { theme: "appearance", textSize: "textSize", lettering: "lettering", ink: "ink" } as const satisfies Record<keyof SharedAppearance, string>;

export interface PaperAppearance {
	appearance: SharedAppearance;
	/** "system" until mounted (CSS follows the OS then), afterwards light or dark, following the OS. */
	resolvedTheme: ResolvedTheme;
	/** Shows a change at once (cross-fading a theme change); `alongside` runs in the same update. Writes nothing. */
	apply: (patch: Partial<SharedAppearance>, alongside?: () => void) => void;
	/** Shows a change and saves it. False when the save failed (the change stays shown). */
	update: (patch: Partial<SharedAppearance>) => Promise<boolean>;
	/** Queues a write of the `notebook` settings section (a patch of its stored keys). */
	queueWrite: (patch: Record<string, unknown>) => Promise<boolean>;
}

const PaperAppearanceContext = createContext<PaperAppearance>({
	appearance: DEFAULT_SHARED_APPEARANCE,
	resolvedTheme: "system",
	apply: (_patch, alongside) => alongside?.(),
	update: async () => false,
	queueWrite: (patch) => writeSettingsKey("notebook", patch).catch(() => false),
});

export function usePaperAppearance(): PaperAppearance {
	return useContext(PaperAppearanceContext);
}

const DARK = "(prefers-color-scheme: dark)";
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Riddled cross-fades a theme change (view transition, 350ms in paper.css); not under reduced motion. */
function withThemeFade(apply: () => void): void {
	const start = (document as Document & { startViewTransition?: (update: () => void) => unknown }).startViewTransition;
	if (typeof start !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { apply(); return; }
	start.call(document, () => flushSync(apply));
}

/** The stored `notebook` patch for a shared patch. */
export function storedPatch(patch: Partial<SharedAppearance>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(patch) as (keyof SharedAppearance)[]) if (patch[key] !== undefined) out[STORED_KEY[key]] = patch[key];
	return out;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** A computed colour (rgb() or #hex) as #rrggbb, or null. */
function hexOf(value: string): string | null {
	const v = value.trim();
	if (HEX.test(v)) return v.toLowerCase();
	const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v);
	return m ? `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}` : null;
}

export function PaperAppearanceProvider({ initial, loaded = true, children }: {
	/** The stored values the server rendered on <html>. */
	initial: SharedAppearance;
	/** False when the server could not read the settings: the provider reads them once. */
	loaded?: boolean;
	children: React.ReactNode;
}) {
	const [appearance, setAppearance] = useState<SharedAppearance>(initial);
	// A new server render (refresh) brings the stored values.
	const incoming = JSON.stringify(initial);
	useEffect(() => { setAppearance(JSON.parse(incoming) as SharedAppearance); }, [incoming]);

	const [systemDark, setSystemDark] = useState<boolean | null>(null);
	useEffect(() => {
		const query = window.matchMedia(DARK);
		const sync = () => setSystemDark(query.matches);
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, []);
	const resolvedTheme: ResolvedTheme = appearance.theme !== "system" ? appearance.theme : systemDark === null ? "system" : systemDark ? "dark" : "light";

	// The attributes move before paint (and inside a theme fade's update).
	useIsoLayoutEffect(() => {
		const html = document.documentElement;
		for (const [name, value] of Object.entries(sharedAppearanceAttributes(appearance))) {
			if (html.getAttribute(name) !== value) html.setAttribute(name, value);
		}
	}, [appearance]);

	// Electron: the window's background and title-bar symbols follow the paper.
	useEffect(() => {
		const setChrome = window.lh?.setChrome;
		if (!setChrome || resolvedTheme === "system") return;
		const styles = getComputedStyle(document.documentElement);
		const background = hexOf(styles.getPropertyValue("--paper"));
		const symbol = hexOf(styles.getPropertyValue("--ink"));
		if (background && symbol) setChrome({ background, symbol });
	}, [resolvedTheme, appearance.theme]);

	// Browsers (phones' toolbars): theme-color is the paper of the theme in use.
	useEffect(() => {
		const background = hexOf(getComputedStyle(document.documentElement).getPropertyValue("--paper"));
		if (!background) return;
		let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
		if (!meta) {
			meta = document.createElement("meta");
			meta.name = "theme-color";
			document.head.append(meta);
		}
		meta.content = background;
	}, [resolvedTheme, appearance.theme]);

	// Without a server read (it failed), read the record once per app load.
	useEffect(() => {
		if (loaded) return;
		let alive = true;
		fetch("/api/settings", { cache: "no-store" })
			.then((r) => r.json())
			.then((body: { settings?: unknown }) => { if (alive) setAppearance(resolveSharedAppearance(body.settings)); })
			.catch(() => { /* the defaults stay; not worth a crash */ });
		return () => { alive = false; };
	}, [loaded]);

	const writes = useRef<Promise<unknown>>(Promise.resolve());
	const queueWrite = useCallback((patch: Record<string, unknown>): Promise<boolean> => {
		const next = writes.current.then(() => writeSettingsKey("notebook", patch).catch(() => false));
		writes.current = next;
		return next;
	}, []);

	const current = useRef(appearance);
	current.current = appearance;
	const apply = useCallback((patch: Partial<SharedAppearance>, alongside?: () => void) => {
		const run = () => {
			setAppearance((now) => ({ ...now, ...patch }));
			alongside?.();
		};
		if (patch.theme && patch.theme !== current.current.theme) withThemeFade(run);
		else run();
	}, []);
	const update = useCallback((patch: Partial<SharedAppearance>) => {
		apply(patch);
		return queueWrite(storedPatch(patch));
	}, [apply, queueWrite]);

	const value = useMemo<PaperAppearance>(() => ({ appearance, resolvedTheme, apply, update, queueWrite }), [appearance, resolvedTheme, apply, update, queueWrite]);
	return <PaperAppearanceContext.Provider value={value}>{children}</PaperAppearanceContext.Provider>;
}
