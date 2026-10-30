"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BrailleSpinner } from "@/components/braille-spinner";
import { SettingsRow, Toggle } from "./controls.tsx";
import { AUTO_UPDATE_HINT } from "./settings-index";
import { useUpdateState, type UpdateState } from "./update-state.ts";
export { useUpdateState, type UpdateState } from "./update-state.ts";

export const APP_VERSION = process.env.LH_VERSION ?? "";
const HOMEPAGE = process.env.LH_HOMEPAGE ?? "";
export const MANUAL_UPDATE_HINT = "Checking downloads available updates. Downloaded updates install when you quit the app.";
export { AUTO_UPDATE_HINT };
const UPDATE_ERROR = "Couldn’t check for updates. Try again later.";

export function updateStatusText(state: UpdateState | null): string | null {
	switch (state?.status) {
		case "checking": return "Checking for updates…";
		case "downloading": return state.version ? `Downloading version ${state.version}…` : "Downloading an update…";
		case "up-to-date": return "No newer version was found at the last check.";
		case "downloaded": return `${state.version ? `Version ${state.version}` : "An update"} is ready. It will install when you quit the app.`;
		case "error": return UPDATE_ERROR;
		default: return null;
	}
}

/** Version information is useful everywhere; update controls only belong
 * to a shell with an available updater. Opening this row never checks. */
export function UpdateSettings({
	autoUpdate,
	onAutoUpdateChange,
	version = APP_VERSION,
	homepage = HOMEPAGE,
}: {
	autoUpdate: boolean;
	onAutoUpdateChange: (on: boolean) => void;
	version?: string;
	homepage?: string;
}) {
	const { state, failed } = useUpdateState();
	const [checkFailed, setCheckFailed] = useState(false);
	useEffect(() => setCheckFailed(false), [state]);
	const active = state !== null && state.status !== "disabled";
	const busy = state?.status === "checking" || state?.status === "downloading";
	const status = state?.status === "downloaded" ? updateStatusText(state)
		: failed || checkFailed ? UPDATE_ERROR : updateStatusText(state);
	const releaseNotes = version && homepage ? `${homepage}/releases/tag/v${version}` : null;
	const check = () => {
		setCheckFailed(false);
		void window.lh?.checkForUpdates?.().catch(() => setCheckFailed(true));
	};

	return (
		<>
			<SettingsRow
				label={`Version ${version || "unknown"}`}
				testid="row-version"
				rowId="version"
				hint={
					<>
						{status && <span className="block" role="status" data-testid="update-status">{status}</span>}
						{active && <span className="block">{MANUAL_UPDATE_HINT}</span>}
						{releaseNotes && <a href={releaseNotes} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-foreground hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center" data-testid="release-notes">Release notes</a>}
					</>
				}
			>
				{active && (state.status === "downloaded" ? (
					<Button type="button" size="xs" className="cursor-pointer pointer-coarse:min-h-11" data-testid="update-restart" onClick={() => window.lh?.installUpdate?.()}>Restart</Button>
				) : (
					<Button type="button" size="xs" variant="outline" className="cursor-pointer disabled:cursor-not-allowed pointer-coarse:min-h-11" data-testid="update-check" disabled={busy} aria-busy={busy} onClick={check}>
						{busy && <BrailleSpinner label={state.status === "downloading" ? "Downloading update" : "Checking for updates"} />}
						Check for updates
					</Button>
				))}
			</SettingsRow>
			{active && (
				<SettingsRow label="Automatic updates" hint={AUTO_UPDATE_HINT} testid="row-auto-update" rowId="auto-update">
					<Toggle checked={autoUpdate} label="auto update" onChange={onAutoUpdateChange} />
				</SettingsRow>
			)}
		</>
	);
}
