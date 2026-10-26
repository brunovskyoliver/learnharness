"use client";
/**
 * The Files section (hosted only, 2026-10-26): the user's upload folder —
 * the only files the agent's ls/find/grep/read/pdf tools can see in hosted
 * mode. List, upload (multi-select), delete. Talks to /api/files.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsRow } from "./controls.tsx";

interface StoredFile { name: string; size: number; modifiedAt: string }

function size(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function call(init?: RequestInit, query = ""): Promise<StoredFile[]> {
	const response = await fetch(`/api/files${query}`, { cache: "no-store", ...init });
	const body = await response.json().catch(() => ({})) as { files?: StoredFile[]; error?: string };
	if (!response.ok || !body.files) throw new Error(body.error ?? "Files could not be loaded.");
	return body.files;
}

export function FilesSection() {
	const [files, setFiles] = useState<StoredFile[] | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const input = useRef<HTMLInputElement | null>(null);

	async function run(action: () => Promise<StoredFile[]>) {
		setBusy(true); setError(null);
		try { setFiles(await action()); }
		catch (e) { setError(e instanceof Error ? e.message : "Files could not be changed."); }
		finally { setBusy(false); }
	}
	useEffect(() => { void run(() => call()); }, []);

	function upload(list: FileList | null) {
		if (!list || list.length === 0) return;
		const form = new FormData();
		for (const file of list) form.append("files", file);
		void run(() => call({ method: "POST", body: form }));
		if (input.current) input.current.value = "";
	}

	return (
		<div className="flex flex-col gap-3" data-testid="files-section">
			<p className="text-xs text-muted-foreground">The agent can read only the files here. Up to 10 MB per upload.</p>
			<div>
				<input ref={input} type="file" multiple hidden data-testid="files-input" onChange={(event) => upload(event.target.files)} />
				<Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} data-testid="files-upload">Upload files…</Button>
			</div>
			{error && <p role="alert" className="text-xs text-red-400">{error}</p>}
			{files === null ? (
				<p className="text-xs text-muted-foreground/70">Loading files…</p>
			) : files.length === 0 ? (
				<p className="text-xs text-muted-foreground/70" data-testid="files-empty">No files yet.</p>
			) : (
				files.map((file) => (
					<SettingsRow key={file.name} label={file.name} hint={size(file.size)} testid="files-row">
						<Button variant="ghost" size="xs" className="text-red-400 hover:text-red-300" disabled={busy} onClick={() => void run(() => call({ method: "DELETE" }, `?name=${encodeURIComponent(file.name)}`))}>Delete</Button>
					</SettingsRow>
				))
			)}
		</div>
	);
}
