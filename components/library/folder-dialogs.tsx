"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FolderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { folderSubtree, folderTrail, type LibraryFolder } from "@/src/core";

const CONTENT = "gap-3 sm:max-w-md";

/** Sends a folder or item change and answers with the server's sentence on refusal. */
export async function sendLibraryChange(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<string | null> {
	try {
		const response = await fetch(url, {
			method,
			...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
		});
		if (response.ok) return null;
		const parsed = await response.json().catch(() => ({})) as { error?: string };
		return parsed.error ?? "That could not be done.";
	} catch {
		return "That could not be done. Check your connection and try again.";
	}
}

/** New folder and Rename folder. The server's refusal stays in the dialog. */
export function FolderNameDialog({ title, label = "Folder name", action, initial, allowEmpty = false, open, onClose, onSubmit, returnFocus }: {
	title: string;
	label?: string;
	/** Tags can be cleared. */
	allowEmpty?: boolean;
	action: string;
	initial: string;
	open: boolean;
	onClose: () => void;
	/** Resolves to the refusal, or null when done. */
	onSubmit: (name: string) => Promise<string | null>;
	returnFocus: () => void;
}) {
	const [name, setName] = useState(initial);
	const [failure, setFailure] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (!open) return;
		setName(initial);
		setFailure(null);
		setBusy(false);
	}, [open, initial]);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if ((!allowEmpty && !name.trim()) || busy) return;
		setBusy(true);
		const refused = await onSubmit(name.trim());
		setBusy(false);
		setFailure(refused);
	};
	return (
		<Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
			<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-folder-dialog" className={CONTENT} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}>
				<DialogTitle className="[overflow-wrap:anywhere]">{title}</DialogTitle>
				<form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
					<input
						autoFocus
						value={name}
						aria-label={label}
						autoComplete="off"
						spellCheck={false}
						aria-invalid={failure ? true : undefined}
						data-testid="library-folder-name"
						onFocus={(event) => event.currentTarget.select()}
						onChange={(event) => setName(event.target.value)}
						className="lh-line-field"
					/>
					{failure && <p role="alert" className="text-sm text-red [overflow-wrap:anywhere]">{failure}</p>}
					<div className="mt-1 flex items-center justify-end gap-5">
						<button type="button" className="lh-text-action" disabled={busy} onClick={onClose}>Cancel</button>
						<button type="submit" className="nb-pill" disabled={busy || (!allowEmpty && !name.trim())} data-testid="library-folder-submit">{action}</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** The folders a thing can move to, top level first. A folder can't go inside itself. */
export function moveTargets(folders: readonly LibraryFolder[], moving: { folderIds?: readonly string[] } | null): { id: string | null; label: string; depth: number }[] {
	const blocked = new Set((moving?.folderIds ?? []).flatMap((id) => [...folderSubtree(id, folders)]));
	const rows = folders
		// Nothing moves into a mirror (feature 026, R11).
		.filter((folder) => !folder.mirror && !blocked.has(folder.id) && !folderTrail(folder.id, folders).some((f) => blocked.has(f.id)))
		.map((folder) => {
			const trail = folderTrail(folder.id, folders);
			return { id: folder.id as string | null, label: trail.map((f) => f.name).join(" / "), depth: trail.length };
		})
		.sort((a, b) => a.label.localeCompare(b.label));
	return [{ id: null, label: "Library", depth: 0 }, ...rows];
}

/** "Move to": the keyboard and touch path for moving anything. */
export function MoveDialog({ name, folders, moving, current, onClose, onMove, returnFocus }: {
	name: string | null;
	folders: readonly LibraryFolder[];
	/** Set when the thing moving is a folder. */
	moving: { folderIds?: readonly string[] } | null;
	current: string | null;
	onClose: () => void;
	onMove: (target: string | null) => Promise<string | null>;
	returnFocus: () => void;
}) {
	const [failure, setFailure] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		setFailure(null);
		setBusy(false);
	}, [name]);
	const choose = async (target: string | null) => {
		setBusy(true);
		const refused = await onMove(target);
		setBusy(false);
		setFailure(refused);
	};
	return (
		<Dialog open={name !== null} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
			<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-move-dialog" className={CONTENT} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}>
				<DialogTitle className="[overflow-wrap:anywhere]">Move {name} to</DialogTitle>
				<ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
					{moveTargets(folders, moving).map((target) => {
						const here = target.id === current;
						return (
							<li key={target.id ?? "top"}>
								<button
									type="button"
									disabled={busy || here}
									data-testid="library-move-target"
									className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-md transition-colors pointer-coarse:min-h-11 ${here ? "text-faint" : "text-ink hover:bg-shelf"}`}
									onClick={() => void choose(target.id)}
								>
									<FolderIcon className="size-[15px] shrink-0 text-faint" aria-hidden="true" />
									<span className="min-w-0 [overflow-wrap:anywhere]">{target.label}{here ? " · Already here" : ""}</span>
								</button>
							</li>
						);
					})}
				</ul>
				{failure && <p role="alert" className="text-sm text-red [overflow-wrap:anywhere]">{failure}</p>}
				<div className="flex justify-end">
					<button type="button" className="lh-text-action" disabled={busy} onClick={onClose}>Cancel</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
