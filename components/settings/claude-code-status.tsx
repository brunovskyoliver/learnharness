"use client";
/**
 * Settings → Providers → External CLI (feature 029, port of upstream's
 * claude-code-status.tsx onto the paper settings kit). The opt-in switch
 * persists first, then the installation check runs; switching off aborts a
 * pending check. Upstream's "Verify AI claims independently…" line is not
 * rendered (owner, spec Clarifications).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CLAUDE_CODE_MINIMUM_VERSION, type ClaudeCodeStatus, type UserSettings } from "@/src/core";
import { notifySettingsSaved, useSettingsSaved } from "@/components/settings-signal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { connectionActionClass } from "./connection-controls";
import { ClaudeCodeSignIn } from "./claude-code-sign-in";
import { useSettingsDialog } from "./settings-dialog";
import { SettingsFailure, SettingsRow, Toggle } from "./controls";

export function claudeCodeStatusLabel(status: ClaudeCodeStatus | null): string {
	switch (status?.state) {
		case "not-found": return "Not found";
		case "meets-minimum": return `Version ${status.version} · meets minimum`;
		case "update-required": return `Version ${status.version} · update required`;
		default: return "Version could not be checked";
	}
}

export function ClaudeCodeInstallationStatus() {
	const { hosted } = useSettingsDialog();
	const [enabled, setEnabled] = useState(false);
	const [loaded, setLoaded] = useState(false);
	// The first successful read makes the row a search target; the remount
	// it causes lets the settings jump (a childList observer) land on an
	// unlocked switch.
	const [ready, setReady] = useState(false);
	// This component's own save notification needs no re-read: re-reading
	// would lock the switch the keyboard user just pressed and drop focus.
	const ownNotify = useRef(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<ClaudeCodeStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const request = useRef<AbortController | null>(null);
	const settingsRead = useRef<AbortController | null>(null);
	const settingsWrite = useRef<AbortController | null>(null);

	const read = useCallback(async () => {
		settingsRead.current?.abort();
		const controller = new AbortController();
		settingsRead.current = controller;
		setLoaded(false);
		try {
			const response = await fetch("/api/settings", { cache: "no-store", signal: controller.signal });
			if (!response.ok) throw new Error("settings unavailable");
			const body = await response.json() as { settings: UserSettings | null };
			if (!controller.signal.aborted) {
				setEnabled(body.settings?.claudeCode?.enabled === true);
				setLoaded(true);
				setReady(true);
				setError(null);
			}
		} catch {
			if (!controller.signal.aborted) setError("Could not load Claude Code settings.");
		}
	}, []);
	useEffect(() => {
		void read();
		return () => { settingsRead.current?.abort(); settingsWrite.current?.abort(); };
	}, [read]);
	useSettingsSaved((section) => { if (section === "claudeCode" && !ownNotify.current) void read(); });

	const save = async (next: boolean) => {
		const controller = new AbortController();
		settingsWrite.current = controller;
		settingsRead.current?.abort();
		setSaving(true);
		setError(null);
		try {
			const response = await fetch("/api/settings/claudeCode", { method: "PUT", headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: next }), signal: controller.signal });
			if (!response.ok) throw new Error("settings write failed");
			const body = await response.json() as { settings: UserSettings };
			if (typeof body.settings?.claudeCode?.enabled !== "boolean") throw new Error("invalid settings response");
			if (!controller.signal.aborted) {
				setEnabled(body.settings.claudeCode.enabled);
				ownNotify.current = true;
				try { notifySettingsSaved("claudeCode"); } finally { ownNotify.current = false; }
			}
		} catch {
			if (!controller.signal.aborted) setError("Could not save Claude Code settings.");
		} finally {
			if (!controller.signal.aborted) setSaving(false);
		}
	};

	const refresh = useCallback(async () => {
		if (!enabled) return;
		request.current?.abort();
		const controller = new AbortController();
		request.current = controller;
		setBusy(true);
		try {
			const response = await fetch("/api/claude-code", { cache: "no-store", signal: controller.signal, headers: { "x-learnharness-claude-code": "1" } });
			if (!response.ok) throw new Error("status unavailable");
			const value = await response.json() as ClaudeCodeStatus;
			if (!["not-found", "meets-minimum", "update-required", "version-unchecked"].includes(value.state)
				|| value.minimumVersion !== CLAUDE_CODE_MINIMUM_VERSION
				|| (value.version !== null && (typeof value.version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.version)))) throw new Error("invalid status");
			if (!controller.signal.aborted) setStatus(value);
		} catch {
			if (!controller.signal.aborted) setStatus(null);
		} finally {
			if (!controller.signal.aborted) setBusy(false);
		}
	}, [enabled]);
	useEffect(() => {
		if (enabled) void refresh();
		else { request.current?.abort(); setStatus(null); setBusy(false); }
		return () => request.current?.abort();
	}, [enabled, refresh]);

	return <div key={ready ? "ready" : "loading"} className="flex scroll-mt-4 flex-col rounded-md" data-testid="claude-code-installation" data-settings-row={ready ? "claude-code" : undefined}>
		<SettingsRow label="Claude Code">
			<Toggle label="Claude Code" checked={enabled} disabled={!loaded} busy={saving} onChange={(next) => void save(next)} />
		</SettingsRow>
		{error && <SettingsFailure testid="claude-code-settings-error" message={error} className="pb-3" />}
		{enabled && <div className="flex flex-col gap-2 pb-3" data-testid="claude-code-details">
			<div className="flex flex-wrap items-center gap-3">
				<span role="status" className="text-meta text-graphite">{busy ? "Checking…" : claudeCodeStatusLabel(status)}</span>
				{/* aria-disabled, not disabled: a check in flight keeps keyboard focus on the button. */}
				<Button type="button" size="xs" variant="outline" className={cn(connectionActionClass("outline"), "aria-disabled:text-faint")} aria-disabled={busy || undefined} onClick={() => { if (!busy) void refresh(); }} data-testid="claude-code-check-again">Check again</Button>
			</div>
			{hosted ? <>
				{/* Hosted (owner O2): each user signs in with their own account; no terminal setup, no Setup link. */}
				<p className="nb-set-row-hint">Sign in with your own Claude account. Your usage is billed to that account.</p>
				<p className="nb-set-row-hint">Claude Code controls billing. Requires v{CLAUDE_CODE_MINIMUM_VERSION}+.</p>
				<ClaudeCodeSignIn />
			</> : <>
				<p className="nb-set-row-hint"><strong className="font-medium text-graphite">Install and authenticate Claude Code in your terminal, then select a Claude Code model here.</strong> LearnHarness starts it when needed—no background process required.</p>
				<p className="nb-set-row-hint">Checks installation/version only—not authentication, model access, or quota. Claude Code controls billing. Requires v{CLAUDE_CODE_MINIMUM_VERSION}+. <a href="https://code.claude.com/docs/en/setup" target="_blank" rel="noreferrer" className="text-graphite underline underline-offset-2 hover:text-ink">Setup <span aria-hidden="true">↗</span></a></p>
			</>}
		</div>}
	</div>;
}
