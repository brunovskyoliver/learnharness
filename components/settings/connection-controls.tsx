"use client";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { LoadingModal } from "@/components/loading-modal";
import type { ConnectionDialog as LoadedDialog } from "./connection-dialog";
import { Button } from "@/components/ui/button";

/** The connection action's classes, shared with other outline row actions
 *  (Claude Code's Check again) so they read as one control. */
export function connectionActionClass(variant: "outline" | "ghost"): string {
	return `ml-auto cursor-pointer disabled:cursor-not-allowed pointer-coarse:min-h-11 ${variant === "outline" ? "" : "text-faint hover:text-ink"}`;
}

export function ConnectionRow({ label, action, actionVariant, disabled, onAction, children, testid, actionTestid }: { label: string; action: string; actionVariant?: "outline" | "ghost"; disabled: boolean; onAction: () => void; children?: React.ReactNode; testid?: string; actionTestid?: string }) {
	const variant = actionVariant ?? (action === "Connect" ? "outline" : "ghost");
	return <div className="flex min-h-14 flex-wrap items-center gap-3 py-3" data-testid={testid}>
		<span className="nb-set-row-label">{label}</span>
		{children}
		<Button type="button" size="xs" variant={variant} className={connectionActionClass(variant)} data-testid={actionTestid} disabled={disabled} onClick={onAction}>{action}</Button>
	</div>;
}

export function ConnectionFooter({ leading, children, testid }: { leading?: React.ReactNode; children: React.ReactNode; testid?: string }) {
	return <div className="mt-4 flex flex-wrap items-center justify-between gap-3" data-testid={testid}>
		{leading}
		<div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
	</div>;
}

type DialogComponent = typeof LoadedDialog;
let loadedDialog: DialogComponent | undefined;
let request: Promise<DialogComponent> | undefined;
function loadDialog() {
 return request ??= import("./connection-dialog").then((module) => (loadedDialog = module.ConnectionDialog));
}

/** Root connection state remains live while its modal presentation downloads. */
export function ConnectionDialog(props: ComponentProps<DialogComponent>) {
 const [Dialog, setDialog] = useState<DialogComponent | undefined>(() => loadedDialog);
 const [failed, setFailed] = useState(false);
 const opener = useRef<HTMLElement | null>(null);
 useEffect(() => {
  return () => { const trigger = opener.current; setTimeout(() => { if (trigger?.isConnected && !document.querySelector(`[data-testid="${props.testid}"]`)) trigger.focus(); }, 0); };
 }, []);
 useEffect(() => {
  if (Dialog) return;
  let active = true;
  loadDialog().then((component) => { if (active) setDialog(() => component); }, () => { if (active) setFailed(true); });
  return () => { active = false; };
 }, [Dialog]);
 useEffect(() => {
  if (!failed || document.activeElement !== document.body) return;
  document.querySelector<HTMLElement>(`[data-testid="${props.testid}-loading"]`)?.querySelector<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])')?.focus();
 }, [failed]);
 if (Dialog) return <Dialog {...props} />;
 return <LoadingModal label={props.label} onClose={props.onClose} busy={props.busy} onOpen={(trigger) => { opener.current = trigger; }} testid={`${props.testid}-loading`} hideTitle={failed}>
  {failed ? <>
   <p role="status" className="lh-dialog-text mb-3 text-ink">The standard dialog could not load. Account controls remain available below.</p>
   {props.children}
  </> : <>
   <p role="status" className="lh-dialog-text text-faint">Loading connection…</p>
   <div className="lh-dialog-actions"><button type="button" className="lh-text-action" disabled={props.busy} onClick={props.onClose}>Close</button></div>
  </>}
 </LoadingModal>;
}
