"use client";

/**
 * The auto-update banner (Wave C, owner 2026-10-10: silent download +
 * restart-banner UX). The shell pushes "lh:update-status" once a staged
 * update exists (electron/main.cjs update-downloaded). Snapshot retrieval
 * also covers a late load. The card offers Restart alongside Settings.
 * Browser builds have no window.lh and never see a push: renders null.
 *
 * No dismiss: a downloaded update installs on quit anyway
 * (autoInstallOnAppQuit); the banner is a courtesy, not a gate.
 */

import { useUpdateState } from "@/components/settings/update-state.ts";

export default function UpdateBanner() {
	const { state: ready } = useUpdateState();
	if (ready?.status !== "downloaded") return null;
	// Feature 025: a lifted card (radius 10) in the corner hint's register,
	// Restart the one ink pill. It sits under the band, clear of the composer and the corner hint.
	return (
		<div
			data-testid="update-banner"
			role="status"
			className="fixed top-14 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-paper px-4 py-3 shadow-lift"
		>
			<p className="min-w-0 text-sm text-graphite">
				<span className="font-medium text-ink">Brunovský&apos;s study {ready.version ?? "update"} is ready</span>
				<span> — restart to finish installing.</span>
			</p>
			<button type="button" onClick={() => window.lh?.installUpdate?.()} className="nb-pill ml-auto">
				Restart
			</button>
		</div>
	);
}
