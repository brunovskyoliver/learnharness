"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ChatGPTUIProvider } from "./chatgpt-connection";
import { NativeSubscriptionUIProvider } from "./subscription-connections";
import type { SectionId } from "./settings-dialog-content";

const SettingsDialog = lazy(() => import("./settings-dialog-content"));
const DialogContext = createContext<{ open: (section?: string, row?: string, trigger?: HTMLElement) => void; hosted: boolean }>({ open: () => {}, hosted: false });

/** The providers stay mounted; the settings editor loads only when opened. */
export function SettingsDialogProvider({ children, hosted = false }: { children: ReactNode; hosted?: boolean }) {
	const [show, setShow] = useState(false);
	const [landOn, setLandOn] = useState<SectionId>("keys");
	const [landOnRow, setLandOnRow] = useState<string | null>(null);
	const opener = useRef<HTMLElement | null>(null);
	const open = useCallback((section?: string, row?: string, trigger?: HTMLElement) => {
		if (trigger) opener.current = trigger;
		else if (!document.activeElement?.closest("[data-lh-modal-content]")) opener.current = document.activeElement as HTMLElement | null;
		setLandOn(section ? section as SectionId : "keys");
		setLandOnRow(row ?? null);
		setShow(true);
	}, []);
	useEffect(() => window.lh?.onOpenSettings?.((section) => open(section)), [open]);
	return (
		<ChatGPTUIProvider><NativeSubscriptionUIProvider><DialogContext.Provider value={{ open, hosted }}>
			{children}
			{show && <Suspense fallback={null}><SettingsDialog onClose={() => setShow(false)} initialSection={landOn} initialRow={landOnRow} hosted={hosted} returnFocusElement={opener.current} /></Suspense>}
		</DialogContext.Provider></NativeSubscriptionUIProvider></ChatGPTUIProvider>
	);
}

export function useSettingsDialog() { return useContext(DialogContext); }
