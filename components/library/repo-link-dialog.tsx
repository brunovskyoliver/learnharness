"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { InkWait } from "@/components/paper/blot";
import { REPO_MAX_LINKS, type LibraryFolder, type RepoLinkView, type SyncFailure } from "@/src/core";

/** What POST /api/library/links answered (contracts/api.md). */
export type LinkAnswer =
	| { ok: true; link: RepoLinkView; folder: LibraryFolder }
	| { ok: false; code: string; error: string; suggestedName?: string; failure?: SyncFailure };

export interface LinkFields { url: string; folderName: string; token: string; branch: string }

type Field = "url" | "folderName" | "token" | "branch" | "form";

/** The field a refusal belongs under (ui-contract.md). */
function fieldOf(answer: Extract<LinkAnswer, { ok: false }>): Field {
	if (answer.code === "sync_failed") return answer.failure?.code === "auth" ? "token" : "url";
	if (answer.code === "invalid_branch") return "branch";
	if (["invalid_name", "name_taken", "folder_missing", "repo_folder"].includes(answer.code)) return "folderName";
	if (answer.code === "limit_links" || answer.code === "already_linked") return "form";
	return "url";
}

/** "notes" from https://github.com/oliver/notes.git, or "" while it isn't one. */
export function repoNameOf(raw: string): string {
	try {
		const last = new URL(raw.trim()).pathname.replace(/\/+$/, "").split("/").at(-1) ?? "";
		return decodeURIComponent(last.replace(/\.git$/i, ""));
	} catch {
		return "";
	}
}

const LIMIT_SENTENCE = "You have 10 linked repos, the most allowed. Unlink one to add another.";

/** "Link a repo" (ui-contract.md): a lifted dialog of line fields. The first pull runs
 *  while it shows "Linking…"; Cancel only closes it, and the parent keeps the outcome. */
