"use client";
import { useEffect, useRef } from "react";
import { Dialog } from "radix-ui";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";

export function ConnectionDialog({ children, onClose, busy, label, testid, backdropTestid }: { children: React.ReactNode; onClose: () => void; busy: boolean; label: string; testid: string; backdropTestid: string }) {
	const ref = useRef<HTMLDivElement>(null), closeRef = useRef(onClose);
	closeRef.current = onClose;
	const backdropDismiss = useBackdropDismiss(() => { if (!busy) onClose(); });
	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])') ?? [])];
		focusable()[0]?.focus();
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
			else if (event.key === "Tab") {
				const items = focusable(), first = items[0], last = items.at(-1);
				if (!first) { event.preventDefault(); return; }
				if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
				else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
			}
		};
		document.addEventListener("keydown", key, true);
		return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
	}, []);
	return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
		<Dialog.Portal>
			<Dialog.Overlay className="fixed inset-0 z-[60] bg-background/80" data-testid={backdropTestid} {...backdropDismiss} />
			<Dialog.Content ref={ref} data-lh-modal-content aria-describedby={undefined} aria-busy={busy} data-testid={testid}
				onOpenAutoFocus={(event) => { event.preventDefault(); ref.current?.querySelector<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])')?.focus(); }}
				onCloseAutoFocus={(event) => event.preventDefault()}
				onPointerDownOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => event.preventDefault()}
				className="fixed inset-4 z-[60] m-auto h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl outline-none">
				<Dialog.Title asChild><span className="sr-only">{label}</span></Dialog.Title>
				{children}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>;
}
