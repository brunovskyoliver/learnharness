"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { LoadingModal } from "@/components/loading-modal";
import { Button } from "@/components/ui/button";
import { useReloadRetry, useRestoreReloadRecovery, type ReloadOverlay } from "@/components/reload-recovery";
import type { SetupDialog } from "@/components/setup-dialog";

type SetupProps = ComponentProps<typeof SetupDialog>;
type SetupComponent = typeof SetupDialog;
let loadedSetup: SetupComponent | undefined;
let setupRequest: Promise<SetupComponent> | undefined;

function loadSetup(): Promise<SetupComponent> {
	if (loadedSetup) return Promise.resolve(loadedSetup);
	return setupRequest ??= import("@/components/setup-dialog")
		.then((module) => (loadedSetup = module.SetupDialog))
		.catch((error: unknown) => { setupRequest = undefined; throw error; });
}

/** Keep the unopened setup UI outside startup. Once loaded, retain its mount
 * so closing and reopening preserves the existing dialog's staged state. */
export function LazySetupDialog(originalProps: SetupProps) {
	const [restored, setRestored] = useState<ReloadOverlay | undefined>();
	useRestoreReloadRecovery("setup", (record) => { if (record.overlay.kind === "setup") setRestored(record.overlay); });
	const props: SetupProps = {
		...originalProps,
		open: originalProps.open || Boolean(restored),
		onClose: () => { setRestored(undefined); originalProps.onClose(); },
		onDone: (models) => { setRestored(undefined); originalProps.onDone(models); },
	};
	const recovery = useReloadRetry({ kind: "setup" });
	const [Setup, setSetup] = useState<SetupComponent | undefined>(() => loadedSetup);
	const [failed, setFailed] = useState(false);
	const handoff = useRef(false);
	const opener = useRef<HTMLElement | null>(null);
	useEffect(() => {
		if (!props.open || Setup) return;
		let active = true;
		loadSetup().then((component) => {
			if (!active) return;
			handoff.current = true;
			setSetup(() => component);
		}, () => { if (active) setFailed(true); });
		return () => { active = false; };
	}, [props.open, Setup]);
	useEffect(() => {
		if (props.open || !handoff.current) return;
		// The loaded dialog first focused inside the loading dialog. Restore
		// the original trigger after both Radix focus scopes finish closing.
		handoff.current = false;
		const trigger = opener.current;
		opener.current = null;
		const frame = requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); });
		return () => cancelAnimationFrame(frame);
	}, [props.open]);

	if (Setup) return <Setup {...props} />;
	if (!props.open) return null;
	return (
        <LoadingModal label="Set up your models" testid="setup-loading-dialog" onClose={props.onClose} onOpen={(trigger) => { opener.current = trigger; }}
            className="fixed inset-4 m-auto flex h-fit w-[640px] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-xl border border-border bg-background p-5 outline-none">
            <p role={failed ? "alert" : "status"} className="text-sm text-muted-foreground">
                {failed ? "Setup could not load. Reload to retry. Your draft will be saved before reloading." : "Loading setup…"}
            </p>
            {recovery.error && <p role="alert" className="text-sm text-muted-foreground">{recovery.error}</p>}
            <div className="flex justify-end gap-2">
                {failed && <Button variant="outline" onClick={recovery.reload}>Reload to retry</Button>}
                <Button variant="outline" onClick={props.onClose}>Close setup</Button>
            </div>
        </LoadingModal>
    );
}