export function RepoLinkDialog({ open, location, linkCount, hosted, onClose, onSubmit, returnFocus }: {
	open: boolean;
	/** "In Physics / Waves" or "In Library". */
	location: string;
	linkCount: number;
	hosted: boolean;
	onClose: () => void;
	/** Resolves with the server's answer; the parent handles success. */
	onSubmit: (fields: LinkFields) => Promise<LinkAnswer>;
	returnFocus: () => void;
}) {
	const [fields, setFields] = useState<LinkFields>({ url: "", folderName: "", token: "", branch: "" });
	const [nameEdited, setNameEdited] = useState(false);
	const [branchOpen, setBranchOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [refusal, setRefusal] = useState<Extract<LinkAnswer, { ok: false }> | null>(null);
	const [details, setDetails] = useState(false);
	const live = useRef(true);
	useEffect(() => {
		if (!open) return;
		live.current = true;
		setFields({ url: "", folderName: "", token: "", branch: "" });
		setNameEdited(false);
		setBranchOpen(false);
		setBusy(false);
		setRefusal(null);
		setDetails(false);
		return () => { live.current = false; };
	}, [open]);
	const atLimit = linkCount >= REPO_MAX_LINKS;
	const set = (key: keyof LinkFields, value: string) => {
		setFields((current) => {
			const next = { ...current, [key]: value };
			if (key === "url" && !nameEdited) next.folderName = repoNameOf(value);
			return next;
		});
		if (key === "folderName") setNameEdited(true);
		if (refusal && fieldOf(refusal) === key) setRefusal(null);
	};
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (busy || atLimit || !fields.url.trim() || !fields.folderName.trim()) return;
		setBusy(true);
		setRefusal(null);
		setDetails(false);
		const answer = await onSubmit(fields);
		if (!live.current) return;
		setBusy(false);
		if (!answer.ok) {
			setRefusal(answer);
			const field = fieldOf(answer);
			if (field === "branch") setBranchOpen(true);
			// The field the refusal sits under takes focus, so the sentence is read with it.
			if (field !== "form") requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-testid="repo-link-dialog"] input[name="repo-${field}"]`)?.focus());
		}
	};
	const where = refusal ? fieldOf(refusal) : null;
	const line = (field: Field) => {
		if (field === "form" && atLimit) return <p role="alert" id="repo-link-error-form" className="text-sm text-red" data-testid="repo-link-refusal">{LIMIT_SENTENCE}</p>;
		if (!refusal || where !== field) return null;
		const sentence = refusal.failure?.message ?? refusal.error;
		const detail = refusal.failure?.detail;
		return (
			<div className="flex flex-col gap-1" id={`repo-link-error-${field}`} data-testid="repo-link-refusal">
				<p role="alert" className="text-sm text-red [overflow-wrap:anywhere]">{sentence}</p>
				<div className="flex flex-wrap gap-x-4">
					{refusal.code === "name_taken" && refusal.suggestedName && (
						<button type="button" className="lh-text-action" onClick={() => { set("folderName", refusal.suggestedName!); setRefusal(null); }}>Use {refusal.suggestedName}</button>
					)}
					{detail && <button type="button" className="lh-text-action" aria-expanded={details} onClick={() => setDetails((on) => !on)}>{details ? "Hide details" : "Show details"}</button>}
				</div>
				{detail && details && <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-graphite [overflow-wrap:anywhere]" data-testid="repo-link-detail">{detail}</pre>}
			</div>
		);
	};
	const label = "lh-float-label";
	return (
		<Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
			<DialogContent showCloseButton={false} data-testid="repo-link-dialog" className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto sm:max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}>
				<DialogTitle>Link a repo</DialogTitle>
				<DialogDescription>The app pulls the repo every 15 minutes and keeps a read-only copy here. It never writes to the repo.</DialogDescription>
				<form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
					<label className="flex flex-col gap-1">
						<span className={label}>Repo address (HTTPS)</span>
						<input
							autoFocus
							value={fields.url}
							placeholder="https://github.com/you/notes"
							inputMode="url"
							autoComplete="off"
							autoCapitalize="off"
							spellCheck={false}
							aria-invalid={where === "url" ? true : undefined}
							aria-describedby={where === "url" ? "repo-link-error-url" : undefined}
							name="repo-url"
							data-testid="repo-link-url"
							onChange={(event) => set("url", event.target.value)}
							className="lh-line-field"
						/>
					</label>
					{line("url")}
					<label className="flex flex-col gap-1">
						<span className={label}>Folder name</span>
						<input
							value={fields.folderName}
							autoComplete="off"
							spellCheck={false}
							aria-invalid={where === "folderName" ? true : undefined}
							aria-describedby={where === "folderName" ? "repo-link-error-folderName" : undefined}
							name="repo-folderName"
							data-testid="repo-link-folder"
							onChange={(event) => set("folderName", event.target.value)}
							className="lh-line-field"
						/>
					</label>
					{line("folderName")}
					<label className="flex flex-col gap-1">
						<span className={label}>Personal access token (only for a private repo)</span>
						<input
							type="password"
							value={fields.token}
							autoComplete="off"
							spellCheck={false}
							aria-invalid={where === "token" ? true : undefined}
							aria-describedby={where === "token" ? "repo-link-error-token" : undefined}
							name="repo-token"
							data-testid="repo-link-token"
							onChange={(event) => set("token", event.target.value)}
							className="lh-line-field"
						/>
					</label>
					{line("token")}
					{branchOpen ? (
						<label className="flex flex-col gap-1">
							<span className={label}>Branch</span>
							<input
								autoFocus
								value={fields.branch}
								placeholder="Default branch"
								autoComplete="off"
								autoCapitalize="off"
								spellCheck={false}
								aria-invalid={where === "branch" ? true : undefined}
								aria-describedby={where === "branch" ? "repo-link-error-branch" : undefined}
								name="repo-branch"
								data-testid="repo-link-branch"
								onChange={(event) => set("branch", event.target.value)}
								className="lh-line-field"
							/>
						</label>
					) : (
						<p className="flex flex-wrap items-center gap-x-2 text-sm text-graphite">
							<span className="text-faint">Branch</span>
							<button type="button" className="lh-text-action" aria-expanded={false} onClick={() => setBranchOpen(true)} data-testid="repo-link-branch-toggle">Default branch</button>
						</p>
					)}
					{line("branch")}
					<p className="text-sm text-faint [overflow-wrap:anywhere]" data-testid="repo-link-location">{location}</p>
					{hosted && <p className="text-sm text-faint">The token is stored on the server for your account only.</p>}
					{line("form")}
					<div className="mt-1 flex items-center justify-end gap-5">
						<button type="button" className="lh-text-action" onClick={onClose} data-testid="repo-link-cancel">Cancel</button>
						<button
							type="submit"
							className="nb-pill inline-flex items-center gap-2"
							disabled={!busy && (atLimit || !fields.url.trim() || !fields.folderName.trim())}
							aria-disabled={busy ? true : undefined}
							data-testid="repo-link-submit"
						>
							{busy && <InkWait label="Linking" size={12} />}
							{busy ? "Linking…" : "Link"}
						</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
