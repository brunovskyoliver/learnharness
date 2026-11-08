"use client";

import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { syncStatusText, type RepoLinkView } from "@/src/core";
import { DESTRUCTIVE_BUTTON } from "./delete-item-dialog.tsx";

/** What a token change answered: the link as it is now, or why not. */
export type TokenAnswer = { ok: true; link: RepoLinkView } | { ok: false; error: string };

const LABEL = "text-sm text-faint";
const VALUE = "min-w-0 text-md text-ink [overflow-wrap:anywhere]";

/** The details rows and token actions, pure for SSR tests (portals render nothing there). */
export function RepoDetailsBody({ link, folderName, now, onSyncNow, onToken, onUnlink, onClose }: {
	link: RepoLinkView;
	folderName: string;
	now: Date;
	onSyncNow: () => void;
	/** A new token, or null to remove it. */
	onToken: (token: string | null) => Promise<TokenAnswer>;
	onUnlink: () => void;
	onClose: () => void;
}) {
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const [saved, setSaved] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const field = useRef<HTMLInputElement>(null);
	useEffect(() => { if (editing) field.current?.focus(); }, [editing]);
	const syncing = link.sync.state === "syncing" || link.sync.state === "never";
	const send = async (token: string | null) => {
		setBusy(true);
		setFailure(null);
		setSaved(false);
		const answer = await onToken(token);
		setBusy(false);
		if (!answer.ok) return setFailure(answer.error);
		setValue("");
		setEditing(false);
		if (token !== null) setSaved(true);
	};
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!busy && value.trim()) void send(value.trim());
	};
	return (
		<>
			<DialogTitle className="[overflow-wrap:anywhere]">{folderName}</DialogTitle>
			<DialogDescription className="sr-only">The repo this folder is linked to.</DialogDescription>
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 gap-y-2.5 max-sm:grid-cols-1 max-sm:gap-y-0.5" data-testid="repo-details">
				<dt className={LABEL}>Address</dt>
				<dd className={`${VALUE} max-sm:mb-2`}>
					<a href={link.url} target="_blank" rel="noreferrer" className="underline decoration-ink/40 underline-offset-[3px] hover:decoration-ink pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center" data-testid="repo-details-address">{link.display}</a>
				</dd>
				<dt className={LABEL}>Branch</dt>
				<dd className={`${VALUE} max-sm:mb-2`} data-testid="repo-details-branch">{link.branchGiven ? link.branch : `${link.branch} (default)`}</dd>
				<dt className={LABEL}>Last sync</dt>
				<dd className={`${VALUE} max-sm:mb-2`} data-testid="repo-details-sync">{syncStatusText(link.sync, now)}</dd>
				<dt className={LABEL}>Commit</dt>
				<dd className={`${VALUE} font-mono text-sm max-sm:mb-2`} data-testid="repo-details-commit">{link.sync.commit ? link.sync.commit.slice(0, 7) : "—"}</dd>
				<dt className={LABEL}>Token</dt>
				<dd className={`${VALUE} flex flex-col gap-1.5`}>
					<span className="flex flex-wrap items-center gap-x-4 gap-y-1">
						<span className={link.tokenMask ? "font-mono text-sm" : "text-graphite"} data-testid="repo-details-token">{link.tokenMask ?? "No token"}</span>
						{!editing && (
							<>
								<button type="button" className="lh-text-action" disabled={busy} onClick={() => { setSaved(false); setFailure(null); setEditing(true); }} data-testid="repo-details-token-edit">{link.tokenMask ? "Replace token" : "Add token"}</button>
								{link.tokenMask && <button type="button" className="lh-text-action" disabled={busy} onClick={() => void send(null)} data-testid="repo-details-token-remove">Remove token</button>}
							</>
						)}
					</span>
					{editing && (
						<form onSubmit={submit} className="flex flex-wrap items-end gap-x-4 gap-y-2">
							<input
								ref={field}
								type="password"
								value={value}
								autoComplete="off"
								spellCheck={false}
								aria-label="Personal access token"
								data-testid="repo-details-token-field"
								onChange={(event) => setValue(event.target.value)}
								onKeyDown={(event) => {
									// Escape leaves the field, not the dialog; focus goes back to its action.
									if (event.key !== "Escape") return;
									event.preventDefault();
									setEditing(false);
									setValue("");
									requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="repo-details-token-edit"]')?.focus());
								}}
								className="lh-line-field min-w-0 flex-[1_1_12rem]"
							/>
							<button type="submit" className="nb-pill" disabled={busy || !value.trim()} data-testid="repo-details-token-save">Save token</button>
						</form>
					)}
					{saved && <p role="status" className="text-sm text-graphite" data-testid="repo-details-token-saved">Saved. The next sync uses it.</p>}
					{failure && <p role="alert" className="text-sm text-red">{failure}</p>}
				</dd>
			</dl>
			<div className="mt-2 flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
				<button type="button" className="lh-text-action mr-auto" aria-disabled={syncing || undefined} onClick={() => { if (!syncing) onSyncNow(); }} data-testid="repo-details-sync-now">{syncing ? "Syncing…" : "Sync now"}</button>
				<button type="button" className="lh-text-action" data-danger="" onClick={onUnlink} data-testid="repo-details-unlink">Unlink…</button>
				<button type="button" className="lh-text-action" onClick={onClose} data-testid="repo-details-close">Close</button>
			</div>
		</>
	);
}

