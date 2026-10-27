"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MenuPortalContext } from "@/components/menu-shell";
import { containModalTab } from "@/components/modal-focus";

/** Native modality keeps navigation immediately available without loading a
 * dialog runtime. Menus portal inside the modal so they remain interactive. */
export default function MobileSidebar({ width, onClose, hasMenu, children }: { width: number; onClose: () => void; hasMenu: boolean; children: ReactNode }) {
	const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
	const panel = useRef<HTMLDivElement>(null);
	const title = useId();
	useEffect(() => {
		if (!dialog) return;
		const overflow = document.body.style.overflow;
		dialog.showModal();
		panel.current?.focus({ preventScroll: true });
		document.body.style.overflow = "hidden";
		return () => {
			dialog.close();
			document.body.style.overflow = overflow;
			document.querySelector<HTMLButtonElement>('[aria-label="Open sidebar"]')?.focus({ preventScroll: true });
		};
	}, [dialog]);
	if (typeof document === "undefined") return null;
	return createPortal(
		<dialog ref={setDialog} role="dialog" aria-labelledby={title} aria-modal="true"
			className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-foreground outline-none backdrop:bg-transparent"
			onCancel={(event) => { event.preventDefault(); if (!hasMenu) onClose(); }}
			onKeyDown={(event) => {
				containModalTab(event, event.currentTarget);
				if (event.key !== "Escape") return;
				// Field handlers run first. An open menu still receives this
				// event, but its dismissal must not also cancel the native modal.
				event.preventDefault();
				if (!hasMenu) { event.stopPropagation(); onClose(); }
			}}
		>
			<div className="fixed inset-0 bg-black/40" onPointerDown={onClose} />
			<div ref={panel} data-mobile-navigation="" tabIndex={-1}
				className="fixed inset-y-0 left-0 outline-none"
				style={{ width: Math.min(width, 320), maxWidth: "calc(100vw - 3rem)" }}
			>
				<h2 id={title} className="sr-only">Sessions</h2>
				<MenuPortalContext.Provider value={dialog}>{children}</MenuPortalContext.Provider>
			</div>
		</dialog>, document.body,
	);
}
