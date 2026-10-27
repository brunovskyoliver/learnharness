"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReloadRetry, useRestoreReloadRecovery, type ReloadOverlay } from "@/components/reload-recovery";
import { TopBar } from "@/components/top-bar";
import type { ChainTableOverlay } from "@/components/chain-table";

type ChainProps = ComponentProps<typeof ChainTableOverlay>;
type ChainComponent = typeof ChainTableOverlay;
let loadedTable: ChainComponent | undefined;
let tableRequest: Promise<ChainComponent> | undefined;

function loadTable(): Promise<ChainComponent> {
	if (loadedTable) return Promise.resolve(loadedTable);
	return tableRequest ??= import("@/components/chain-table")
		.then((module) => (loadedTable = module.ChainTableOverlay))
		.catch((error: unknown) => { tableRequest = undefined; throw error; });
}

/** The closed graph overlay must not load the table's math renderer. After
 * first use, keep its component mounted so its query and selection survive. */
export function LazyChainTableOverlay(originalProps: ChainProps) {
	const [restored, setRestored] = useState<ReloadOverlay | undefined>();
	useRestoreReloadRecovery("chains", (record) => { if (record.overlay.kind === "chains") setRestored(record.overlay); });
	const props: ChainProps = {
		...originalProps,
		open: originalProps.open || Boolean(restored && originalProps.nodes.length),
		onClose: () => { setRestored(undefined); originalProps.onClose(); },
		selectMode: restored?.kind === "chains" ? restored.selectMode : originalProps.selectMode,
	};
	const recovery = useReloadRetry({ kind: "chains", selectMode: props.selectMode === true });
	const [Table, setTable] = useState<ChainComponent | undefined>(() => loadedTable);
	const [failed, setFailed] = useState(false);
	const host = useRef<HTMLDivElement | null>(null);
	const closeButton = useRef<HTMLButtonElement | null>(null);
	const opener = useRef<HTMLElement | null>(null);
	const loadingFocused = useRef(false);

	useEffect(() => {
		if (!props.open || Table) return;
		let active = true;
		loadTable().then((component) => {
			if (active) setTable(() => component);
		}, () => { if (active) setFailed(true); });
		return () => { active = false; };
	}, [props.open, Table]);

	useEffect(() => {
		if (props.open) {
			opener.current = document.activeElement as HTMLElement | null;
			if (closeButton.current) {
				loadingFocused.current = true;
				closeButton.current.focus({ preventScroll: true });
			}
			return;
		}
		if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
		opener.current = null;
		loadingFocused.current = false;
	}, [props.open]);

	useEffect(() => {
		if (!props.open || !Table || !loadingFocused.current) return;
		loadingFocused.current = false;
		// Respect focus moved to the sidebar while the table was downloading.
		if (document.activeElement && document.activeElement !== document.body) return;
		host.current?.querySelector<HTMLInputElement>('[data-testid="chain-table-search"]')?.focus({ preventScroll: true });
	}, [props.open, Table]);

	useEffect(() => {
		if (!props.open || Table) return;
		const dismiss = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			event.preventDefault();
			event.stopPropagation();
			props.onClose();
		};
		document.addEventListener("keydown", dismiss);
		return () => document.removeEventListener("keydown", dismiss);
	}, [props.open, props.onClose, Table]);

	if (Table) return <div ref={host} className="contents"><Table {...props} /></div>;
	if (!props.open) return null;
	return (
		<div ref={host} className="contents">
			<div data-testid="chain-table-loading" role="region" aria-label="Chains" className="absolute inset-0 z-40 flex flex-col bg-background/80 backdrop-blur-sm">
				<TopBar>
					<span className="min-w-0 flex-1 text-xs text-muted-foreground" role={failed ? "alert" : "status"}>
						{failed ? "Chains could not load. Reload to retry. Your draft will be saved before reloading." : "Loading chains…"}
					</span>
					{failed && <Button variant="outline" onClick={recovery.reload}>Reload to retry</Button>}
					<Button ref={closeButton} variant="ghost" size="icon" aria-label="Close chains" onClick={props.onClose}><XIcon /></Button>
				</TopBar>
				{recovery.error && <p role="alert" className="px-5 py-3 text-sm text-muted-foreground">{recovery.error}</p>}
			</div>
		</div>
	);
}