/** "Repo details" (ui-contract.md): a lifted dialog; focus trapped and returned. */
export function RepoDetailsDialog({ link, folderName, onClose, onSyncNow, onToken, onUnlink, returnFocus }: {
	link: RepoLinkView | null;
	folderName: string;
	onClose: () => void;
	onSyncNow: () => void;
	onToken: (token: string | null) => Promise<TokenAnswer>;
	onUnlink: () => void;
	returnFocus: () => void;
}) {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		if (!link) return;
		setNow(new Date());
		const timer = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(timer);
	}, [link]);
	return (
		<Dialog open={link !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent
				showCloseButton={false}
				data-testid="repo-details-dialog"
				className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto sm:max-w-md"
				// Escape in the token field closes the field (its own handler), not the dialog.
				onEscapeKeyDown={(event) => { if ((document.activeElement as HTMLElement | null)?.dataset.testid === "repo-details-token-field") event.preventDefault(); }}
				onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}
			>
				{link && <RepoDetailsBody key={link.id} link={link} folderName={folderName} now={now} onSyncNow={onSyncNow} onToken={onToken} onUnlink={onUnlink} onClose={onClose} />}
			</DialogContent>
		</Dialog>
	);
}

/** The unlink confirm (ui-contract.md): red pill, focus starts on Cancel, Escape cancels. */
export function UnlinkBody({ folderName, files, busy, failure, onCancel, onConfirm, cancelRef }: {
	folderName: string;
	files: number;
	busy: boolean;
	failure: string | null;
	onCancel: () => void;
	onConfirm: () => void;
	cancelRef?: Ref<HTMLButtonElement>;
}) {
	return (
		<>
			<DialogTitle className="[overflow-wrap:anywhere]">Unlink {folderName}?</DialogTitle>
			<DialogDescription>The folder and its {files} {files === 1 ? "file" : "files"} leave your Library. Your highlights, notes and flashcards stay, and come back if you link this repo again. The repo isn&apos;t changed.</DialogDescription>
			{failure && <p role="alert" className="text-sm text-red">{failure}</p>}
			<div className="mt-2 flex items-center justify-end gap-5">
				<button ref={cancelRef} type="button" className="lh-text-action" disabled={busy} onClick={onCancel} data-testid="repo-unlink-cancel">Cancel</button>
				<button type="button" className={DESTRUCTIVE_BUTTON} aria-disabled={busy || undefined} onClick={() => { if (!busy) onConfirm(); }} data-testid="repo-unlink-confirm">Unlink</button>
			</div>
		</>
	);
}

export function UnlinkDialog({ target, onClose, onConfirm, returnFocus }: {
	target: { folderName: string; files: number } | null;
	onClose: () => void;
	/** Resolves with a failure sentence, or null once unlinked. */
	onConfirm: () => Promise<string | null>;
	returnFocus: () => void;
}) {
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const cancel = useRef<HTMLButtonElement>(null);
	useEffect(() => { setBusy(false); setFailure(null); }, [target]);
	const confirm = async () => {
		setBusy(true);
		setFailure(null);
		const refused = await onConfirm();
		setBusy(false);
		setFailure(refused);
	};
	return (
		<Dialog open={target !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
			<DialogContent
				showCloseButton={false}
				data-testid="repo-unlink-dialog"
				className="gap-3 sm:max-w-md"
				onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}
				onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}
			>
				{target && <UnlinkBody folderName={target.folderName} files={target.files} busy={busy} failure={failure} onCancel={onClose} onConfirm={() => void confirm()} cancelRef={cancel} />}
			</DialogContent>
		</Dialog>
	);
}
