"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";

/** Loaded only when narrow-screen navigation opens. Dialog owns focus,
 * outside clicks and background inertness; desktop pays no drawer bundle. */
export default function MobileSidebar({ width, onClose, hasMenu, children }: { width: number; onClose: () => void; hasMenu: boolean; children: ReactNode }) {
	return (
		<Dialog.Root open onOpenChange={(value) => { if (!value) onClose(); }}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
				<Dialog.Content aria-modal="true" data-mobile-navigation="" aria-describedby={undefined}
					className="fixed inset-y-0 left-0 z-50 outline-none"
					style={{ width: Math.min(width, 320), maxWidth: "calc(100vw - 3rem)" }}
					onOpenAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLElement>("[data-mobile-navigation]")?.focus(); }}
					onKeyDownCapture={(event) => {
						if (event.key === "Escape" && !hasMenu) { event.preventDefault(); event.stopPropagation(); onClose(); }
					}}
					onEscapeKeyDown={(event) => { if (hasMenu) { event.preventDefault(); return; } event.preventDefault(); event.stopPropagation(); onClose(); }}
					onCloseAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLButtonElement>('[aria-label="Open sidebar"]')?.focus(); }}
				>
					<Dialog.Title className="sr-only">Sessions</Dialog.Title>
					{children}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
