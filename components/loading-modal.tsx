"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import { containModalTab } from "@/components/modal-focus";

/** The temporary shell uses the browser modal while the full dialog downloads.
 * Native modality keeps background content inert without shipping dialog code. */
export function LoadingModal({ label, children, onClose, busy = false, testid, className, onOpen, hideTitle = false }: {
 label: string; children: ReactNode; onClose: () => void; busy?: boolean; testid: string; className?: string; onOpen?: (trigger: HTMLElement | null) => void; hideTitle?: boolean;
}) {
 const ref = useRef<HTMLDialogElement>(null);
 const close = useRef(onClose);
 const locked = useRef(busy);
 close.current = onClose; locked.current = busy;
 const title = useId();
 const backdrop = useBackdropDismiss(() => { if (!busy) onClose(); });
 useEffect(() => {
  const dialog = ref.current;
  const previous = document.activeElement as HTMLElement | null;
  if (!dialog) return;
  onOpen?.(previous);
  dialog.showModal();
  const scroll = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const escape = (event: KeyboardEvent) => {
   containModalTab(event, dialog);
   if (event.key !== "Escape") return;
   event.preventDefault(); event.stopImmediatePropagation();
   if (!locked.current) close.current();
  };
  document.addEventListener("keydown", escape, true);
  return () => {
   document.removeEventListener("keydown", escape, true);
   document.body.style.overflow = scroll;
   dialog.close();
   if (previous?.isConnected) previous.focus({ preventScroll: true });
  };
 }, []);
 if (typeof document === "undefined") return null;
 return createPortal(
  <dialog ref={ref} role="dialog" aria-labelledby={title} aria-busy={busy} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="pointer-events-auto fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-foreground outline-none backdrop:bg-transparent">
   <div className="fixed inset-0 bg-background/80" {...backdrop} />
   <div data-lh-modal-content data-testid={testid} className={className ?? "fixed inset-4 m-auto h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl outline-none"}>
    <h2 id={title} className={hideTitle ? "sr-only" : "text-base font-semibold"}>{label}</h2>
    {children}
   </div>
  </dialog>, document.body,
 );
}
