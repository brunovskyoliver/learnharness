"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { flushSync } from "react-dom";
import { kbdEventForAction } from "@/src/core";
import type { CommandPaletteProps } from "./command-palette-dialog";

/** Holds the shortcut and the opener; the dialog and its Radix runtime load on
 *  the first open (constitution VIII). A failed load says so, and the next press
 *  tries again. */
export function CommandPaletteHost() {
	const [Dialog, setDialog] = useState<ComponentType<CommandPaletteProps> | null>(null);
	const [open, setOpen] = useState(false);
	const [loadFailed, setLoadFailed] = useState(false);
	const loading = useRef(false);
	const opener = useRef<HTMLElement | null>(null);
	const loaded = useRef(false);
	loaded.current = Dialog !== null;

	useEffect(() => {
		const onOpen = () => {
			opener.current = document.activeElement as HTMLElement | null;
			// The shortcut arrives as a custom event, which React would render at
			// default priority (a frame late): open in this task, so focus is in
			// the field in the frame the key went down (feature 028, FR-005).
			if (loaded.current) flushSync(() => { setLoadFailed(false); setOpen(true); });
			else { setLoadFailed(false); setOpen(true); }
			if (loaded.current || loading.current) return;
			loading.current = true;
			import("./command-palette-dialog").then(
				(module) => setDialog(() => module.default),
				() => { setOpen(false); setLoadFailed(true); },
			).finally(() => { loading.current = false; });
		};
		const event = kbdEventForAction("command-palette");
		window.addEventListener(event, onOpen);
		return () => window.removeEventListener(event, onOpen);
	}, []);

	useEffect(() => {
		if (!loadFailed) return;
		const timer = window.setTimeout(() => setLoadFailed(false), 6000);
		return () => window.clearTimeout(timer);
	}, [loadFailed]);

	return (
		<>
			{Dialog && <Dialog open={open} onOpenChange={setOpen} opener={opener} />}
			{loadFailed && <p role="alert" data-testid="command-palette-failed" className="fixed bottom-4 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl bg-paper shadow-lift px-3 py-2 text-sm text-ink">The command palette could not be loaded. Press the shortcut to try again.</p>}
		</>
	);
}
